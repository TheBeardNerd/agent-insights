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

function resolveConfiguredModel(model) {
  if (model && typeof model === 'object' && typeof model.providerID === 'string' && typeof model.modelID === 'string') {
    return model;
  }

  if (typeof model !== 'string') {
    return null;
  }

  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    return null;
  }

  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
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
    smallModel: resolveConfiguredModel(api.state?.config?.small_model),
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
