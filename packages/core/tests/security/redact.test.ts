import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../../src/security/redact.js';

describe('redactSecrets', () => {
  it('redacts an AWS access key mixed with ordinary text (AC-1)', () => {
    const input = 'evidence: found key AKIAABCDEFGHIJKLMNOP in the config file';
    const result = redactSecrets(input);
    expect(result).toBe('evidence: found key [REDACTED] in the config file');
  });

  it('redacts a GitHub token mixed with ordinary text (AC-1)', () => {
    const input = 'leaked token ghp_1234567890abcdefWXYZ1234 was committed';
    const result = redactSecrets(input);
    expect(result).toBe('leaked token [REDACTED] was committed');
  });

  it('redacts an Authorization bearer header value, keeping the word Authorization (AC-1)', () => {
    const input = 'request had Authorization: Bearer sk-live-abc123DEF456 attached';
    const result = redactSecrets(input);
    expect(result).toContain('Authorization: [REDACTED]');
    expect(result).toBe('request had Authorization: [REDACTED] attached');
  });

  it('redacts an authorization basic header value case-insensitively (AC-1)', () => {
    const input = 'saw authorization: basic dXNlcjpwYXNzd29yZA== in the diff';
    const result = redactSecrets(input);
    expect(result).toBe('saw authorization: [REDACTED] in the diff');
  });

  it('redacts a JWT-shaped string mixed with ordinary text (AC-1)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const input = `note found ${jwt} embedded in log`;
    const result = redactSecrets(input);
    expect(result).toBe('note found [REDACTED] embedded in log');
  });

  it('redacts a PEM private key block mixed with ordinary text (AC-1)', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEr\n-----END RSA PRIVATE KEY-----';
    const input = `before\n${pem}\nafter`;
    const result = redactSecrets(input);
    expect(result).toBe('before\n[REDACTED]\nafter');
  });

  it('redacts a generic key= assignment mixed with ordinary text (AC-1)', () => {
    const input = 'config had api_key="sk-abc123XYZ456verylong" set explicitly';
    const result = redactSecrets(input);
    expect(result).toBe('config had api_key=[REDACTED] set explicitly');
  });

  it('redacts a generic password= assignment without quotes (AC-1)', () => {
    const input = 'the line password=hunter2xyzLONG was found in .env';
    const result = redactSecrets(input);
    expect(result).toBe('the line password=[REDACTED] was found in .env');
  });

  it('redacts a generic token= assignment (AC-1)', () => {
    const input = 'set token: "abcdef0123456789ghij" for the client';
    const result = redactSecrets(input);
    expect(result).toBe('set token: [REDACTED] for the client');
  });

  it('redacts a generic secret= assignment (AC-1)', () => {
    const input = 'secret=supersecretvalue123 was hardcoded';
    const result = redactSecrets(input);
    expect(result).toBe('secret=[REDACTED] was hardcoded');
  });

  it('leaves ordinary text with no secrets completely unchanged (AC-1)', () => {
    const input =
      'This is a perfectly ordinary sentence about deploying the service and checking logs for errors.';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it('does not redact non-secret identifiers ending in "Key" or "Token" (AC-1)', () => {
    const input = 'DynamoDB scan returned partitionKey=user-12345 sortKey=order-67890';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it('does not redact a non-secret identifier ending in "Token" (AC-1)', () => {
    const input = 'response included fooToken=abc123def456 in the payload';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it('redacts an underscore-prefixed "my_api_key:" assignment (AC-1)', () => {
    const input = 'my_api_key: abcdef0123456789';
    const result = redactSecrets(input);
    expect(result).toBe('my_api_key: [REDACTED]');
  });

  it('redacts a SNAKE_CASE "DB_PASSWORD=" env-var-style assignment (AC-1)', () => {
    const input = 'DB_PASSWORD=hunter2xyzLONG';
    const result = redactSecrets(input);
    expect(result).toBe('DB_PASSWORD=[REDACTED]');
  });

  it('redacts a SNAKE_CASE "AWS_SECRET_KEY=" env-var-style assignment (AC-1)', () => {
    const input = 'AWS_SECRET_KEY=abcdef0123456789';
    const result = redactSecrets(input);
    expect(result).toBe('AWS_SECRET_KEY=[REDACTED]');
  });
});
