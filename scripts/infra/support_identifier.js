/**
 * Edora Opaque Support Identifier Generator
 * Derives a human-readable, collision-resistant, non-enumerable support token
 * from user UUID using HMAC-SHA256 and server-side secret SUPPORT_HMAC_KEY.
 *
 * Format: ED-XXXX-XXXX-XXXX-XXXX (64-bit truncated hex digest)
 */

import crypto from 'crypto';

export function generateSupportId(userId, secretKey = process.env.SUPPORT_HMAC_KEY) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user_id string is required to generate a support identifier.');
  }

  // Fallback to a predictable test key in development if secretKey is not configured
  const key = secretKey || 'edora-default-dev-support-hmac-key';

  const hmac = crypto.createHmac('sha256', key);
  hmac.update(userId.toLowerCase().trim());
  const digest = hmac.digest('hex'); // 64 hex chars (256 bits)

  // Truncate to first 16 hex chars (64 bits)
  const truncated = digest.substring(0, 16).toUpperCase();

  // Format into 4-character blocks: ED-XXXX-XXXX-XXXX-XXXX
  const p1 = truncated.substring(0, 4);
  const p2 = truncated.substring(4, 8);
  const p3 = truncated.substring(8, 12);
  const p4 = truncated.substring(12, 16);

  return `ED-${p1}-${p2}-${p3}-${p4}`;
}
