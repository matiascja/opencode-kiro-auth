import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveIdcDefaults } from '../core/auth/idc-auth-method.js'
import { TokenRefresher } from '../core/auth/token-refresher.js'
import { KiroTokenRefreshError } from '../plugin/errors.js'
import { isPermanentError } from '../plugin/health.js'
import { canWriteBackToKiroCli, deriveCliRegions } from '../plugin/sync/kiro-cli-parser.js'

// Shape of a real IAM Identity Center setup where the SSO instance and the
// CodeWhisperer profile live in different regions.
const PROFILE_ARN_US_EAST_1 = 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABCDEF'

describe('deriveCliRegions', () => {
  test('IDC: refresh region comes from the SSO token, not the profile ARN', () => {
    expect(
      deriveCliRegions({
        isIdc: true,
        profileArn: PROFILE_ARN_US_EAST_1,
        tokenRegion: 'us-east-2',
        deviceRegRegion: 'us-east-2'
      })
    ).toEqual({ serviceRegion: 'us-east-1', oidcRegion: 'us-east-2' })
  })

  test('IDC: falls back to device registration, then kiro-cli auth.idc.region', () => {
    expect(
      deriveCliRegions({
        isIdc: true,
        profileArn: PROFILE_ARN_US_EAST_1,
        deviceRegRegion: 'eu-west-1'
      }).oidcRegion
    ).toBe('eu-west-1')
    expect(
      deriveCliRegions({
        isIdc: true,
        profileArn: PROFILE_ARN_US_EAST_1,
        cliIdcRegion: 'ap-southeast-1'
      }).oidcRegion
    ).toBe('ap-southeast-1')
  })

  test('IDC: ignores invalid regions instead of substituting us-east-1', () => {
    expect(
      deriveCliRegions({
        isIdc: true,
        profileArn: 'arn:aws:codewhisperer:eu-central-1:1:profile/X',
        tokenRegion: 'not-a-region',
        deviceRegRegion: ''
      })
    ).toEqual({ serviceRegion: 'eu-central-1', oidcRegion: 'eu-central-1' })
  })

  test('same-region setups are unchanged', () => {
    expect(
      deriveCliRegions({ isIdc: true, profileArn: PROFILE_ARN_US_EAST_1, tokenRegion: 'us-east-1' })
    ).toEqual({ serviceRegion: 'us-east-1', oidcRegion: 'us-east-1' })
  })

  test('desktop (social) accounts keep a single region', () => {
    expect(deriveCliRegions({ isIdc: false, tokenRegion: 'us-east-1' })).toEqual({
      serviceRegion: 'us-east-1',
      oidcRegion: 'us-east-1'
    })
  })
})

describe('canWriteBackToKiroCli', () => {
  test('writes IDC tokens only for the same OIDC client registration', () => {
    expect(canWriteBackToKiroCli({ authMethod: 'idc', clientId: 'cli' }, 'cli')).toBe(true)
    expect(canWriteBackToKiroCli({ authMethod: 'idc', clientId: 'plugin' }, 'cli')).toBe(false)
    expect(canWriteBackToKiroCli({ authMethod: 'idc', clientId: 'plugin' }, undefined)).toBe(false)
    expect(canWriteBackToKiroCli({ authMethod: 'idc' }, 'cli')).toBe(false)
  })

  test('desktop accounts are not affected', () => {
    expect(canWriteBackToKiroCli({ authMethod: 'desktop' }, undefined)).toBe(true)
  })
})

describe('resolveIdcDefaults', () => {
  const cli = () => ({ region: 'us-east-2', startUrl: 'https://example.awsapps.com/start/' })

  test('kiro.json wins over kiro-cli', () => {
    expect(
      resolveIdcDefaults(
        { idc_start_url: 'https://config.awsapps.com/start', idc_region: 'eu-west-1' },
        cli
      )
    ).toEqual({
      startUrl: 'https://config.awsapps.com/start',
      region: 'eu-west-1',
      startUrlSource: 'config',
      regionSource: 'config'
    })
  })

  test('empty kiro.json re-auths against the SSO instance kiro-cli logged in with', () => {
    expect(resolveIdcDefaults({}, cli)).toEqual({
      startUrl: 'https://example.awsapps.com/start/',
      region: 'us-east-2',
      startUrlSource: 'kiro-cli',
      regionSource: 'kiro-cli'
    })
  })

  test('without kiro-cli data nothing is invented', () => {
    expect(resolveIdcDefaults({}, () => ({}))).toEqual({
      startUrl: undefined,
      region: undefined,
      startUrlSource: 'none',
      regionSource: 'none'
    })
  })
})

describe('readIdcDefaultsFromKiroCli', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kiro-idc-defaults-'))
  })

  afterEach(() => {
    delete process.env.KIROCLI_DB_PATH
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Windows can briefly hold the sqlite file after close().
    }
  })

  test('reads JSON-encoded auth.idc.* state written by kiro-cli', async () => {
    const dbPath = join(dir, 'data.sqlite3')
    process.env.KIROCLI_DB_PATH = dbPath
    const db = new Database(dbPath)
    db.run('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT)')
    db.run('INSERT INTO state (key, value) VALUES (?, ?)', [
      'auth.idc.region',
      JSON.stringify('us-east-2')
    ])
    db.run('INSERT INTO state (key, value) VALUES (?, ?)', [
      'auth.idc.start-url',
      JSON.stringify('https://example.awsapps.com/start/')
    ])
    db.close()

    const { readIdcDefaultsFromKiroCli } = await import('../plugin/sync/kiro-cli-profile.js')
    expect(readIdcDefaultsFromKiroCli()).toEqual({
      region: 'us-east-2',
      startUrl: 'https://example.awsapps.com/start/'
    })
  })
})

describe('TokenRefresher wrong-region refresh failure', () => {
  test('invalid_request is treated as permanent so re-auth happens immediately', async () => {
    const account: any = {
      id: 'acc',
      email: 'user@example.com',
      accessToken: 'expired',
      expiresAt: Date.now() - 60_000
    }
    const reasons: string[] = []
    const accountManager: any = {
      markUnhealthy: (_: any, reason: string) => reasons.push(reason),
      getAccounts: () => [account],
      toAuthDetails: (a: any) => ({ access: a.accessToken, expires: a.expiresAt })
    }
    // No credentials recovered from kiro-cli: the account is not found after sync.
    // (Avoids depending on accessTokenExpired, which other test files mock globally.)
    const repository: any = {
      invalidateCache: () => {},
      findAll: async () => [],
      batchSave: async () => {}
    }
    const refresher = new TokenRefresher(
      {
        token_expiry_buffer_ms: 0,
        auto_sync_kiro_cli: false,
        account_selection_strategy: 'sticky'
      },
      accountManager,
      async () => {},
      repository
    )

    const result = await (refresher as any).handleRefreshError(
      new KiroTokenRefreshError('Refresh failed: Invalid token provided', 'invalid_request'),
      account,
      () => {}
    )

    expect(result.shouldContinue).toBe(true)
    expect(reasons).toEqual(['Refresh failed: Invalid token provided'])
    expect(isPermanentError(reasons[0])).toBe(true)
  })
})
