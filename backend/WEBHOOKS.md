Webhook specification for consumers

Headers
- X-Webhook-Timestamp: Unix epoch seconds (e.g. 1622547800)
- X-Webhook-Signature: sha256=<hex>  (HMAC-SHA256 of JSON payload using shared secret)

Verification pseudocode
1. Parse and reject if missing headers.
2. Ensure timestamp within ±window (default 300s).
3. Compute expected = HMAC_SHA256(secret, JSON.stringify(body)) hex.
4. Compare using constant-time compare (timingSafeEqual).
5. Reject with 401 on mismatch.

Key rotation guidance
- Support per-endpoint keys where possible. Maintain a key ID mapping on consumers.
- Rotate keys by starting to sign with new key while still accepting old key for a short overlap window.
- Revoke old keys from acceptance after rotation interval.
- Never embed secrets in client-side code; use a secure secret manager.

Payload structure
- Webhooks are JSON objects. No fields are required universally; each event defines its payload.
- When including identifiers, use non-sensitive stable IDs (transfer_id, receipt_id). Do not include PII.
