# Agent Insights Installable Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the current local OpenCode `/insights` plugin into `~/Projects/agent-insights`, split it into a portable core plus a thin OpenCode adapter, and make it locally installable now with a GitHub-installable package shape for later publishing.

**Architecture:** Keep one package, `agent-insights`, with `.opencode/plugins/agent-insights.js` as the install entrypoint. Move analysis, ingestion, enrichment, and report rendering into `src/core/`, and keep slash-command wiring, OpenCode client integration, browser opening, and host-specific path handling in `src/opencode/`.

**Tech Stack:** Node.js ESM, OpenCode plugin runtime, OpenCode SDK/client wrappers, built-in `node:test`, SQLite access through the local `sqlite3` CLI, self-contained HTML/CSS/JS.

---

**Plan note:** `~/Projects/agent-insights` does not yet contain implementation files and is not a git repo. This plan treats the current source of truth as `~/.config/opencode/plugins/opencode-insights` and uses verification checkpoints rather than commit steps.

## Planned File Structure

- Create: `/Users/twc/Projects/agent-insights/package.json`
- Create: `/Users/twc/Projects/agent-insights/.gitignore`
- Create: `/Users/twc/Projects/agent-insights/README.md`
- Create: `/Users/twc/Projects/agent-insights/.opencode/plugins/agent-insights.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/create-command.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/open-report.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/prompt-session.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/run-insights.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/ingest/filter.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/analyze-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/report/render-insights-report.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/create-command.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/run-insights.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/open-report.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/analyze/analyze-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/report/render-insights-report.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/messages/root-session.json`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/root-session.json`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/ghost-session.json`
- Modify: `/Users/twc/.config/opencode/opencode.json`

### Task 1: Bootstrap the Standalone Plugin Repo

**Files:**
- Create: `/Users/twc/Projects/agent-insights/package.json`
- Create: `/Users/twc/Projects/agent-insights/.gitignore`
- Create: `/Users/twc/Projects/agent-insights/.opencode/plugins/agent-insights.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/create-command.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/create-command.test.js`

- [ ] **Step 1: Write the failing slash-command registration test**

```js
// /Users/twc/Projects/agent-insights/test/opencode/create-command.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInsightsCommands } from '../../src/opencode/create-command.js';

test('creates a visible /insights slash command', async () => {
  const calls = [];
  const commands = createInsightsCommands({
    runInsights: async () => {
      calls.push('ran');
    },
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].title, 'Insights report');
  assert.equal(commands[0].slash?.name, 'insights');
  assert.equal(commands[0].value, 'insights.generate');

  await commands[0].onSelect();
  assert.deepEqual(calls, ['ran']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/create-command.test.js"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/opencode/create-command.js`

- [ ] **Step 3: Create the package metadata and ignore file**

```json
// /Users/twc/Projects/agent-insights/package.json
{
  "name": "agent-insights",
  "version": "0.1.0",
  "type": "module",
  "main": ".opencode/plugins/agent-insights.js",
  "scripts": {
    "test": "node --test test/**/*.test.js"
  }
}
```

```gitignore
# /Users/twc/Projects/agent-insights/.gitignore
node_modules
.DS_Store
*.log
coverage
```

- [ ] **Step 4: Create the thin plugin entrypoint and command module**

```js
// /Users/twc/Projects/agent-insights/src/opencode/create-command.js
export function createInsightsCommands({ runInsights }) {
  return [
    {
      title: 'Insights report',
      value: 'insights.generate',
      description: 'Generate a 30-day OpenCode insights report',
      category: 'Insights',
      suggested: true,
      slash: { name: 'insights' },
      onSelect: async () => {
        await runInsights();
      },
    },
  ];
}
```

```js
// /Users/twc/Projects/agent-insights/.opencode/plugins/agent-insights.js
import { createInsightsCommands } from '../../src/opencode/create-command.js';
import { runInsights } from '../../src/opencode/run-insights.js';

export const AgentInsightsPlugin = async () => ({
  tui: async (api) => {
    api.command.register(() =>
      createInsightsCommands({
        runInsights: () => runInsights({ api }),
      }),
    );
  },
});
```

