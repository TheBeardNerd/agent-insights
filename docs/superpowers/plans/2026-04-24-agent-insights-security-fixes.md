# Agent Insights Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redact sensitive transcript and path data before LLM enrichment egress, block directory-backed message path traversal, and tighten install and package surface before the first commit.

**Architecture:** Keep the fix small and local. Add one shared redaction helper used by both enrichment prompt building and OpenCode prompt-session metadata, add fail-closed session ID validation in the directory-backed ingest path, and then harden the README and published package contents.

**Tech Stack:** Node.js ESM, built-in `node:test`, OpenCode plugin runtime/client APIs, local `sqlite3` CLI, npm package metadata.

---

**Plan note:** `/Users/twc/Projects/agent-insights` is not currently a git repository, so this plan uses verification checkpoints instead of commit steps.

## Planned File Structure

- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/redact-for-llm.js`
- Modify: `/Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js`
- Modify: `/Users/twc/Projects/agent-insights/src/opencode/prompt-session.js`
- Modify: `/Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js`
- Modify: `/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js`
- Modify: `/Users/twc/Projects/agent-insights/test/opencode/prompt-session.test.js`
- Modify: `/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js`
- Modify: `/Users/twc/Projects/agent-insights/README.md`
- Modify: `/Users/twc/Projects/agent-insights/package.json`

### Task 1: Redact Transcript Content Before Enrichment

**Files:**
- Create: `/Users/twc/Projects/agent-insights/src/core/analyze/redact-for-llm.js`
- Modify: `/Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js`
- Modify: `/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js`

- [ ] **Step 1: Extend the enrichment test file with a failing redaction regression test**

```js
// /Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichSessions } from '../../../src/core/analyze/enrich-sessions.js';

test('enrichSessions returns deterministic results unchanged when no small model exists', async () => {
  const enriched = await enrichSessions({
    sessions: [{ sessionId: 's1', transcript: [{ role: 'user', text: 'fix this bug' }] }],
    smallModel: null,
    promptSession: async () => {
      throw new Error('should not run');
    },
  });

  assert.equal(enriched[0].facet, undefined);
});

test('enrichSessions attaches structured facets from the prompt helper', async () => {
  const enriched = await enrichSessions({
    sessions: [{ sessionId: 's2', transcript: [{ role: 'user', text: 'debug this issue' }] }],
    smallModel: { providerID: 'openai', modelID: 'gpt-5-mini' },
    promptSession: async () => ({
      sentiment: 'frustrated',
      failureTaxonomy: ['buggy_code'],
      taskCategory: 'debugging',
      confidence: 0.9,
    }),
  });

  assert.equal(enriched[0].facet.sentiment, 'frustrated');
  assert.deepEqual(enriched[0].facet.failureTaxonomy, ['buggy_code']);
});

test('enrichSessions redacts secrets and path details before building the prompt', async () => {
  const prompts = [];
  const enriched = await enrichSessions({
    sessions: [{
      sessionId: 's-redact',
      transcript: [{
        role: 'user',
        text: 'Debug deploy using sk_live_1234567890ABCDE and ghp_1234567890abcdefghij at /Users/twc/Projects/private-app/.env',
      }],
    }],
    smallModel: { providerID: 'openai', modelID: 'gpt-5-mini' },
    promptSession: async (_session, _model, prompt) => {
      prompts.push(prompt);
      return {
        sentiment: 'frustrated',
        failureTaxonomy: ['buggy_code'],
        taskCategory: 'debugging',
        confidence: 0.9,
      };
    },
  });

  assert.equal(enriched[0].facet.taskCategory, 'debugging');
  assert.equal(prompts.length, 1);
  assert.doesNotMatch(prompts[0], /sk_live_1234567890ABCDE/);
  assert.doesNotMatch(prompts[0], /ghp_1234567890abcdefghij/);
  assert.doesNotMatch(prompts[0], /\/Users\/twc\/Projects\/private-app/);
  assert.match(prompts[0], /\[REDACTED_SECRET\]/);
  assert.match(prompts[0], /\[REDACTED_PATH\]/);
});

test('enrichSessions falls back to the original session when prompt output is malformed', async () => {
  const session = { sessionId: 's3', transcript: [{ role: 'user', text: 'classify this issue' }] };
  const enriched = await enrichSessions({
    sessions: [session],
    smallModel: { providerID: 'openai', modelID: 'gpt-5-mini' },
    promptSession: async () => ({ sentiment: 42, failureTaxonomy: 'buggy_code' }),
  });

  assert.deepEqual(enriched[0], session);
});

