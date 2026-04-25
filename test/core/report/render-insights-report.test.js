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

test('renderInsightsReport guards localStorage access in the theme script', () => {
  const html = renderInsightsReport({
    generatedAt: '2026-04-21T12:00:00Z',
    summary: { sessionsAnalyzed: 12, totalTokens: 4200, averageDurationMinutes: 18 },
    frictionRanking: [{ label: 'Search tool underuse', evidence: 'Repeated ls with no grep/glob' }],
    workflowSuggestions: ['Use glob or grep before repeated ls to reduce navigation churn.'],
    workMix: { featureWork: 5, debugging: 4, setup: 2, refactoring: 1 },
  });

  assert.match(html, /try\s*\{\s*const saved = localStorage\.getItem\(key\);/);
  assert.match(html, /try\s*\{\s*localStorage\.setItem\(key, next\);/);
});

test('renderInsightsReport toggle derives the effective theme when no preference is saved', () => {
  const html = renderInsightsReport({
    generatedAt: '2026-04-21T12:00:00Z',
    summary: { sessionsAnalyzed: 12, totalTokens: 4200, averageDurationMinutes: 18 },
    frictionRanking: [{ label: 'Search tool underuse', evidence: 'Repeated ls with no grep/glob' }],
    workflowSuggestions: ['Use glob or grep before repeated ls to reduce navigation churn.'],
    workMix: { featureWork: 5, debugging: 4, setup: 2, refactoring: 1 },
  });

  assert.match(html, /matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/);
  assert.match(html, /const current = root\.dataset\.theme \|\| \(window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches \? 'dark' : 'light'\);/);
  assert.match(html, /const next = current === 'dark' \? 'light' : 'dark';/);
});
