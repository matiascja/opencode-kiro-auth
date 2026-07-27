import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import lockfile from 'proper-lockfile'
import { isPermanentError } from '../health'
import type { ManagedAccount } from '../types'

const LOCK_OPTIONS = {
  stale: 10000,
  retries: {
    retries: 5,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2
  },
  realpath: false
}

export async function withDatabaseLock<T>(dbPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = `${dbPath}.lock`

  if (!existsSync(dbPath)) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf('/'))
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(dbPath, '')
  }

  let release: (() => Promise<void>) | null = null
  try {
    release = await lockfile.lock(dbPath, LOCK_OPTIONS)
    return await fn()
  } finally {
    if (release) {
      try {
        await release()
      } catch (e) {
        console.warn('Failed to release lock:', e)
      }
    }
  }
}

export function createDeterministicId(
  email: string,
  authMethod: string,
  clientId?: string,
  profileArn?: string
): string {
  // Must exactly mirror `accounts.ts/createDeterministicAccountId` — this is a
  // thin duplicate kept here to avoid a circular import between accounts.ts
  // and locked-operations.ts. IDC clientId rotates on every `kiro-cli login`,
  // so it's excluded from the key for that auth method.
  const key =
    authMethod === 'idc'
      ? `${email}:${authMethod}:${profileArn || ''}`
      : `${email}:${authMethod}:${clientId || ''}:${profileArn || ''}`
  return createHash('sha256').update(key).digest('hex')
}

export function mergeAccounts(
  existing: ManagedAccount[],
  incoming: ManagedAccount[]
): ManagedAccount[] {
  const accountMap = new Map<string, ManagedAccount>()

  for (const acc of existing) {
    accountMap.set(acc.id, acc)
  }

  for (const acc of incoming) {
    const existingAcc = accountMap.get(acc.id)

    if (existingAcc) {
      const incomingHasPermanentError = isPermanentError(acc.unhealthyReason)
      const incomingRecovered = acc.isHealthy && !incomingHasPermanentError
      const hasPermanentError =
        !incomingRecovered &&
        (isPermanentError(existingAcc.unhealthyReason) || incomingHasPermanentError)

      accountMap.set(acc.id, {
        ...existingAcc,
        ...acc,
        lastUsed: Math.max(existingAcc.lastUsed || 0, acc.lastUsed || 0),
        usedCount: Math.max(existingAcc.usedCount || 0, acc.usedCount || 0),
        limitCount: Math.max(existingAcc.limitCount || 0, acc.limitCount || 0),
        rateLimitResetTime: Math.max(
          existingAcc.rateLimitResetTime || 0,
          acc.rateLimitResetTime || 0
        ),
        isHealthy: incomingRecovered
          ? true
          : hasPermanentError
            ? false
            : existingAcc.isHealthy || acc.isHealthy,
        unhealthyReason: incomingRecovered
          ? undefined
          : acc.unhealthyReason || existingAcc.unhealthyReason,
        recoveryTime: incomingRecovered ? undefined : acc.recoveryTime || existingAcc.recoveryTime,
        failCount: incomingRecovered
          ? acc.failCount || 0
          : Math.max(existingAcc.failCount || 0, acc.failCount || 0),
        lastSync: Math.max(existingAcc.lastSync || 0, acc.lastSync || 0)
      })
    } else {
      accountMap.set(acc.id, acc)
    }
  }

  return Array.from(accountMap.values())
}

export function deduplicateAccounts(accounts: ManagedAccount[]): ManagedAccount[] {
  const accountMap = new Map<string, ManagedAccount>()

  for (const acc of accounts) {
    const key = getAccountIdentityKey(acc)
    const existing = accountMap.get(key)
    if (!existing) {
      accountMap.set(key, acc)
      continue
    }

    if (isPreferredAccount(acc, existing)) {
      accountMap.set(key, acc)
    }
  }

  return Array.from(accountMap.values())
}

function getAccountIdentityKey(acc: ManagedAccount): string {
  if (acc.authMethod === 'idc') {
    return ['idc', acc.email, acc.profileArn || '', acc.region || ''].join(':')
  }
  return acc.id
}

function isPreferredAccount(current: ManagedAccount, existing: ManagedAccount): boolean {
  if (current.isHealthy !== existing.isHealthy) return current.isHealthy

  const currentPermanent = isPermanentError(current.unhealthyReason)
  const existingPermanent = isPermanentError(existing.unhealthyReason)
  if (currentPermanent !== existingPermanent) return !currentPermanent

  const currentLastUsed = current.lastUsed || 0
  const existingLastUsed = existing.lastUsed || 0
  if (currentLastUsed !== existingLastUsed) return currentLastUsed > existingLastUsed

  return (current.expiresAt || 0) > (existing.expiresAt || 0)
}