test('enrichSessions falls back to the original session when promptSession throws', async () => {
  const session = { sessionId: 's4', transcript: [{ role: 'user', text: 'help me debug' }] };
  const enriched = await enrichSessions({
    sessions: [session],
    smallModel: { providerID: 'openai', modelID: 'gpt-5-mini' },
    promptSession: async () => {
      throw new Error('prompt failed');
    },
  });

  assert.deepEqual(enriched[0], session);
});
```

- [ ] **Step 2: Run the redaction regression test to verify it fails for the right reason**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js"`
Expected: FAIL in `enrichSessions redacts secrets and path details before building the prompt` because the raw secret and path text are still present in the prompt.

- [ ] **Step 3: Create the shared redaction helper**

```js
// /Users/twc/Projects/agent-insights/src/core/analyze/redact-for-llm.js
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*[^\s'"`]+/gi,
];

const PATH_PATTERNS = [
  /(?:\/Users|\/home|~)\/[A-Za-z0-9._\/-]+/g,
  /[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+/g,
];

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function redactForLlm(value, { maxLength = 400 } = {}) {
  if (typeof value !== 'string') {
    return '';
  }

  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED_SECRET]');
  }
  for (const pattern of PATH_PATTERNS) {
    output = output.replace(pattern, '[REDACTED_PATH]');
  }

  output = output.replace(/\s+/g, ' ').trim();
  return truncate(output, maxLength);
}

export function redactTranscriptForLlm(transcript, { maxTurns = 8, maxLength = 400 } = {}) {
  return transcript
    .slice(0, maxTurns)
    .map((part) => `${part.role}: ${redactForLlm(part.text ?? '', { maxLength })}`)
    .join('\n');
}
```

- [ ] **Step 4: Update `enrich-sessions.js` to build prompts from redacted text**

```js
// /Users/twc/Projects/agent-insights/src/core/analyze/enrich-sessions.js
import { redactTranscriptForLlm } from './redact-for-llm.js';

function buildFacetPrompt(session) {
  const text = redactTranscriptForLlm(session.transcript ?? []);
  return `Return JSON with keys sentiment, failureTaxonomy, taskCategory, confidence.\n${text}`;
}

function isValidFacet(facet) {
  return (
    facet &&
    typeof facet === 'object' &&
    typeof facet.sentiment === 'string' &&
    Array.isArray(facet.failureTaxonomy) &&
    facet.failureTaxonomy.every((item) => typeof item === 'string') &&
    typeof facet.taskCategory === 'string' &&
    typeof facet.confidence === 'number' &&
    Number.isFinite(facet.confidence)
  );
}

export async function enrichSessions({ sessions, smallModel, promptSession }) {
  if (!smallModel) return sessions;

  const output = [];
  for (const session of sessions) {
    try {
      const facet = await promptSession(session, smallModel, buildFacetPrompt(session));
      if (!isValidFacet(facet)) {
        output.push(session);
        continue;
      }
      output.push({ ...session, facet });
    } catch {
      output.push(session);
    }
  }
  return output;
}
```

- [ ] **Step 5: Re-run the enrichment test file to verify it passes**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/analyze/enrich-sessions.test.js"`
Expected: PASS with the new redaction test green and the existing enrichment behavior unchanged.

### Task 2: Redact Directory Metadata Sent to the OpenCode Client

**Files:**
- Modify: `/Users/twc/Projects/agent-insights/src/opencode/prompt-session.js`
- Modify: `/Users/twc/Projects/agent-insights/test/opencode/prompt-session.test.js`
- Reuse: `/Users/twc/Projects/agent-insights/src/core/analyze/redact-for-llm.js`

- [ ] **Step 1: Replace the current prompt-session test with a failing redacted-directory regression test**

