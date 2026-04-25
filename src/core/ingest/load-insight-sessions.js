import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { isGhostSession, isInsideTrailingWindow } from './filter.js';

const execFileAsync = promisify(execFile);

export async function loadInsightSessions({
  stateRoot,
  now = new Date(),
  readText = defaultReadText,
  queryRows = defaultQueryRows,
}) {
  const dbPath = path.join(stateRoot, 'opencode.db');
  if (await pathExists(dbPath)) {
    return loadInsightSessionsFromDb({ dbPath, now, queryRows });
  }

  return loadInsightSessionsFromDirectory({ stateRoot, now, readText });
}

async function loadInsightSessionsFromDirectory({ stateRoot, now, readText }) {
  const sessionsDir = path.join(stateRoot, 'sessions');
  const messagesDir = path.join(stateRoot, 'messages');
  const sessionFiles = await fs.readdir(sessionsDir);
  const output = [];

  for (const fileName of sessionFiles) {
    if (!fileName.endsWith('.json')) continue;
    const session = JSON.parse(await readText(path.join(sessionsDir, fileName)));
    const messages = JSON.parse(await loadMessages({ messagesDir, readText, sessionId: session.id }));
    const userTurnCount = messages.filter((message) => message.role === 'user').length;
    const toolCallCount = messages.reduce((count, message) => count + (message.tools?.length ?? 0), 0);
    const toolCounts = {};
    for (const message of messages) {
      for (const toolName of message.tools ?? []) {
        toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
      }
    }

    const normalized = {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      directory: session.directory,
      worktree: session.worktree,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      userTurnCount,
      assistantTurnCount: messages.filter((message) => message.role === 'assistant').length,
      toolCallCount,
      toolCounts,
      tokenTotals: buildEmptyTokenTotals(),
      transcript: messages.map((message) => ({
        role: message.role ?? 'assistant',
        text: typeof message.text === 'string' ? message.text : '',
      })),
    };
    if (!isInsideTrailingWindow(normalized, now)) continue;
    if (isGhostSession(normalized)) continue;
    output.push(normalized);
  }

  return output;
}

async function loadInsightSessionsFromDb({ dbPath, now, queryRows }) {
  const rows = await queryRows(dbPath, `
    select
      s.id as session_id,
      s.workspace_id,
      s.directory,
      s.time_created as session_time_created,
      s.time_updated as session_time_updated,
      m.id as message_id,
      m.data as message_data,
      p.data as part_data
    from session s
    left join message m on m.session_id = s.id
    left join part p on p.message_id = m.id
    order by s.time_updated desc, m.time_created asc, p.time_created asc
  `);

  const sessions = new Map();
  for (const row of rows) {
    const session = getOrCreateSession(sessions, row);
    if (!row.message_id) continue;

    const message = getOrCreateMessage(session, row);
    const part = safeJsonParse(row.part_data);
    if (part) {
      message.parts.push(part);
    }
  }

  const output = [];
  for (const session of sessions.values()) {
    const normalized = normalizeDbSession(session);
    if (!isInsideTrailingWindow(normalized, now)) continue;
    if (isGhostSession(normalized)) continue;
    output.push(normalized);
  }
  return output;
}

async function defaultReadText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function defaultQueryRows(dbPath, sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql]);
  return safeJsonParse(stdout) ?? [];
}

function isSafeSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(sessionId);
}

async function loadMessages({ messagesDir, readText, sessionId }) {
  if (!isSafeSessionId(sessionId)) {
    return '[]';
  }

  try {
    return await readText(path.join(messagesDir, `${sessionId}.json`));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '[]';
    }

    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getOrCreateSession(sessions, row) {
  if (!sessions.has(row.session_id)) {
    sessions.set(row.session_id, {
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      directory: row.directory,
      startedAt: normalizeTimestamp(row.session_time_created),
      endedAt: normalizeTimestamp(row.session_time_updated),
      messages: new Map(),
    });
  }
  return sessions.get(row.session_id);
}

function getOrCreateMessage(session, row) {
  if (!session.messages.has(row.message_id)) {
    session.messages.set(row.message_id, {
      data: safeJsonParse(row.message_data) ?? {},
      parts: [],
    });
  }
  return session.messages.get(row.message_id);
}

function normalizeDbSession(session) {
  const transcript = [];
  const toolCounts = {};
  const tokenTotals = buildEmptyTokenTotals();
  let userTurnCount = 0;
  let assistantTurnCount = 0;

  for (const message of session.messages.values()) {
    const role = message.data.role ?? 'assistant';
    if (role === 'user') userTurnCount += 1;
    if (role === 'assistant') assistantTurnCount += 1;

    for (const part of message.parts) {
      if (part?.type === 'tool' && typeof part.tool === 'string') {
        toolCounts[part.tool] = (toolCounts[part.tool] ?? 0) + 1;
      }
    }

    mergeTokenTotals(tokenTotals, extractMessageTokens(message));

    transcript.push({
      role,
      text: extractTranscriptText(message),
    });
  }

  return {
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    directory: session.directory,
    worktree: undefined,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    userTurnCount,
    assistantTurnCount,
    toolCallCount: Object.values(toolCounts).reduce((sum, count) => sum + count, 0),
    toolCounts,
    tokenTotals,
    transcript,
  };
}

function extractTranscriptText(message) {
  return message.parts
    .filter((part) => (part?.type === 'text' || part?.type === 'reasoning') && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function extractMessageTokens(message) {
  return normalizeTokenTotals(
    message.data.tokens
    ?? message.data.tokenTotals
    ?? message.data.usage
    ?? message.parts.find((part) => part?.type === 'step-finish')?.tokens
    ?? message.parts.find((part) => part?.type === 'step-finish')?.usage,
  );
}

function normalizeTokenTotals(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    return buildEmptyTokenTotals();
  }

  return {
    input: numberOrZero(tokens.input ?? tokens.input_tokens),
    output: numberOrZero(tokens.output ?? tokens.output_tokens),
    reasoning: numberOrZero(tokens.reasoning ?? tokens.reasoning_tokens),
    cache: {
      read: numberOrZero(tokens.cache?.read ?? tokens.cache_read_input_tokens),
      write: numberOrZero(tokens.cache?.write ?? tokens.cache_creation_input_tokens),
    },
  };
}

function mergeTokenTotals(target, source) {
  target.input += source.input;
  target.output += source.output;
  target.reasoning += source.reasoning;
  target.cache.read += source.cache.read;
  target.cache.write += source.cache.write;
}

function buildEmptyTokenTotals() {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ''
    ? new Date(numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function safeJsonParse(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : Number(value) || 0;
}
