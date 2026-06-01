import { describe, expect, test } from 'bun:test'
import { deduplicateAccounts, mergeAccounts } from '../plugin/storage/locked-operations.js'
import type { ManagedAccount } from '../plugin/types.js'

const base: ManagedAccount = {
  id: 'old-id',
  email: 'matias@jetsmart.com',
  authMethod: 'idc',
  region: 'us-east-1',
  profileArn: 'arn:aws:codewhisperer:us-east-1:111:profile/X',
  refreshToken: 'refresh-old',
  accessToken: 'access-old',
  expiresAt: 1_700_000_000_000,
  rateLimitResetTime: 0,
  isHealthy: true,
  failCount: 0
}

describe('deduplicateAccounts', () => {
  test('deduplicates IDC accounts by logical identity instead of id', () => {
    const rows = deduplicateAccounts([
      base,
      {
        ...base,
        id: 'new-stable-id',
        refreshToken: 'refresh-new',
        accessToken: 'access-new',
        expiresAt: base.expiresAt + 1000
      }
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('new-stable-id')
    expect(rows[0]!.refreshToken).toBe('refresh-new')
  })

  test('prefers healthy IDC account over stale permanent-error ghost row', () => {
    const rows = deduplicateAccounts([
      {
        ...base,
        isHealthy: false,
        unhealthyReason: 'Refresh failed: Invalid refresh token provided',
        expiresAt: base.expiresAt + 100_000
      },
      {
        ...base,
        id: 'healthy-id',
        refreshToken: 'refresh-healthy',
        accessToken: 'access-healthy',
        isHealthy: true,
        expiresAt: base.expiresAt
      }
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('healthy-id')
    expect(rows[0]!.isHealthy).toBe(true)
  })

  test('does not dedupe non-IDC accounts with different ids', () => {
    const rows = deduplicateAccounts([
      { ...base, id: 'desktop-a', authMethod: 'desktop' },
      { ...base, id: 'desktop-b', authMethod: 'desktop' }
    ])

    expect(rows).toHaveLength(2)
  })
})

describe('mergeAccounts', () => {
  test('healthy CLI sync revives same IDC account after permanent refresh error', () => {
    const rows = mergeAccounts(
      [
        {
          ...base,
          isHealthy: false,
          unhealthyReason: 'Refresh failed: Invalid refresh token provided',
          failCount: 10,
          lastUsed: 1_700_000_000_000,
          lastSync: 1_700_000_000_000
        }
      ],
      [
        {
          ...base,
          refreshToken: 'refresh-new',
          accessToken: 'access-new',
          expiresAt: base.expiresAt + 1000,
          isHealthy: true,
          failCount: 0,
          usedCount: 6000,
          limitCount: 10000,
          lastSync: 1_700_000_010_000
        }
      ]
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.isHealthy).toBe(true)
    expect(rows[0]!.unhealthyReason).toBeUndefined()
    expect(rows[0]!.failCount).toBe(0)
    expect(rows[0]!.refreshToken).toBe('refresh-new')
  })
})