```js
// /Users/twc/Projects/agent-insights/test/opencode/prompt-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPromptSession } from '../../src/opencode/prompt-session.js';

test('createPromptSession redacts the analyzed session directory before client calls', async () => {
  const calls = [];
  const promptSession = createPromptSession({
    state: {
      path: {
        directory: '/workspace/current',
        worktree: '/workspace/current-worktree',
      },
    },
    client: {
      session: {
        create: async (input) => {
          calls.push(['create', input]);
          return { id: 'tmp-session' };
        },
        prompt: async (input) => {
          calls.push(['prompt', input]);
          return {
            parts: [{ type: 'text', text: '{"ok":true}' }],
          };
        },
        delete: async (input) => {
          calls.push(['delete', input]);
        },
      },
    },
  });

  const result = await promptSession(
    { directory: '/Users/twc/Projects/private-app', worktree: '/Users/twc/Projects/private-app-worktree' },
    { providerID: 'openai', modelID: 'gpt-5-mini' },
    'facet prompt',
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], ['create', { directory: '[REDACTED_PATH]' }]);
  assert.equal(calls[1][1].directory, '[REDACTED_PATH]');
  assert.deepEqual(calls[2], ['delete', { sessionID: 'tmp-session', directory: '[REDACTED_PATH]' }]);
});
```

- [ ] **Step 2: Run the prompt-session test to verify it fails for the right reason**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/prompt-session.test.js"`
Expected: FAIL because the client calls still receive the raw `/Users/twc/Projects/private-app` path.

- [ ] **Step 3: Update `prompt-session.js` to send redacted directory metadata only**

```js
// /Users/twc/Projects/agent-insights/src/opencode/prompt-session.js
import { redactForLlm } from '../core/analyze/redact-for-llm.js';

function getRedactedDirectory(session, api) {
  const directory = session?.directory
    ?? session?.worktree
    ?? api.state?.path?.directory
    ?? api.state?.path?.worktree;

  const redacted = redactForLlm(directory ?? '', { maxLength: 160 });
  return redacted || undefined;
}

export function createPromptSession(api) {
  return async function promptSession(session, smallModel, prompt) {
    const client = api.client;
    if (!client?.session?.create || !client?.session?.prompt) {
      return undefined;
    }

    const directory = getRedactedDirectory(session, api);
    const created = await client.session.create(directory ? { directory } : {});
    const tempSession = created?.data ?? created;
    const tempSessionID = tempSession?.id;
    if (!tempSessionID) {
      return undefined;
    }

    try {
      const response = await client.session.prompt({
        sessionID: tempSessionID,
        ...(directory ? { directory } : {}),
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
        await client.session.delete({ sessionID: tempSessionID, ...(directory ? { directory } : {}) }).catch(() => undefined);
      }
    }
  };
}
```

- [ ] **Step 4: Re-run the prompt-session test to verify it passes**

Run: `node --test "/Users/twc/Projects/agent-insights/test/opencode/prompt-session.test.js"`
Expected: PASS with all client calls receiving `[REDACTED_PATH]` instead of the raw local path.

### Task 3: Fail Closed on Traversal-Style Session IDs

**Files:**
- Modify: `/Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js`
- Modify: `/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js`

- [ ] **Step 1: Add a failing traversal regression test to the ingest test file**

```js
// append to /Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js
import fs from 'node:fs/promises';

test('loadInsightSessions does not read outside messages for traversal-style session ids', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-insights-path-'));
  await fs.mkdir(path.join(stateRoot, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(stateRoot, 'messages'), { recursive: true });

  await fs.writeFile(path.join(stateRoot, 'sessions', 'unsafe.json'), JSON.stringify({
    id: '../../escape',
    workspaceId: 'w1',
    directory: '/tmp/project',
    startedAt: '2026-04-20T17:40:00.000Z',
    endedAt: '2026-04-20T18:00:00.000Z',
  }), 'utf8');

  const calls = [];
  const sessions = await loadInsightSessions({
    stateRoot,
    now: new Date('2026-04-21T12:00:00Z'),
    readText: async (filePath) => {
      calls.push(filePath);
      if (filePath.endsWith(path.join('messages', '..', '..', 'escape.json'))) {
        throw new Error('path traversal reached readText');
      }
      return fs.readFile(filePath, 'utf8');
    },
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, '../../escape');
  assert.deepEqual(sessions[0].transcript, []);
  assert.equal(calls.some((filePath) => filePath.includes('escape.json')), false);
});
```

- [ ] **Step 2: Run the ingest test file to verify the traversal test fails for the right reason**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js"`
Expected: FAIL because `loadMessages()` still attempts to read a path containing `escape.json`.

- [ ] **Step 3: Add strict session ID validation before building the message path**

