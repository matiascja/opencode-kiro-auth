import { describe, expect, test } from 'bun:test'
import { TokenRefresher } from '../core/auth/token-refresher.js'
import { KiroTokenRefreshError } from '../plugin/errors.js'

describe('TokenRefresher CLI recovery', () => {
  test('updates the in-memory account and resumes with recovered credentials', async () => {
    const staleAccount: any = {
      id: 'account-1',
      email: 'user@example.com',
      accessToken: 'stale-access',
      expiresAt: Date.now() - 60_000
    }
    const recoveredAccount: any = {
      ...staleAccount,
      accessToken: 'recovered-access',
      expiresAt: Date.now() + 3_600_000
    }
    let inMemoryAccount = staleAccount
    const accountManager: any = {
      addAccount: (account: any) => {
        inMemoryAccount = account
      },
      toAuthDetails: (account: any) => ({
        access: account.accessToken,
        expires: account.expiresAt
      })
    }
    const repository: any = {
      invalidateCache: () => {},
      findAll: async () => [recoveredAccount]
    }
    const refresher = new TokenRefresher(
      {
        token_expiry_buffer_ms: 0,
        auto_sync_kiro_cli: true,
        account_selection_strategy: 'sticky'
      },
      accountManager,
      async () => {},
      repository
    )
    const toasts: string[] = []

    const result = await (refresher as any).handleRefreshError(
      new KiroTokenRefreshError('Invalid token', 'HTTP_401'),
      staleAccount,
      (message: string) => toasts.push(message)
    )

    expect(inMemoryAccount).toBe(recoveredAccount)
    expect(result).toEqual({ account: recoveredAccount, shouldContinue: false })
    expect(toasts).toEqual(['Credentials recovered from Kiro CLI sync.'])
  })
})