- [ ] **Step 5: Add a temporary `runInsights` stub so imports resolve**

```js
// /Users/twc/Projects/agent-insights/src/opencode/run-insights.js
export async function runInsights({ api }) {
  api.ui.toast({
    variant: 'info',
    title: '/insights',
    message: 'Agent Insights repo is being wired up.',
  });
}
```

- [ ] **Step 6: Re-run the test to verify it passes**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/create-command.test.js"`
Expected: PASS

### Task 2: Extract the Portable Ingest Core

**Files:**
- Create: `/Users/twc/Projects/agent-insights/src/core/ingest/filter.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/messages/root-session.json`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/root-session.json`
- Create: `/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/ghost-session.json`

- [ ] **Step 1: Copy the current fixtures and ingest tests into the new repo**

Run:
```bash
mkdir -p "/Users/twc/Projects/agent-insights/test/core/ingest" \
  "/Users/twc/Projects/agent-insights/test/fixtures/state/messages" \
  "/Users/twc/Projects/agent-insights/test/fixtures/state/sessions" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/fixtures/state/messages/root-session.json" "/Users/twc/Projects/agent-insights/test/fixtures/state/messages/root-session.json" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/fixtures/state/sessions/root-session.json" "/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/root-session.json" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/fixtures/state/sessions/ghost-session.json" "/Users/twc/Projects/agent-insights/test/fixtures/state/sessions/ghost-session.json"
```
Expected: fixture files exist in the new repo

- [ ] **Step 2: Write the failing ingest test file using the extracted current tests**

```js
// /Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js
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
```

- [ ] **Step 3: Run the ingest tests to verify they fail**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/core/ingest/load-insight-sessions.js`

- [ ] **Step 4: Copy the current ingest implementation into the new core location**

Run:
```bash
mkdir -p "/Users/twc/Projects/agent-insights/src/core/ingest" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/filter.js" "/Users/twc/Projects/agent-insights/src/core/ingest/filter.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/session-store.js" "/Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js"
```
Expected: copied files exist in `src/core/ingest/`

- [ ] **Step 5: Update the copied ingest module imports to the new repo shape**

```js
// /Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js
import { isGhostSession, isInsideTrailingWindow } from './filter.js';
```

- [ ] **Step 6: Re-run the ingest tests to verify they pass**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js"`
Expected: PASS

### Task 3: Extract Portable Analysis and Report Core Modules

**Files:**
- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/analyze-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js`
- Create: `/Users/twc/Projects/agent-insights/src/core/report/render-insights-report.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/analyze/analyze-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/core/report/render-insights-report.test.js`

- [ ] **Step 1: Copy the current analysis, enrichment, and report tests into core-scoped test files**

Run:
```bash
mkdir -p "/Users/twc/Projects/agent-insights/test/core/analyze" \
  "/Users/twc/Projects/agent-insights/test/core/report" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/analyze.test.js" "/Users/twc/Projects/agent-insights/test/core/analyze/analyze-sessions.test.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/enrich.test.js" "/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/test/report.test.js" "/Users/twc/Projects/agent-insights/test/core/report/render-insights-report.test.js"
```
Expected: test files exist in the new repo

- [ ] **Step 2: Narrow the copied report test file to core-report concerns only**

Replace `/Users/twc/Projects/agent-insights/test/core/report/render-insights-report.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderInsightsReport } from '../../../src/core/report/render-insights-report.js';