```js
// /Users/twc/Projects/agent-insights/src/core/ingest/load-insight-sessions.js
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { isGhostSession, isInsideTrailingWindow } from './filter.js';

const execFileAsync = promisify(execFile);
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function loadInsightSessions({
  stateRoot,
  now = new Date(),
  readText = defaultReadText,
  queryRows = defaultQueryRows,
}) {
  const dbPath = path.join(stateRoot, 'opencode.db');
  if (await pathExists(dbPath)) {
    return loadInsightSessionsFromDb({ dbPath, now, queryRows });
  }

  return loadInsightSessionsFromDirectory({ stateRoot, now, readText });
}

async function loadInsightSessionsFromDirectory({ stateRoot, now, readText }) {
  const sessionsDir = path.join(stateRoot, 'sessions');
  const messagesDir = path.join(stateRoot, 'messages');
  const sessionFiles = await fs.readdir(sessionsDir);
  const output = [];

  for (const fileName of sessionFiles) {
    if (!fileName.endsWith('.json')) continue;
    const session = JSON.parse(await readText(path.join(sessionsDir, fileName)));
    const messages = JSON.parse(await loadMessages({ messagesDir, readText, sessionId: session.id }));
    const userTurnCount = messages.filter((message) => message.role === 'user').length;
    const toolCallCount = messages.reduce((count, message) => count + (message.tools?.length ?? 0), 0);
    const toolCounts = {};
    for (const message of messages) {
      for (const toolName of message.tools ?? []) {
        toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
      }
    }

    const normalized = {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      directory: session.directory,
      worktree: session.worktree,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      userTurnCount,
      assistantTurnCount: messages.filter((message) => message.role === 'assistant').length,
      toolCallCount,
      toolCounts,
      tokenTotals: buildEmptyTokenTotals(),
      transcript: messages.map((message) => ({
        role: message.role ?? 'assistant',
        text: typeof message.text === 'string' ? message.text : '',
      })),
    };
    if (!isInsideTrailingWindow(normalized, now)) continue;
    if (isGhostSession(normalized)) continue;
    output.push(normalized);
  }

  return output;
}

async function loadInsightSessionsFromDb({ dbPath, now, queryRows }) {
  const rows = await queryRows(dbPath, `
    select
      s.id as session_id,
      s.workspace_id,
      s.directory,
      s.time_created as session_time_created,
      s.time_updated as session_time_updated,
      m.id as message_id,
      m.data as message_data,
      p.data as part_data
    from session s
    left join message m on m.session_id = s.id
    left join part p on p.message_id = m.id
    order by s.time_updated desc, m.time_created asc, p.time_created asc
  `);

  const sessions = new Map();
  for (const row of rows) {
    const session = getOrCreateSession(sessions, row);
    if (!row.message_id) continue;

    const message = getOrCreateMessage(session, row);
    const part = safeJsonParse(row.part_data);
    if (part) {
      message.parts.push(part);
    }
  }

  const output = [];
  for (const session of sessions.values()) {
    const normalized = normalizeDbSession(session);
    if (!isInsideTrailingWindow(normalized, now)) continue;
    if (isGhostSession(normalized)) continue;
    output.push(normalized);
  }
  return output;
}

async function defaultReadText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function defaultQueryRows(dbPath, sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql]);
  return safeJsonParse(stdout) ?? [];
}

async function loadMessages({ messagesDir, readText, sessionId }) {
  if (!isSafeSessionId(sessionId)) {
    return '[]';
  }

  try {
    return await readText(path.join(messagesDir, `${sessionId}.json`));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '[]';
    }

    throw error;
  }
}

function isSafeSessionId(sessionId) {
  return typeof sessionId === 'string' && SAFE_SESSION_ID_PATTERN.test(sessionId);
}

function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function getOrCreateSession(sessions, row) {
  if (!sessions.has(row.session_id)) {
    sessions.set(row.session_id, {
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      directory: row.directory,
      startedAt: normalizeTimestamp(row.session_time_created),
      endedAt: normalizeTimestamp(row.session_time_updated),
      messages: new Map(),
    });
  }
  return sessions.get(row.session_id);
}

function getOrCreateMessage(session, row) {
  if (!session.messages.has(row.message_id)) {
    session.messages.set(row.message_id, {
      data: safeJsonParse(row.message_data) ?? {},
      parts: [],
    });
  }
  return session.messages.get(row.message_id);
}

function normalizeDbSession(session) {
  const transcript = [];
  const toolCounts = {};
  const tokenTotals = buildEmptyTokenTotals();
  let userTurnCount = 0;
  let assistantTurnCount = 0;

  for (const message of session.messages.values()) {
    const role = message.data.role ?? 'assistant';
    if (role === 'user') userTurnCount += 1;
    if (role === 'assistant') assistantTurnCount += 1;

    for (const part of message.parts) {
      if (part?.type === 'tool' && typeof part.tool === 'string') {
        toolCounts[part.tool] = (toolCounts[part.tool] ?? 0) + 1;
      }
    }

    mergeTokenTotals(tokenTotals, extractMessageTokens(message));

    transcript.push({
      role,
      text: extractTranscriptText(message),
    });
  }

  return {
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    directory: session.directory,
    worktree: undefined,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    userTurnCount,
    assistantTurnCount,
    toolCallCount: Object.values(toolCounts).reduce((sum, count) => sum + count, 0),
    toolCounts,
    tokenTotals,
    transcript,
  };
}

function extractTranscriptText(message) {
  return message.parts
    .filter((part) => (part?.type === 'text' || part?.type === 'reasoning') && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function extractMessageTokens(message) {
  return normalizeTokenTotals(
    message.data.tokens
    ?? message.data.tokenTotals
    ?? message.data.usage
    ?? message.parts.find((part) => part?.type === 'step-finish')?.tokens
    ?? message.parts.find((part) => part?.type === 'step-finish')?.usage,
  );
}

function normalizeTokenTotals(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    return buildEmptyTokenTotals();
  }

  return {
    input: numberOrZero(tokens.input ?? tokens.input_tokens),
    output: numberOrZero(tokens.output ?? tokens.output_tokens),
    reasoning: numberOrZero(tokens.reasoning ?? tokens.reasoning_tokens),
    cache: {
      read: numberOrZero(tokens.cache?.read ?? tokens.cache_read_input_tokens),
      write: numberOrZero(tokens.cache?.write ?? tokens.cache_creation_input_tokens),
    },
  };
}

function mergeTokenTotals(target, source) {
  target.input += source.input;
  target.output += source.output;
  target.reasoning += source.reasoning;
  target.cache.read += source.cache.read;
  target.cache.write += source.cache.write;
}

function buildEmptyTokenTotals() {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ''
    ? new Date(numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function safeJsonParse(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : Number(value) || 0;
}
```

