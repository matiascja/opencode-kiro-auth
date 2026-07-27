import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrapAuthIfNeeded } from '../plugin/auth-bootstrap.js'

const originalHome = process.env.HOME
const originalXdgDataHome = process.env.XDG_DATA_HOME
const originalLocalAppData = process.env.LOCALAPPDATA
const originalKiroCliDbPath = process.env.KIROCLI_DB_PATH

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome

  if (originalXdgDataHome === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = originalXdgDataHome

  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA
  else process.env.LOCALAPPDATA = originalLocalAppData

  if (originalKiroCliDbPath === undefined) delete process.env.KIROCLI_DB_PATH
  else process.env.KIROCLI_DB_PATH = originalKiroCliDbPath
})

// getOpenCodeAuthPath() reads LOCALAPPDATA on win32 and XDG_DATA_HOME/HOME
// elsewhere. Both must be redirected into the temp fixture dir, or these tests
// will read/write the developer's real OpenCode auth.json.
function setupBootstrapFixture() {
  const home = mkdtempSync(join(tmpdir(), 'kiro-auth-bootstrap-'))
  process.env.HOME = home
  process.env.XDG_DATA_HOME = join(home, '.local', 'share')
  process.env.LOCALAPPDATA = join(home, '.local', 'share')

  const cliDbPath = join(home, 'kiro-cli.sqlite3')
  writeFileSync(cliDbPath, '')
  process.env.KIROCLI_DB_PATH = cliDbPath

  const authDir = join(home, '.local', 'share', 'opencode')
  const authPath = join(authDir, 'auth.json')
  mkdirSync(authDir, { recursive: true })

  return { home, authPath }
}

describe('bootstrapAuthIfNeeded', () => {
  test('does not rewrite malformed auth.json', () => {
    const { home, authPath } = setupBootstrapFixture()
    writeFileSync(authPath, '{"github":')

    bootstrapAuthIfNeeded('kiro')

    expect(readFileSync(authPath, 'utf-8')).toBe('{"github":')
    rmSync(home, { recursive: true, force: true })
  })

  test('adds placeholder while preserving existing auth providers', () => {
    const { home, authPath } = setupBootstrapFixture()
    writeFileSync(authPath, JSON.stringify({ github: { type: 'api', key: 'existing' } }, null, 2))

    bootstrapAuthIfNeeded('kiro')

    expect(JSON.parse(readFileSync(authPath, 'utf-8'))).toEqual({
      github: { type: 'api', key: 'existing' },
      kiro: { type: 'api', key: 'kiro-bootstrap-placeholder' }
    })
    rmSync(home, { recursive: true, force: true })
  })

  // NTFS does not honor POSIX mode bits the way ext4/APFS do — chmodSync/statSync
  // round-trips are unreliable on Windows (confirmed on pristine upstream too),
  // so this behavior is only verified on POSIX platforms.
  test.skipIf(process.platform === 'win32')(
    'preserves restrictive auth.json permissions when rewriting',
    () => {
      const { home, authPath } = setupBootstrapFixture()
      writeFileSync(authPath, JSON.stringify({ github: { type: 'api', key: 'existing' } }, null, 2))
      chmodSync(authPath, 0o600)

      bootstrapAuthIfNeeded('kiro')

      expect(statSync(authPath).mode & 0o777).toBe(0o600)
      rmSync(home, { recursive: true, force: true })
    }
  )
})
