export function isGhostSession(session) {
  return session.toolCallCount === 0 || session.userTurnCount < 2;
}

export function isInsideTrailingWindow(session, now, days = 30) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(session.endedAt ?? session.startedAt).getTime() >= cutoff;
}
