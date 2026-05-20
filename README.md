# OpenCode Kiro Auth Plugin (fork: IDC ghost-account fix)

[![npm version](https://img.shields.io/npm/v/@zhafron/opencode-kiro-auth)](https://www.npmjs.com/package/@zhafron/opencode-kiro-auth)
[![npm downloads](https://img.shields.io/npm/dm/@zhafron/opencode-kiro-auth)](https://www.npmjs.com/package/@zhafron/opencode-kiro-auth)
[![license](https://img.shields.io/npm/l/@zhafron/opencode-kiro-auth)](https://www.npmjs.com/package/@zhafron/opencode-kiro-auth)

OpenCode plugin for AWS Kiro (CodeWhisperer) providing access to Claude Sonnet and Haiku
models with substantial trial quotas.

> Fork of [`tickernelz/opencode-kiro-auth`](https://github.com/tickernelz/opencode-kiro-auth).
> Adds a fix for IAM Identity Center (IDC) deployments whose corporate sessions force a
> `kiro-cli login` every few hours. Upstream rebuilt account ids on every login because
> IDC rotates the OIDC `clientId`, leaving stale "Invalid refresh token" rows in
> `kiro.db`. This fork keeps a single stable IDC account row across reauths.

## Fork changes vs upstream `v1.10.1`

- **Stable IDC account id.** `createDeterministicAccountId` (and the mirror in
  `storage/locked-operations`) ignores the rotating `clientId` for `auth_method = idc`.
  Identity is keyed on `email + auth_method + profile_arn`, so each `kiro-cli login`
  refreshes the existing row instead of minting a new one.
- **Logical IDC dedupe.** `deduplicateAccounts` groups IDC rows by their logical
  identity, prefers healthy rows over permanent-error ghosts, and `KiroDatabase` now
  deletes the discarded legacy rows during `upsertAccount` / `batchUpsertAccounts`.
- **Stale ghost cleanup at startup.** `KiroDatabase.init()` purges accounts with
  permanent auth errors (`Invalid refresh token`, `HTTP_401/403`,
  `ExpiredTokenException`, etc.) older than `STALE_UNHEALTHY_THRESHOLD_MS` (24h).
- **Skip expired CLI tokens.** `syncFromKiroCli` no longer imports rows whose
  `expires_at` is already in the past.
- **Quieter lock contention.** `proper-lockfile` retries raised from 5 to 10 (max
  backoff 1s -> 2s) and `addAccount` lock-contention errors are demoted to debug.
- **Tests.** New suites in `src/__tests__/` cover health helpers, deterministic IDs,
  and IDC dedupe behaviour.

Branch: [`fix/idc-ghost-accounts`](https://github.com/matiascja/opencode-kiro-auth/tree/fix/idc-ghost-accounts).

## Features

- **Multiple Auth Methods**: Supports AWS Builder ID (IDC), IAM Identity Center (custom
  Start URL), and Kiro Desktop (CLI-based) authentication.
- **Auto-Sync Kiro CLI**: Automatically imports and synchronizes active sessions from
  your local `kiro-cli` SQLite database.
- **Gradual Context Truncation**: Intelligently prevents error 400 by reducing context
  size dynamically during retries.
- **Intelligent Account Rotation**: Prioritizes multi-account usage based on lowest
  available quota.
- **High-Performance Storage**: Efficient account and usage management using native Bun
  SQLite.
- **Native Thinking Mode**: Full support for Claude reasoning capabilities via virtual
  model mappings.
- **Automated Recovery**: Exponential backoff for rate limits and automated token
  refresh.
- **IDC Ghost-Account Prevention (fork)**: Stable account id across `kiro-cli login`
  cycles, logical IDC dedupe, and startup cleanup of stale permanent-error rows.

## Installation

### Use the published upstream package

Add the plugin to your `opencode.json` or `opencode.jsonc`:

```json
{
  "plugin": ["@zhafron/opencode-kiro-auth"],
  "provider": {
    "kiro": {
      "models": {
        "claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-sonnet-4-6-thinking": {
          "name": "Claude Sonnet 4.6 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "claude-haiku-4-5": {
          "name": "Claude Haiku 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "claude-opus-4-5": {
          "name": "Claude Opus 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-opus-4-5-thinking": {
          "name": "Claude Opus 4.5 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "claude-opus-4-6": {
          "name": "Claude Opus 4.6",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "claude-opus-4-6-1m": {
          "name": "Claude Opus 4.6 (1M Context)",
          "limit": { "context": 1000000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-opus-4-6-1m-thinking": {
          "name": "Claude Opus 4.6 (1M Context) Thinking",
          "limit": { "context": 1000000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "claude-sonnet-4-5-1m": {
          "name": "Claude Sonnet 4.5 (1M Context)",
          "limit": { "context": 1000000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-sonnet-4-6-1m": {
          "name": "Claude Sonnet 4.6 (1M Context)",
          "limit": { "context": 1000000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-sonnet-4-6-1m-thinking": {
          "name": "Claude Sonnet 4.6 (1M Context) Thinking",
          "limit": { "context": 1000000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "auto": { "name": "Auto (1.0x)" },
        "claude-sonnet-4": { "name": "Claude Sonnet 4.0 (1.3x)", "limit": { "context": 200000, "output": 64000 } },
        "deepseek-3.2": { "name": "DeepSeek 3.2 (0.25x)", "limit": { "context": 128000, "output": 64000 } },
        "minimax-m2.5": { "name": "MiniMax 2.5 (0.25x)", "limit": { "context": 200000, "output": 64000 } },
        "minimax-m2.1": { "name": "MiniMax 2.1 (0.15x)", "limit": { "context": 200000, "output": 64000 } },
        "qwen3-coder-next": { "name": "Qwen3 Coder Next (0.05x)", "limit": { "context": 256000, "output": 64000 } }
      }
    }
  }
}
```

## Setup

### Using this fork directly

If you want the IDC ghost-account fix without waiting for an upstream release, point
OpenCode at a local build of this fork instead of the npm package:

```bash
git clone https://github.com/matiascja/opencode-kiro-auth.git
cd opencode-kiro-auth
git checkout fix/idc-ghost-accounts
bun install
bun test
bun run build
```

Then set the `plugin` entry in `opencode.json` to the built file:

```json
{
  "plugin": [
    "file:///absolute/path/to/opencode-kiro-auth/dist/index.js"
  ]
}
```

Restart any running OpenCode processes so they load the fork build instead of the
upstream version. Already-running processes keep the previously loaded plugin in memory
and may continue emitting old `Lock file is already being held` warnings until restarted.

1. **Authentication via Kiro CLI (Recommended)**:
   - Perform login directly in your terminal using `kiro-cli login`.
   - The plugin will automatically detect and import your session on startup.
   - For AWS IAM Identity Center (SSO/IDC), the plugin imports both the token and device
     registration (OIDC client credentials) from the `kiro-cli` database.
2. **Direct Authentication**:
   - Run `opencode auth login`.
   - Select `Other`, type `kiro`, and press enter.
   - You'll be prompted for your **IAM Identity Center Start URL** and **IAM Identity
     Center region** (`sso_region`).
     - Leave it blank to sign in with **AWS Builder ID**.
     - Enter your company's Start URL (e.g. `https://your-company.awsapps.com/start`) to
       use **IAM Identity Center (SSO)**.
   - Note: the TUI `/connect` flow currently does **not** run plugin OAuth prompts
     (Start URL / region), so Identity Center logins may fall back to Builder ID unless
     you use `opencode auth login` (or preconfigure defaults in
     `~/.config/opencode/kiro.json`).
   - For **IAM Identity Center**, you may also need a **profile ARN** (`profileArn`).
     - If `kiro-cli` is installed and you've selected a profile once
       (`kiro-cli profile`), the plugin auto-detects it.
     - Otherwise, set `idc_profile_arn` in `~/.config/opencode/kiro.json`.
   - A browser window will open directly to AWS' verification URL (no local auth
     server). If it doesn't, copy/paste the URL and enter the code printed by OpenCode.
   - You can also pre-configure defaults in `~/.config/opencode/kiro.json` via
     `idc_start_url` and `idc_region`.
3. Configuration will be automatically managed at `~/.config/opencode/kiro.db`.

## Local plugin development

OpenCode installs plugins into a cache directory (typically
`~/.cache/opencode/node_modules`).

The simplest way to test local changes (without publishing to npm) is to build this repo
and hot-swap the cached plugin `dist/` folder:

1. Build this repo: `bun run build` (or `npm run build`)
2. Hot-swap `dist/` (creates a timestamped backup):

```bash
PLUGIN_DIR="$HOME/.cache/opencode/node_modules/@zhafron/opencode-kiro-auth"
TS=$(date +%Y%m%d-%H%M%S)
cp -a "$PLUGIN_DIR/dist" "$PLUGIN_DIR/dist.bak.$TS"
rm -rf "$PLUGIN_DIR/dist"
cp -a "/absolute/path/to/opencode-kiro-auth/dist" "$PLUGIN_DIR/dist"
echo "Backup at: $PLUGIN_DIR/dist.bak.$TS"
```

Revert:

```bash
PLUGIN_DIR="$HOME/.cache/opencode/node_modules/@zhafron/opencode-kiro-auth"
rm -rf "$PLUGIN_DIR/dist"
mv "$PLUGIN_DIR/dist.bak.YYYYMMDD-HHMMSS" "$PLUGIN_DIR/dist"
```

## Troubleshooting

### Symptom: `kiro.db` keeps growing after every IDC login (fork-specific notes)

If you used a pre-fork version of the plugin and your `kiro.db` accumulated multiple
rows per IDC email with `unhealthy_reason = 'Refresh failed: Invalid refresh token
provided'`, this fork addresses the root cause:

- New logins reuse the same account row instead of creating a new one.
- Startup cleanup drops rows whose permanent-error `last_used` is older than 24h.
- Stale legacy rows that share the same logical identity are deleted during the next
  upsert by `KiroDatabase.upsertAccount` / `batchUpsertAccounts`.

If you want to clean ghost rows immediately after upgrading to the fork, take a backup
of `kiro.db` first and then run something like:

```sql
DELETE FROM accounts
WHERE is_healthy = 0
  AND unhealthy_reason LIKE 'Refresh failed%';
```

After that, restart OpenCode so all processes load the fork build.

### Error: Status: 403 (AccessDeniedException / User is not authorized)

If you're using **IAM Identity Center** (a custom Start URL), the Q Developer /
CodeWhisperer APIs typically require a **profile ARN**.

This plugin reads the active profile ARN from your local `kiro-cli` database
(`state.key = api.codewhisperer.profile`) and sends it as `profileArn`.

Fix:

1. Run `kiro-cli profile` and select a profile (e.g. `QDevProfile-us-east-1`).
2. Retry `opencode auth login` (or restart OpenCode so it re-syncs).

### Error: No accounts

This happens when the plugin has no records in `~/.config/opencode/kiro.db`.

1. Ensure `kiro-cli login` succeeds.
2. Ensure `auto_sync_kiro_cli` is `true` in `~/.config/opencode/kiro.json`.
3. Retry the request; the plugin will attempt a Kiro CLI sync when it detects zero
   accounts.

### Note: `/connect` vs `opencode auth login`

If you need to enter provider-specific values for an OAuth login (like IAM Identity
Center Start URL / region), use `opencode auth login`. The current TUI `/connect` flow
may not display plugin OAuth prompts, so it can’t collect those inputs.

Note for IDC/SSO (ODIC): the plugin may temporarily create an account with a placeholder
email if it cannot fetch the real email during sync (e.g. offline).
It will replace it with the real email once usage/email lookup succeeds.

### Kiro CLI (Google/GitHub OAuth) users: plugin sync never runs

If you authenticated via `kiro-cli login` using Google or GitHub OAuth (not AWS Builder
ID or IAM Identity Center), the plugin's sync may never trigger.
This happens because OpenCode requires a kiro entry in `auth.json` before making API
requests, but the plugin loader only runs when a request is made.

**Workaround:** Add a minimal placeholder entry to `~/.local/share/opencode/auth.json`:

```json
{
  "kiro": {
    "type": "api",
    "key": "placeholder"
  }
}
```

After adding this, OpenCode will treat the provider as connected, trigger the plugin
loader, and the kiro-cli sync will populate `kiro.db` with your actual tokens.
The placeholder values are not used for API calls.

**Important:** Ensure `auto_sync_kiro_cli` is `true` in `~/.config/opencode/kiro.json`
and that `kiro-cli login` succeeds before applying this workaround.

### Error: ERR_INVALID_URL

`TypeError [ERR_INVALID_URL]: "undefined/chat/completions" cannot be parsed as a URL`

If this happens, check your auth.json in .local/share/opencode.
example:

```json
{
  "kiro": {
    "type": "api",
    "key": "whatever"
  }
}
```

## Configuration

The plugin supports extensive configuration options.
Edit `~/.config/opencode/kiro.json`:

```json
{
  "auto_sync_kiro_cli": true,
  "account_selection_strategy": "lowest-usage",
  "default_region": "us-east-1",
  "idc_start_url": "https://your-company.awsapps.com/start",
  "idc_region": "us-east-1",
  "rate_limit_retry_delay_ms": 5000,
  "rate_limit_max_retries": 3,
  "max_request_iterations": 20,
  "request_timeout_ms": 120000,
  "token_expiry_buffer_ms": 120000,
  "usage_sync_max_retries": 3,
  "usage_tracking_enabled": true,
  "enable_log_api_request": false
}
```

### Configuration Options

- `auto_sync_kiro_cli`: Automatically sync sessions from Kiro CLI (default: `true`).
- `account_selection_strategy`: Account rotation strategy (`sticky`, `round-robin`,
  `lowest-usage`).
- `default_region`: AWS region (`us-east-1`, `us-west-2`).
- `idc_start_url`: Default IAM Identity Center Start URL (e.g.
  `https://your-company.awsapps.com/start`). Leave unset/blank to default to AWS Builder
  ID.
- `idc_region`: IAM Identity Center (SSO OIDC) region (`sso_region`). Defaults to
  `us-east-1`.
- `rate_limit_retry_delay_ms`: Delay between rate limit retries (1000-60000ms).
- `rate_limit_max_retries`: Maximum retry attempts for rate limits (0-10).
- `max_request_iterations`: Maximum loop iterations to prevent hangs (10-1000).
- `request_timeout_ms`: Request timeout in milliseconds (60000-600000ms).
- `token_expiry_buffer_ms`: Token refresh buffer time (30000-300000ms).
- `usage_sync_max_retries`: Retry attempts for usage sync (0-5).
- `auth_server_port_start`: Legacy/ignored (no local auth server).
- `auth_server_port_range`: Legacy/ignored (no local auth server).
- `usage_tracking_enabled`: Enable usage tracking and toast notifications.
- `enable_log_api_request`: Enable detailed API request logging.

## Storage

**Linux/macOS:**

- SQLite Database: `~/.config/opencode/kiro.db`
- Plugin Config: `~/.config/opencode/kiro.json`

**Windows:**

- SQLite Database: `%APPDATA%\opencode\kiro.db`
- Plugin Config: `%APPDATA%\opencode\kiro.json`

## Acknowledgements

Special thanks to [AIClient-2-API](https://github.com/justlovemaki/AIClient-2-API) for
providing the foundational Kiro authentication logic and request patterns.

## Disclaimer

This plugin is provided strictly for learning and educational purposes.
It is an independent implementation and is not affiliated with, endorsed by, or
supported by Amazon Web Services (AWS) or Anthropic.
Use of this plugin is at your own risk.

Feel free to open a PR to optimize this plugin further.
