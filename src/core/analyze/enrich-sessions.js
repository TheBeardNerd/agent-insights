import { redactForLlm } from './redact-for-llm.js';

function buildFacetPrompt(session) {
  const text = session.transcript
    .slice(0, 8)
    .map((part) => `${part.role}: ${redactForLlm(part.text)}`)
    .join('\n');

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