test('renderInsightsReport emits a complete html document with theme toggle', () => {
  const html = renderInsightsReport({
    generatedAt: '2026-04-21T12:00:00Z',
    summary: { sessionsAnalyzed: 12, totalTokens: 4200, averageDurationMinutes: 18 },
    frictionRanking: [{ label: 'Search tool underuse', evidence: 'Repeated ls with no grep/glob' }],
    workflowSuggestions: ['Use glob or grep before repeated ls to reduce navigation churn.'],
    workMix: { featureWork: 5, debugging: 4, setup: 2, refactoring: 1 },
  });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /data-theme-toggle/);
  assert.match(html, /Friction Ranking/);
});
```

- [ ] **Step 3: Update the copied analyze and enrich tests to import from the new core paths**

```js
// /Users/twc/Projects/agent-insights/test/core/analyze/analyze-sessions.test.js
import { analyzeSessions } from '../../../src/core/analyze/analyze-sessions.js';
```

```js
// /Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js
import { enrichSessions } from '../../../src/core/analyze/enrich-sessions.js';
```

- [ ] **Step 4: Run the core tests to verify they fail**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/**/*.test.js"`
Expected: FAIL with module-not-found errors for the new `src/core` files

- [ ] **Step 5: Copy the current core candidates from the local plugin into the new repo**

Run:
```bash
mkdir -p "/Users/twc/Projects/agent-insights/src/core/analyze" \
  "/Users/twc/Projects/agent-insights/src/core/report" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/analyze.js" "/Users/twc/Projects/agent-insights/src/core/analyze/analyze-sessions.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/enrich.js" "/Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/report.js" "/Users/twc/Projects/agent-insights/src/core/report/render-insights-report.js"
```
Expected: core files exist in the new repo

- [ ] **Step 6: Re-run the core tests to verify they pass**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/**/*.test.js"`
Expected: PASS

### Task 4: Extract the OpenCode Runtime Adapter

**Files:**
- Create: `/Users/twc/Projects/agent-insights/src/opencode/open-report.js`
- Create: `/Users/twc/Projects/agent-insights/src/opencode/prompt-session.js`
- Modify: `/Users/twc/Projects/agent-insights/src/opencode/run-insights.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/run-insights.test.js`
- Create: `/Users/twc/Projects/agent-insights/test/opencode/open-report.test.js`

- [ ] **Step 1: Write the failing OpenCode adapter tests**

```js
// /Users/twc/Projects/agent-insights/test/opencode/open-report.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { openReport } from '../../src/opencode/open-report.js';

test('openReport resolves true when browser launch starts', async () => {
  class FakeChild extends EventEmitter { unref() {} }
  const launched = openReport('/tmp/report.html', () => {
    const child = new FakeChild();
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  assert.equal(await launched, true);
});
```

```js
// /Users/twc/Projects/agent-insights/test/opencode/run-insights.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runInsights } from '../../src/opencode/run-insights.js';

test('runInsights writes report.html into insights/latest', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-insights-'));
  const toasts = [];
  const openCalls = [];

  const reportFile = await runInsights({
    api: { ui: { toast: (input) => toasts.push(input) } },
    stateRoot,
    loadInsightSessions: async () => [{
      sessionId: 's1',
      startedAt: '2026-04-20T15:00:00Z',
      endedAt: '2026-04-20T15:20:00Z',
      transcript: [{ role: 'user', text: 'debug this issue' }],
      tokenTotals: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } },
      toolCounts: { ls: 4, glob: 0, grep: 0 },
    }],
    analyzeSessions: (sessions) => ({
      summary: { sessionsAnalyzed: sessions.length, totalTokens: 6, averageDurationMinutes: 20 },
      frictionRanking: [{ key: 'search-underuse', label: 'Search tool underuse', score: 1, evidence: 'Repeated ls with no grep/glob' }],
      workflowSuggestions: ['Use glob or grep before repeated ls to reduce navigation churn.'],
      workMix: { featureWork: 0, debugging: 1, setup: 0, refactoring: 0 },
    }),
    enrichSessions: async ({ sessions }) => sessions,
    openReport: async (file) => openCalls.push(file),
  });

  assert.equal(reportFile.endsWith('/insights/latest/report.html'), true);
  assert.equal(openCalls.length, 1);
  assert.match(await readFile(reportFile, 'utf8'), /OpenCode Insights/);
  assert.equal(toasts.length > 0, true);
});
```

