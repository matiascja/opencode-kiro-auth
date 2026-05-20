import { describe, expect, test } from 'bun:test'
import { createDeterministicAccountId } from '../plugin/accounts.js'
import { createDeterministicId } from '../plugin/storage/locked-operations.js'

describe('createDeterministicAccountId', () => {
  test('IDC ids ignore clientId so reauths do not mint ghost rows', () => {
    const a = createDeterministicAccountId(
      'matias@jetsmart.com',
      'idc',
      'client-A',
      'arn:aws:codewhisperer:us-east-1:111:profile/X'
    )
    const b = createDeterministicAccountId(
      'matias@jetsmart.com',
      'idc',
      'client-B-rotated',
      'arn:aws:codewhisperer:us-east-1:111:profile/X'
    )
    expect(a).toBe(b)
  })

  test('non-IDC methods still differentiate by clientId', () => {
    const a = createDeterministicAccountId('me@example.com', 'desktop', 'client-A')
    const b = createDeterministicAccountId('me@example.com', 'desktop', 'client-B')
    expect(a).not.toBe(b)
  })

  test('different profileArn still produces different ids for IDC', () => {
    const a = createDeterministicAccountId(
      'matias@jetsmart.com',
      'idc',
      'cid',
      'arn:aws:codewhisperer:us-east-1:111:profile/X'
    )
    const b = createDeterministicAccountId(
      'matias@jetsmart.com',
      'idc',
      'cid',
      'arn:aws:codewhisperer:us-east-1:222:profile/Y'
    )
    expect(a).not.toBe(b)
  })

  test('matches createDeterministicId in locked-operations', () => {
    const a = createDeterministicAccountId('me@example.com', 'idc', 'cid', 'arn')
    const b = createDeterministicId('me@example.com', 'idc', 'cid', 'arn')
    expect(a).toBe(b)
  })
})
