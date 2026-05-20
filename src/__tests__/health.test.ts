import { describe, expect, test } from 'bun:test'
import {
  isPermanentError,
  isStaleUnhealthy,
  STALE_UNHEALTHY_THRESHOLD_MS
} from '../plugin/health.js'

describe('isPermanentError', () => {
  test('flags Invalid refresh token', () => {
    expect(isPermanentError('Refresh failed: Invalid refresh token provided')).toBe(true)
  })

  test('flags HTTP 401/403 markers', () => {
    expect(isPermanentError('HTTP_401 unauthorized')).toBe(true)
    expect(isPermanentError('HTTP_403 forbidden')).toBe(true)
  })

  test('returns false for empty/undefined reasons', () => {
    expect(isPermanentError(undefined)).toBe(false)
    expect(isPermanentError('')).toBe(false)
    expect(isPermanentError('Network timeout')).toBe(false)
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
    expect(isStaleUnhealthy('HTTP_403 forbidden', stale, now)).toBe(true)
  })
})
