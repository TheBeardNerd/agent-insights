const SECRET_PATTERNS = [
  {
    pattern: /(\bauthorization\b\s*:\s*)(?:bearer|basic|token)\s+[^\s,;]+/gi,
    replacer: '$1[REDACTED_SECRET]',
  },
  {
    pattern:
      /((["'])authorization\2\s*:\s*)(["'])(?:bearer|basic|token)\s+[^"']*\3/gi,
    replacer: '$1[REDACTED_SECRET]',
  },
  {
    pattern:
      /((?:["'])?(?:api[_-]?key|token|secret|password|passwd)(?:["'])?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|`[^`]*`)/gi,
    replacer: '$1[REDACTED_SECRET]',
  },
  {
    pattern:
      /((?:["'])?(?:api[_-]?key|token|secret|password|passwd)(?:["'])?\s*[:=]\s*)([^,;\n}\]]+?)(?=\s+(?:and|or|but)\b|\s*(?:[,;\n}\]]|$))/gi,
    replacer: '$1[REDACTED_SECRET]',
  },
  {
    pattern: /\bsk-(?:live|test)-[A-Za-z0-9_-]+\b/g,
    replacer: '[REDACTED_SECRET]',
  },
  {
    pattern: /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g,
    replacer: '[REDACTED_SECRET]',
  },
];

const PATH_PATTERNS = [
  /(?:~|\/)[^\s'"`]+(?:\/[^\s'"`]+)+/g,
  /\b[A-Za-z]:\\[^\s'"`]+(?:\\[^\s'"`]+)+/g,
];

const DEFAULT_MAX_LENGTH = 1000;

export function redactForLlm(text, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  if (!text) return '';

  let redacted = String(text);

  for (const { pattern, replacer } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacer);
  }

  for (const pattern of PATH_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_PATH]');
  }

  redacted = redacted.replace(/\s+/g, ' ').trim();

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, maxLength).trimEnd()}...`;
}
