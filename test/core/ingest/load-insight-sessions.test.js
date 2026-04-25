import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadInsightSessions } from '../../../src/core/ingest/load-insight-sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, '../../fixtures/state');
const execFileAsync = promisify(execFile);

test('loadInsightSessions keeps recent non-ghost sessions only', async () => {
  const sessions = await loadInsightSessions({
    stateRoot: fixtureRoot,
    now: new Date('2026-04-21T12:00:00Z'),
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, 'root-session');
  assert.equal(sessions[0].userTurnCount, 2);
  assert.equal(sessions[0].toolCallCount, 3);
  assert.deepEqual(sessions[0].transcript, [
    { role: 'user', text: 'Investigate a failing build' },
    { role: 'assistant', text: '' },
    { role: 'user', text: 'Fix only the login page regression' },
    { role: 'assistant', text: '' },
  ]);
});

test('loadInsightSessions rethrows non-ENOENT message read failures', async () => {
  const expectedError = Object.assign(new Error('permission denied'), { code: 'EACCES' });

  await assert.rejects(
    loadInsightSessions({
      stateRoot: fixtureRoot,
      now: new Date('2026-04-21T12:00:00Z'),
      readText: async (filePath) => {
        if (filePath.endsWith(path.join('messages', 'root-session.json'))) {
          throw expectedError;
        }

        return await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf8'));
      },
    }),
    expectedError,
  );
});

test('loadInsightSessions rejects path traversal in session IDs', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-insights-traversal-'));
  await import('node:fs/promises').then((fs) =>
    fs.mkdir(path.join(stateRoot, 'sessions')).then(() =>
      fs.mkdir(path.join(stateRoot, 'messages'))
    )
  );

  await import('node:fs/promises').then((fs) =>
    fs.writeFile(
      path.join(stateRoot, 'sessions', 'traversal-session.json'),
      JSON.stringify({ id: '../../escape', workspaceId: 'w1', directory: '/tmp', startedAt: '2026-04-21T10:00:00Z', endedAt: '2026-04-21T11:00:00Z' })
    )
  );

  await import('node:fs/promises').then((fs) =>
    fs.writeFile(
      path.join(stateRoot, 'messages', '../../escape.json'),
      '[{"role":"user","text":"first prompt"},{"role":"assistant","text":"response"},{"role":"user","text":"second prompt"},{"role":"assistant","text":"response2"}]'
    )
  );

  let readAttempts = [];
  const sessions = await loadInsightSessions({
    stateRoot,
    now: new Date('2026-04-21T12:00:00Z'),
    readText: async (filePath) => {
      readAttempts.push(filePath);
      return await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf8'));
    },
  });

  assert.equal(readAttempts.some(p => p.includes('escape.json') && !p.includes('messages')), false, 'Should not read outside messages directory');
});

test('loadInsightSessions reads DB-backed OpenCode state and normalizes transcript data', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-insights-db-'));
  const dbPath = path.join(stateRoot, 'opencode.db');

  await execFileAsync('sqlite3', [dbPath, `
    create table session (id text, directory text, time_created integer, time_updated integer, workspace_id text);
    create table message (id text, session_id text, time_created integer, time_updated integer, data text);
    create table part (id text, message_id text, session_id text, time_created integer, time_updated integer, data text);

    insert into session values ('s1', '/tmp/project', 1776706800000, 1776708000000, 'w1');
    insert into message values ('m1', 's1', 1776706800000, 1776706800000, '{"role":"user","tools":{"todowrite":false}}');
    insert into message values ('m2', 's1', 1776707100000, 1776707400000, '{"role":"assistant","tokens":{"input":10,"output":20,"reasoning":5,"cache":{"read":1,"write":2}}}');
    insert into message values ('m3', 's1', 1776707700000, 1776707700000, '{"role":"user","tools":{}}');

    insert into part values ('p1', 'm1', 's1', 1776706800000, 1776706800000, '{"type":"text","text":"debug this failing test"}');
    insert into part values ('p2', 'm2', 's1', 1776707100000, 1776707100000, '{"type":"reasoning","text":"I should inspect the failing test and the setup"}');
    insert into part values ('p3', 'm2', 's1', 1776707200000, 1776707200000, '{"type":"tool","tool":"bash","state":{"status":"completed"}}');
    insert into part values ('p4', 'm2', 's1', 1776707400000, 1776707400000, '{"type":"text","text":"I ran bash and found the root cause"}');
    insert into part values ('p5', 'm3', 's1', 1776707700000, 1776707700000, '{"type":"text","text":"please fix it"}');
  `]);

  const sessions = await loadInsightSessions({
    stateRoot,
    now: new Date('2026-04-21T12:00:00Z'),
  });

  assert.deepEqual(sessions[0], {
    sessionId: 's1',
    workspaceId: 'w1',
    directory: '/tmp/project',
    worktree: undefined,
    startedAt: '2026-04-20T17:40:00.000Z',
    endedAt: '2026-04-20T18:00:00.000Z',
    userTurnCount: 2,
    assistantTurnCount: 1,
    toolCallCount: 1,
    toolCounts: { bash: 1 },
    tokenTotals: { input: 10, output: 20, reasoning: 5, cache: { read: 1, write: 2 } },
    transcript: [
      { role: 'user', text: 'debug this failing test' },
      { role: 'assistant', text: 'I should inspect the failing test and the setup\nI ran bash and found the root cause' },
      { role: 'user', text: 'please fix it' },
    ],
  });
});
