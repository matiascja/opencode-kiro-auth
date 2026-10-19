import { describe, expect, mock, test } from 'bun:test'

mock.module('../plugin/logger.js', () => ({
  debug: () => {},
  error: () => {},
  getTimestamp: () => '2026-10-16T00:00:00.000Z',
  log: () => {},
  logApiError: () => {},
  logApiRequest: () => {},
  logApiResponse: () => {},
  warn: () => {}
}))

const { RequestHandler } = await import('../core/request/request-handler.js')

function createHarness(options: { autoSync: boolean; syncedAccounts: any[] }) {
  const stale: any = {
    id: 'account-1',
    email: 'user@example.com',
    authMethod: 'idc',
    expiresAt: Date.now() - 60_000,
    isHealthy: false,
    unhealthyReason: 'Invalid refresh token provided',
    failCount: 10
  }
  const accounts = [stale]
  let stored: any[] = [stale]
  let syncCalls = 0

  const accountManager: any = {
    getAccounts: () => accounts,
    addAccount: (acc: any) => {
      const i = accounts.findIndex((a) => a.id === acc.id)
      if (i === -1) accounts.push(acc)
      else accounts[i] = acc
    }
  }
  const repository: any = {
    invalidateCache: () => {},
    findAll: async () => stored
  }
  const config: any = { auto_sync_kiro_cli: options.autoSync }

  const handler: any = new RequestHandler(accountManager, config, repository)
  handler.syncKiroCli = async () => {
    syncCalls++
    stored = options.syncedAccounts
  }

  return { handler, accounts, getSyncCalls: () => syncCalls }
}

const freshAccount = () => ({
  id: 'account-1',
  email: 'user@example.com',
  authMethod: 'idc',
  expiresAt: Date.now() + 3_600_000,
  isHealthy: true,
  failCount: 0
})

describe('RequestHandler Kiro CLI recovery', () => {
  test('recovers a new Kiro CLI login without OAuth or a service restart', async () => {
    const { handler, accounts, getSyncCalls } = createHarness({
      autoSync: true,
      syncedAccounts: [freshAccount()]
    })
    const toasts: string[] = []

    const recovered = await handler.triggerReauth((message: string) => toasts.push(message))

    expect(recovered).toBe(true)
    expect(getSyncCalls()).toBe(1)
    expect(accounts[0].isHealthy).toBe(true)
    expect(handler.allAccountsPermanentlyUnhealthy()).toBe(false)
    expect(toasts).toEqual(['Credentials recovered from Kiro CLI sync.'])
  })

  test('falls through to re-auth when Kiro CLI has no usable login', async () => {
    const { handler, getSyncCalls } = createHarness({ autoSync: true, syncedAccounts: [] })

    expect(await handler.triggerReauth(() => {})).toBe(false)
    expect(getSyncCalls()).toBe(1)
  })

  test('does not read Kiro CLI when auto sync is disabled', async () => {
    const { handler, getSyncCalls } = createHarness({
      autoSync: false,
      syncedAccounts: [freshAccount()]
    })

    expect(await handler.triggerReauth(() => {})).toBe(false)
    expect(getSyncCalls()).toBe(0)
  })
})