- [ ] **Step 2: Run the OpenCode adapter tests to verify they fail**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/*.test.js"`
Expected: FAIL with module-not-found errors for `src/opencode/open-report.js` and `src/opencode/run-insights.js`

- [ ] **Step 3: Copy and split the current OpenCode adapter files from the local plugin**

Run:
```bash
mkdir -p "/Users/twc/Projects/agent-insights/src/opencode" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/open-report.js" "/Users/twc/Projects/agent-insights/src/opencode/open-report.js" && \
cp -f "/Users/twc/.config/opencode/plugins/opencode-insights/lib/run-insights.js" "/Users/twc/Projects/agent-insights/src/opencode/run-insights.js"
```
Expected: adapter files exist in the new repo

- [ ] **Step 4: Extract the prompt-session helper into its own file**

```js
// /Users/twc/Projects/agent-insights/src/opencode/prompt-session.js
export function createPromptSession(api) {
  return async function promptSession(_session, smallModel, prompt) {
    const client = api.client;
    if (!client?.session?.create || !client?.session?.prompt) {
      return undefined;
    }

    const directory = api.state?.path?.directory ?? api.state?.path?.worktree;
    const created = await client.session.create(directory ? { directory } : {});
    const tempSession = created?.data ?? created;
    const tempSessionID = tempSession?.id;
    if (!tempSessionID) {
      return undefined;
    }

    try {
      const response = await client.session.prompt({
        sessionID: tempSessionID,
        directory,
        model: smallModel,
        tools: {},
        parts: [{ type: 'text', text: prompt }],
      });
      const payload = response?.data ?? response;
      const text = (payload?.parts ?? [])
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim();
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined;
    } finally {
      if (client.session.delete) {
        await client.session.delete({ sessionID: tempSessionID, directory }).catch(() => undefined);
      }
    }
  };
}
```

- [ ] **Step 5: Rewrite `run-insights.js` to use the new repo paths and the extracted prompt helper**

```js
// /Users/twc/Projects/agent-insights/src/opencode/run-insights.js
import fs from 'node:fs/promises';

import { loadInsightSessions as defaultLoadInsightSessions } from '../core/ingest/load-insight-sessions.js';
import { analyzeSessions as defaultAnalyzeSessions } from '../core/analyze/analyze-sessions.js';
import { enrichSessions as defaultEnrichSessions } from '../core/analyze/enrich-sessions.js';
import { renderInsightsReport } from '../core/report/render-insights-report.js';
import { openReport as defaultOpenReport } from './open-report.js';
import { createPromptSession } from './prompt-session.js';

function buildInsightsPaths({ stateRoot }) {
  return {
    reportDir: `${stateRoot}/insights/latest`,
    reportFile: `${stateRoot}/insights/latest/report.html`,
  };
}

export async function runInsights({
  api,
  stateRoot,
  loadInsightSessions = defaultLoadInsightSessions,
  analyzeSessions = defaultAnalyzeSessions,
  enrichSessions = defaultEnrichSessions,
  openReport = defaultOpenReport,
  promptSession = createPromptSession(api),
}) {
  const resolvedStateRoot = stateRoot ?? api.state?.path?.state;
  if (!resolvedStateRoot) {
    throw new Error('runInsights requires a state root');
  }

  const paths = buildInsightsPaths({ stateRoot: resolvedStateRoot });
  api.ui.toast({ variant: 'info', title: '/insights', message: 'Scanning OpenCode sessions...' });

  const sessions = await loadInsightSessions({ stateRoot: resolvedStateRoot });
  const enrichedSessions = await enrichSessions({
    sessions,
    smallModel: api.state?.config?.small_model
      ? { modelID: api.state.config.small_model, providerID: 'configured' }
      : null,
    promptSession,
  });

  const html = renderInsightsReport({
    generatedAt: new Date().toISOString(),
    ...analyzeSessions(enrichedSessions),
  });

  await fs.mkdir(paths.reportDir, { recursive: true });
  await fs.writeFile(paths.reportFile, html, 'utf8');
  await openReport(paths.reportFile);
  api.ui.toast({ variant: 'success', title: '/insights', message: `Report written to ${paths.reportFile}` });
  return paths.reportFile;
}
```

- [ ] **Step 6: Re-run the OpenCode adapter tests to verify they pass**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/*.test.js"`
Expected: PASS

### Task 5: Write Install and Migration Docs, Then Verify Local Plugin Loading

**Files:**
- Create: `/Users/twc/Projects/agent-insights/README.md`
- Modify: `/Users/twc/.config/opencode/opencode.json`

- [ ] **Step 1: Write the failing documentation and local-install verification checklist into the README**

```md
<!-- /Users/twc/Projects/agent-insights/README.md -->
# Agent Insights

GitHub-installable OpenCode `/insights` plugin with a portable analysis core.

## Local Development Install

During local development, point OpenCode at the repo path:

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "../../Projects/agent-insights"
  ]
}
```

## GitHub Install

After publishing:

```json
{
  "plugin": [
    "agent-insights@git+https://github.com/acme/agent-insights.git"
  ]
}
```

## Test Command

```bash
node --test "test/**/*.test.js"
```
```

