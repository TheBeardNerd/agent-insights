import test from 'node:test';
import assert from 'node:assert/strict';

import { createPromptSession } from '../../src/opencode/prompt-session.js';
import { redactForLlm } from '../../src/core/analyze/redact-for-llm.js';

test('createPromptSession prefers the analyzed session directory', async () => {
  const calls = [];
  const rawDir = '/workspace/session';
  const redactedDir = redactForLlm(rawDir);
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
    { directory: rawDir, worktree: '/workspace/session-worktree' },
    { providerID: 'openai', modelID: 'gpt-5-mini' },
    'facet prompt',
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], ['create', { directory: redactedDir }]);
  assert.equal(calls[1][1].directory, redactedDir);
  assert.deepEqual(calls[2], ['delete', { sessionID: 'tmp-session', directory: redactedDir }]);
});

test('createPromptSession redacts directory metadata before sending to client', async () => {
  const rawDirectory = '/Users/twc/Projects/my-project';
  const redactedDirectory = redactForLlm(rawDirectory);

  const calls = [];
  const promptSession = createPromptSession({
    state: { path: { directory: rawDirectory } },
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
    { directory: rawDirectory },
    { providerID: 'openai', modelID: 'gpt-5-mini' },
    'facet prompt',
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0][1].directory, redactedDirectory);
  assert.equal(calls[1][1].directory, redactedDirectory);
  assert.equal(calls[2][1].directory, redactedDirectory);
});