- [ ] **Step 4: Re-run the ingest test file to verify it passes**

Run: `node --test "/Users/twc/Projects/agent-insights/test/core/ingest/load-insight-sessions.test.js"`
Expected: PASS with the new traversal test green and the existing fixture and DB-backed ingest tests still passing.

### Task 4: Tighten Install Docs and Published Package Surface

**Files:**
- Modify: `/Users/twc/Projects/agent-insights/README.md`
- Modify: `/Users/twc/Projects/agent-insights/package.json`

- [ ] **Step 1: Update the README with the approved trust-boundary warnings**

```md
<!-- /Users/twc/Projects/agent-insights/README.md -->
# Agent Insights

GitHub-installable OpenCode `/insights` plugin with a portable analysis core.

## Local Development Install

DB-backed OpenCode ingestion requires the local `sqlite3` CLI to be installed and available on your `PATH`.

When `small_model` is configured, `/insights` sends redacted transcript excerpts and redacted path metadata to the configured model provider for lightweight enrichment.

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

Use a trusted repository URL and pin a ref when you publish this plugin.

Replace `acme/agent-insights` and `COMMIT_SHA` with your real published repository before copying this example.

```json
{
  "plugin": [
    "agent-insights@git+https://github.com/acme/agent-insights.git#COMMIT_SHA"
  ]
}
```

## Trust Notes

- This plugin executes the local `sqlite3` binary from your `PATH` when OpenCode state is DB-backed.
- Install and run it only on a trusted local machine with a trusted `PATH` and trusted plugin source.

## Test Command

```bash
node --test "test/**/*.test.js"
```
```

- [ ] **Step 2: Add a `files` allowlist to `package.json` so `npm pack` only includes runtime files**

```json
// /Users/twc/Projects/agent-insights/package.json
{
  "name": "agent-insights",
  "version": "0.1.0",
  "type": "module",
  "main": ".opencode/plugins/agent-insights.js",
  "files": [
    ".opencode/",
    "src/",
    "README.md"
  ],
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 3: Run the package-surface verification command**

Run: `npm pack --dry-run`
Expected: the tarball contents list includes `.opencode/`, `src/`, `README.md`, and `package.json`, but no `docs/`, `test/`, or fixture files.

- [ ] **Step 4: Run the full test suite as the final regression check**

Run: `npm test`
Expected: PASS with 17 tests passing or the new total after the added security regression tests, and 0 failures.