- [ ] **Step 2: Update the global OpenCode config to use the repo path as the interim local install target**

```json
// /Users/twc/.config/opencode/opencode.json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "../../Projects/agent-insights"
  ]
}
```

- [ ] **Step 3: Run the full new-repo test suite**

Run: `node --test "/Users/twc/Projects/agent-insights/test/**/*.test.js"`
Expected: PASS

- [ ] **Step 4: Smoke-test plugin loading from the new repo path**

Run: `opencode run --print-logs "hello"`
Workdir: `/Users/twc/.config/opencode`
Expected: OpenCode starts successfully with no import error for `../../Projects/agent-insights`

- [ ] **Step 5: Verify slash registration non-interactively**

Run:
```bash
node --input-type=module -e "import assert from 'node:assert/strict'; import { AgentInsightsPlugin } from '/Users/twc/Projects/agent-insights/.opencode/plugins/agent-insights.js'; let registered; const hooks = await AgentInsightsPlugin(); await hooks.tui({ command: { register: (factory) => { registered = factory(); } } }); assert.equal(registered[0].slash.name, 'insights'); console.log(registered[0].value);"
```
Expected: prints `insights.generate`

- [ ] **Step 6: Verify report generation non-interactively**

Run:
```bash
node --input-type=module -e "import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import { runInsights } from '/Users/twc/Projects/agent-insights/src/opencode/run-insights.js'; const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-insights-final-')); const reportFile = await runInsights({ api: { ui: { toast: () => {} } }, stateRoot, loadInsightSessions: async () => [{ sessionId: 's1', startedAt: '2026-04-20T15:00:00Z', endedAt: '2026-04-20T15:20:00Z', transcript: [{ role: 'user', text: 'debug this issue' }], tokenTotals: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } }, toolCounts: { ls: 4, glob: 0, grep: 0 } }], analyzeSessions: (sessions) => ({ summary: { sessionsAnalyzed: sessions.length, totalTokens: 6, averageDurationMinutes: 20 }, frictionRanking: [{ key: 'search-underuse', label: 'Search tool underuse', score: 1, evidence: 'Repeated ls with no grep/glob' }], workflowSuggestions: ['Use glob or grep before repeated ls to reduce navigation churn.'], workMix: { featureWork: 0, debugging: 1, setup: 0, refactoring: 0 } }), enrichSessions: async ({ sessions }) => sessions, openReport: async () => false }); const html = await fs.readFile(reportFile, 'utf8'); assert.match(html, /OpenCode Insights/); assert.match(html, /Search tool underuse/); console.log(reportFile);"
```
Expected: prints a real `report.html` path under a temp state root

## Self-Review

- Spec coverage: the plan covers repo bootstrap, portable-core extraction, OpenCode adapter extraction, package entrypoint shape, local path install verification, and the future GitHub plugin string for published installs.
- Placeholder scan: no unresolved marker strings or deferred implementation gaps remain in the tasks.
- Type consistency: the plan consistently uses `AgentInsightsPlugin`, `createInsightsCommands`, `loadInsightSessions`, `analyzeSessions`, `enrichSessions`, `renderInsightsReport`, and `runInsights` across the extracted repo structure.
