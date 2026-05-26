export function isPermanentError(reason?: string): boolean {
  if (!reason) return false
  return (
    reason.includes('Invalid refresh token') ||
    reason.includes('Invalid grant provided') ||
    reason.includes('invalid_grant') ||
    reason.includes('ExpiredTokenException') ||
    reason.includes('InvalidTokenException') ||
    reason.includes('ExpiredClientException') ||
    reason.includes('Client is expired') ||
    reason.includes('HTTP_401') ||
    reason.includes('HTTP_403')
  )
}

/**
 * Stale-unhealthy threshold for ghost-account cleanup.
 *
 * Rationale: IAM Identity Center (IDC) sessions expire on a fixed cadence
 * (8h for many corporate setups). Each `kiro-cli login` mints a fresh
 * device-registration `clientId`, which historically changed the deterministic
 * account id and left the previous row in the DB with `Invalid refresh token`.
 * After 24h with a permanent error and no usage, the row is safe to drop.
 */
export const STALE_UNHEALTHY_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function isStaleUnhealthy(
  reason: string | undefined,
  lastUsed: number | undefined,
  now: number = Date.now()
): boolean {
  if (!isPermanentError(reason)) return false
  const last = lastUsed || 0
  if (last <= 0) return false
  return now - last > STALE_UNHEALTHY_THRESHOLD_MS
}
