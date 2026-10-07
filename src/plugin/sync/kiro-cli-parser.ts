import { createHash } from 'node:crypto'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { extractRegionFromArn, isValidRegion } from '../../constants'
import type { KiroRegion } from '../types'

function asRegion(value: unknown): KiroRegion | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return isValidRegion(trimmed) ? trimmed : undefined
}

/**
 * Resolve the two independent regions of a Kiro CLI account.
 *
 * - serviceRegion: where the CodeWhisperer/Q profile lives (profile ARN). Used for
 *   q.{region}.amazonaws.com inference/usage calls.
 * - oidcRegion: where the IAM Identity Center instance issued the SSO token. Used
 *   for the refresh call to oidc.{region}.amazonaws.com/token.
 *
 * They often differ (e.g. SSO instance in us-east-2, profile in us-east-1). Using
 * the ARN region for refresh makes AWS reject it with `invalid_request /
 * Invalid token provided` once the first access token expires.
 */
export function deriveCliRegions(input: {
  isIdc: boolean
  profileArn?: string
  tokenRegion?: unknown
  deviceRegRegion?: unknown
  cliIdcRegion?: unknown
}): { serviceRegion: KiroRegion; oidcRegion: KiroRegion } {
  const tokenRegion = asRegion(input.tokenRegion)
  const serviceRegion = extractRegionFromArn(input.profileArn) || tokenRegion || 'us-east-1'
  if (!input.isIdc) return { serviceRegion, oidcRegion: serviceRegion }

  const oidcRegion =
    tokenRegion || asRegion(input.deviceRegRegion) || asRegion(input.cliIdcRegion) || serviceRegion
  return { serviceRegion, oidcRegion }
}

/**
 * Only write refreshed IDC tokens back into kiro-cli when they belong to the same
 * OIDC client registration kiro-cli holds. A refresh token minted for the plugin's
 * own device registration (e.g. after an OpenCode re-auth) is unusable with
 * kiro-cli's clientId/secret and would break kiro-cli's own refresh.
 */
export function canWriteBackToKiroCli(
  acc: { authMethod?: string; clientId?: string },
  cliClientId: string | undefined
): boolean {
  if (acc.authMethod !== 'idc') return true
  return !!acc.clientId && !!cliClientId && acc.clientId === cliClientId
}

export function getCliDbPath(): string {
  const override = process.env.KIROCLI_DB_PATH
  if (override) return override
  const p = platform()
  if (p === 'win32')
    return join(
      process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
      'Kiro-Cli',
      'data.sqlite3'
    )
  if (p === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'kiro-cli', 'data.sqlite3')
  return join(homedir(), '.local', 'share', 'kiro-cli', 'data.sqlite3')
}

export function safeJsonParse(value: unknown): any | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function normalizeExpiresAt(input: unknown): number {
  if (typeof input === 'number') {
    return input < 10_000_000_000 ? input * 1000 : input
  }
  if (typeof input === 'string' && input.trim()) {
    const t = new Date(input).getTime()
    if (!Number.isNaN(t) && t > 0) return t
    const n = Number(input)
    if (Number.isFinite(n) && n > 0) return normalizeExpiresAt(n)
  }
  return 0
}

export function findClientCredsRecursive(input: unknown): {
  clientId?: string
  clientSecret?: string
} {
  const root = input as any
  if (!root || typeof root !== 'object') return {}

  const stack: any[] = [root]
  const visited = new Set<any>()
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== 'object') continue
    if (visited.has(cur)) continue
    visited.add(cur)

    const clientId = cur.client_id || cur.clientId
    const clientSecret = cur.client_secret || cur.clientSecret
    if (typeof clientId === 'string' && typeof clientSecret === 'string') {
      if (clientId && clientSecret) return { clientId, clientSecret }
    }

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v)
      continue
    }
    for (const v of Object.values(cur)) stack.push(v)
  }
  return {}
}

export function makePlaceholderEmail(
  authMethod: string,
  region: string,
  clientId?: string,
  profileArn?: string
): string {
  const seed = `${authMethod}:${region}:${clientId || ''}:${profileArn || ''}`
  const h = createHash('sha256').update(seed).digest('hex').slice(0, 16)
  return `${authMethod}-placeholder+${h}@awsapps.local`
}
