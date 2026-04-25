import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSessions } from '../../../src/core/analyze/analyze-sessions.js';

test('analyzeSessions computes summary metrics and workflow suggestions', () => {
  const report = analyzeSessions([
    {
      sessionId: 's1',
      startedAt: '2026-04-20T15:00:00Z',
      endedAt: '2026-04-20T15:20:00Z',
      userTurnCount: 3,
      assistantTurnCount: 3,
      toolCallCount: 6,
      toolCounts: { ls: 4, glob: 0, grep: 0, apply_patch: 2 },
      transcript: [
        { role: 'user', text: 'debug this failing test' },
        { role: 'assistant', text: 'running ls again after another error' },
      ],
      tokenTotals: { input: 100, output: 80, reasoning: 20, cache: { read: 0, write: 0 } },
    },
  ]);

  assert.equal(report.summary.sessionsAnalyzed, 1);
  assert.equal(report.summary.totalTokens, 200);
  assert.equal(report.summary.averageDurationMinutes, 20);
  assert.equal(report.searchUnderuseCount, 1);
  assert.match(report.workflowSuggestions[0], /glob|grep/);
  assert.equal(report.frictionRanking[0].key, 'search-underuse');
});
