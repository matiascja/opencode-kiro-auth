import { describe, expect, test } from 'bun:test'
import {
  isPermanentError,
  isStaleUnhealthy,
  STALE_UNHEALTHY_THRESHOLD_MS
} from '../plugin/health.js'

describe('isPermanentError', () => {
  test('returns false for undefined', () => {
    expect(isPermanentError(undefined)).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isPermanentError('')).toBe(false)
  })

  test('returns false for generic error', () => {
    expect(isPermanentError('Internal Server Error')).toBe(false)
    expect(isPermanentError('Rate limited')).toBe(false)
    expect(isPermanentError('Network timeout')).toBe(false)
  })

  test('detects Invalid refresh token', () => {
    expect(isPermanentError('Invalid refresh token')).toBe(true)
    expect(isPermanentError('Error: Invalid refresh token provided')).toBe(true)
  })

  test('detects Invalid token provided from refresh endpoint', () => {
    expect(isPermanentError('Refresh failed: Invalid token provided')).toBe(true)
  })

  test('detects Invalid grant provided', () => {
    expect(isPermanentError('Invalid grant provided')).toBe(true)
  })

  test('detects invalid_grant', () => {
    expect(isPermanentError('invalid_grant')).toBe(true)
    expect(isPermanentError('error: invalid_grant')).toBe(true)
  })

  test('detects ExpiredTokenException', () => {
    expect(isPermanentError('ExpiredTokenException')).toBe(true)
    expect(isPermanentError('AWS: ExpiredTokenException: token expired')).toBe(true)
  })

  test('detects InvalidTokenException', () => {
    expect(isPermanentError('InvalidTokenException')).toBe(true)
  })

  test('detects ExpiredClientException', () => {
    expect(isPermanentError('ExpiredClientException')).toBe(true)
  })

  test('detects Client is expired', () => {
    expect(isPermanentError('Client is expired')).toBe(true)
  })

  test('detects HTTP_401', () => {
    expect(isPermanentError('HTTP_401')).toBe(true)
    expect(isPermanentError('error HTTP_401 Unauthorized')).toBe(true)
  })

  test('does not treat HTTP_403 as permanent (token expiry — should refresh, not reauth)', () => {
    // HTTP_403 from Kiro means the access token expired mid-request.
    // This is recoverable via token refresh, not a permanent error.
    expect(isPermanentError('HTTP_403')).toBe(false)
    expect(isPermanentError('error HTTP_403 Forbidden')).toBe(false)
  })

  test('does not treat bearer token invalid as permanent (handled in error-handler with refresh)', () => {
    // bearer token invalid triggers a forced token refresh in ErrorHandler, not permanent unhealthy.
    expect(isPermanentError('The bearer token included in the request is invalid')).toBe(false)
    expect(isPermanentError('bearer token included in the request is invalid')).toBe(false)
  })

  test('detects Account Suspended', () => {
    expect(isPermanentError('Account Suspended')).toBe(true)
  })
})

describe('isStaleUnhealthy', () => {
  const now = 1_700_000_000_000

  test('returns false for transient errors regardless of age', () => {
    expect(isStaleUnhealthy('Network timeout', now - 999_999_999, now)).toBe(false)
  })

  test('returns false for permanent errors with no last_used', () => {
    expect(isStaleUnhealthy('Invalid refresh token', 0, now)).toBe(false)
    expect(isStaleUnhealthy('Invalid refresh token', undefined, now)).toBe(false)
  })

  test('returns false within threshold', () => {
    const within = now - (STALE_UNHEALTHY_THRESHOLD_MS - 1000)
    expect(isStaleUnhealthy('Invalid refresh token', within, now)).toBe(false)
  })

  test('returns true past threshold for permanent errors', () => {
    const stale = now - (STALE_UNHEALTHY_THRESHOLD_MS + 1000)
    expect(isStaleUnhealthy('Invalid refresh token', stale, now)).toBe(true)
    expect(isStaleUnhealthy('HTTP_401 unauthorized', stale, now)).toBe(true)
  })

  test('does not flag HTTP_403 as stale-unhealthy (token expiry, not permanent)', () => {
    // HTTP_403 is recoverable via token refresh (see isPermanentError above), so
    // it should never be eligible for the stale-ghost-account purge.
    const stale = now - (STALE_UNHEALTHY_THRESHOLD_MS + 1000)
    expect(isStaleUnhealthy('HTTP_403 forbidden', stale, now)).toBe(false)
  })
})
