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

test('enrichSessions redacts realistic secret formats and local paths before building the prompt', async () => {
  let capturedPrompt = null;

  await enrichSessions({
    sessions: [
      {
        sessionId: 's5',
        transcript: [
          {
            role: 'user',
            text: 'Use Authorization: Bearer abc123 and inspect /Users/twc/Projects/agent-insights/.env for the failure.',
          },
          {
            role: 'assistant',
            text: 'The config shows password="my secret value" in the copied snippet.',
          },
          {
            role: 'user',
            text: '{"secret": "value with spaces inside"}',
          },
          {
            role: 'assistant',
            text: '{"Authorization": "Bearer abc123"}',
          },
          {
            role: 'user',
            text: '{"authorization":"Basic Zm9vOmJhcg=="}',
          },
        ],
      },
    ],
    smallModel: { providerID: 'openai', modelID: 'gpt-5-mini' },
    promptSession: async (_session, _smallModel, prompt) => {
      capturedPrompt = prompt;
      return {
        sentiment: 'neutral',
        failureTaxonomy: ['buggy_code'],
        taskCategory: 'debugging',
        confidence: 0.75,
      };
    },
  });

  assert.ok(capturedPrompt, 'expected promptSession to receive a prompt');
  assert.equal(capturedPrompt.includes('Bearer abc123'), false);
  assert.equal(capturedPrompt.includes('Basic Zm9vOmJhcg=='), false);
  assert.equal(capturedPrompt.includes('my secret value'), false);
  assert.equal(capturedPrompt.includes('value with spaces inside'), false);
  assert.equal(capturedPrompt.includes('/Users/twc/Projects/agent-insights/.env'), false);
  assert.equal(capturedPrompt.includes('[REDACTED_SECRET]'), true);
  assert.equal(capturedPrompt.includes('[REDACTED_PATH]'), true);
});
