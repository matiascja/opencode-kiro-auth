import Database from 'libsql'
import { existsSync } from 'node:fs'
import { getCliDbPath, safeJsonParse } from './kiro-cli-parser'

/**
 * Read the IAM Identity Center defaults kiro-cli persisted at login
 * (`auth.idc.region` / `auth.idc.start-url`). Lets OpenCode re-auth use the same
 * SSO instance as kiro-cli even when kiro.json has no idc_* settings.
 */
export function readIdcDefaultsFromKiroCli(): { region?: string; startUrl?: string } {
  const dbPath = getCliDbPath()
  if (!existsSync(dbPath)) return {}

  let cliDb: InstanceType<typeof Database> | undefined
  try {
    cliDb = new Database(dbPath, { readonly: true })
    cliDb.pragma('busy_timeout = 5000')
    const read = (key: string): string | undefined => {
      const row = cliDb!.prepare('SELECT value FROM state WHERE key = ?').get(key) as any
      const parsed = safeJsonParse(row?.value) ?? row?.value
      return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : undefined
    }
    return { region: read('auth.idc.region'), startUrl: read('auth.idc.start-url') }
  } catch {
    return {}
  } finally {
    try {
      cliDb?.close()
    } catch {
      // ignore
    }
  }
}

export function readActiveProfileArnFromKiroCli(): string | undefined {
  const dbPath = getCliDbPath()
  if (!existsSync(dbPath)) return undefined

  let cliDb: InstanceType<typeof Database> | undefined
  try {
    cliDb = new Database(dbPath, { readonly: true })
    cliDb.pragma('busy_timeout = 5000')

    const row = cliDb
      .prepare('SELECT value FROM state WHERE key = ?')
      .get('api.codewhisperer.profile') as any
    const parsed = safeJsonParse(row?.value)
    const arn = parsed?.arn || parsed?.profileArn || parsed?.profile_arn
    return typeof arn === 'string' && arn.trim() ? arn.trim() : undefined
  } catch {
    return undefined
  } finally {
    try {
      cliDb?.close()
    } catch {
      // ignore
    }
  }
}
