import { createHash } from 'crypto';
import type { IncomingHttpHeaders } from 'http';

/**
 * Generates a device fingerprint from HTTP request headers and IP address.
 *
 * The fingerprint is a risk signal, not a hard security gate — HTTP headers are
 * spoofable. Its purpose is to detect accidental device changes (new browser,
 * new machine) and raise the auth risk score for step-up verification.
 *
 * Returns the first 32 hex characters of a SHA-256 digest (~128 bits).
 */
export function generateFingerprint(
  headers: IncomingHttpHeaders,
  ipAddress?: string,
): string {
  const components = [
    headers['user-agent'] ?? '',
    headers['accept-language'] ?? '',
    headers['accept-encoding'] ?? '',
    headers['accept'] ?? '',
    ipAddress ?? '',
  ];

  return createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .slice(0, 32);
}
