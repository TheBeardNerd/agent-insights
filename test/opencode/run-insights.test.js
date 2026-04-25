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

test('runInsights parses configured small_model into provider and model IDs', async () => {
  let capturedSmallModel;

  await runInsights({
    api: {
      ui: { toast: () => {} },
      state: {
        path: { state: '/tmp/state-root' },
        config: { small_model: 'openai/gpt-5-mini' },
      },
    },
    loadInsightSessions: async () => [],
    analyzeSessions: () => ({
      summary: { sessionsAnalyzed: 0, totalTokens: 0, averageDurationMinutes: 0 },
      frictionRanking: [],
      workflowSuggestions: [],
      workMix: { featureWork: 0, debugging: 0, setup: 0, refactoring: 0 },
    }),
    enrichSessions: async ({ sessions, smallModel }) => {
      capturedSmallModel = smallModel;
      return sessions;
    },
    openReport: async () => {},
  });

  assert.deepEqual(capturedSmallModel, { providerID: 'openai', modelID: 'gpt-5-mini' });
});

test('runInsights skips enrichment model when small_model is not provider-qualified', async () => {
  let capturedSmallModel = 'unset';

  await runInsights({
    api: {
      ui: { toast: () => {} },
      state: {
        path: { state: '/tmp/state-root' },
        config: { small_model: 'gpt-5-mini' },
      },
    },
    loadInsightSessions: async () => [],
    analyzeSessions: () => ({
      summary: { sessionsAnalyzed: 0, totalTokens: 0, averageDurationMinutes: 0 },
      frictionRanking: [],
      workflowSuggestions: [],
      workMix: { featureWork: 0, debugging: 0, setup: 0, refactoring: 0 },
    }),
    enrichSessions: async ({ sessions, smallModel }) => {
      capturedSmallModel = smallModel;
      return sessions;
    },
    openReport: async () => {},
  });

  assert.equal(capturedSmallModel, null);
});
