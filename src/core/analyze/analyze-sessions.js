function classifyWorkType(session) {
  const text = session.transcript.map((part) => part.text ?? '').join(' ').toLowerCase();
  if (text.includes('debug') || text.includes('failing test')) return 'debugging';
  if (text.includes('refactor')) return 'refactoring';
  if (text.includes('setup')) return 'setup';
  return 'featureWork';
}

function classifyFrictions(session) {
  const ls = session.toolCounts?.ls ?? 0;
  const glob = session.toolCounts?.glob ?? 0;
  const grep = session.toolCounts?.grep ?? 0;
  return ls >= 3 && glob + grep === 0 ? ['search-underuse'] : [];
}

export function analyzeSessions(sessions) {
  const durations = sessions
    .map((session) => getDurationMinutes(session))
    .filter((duration) => duration !== null);

  const summary = {
    sessionsAnalyzed: sessions.length,
    totalTokens: sessions.reduce(
      (sum, session) =>
        sum +
        (session.tokenTotals?.input ?? 0) +
        (session.tokenTotals?.output ?? 0) +
        (session.tokenTotals?.reasoning ?? 0),
      0,
    ),
    averageDurationMinutes: durations.length
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      : 0,
  };

  const workMix = { featureWork: 0, debugging: 0, setup: 0, refactoring: 0 };
  for (const session of sessions) {
    workMix[classifyWorkType(session)] += 1;
  }

  const searchUnderuseCount = sessions.filter((session) => classifyFrictions(session).includes('search-underuse')).length;

  const frictionRanking = searchUnderuseCount
    ? [
        {
          key: 'search-underuse',
          label: 'Search tool underuse',
          score: searchUnderuseCount,
          evidence: `${searchUnderuseCount} session(s) used repeated ls with no grep/glob`,
        },
      ]
    : [];

  const workflowSuggestions = searchUnderuseCount
    ? ['Use glob or grep before repeated ls to reduce navigation churn.']
    : [];

  return {
    summary,
    searchUnderuseCount,
    frictionRanking,
    workflowSuggestions,
    workMix,
  };
}

function getDurationMinutes(session) {
  const startedAt = Date.parse(session.startedAt ?? '');
  const endedAt = Date.parse(session.endedAt ?? '');
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return null;
  }

  return (endedAt - startedAt) / (60 * 1000);
}
