import { redactForLlm } from '../core/analyze/redact-for-llm.js';

export function createPromptSession(api) {
  return async function promptSession(session, smallModel, prompt) {
    const client = api.client;
    if (!client?.session?.create || !client?.session?.prompt) {
      return undefined;
    }

    const rawDirectory =
      session?.directory ??
      session?.worktree ??
      api.state?.path?.directory ??
      api.state?.path?.worktree;
    const directory = (() => {
      const redacted = rawDirectory ? redactForLlm(rawDirectory) : '';
      return redacted || undefined;
    })();
    const created = await client.session.create(directory ? { directory } : {});
    const tempSession = created?.data ?? created;
    const tempSessionID = tempSession?.id;
    if (!tempSessionID) {
      return undefined;
    }

    try {
      const response = await client.session.prompt({
        sessionID: tempSessionID,
        directory,
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
        await client.session.delete({ sessionID: tempSessionID, directory }).catch(() => undefined);
      }
    }
  };
}
