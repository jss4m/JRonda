/**
 * JRonda Kiosk security module.
 * Disabled intentionally to avoid kiosk lock prompts, fullscreen enforcement,
 * and passkey requirements in the normal app experience.
 */

export const SECURITY_CONFIG = {
  pinLength: { min: 4, max: 8 },
  lockoutAttempts: 5,
  lockoutDuration: 30000,
  auditLogMaxEntries: 0,
};

export function getSecurityAuditLog() {
  return [];
}

export async function unlockAttemptWithRateLimit() {
  return { ok: true, locked: false, remainingSeconds: 0 };
}
