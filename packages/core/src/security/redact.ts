const REDACTED = '[REDACTED]';

const AWS_ACCESS_KEY_RE = /AKIA[A-Z0-9]{16}/g;
const GITHUB_TOKEN_RE = /gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}/g;
// capture group keeps "Authorization: "/"authorization: " literal; scheme word + credential value are both replaced
const AUTH_HEADER_RE = /(authorization\s*[:=]\s*)(?:bearer|basic|token)\s+\S+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// non-greedy body + PRIVATE KEY marker match spans multi-line PEM blocks without runaway backtracking
const PEM_PRIVATE_KEY_RE =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
// keeps the "key=" prefix literal so callers can still see which field was redacted
// negative lookbehind stops the keyword alternation matching as a bare substring inside a
// longer identifier (e.g. "partitionKey=", "sortKey=") — it must start a standalone token.
// Underscore is deliberately excluded from the lookbehind's excluded set: SNAKE_CASE
// env-var-style secrets (DB_PASSWORD=, AWS_SECRET_KEY=, my_api_key:) are an extremely common
// real-world secret shape and must still be redacted; only a preceding letter/digit (no
// separator) indicates a camelCase identifier like partitionKey=/sortKey=/fooToken=.
const GENERIC_SECRET_RE =
  /(?<![A-Za-z0-9])((?:api[_-]?key|key|token|password|secret)\s*[:=]\s*)(?:"[^"]{6,}"|'[^']{6,}'|\S{6,})/gi;

// deja:new dedup hook match against stickyFlags() in verify/coverage-profiles/engine.ts is a structural
// false positive (unrelated regex-flag helper); this function redacts credential substrings, no overlap
export function redactSecrets(text: string): string {
  return text
    .replace(PEM_PRIVATE_KEY_RE, REDACTED)
    .replace(AUTH_HEADER_RE, `$1${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(AWS_ACCESS_KEY_RE, REDACTED)
    .replace(GITHUB_TOKEN_RE, REDACTED)
    .replace(GENERIC_SECRET_RE, `$1${REDACTED}`);
}
