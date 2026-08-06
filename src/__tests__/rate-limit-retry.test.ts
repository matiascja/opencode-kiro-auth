import { describe, expect, test } from 'bun:test'
import { ErrorHandler } from '../core/request/error-handler.js'

function createHarness(maxRetries = 2) {
  const account: any = { id: 'account-1', email: 'user@example.com' }
  const accountManager: any = {
    getAccounts: () => [account],
    getAccountCount: () => 1,
    markRateLimited: () => {}
  }
  const repository: any = { batchSave: async () => {} }
  const handler = new ErrorHandler(
    { rate_limit_max_retries: maxRetries, rate_limit_retry_delay_ms: 5000 },
    accountManager,
    repository
  )

  return { account, handler }
}

describe('ErrorHandler rate-limit recovery', () => {
  test('increments the retry count after a 429', async () => {
    const { account, handler } = createHarness()
    const response = new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '0' }
    })

    const result = await handler.handle(null, response, account, { retry: 0 }, () => {})

    expect(result).toEqual({
      shouldRetry: true,
      newContext: { retry: 1 }
    })
  })

  test('stops retrying a 429 after the configured limit', async () => {
    const { account, handler } = createHarness(2)
    const response = new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '0' }
    })

    const result = await handler.handle(null, response, account, { retry: 2 }, () => {})

    expect(result).toEqual({ shouldRetry: false })
  })
})
