import type { AuthHook } from '@opencode-ai/plugin'
import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import { RegionSchema } from '../../plugin/config/schema.js'
import * as logger from '../../plugin/logger.js'
import { summarizeUsage } from '../../plugin/usage.js'
import { UsageTracker } from '../account/usage-tracker.js'
import { IdcAuthMethod } from './idc-auth-method.js'
import { TokenRefresher } from './token-refresher.js'

type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void

export class AuthHandler {
  private accountManager?: any
  private startupUsageFetched = false
  private usagePollTimer?: ReturnType<typeof setInterval>
  // Last summary toasted per account, so periodic refreshes only toast on change.
  private lastToastedUsage = new Map<string, string>()

  constructor(
    private config: any,
    private repository: AccountRepository
  ) {}

  async initialize(showToast?: ToastFunction): Promise<void> {
    const { syncFromKiroCli } = await import('../../plugin/sync/kiro-cli.js')

    logger.log('Auth init', { autoSyncKiroCli: !!this.config.auto_sync_kiro_cli })
    if (this.config.auto_sync_kiro_cli) {
      logger.log('Kiro CLI sync: start')
      await syncFromKiroCli()
      this.repository.invalidateCache()
      const accounts = await this.repository.findAll()
      if (this.accountManager) {
        for (const a of accounts) this.accountManager.addAccount(a)
      }
      logger.log('Kiro CLI sync: done', { importedAccounts: accounts.length })
    }

    // Refresh usage before the summary toast: the persisted value is stale after
    // the monthly reset until the first request syncs. Backgrounded so it never
    // delays the auth loader, and falls back to the stored value on error.
    void (async () => {
      try {
        await this.refreshUsageFromApi(showToast)
      } catch (e) {
        logger.warn('Startup usage refresh failed', {
          error: e instanceof Error ? e.message : String(e)
        })
      }
      this.logUsageSummary(showToast)
      this.startUsagePolling(this.config.usage_refresh_interval_ms ?? 0, showToast)
    })()
  }

  async refreshUsageFromApi(showToast?: ToastFunction): Promise<void> {
    if (!this.accountManager || this.config.usage_tracking_enabled === false) return
    if (this.startupUsageFetched) return
    this.startupUsageFetched = true
    await this.fetchUsageForHealthyAccounts(showToast)
  }

  /**
   * Re-read usage from the API and toast each account whose summary changed since
   * the last toast. Unlike refreshUsageFromApi, this has no one-shot guard, so it
   * backs the periodic refresh.
   */
  async pollUsageOnce(showToast?: ToastFunction): Promise<void> {
    await this.fetchUsageForHealthyAccounts(showToast)
    for (const { message, variant } of this.usageSummaries()) {
      if (this.lastToastedUsage.get(message.key) === message.text) continue
      this.lastToastedUsage.set(message.key, message.text)
      logger.log(message.text)
      showToast?.(message.text, variant)
    }
  }

  startUsagePolling(intervalMs: number, showToast?: ToastFunction): void {
    if (this.usagePollTimer || intervalMs <= 0) return
    if (!this.accountManager || this.config.usage_tracking_enabled === false) return
    let inFlight = false
    this.usagePollTimer = setInterval(() => {
      // Skip a tick rather than overlap a slow refresh (token refresh + fetch).
      if (inFlight) return
      inFlight = true
      this.pollUsageOnce(showToast)
        .catch((e) =>
          logger.warn('Periodic usage refresh failed', {
            error: e instanceof Error ? e.message : String(e)
          })
        )
        .finally(() => {
          inFlight = false
        })
    }, intervalMs)
    // Never keep the OpenCode process alive just to poll usage.
    this.usagePollTimer.unref?.()
  }

  stopUsagePolling(): void {
    if (this.usagePollTimer) clearInterval(this.usagePollTimer)
    this.usagePollTimer = undefined
  }

  private async fetchUsageForHealthyAccounts(showToast?: ToastFunction): Promise<void> {
    if (!this.accountManager || this.config.usage_tracking_enabled === false) return

    const { syncFromKiroCli } = await import('../../plugin/sync/kiro-cli.js')
    const tokenRefresher = new TokenRefresher(
      this.config,
      this.accountManager,
      syncFromKiroCli,
      this.repository
    )
    const usageTracker = new UsageTracker(this.config, this.accountManager, this.repository)
    const toast: ToastFunction = showToast ?? (() => {})

    for (const acc of this.accountManager.getAccounts()) {
      if (!acc.isHealthy) continue
      try {
        const { account: usable } = await tokenRefresher.refreshIfNeeded(
          acc,
          this.accountManager.toAuthDetails(acc),
          toast
        )
        if (!usable.isHealthy) continue
        await usageTracker.syncNow(usable, this.accountManager.toAuthDetails(usable))
      } catch (e) {
        logger.warn('Usage fetch failed; keeping stored value', {
          email: acc.email,
          error: e instanceof Error ? e.message : String(e)
        })
      }
    }
  }

  private usageSummaries(): Array<{
    message: { key: string; text: string }
    variant: 'info' | 'warning'
  }> {
    if (!this.accountManager) return []
    const summaries: Array<{
      message: { key: string; text: string }
      variant: 'info' | 'warning'
    }> = []
    for (const acc of this.accountManager.getAccounts()) {
      const { used, limit, pct } = summarizeUsage(acc.usedCount ?? 0, acc.limitCount ?? 0)
      const key = acc.id ?? acc.email
      if (limit > 0) {
        summaries.push({
          message: { key, text: `Kiro usage (${acc.email}): ${used}/${limit} (${pct}%)` },
          variant: pct >= 90 ? 'warning' : 'info'
        })
      } else if (used > 0) {
        summaries.push({
          message: { key, text: `Kiro usage (${acc.email}): ${used} requests used` },
          variant: 'info'
        })
      }
    }
    return summaries
  }

  private logUsageSummary(showToast?: ToastFunction): void {
    for (const { message, variant } of this.usageSummaries()) {
      this.lastToastedUsage.set(message.key, message.text)
      logger.log(message.text)
      if (showToast) setTimeout(() => showToast(message.text, variant), 3000)
    }
  }

  setAccountManager(am: any): void {
    this.accountManager = am
  }

  getMethods(): AuthHook['methods'] {
    if (!this.accountManager) {
      return []
    }

    const idcMethod = new IdcAuthMethod(this.config, this.repository, this.accountManager)

    const configStartUrl = this.config.idc_start_url
    const configRegion = this.config.idc_region

    return [
      {
        label: 'AWS Builder ID / IAM Identity Center',
        type: 'oauth' as const,
        prompts: [
          {
            type: 'text' as const,
            key: 'start_url',
            message: configStartUrl
              ? `IAM Identity Center Start URL (current: ${configStartUrl}, leave blank to keep)`
              : 'IAM Identity Center Start URL (leave blank for AWS Builder ID)',
            placeholder: 'https://your-company.awsapps.com/start',
            validate: (value: string) => {
              if (!value) return undefined
              try {
                new URL(value)
                return undefined
              } catch {
                return 'Please enter a valid URL'
              }
            }
          },
          {
            type: 'text' as const,
            key: 'idc_region',
            message:
              configRegion && configRegion !== 'us-east-1'
                ? `IAM Identity Center region (sso_region) (current: ${configRegion}, leave blank to keep)`
                : 'IAM Identity Center region (sso_region) (leave blank for us-east-1)',
            placeholder: 'us-east-1',
            validate: (value: string) => {
              if (!value) return undefined
              return RegionSchema.safeParse(value.trim()).success
                ? undefined
                : 'Please enter a valid AWS region'
            }
          }
        ],
        authorize: (inputs?: any) => idcMethod.authorize(inputs)
      },
      {
        label: 'IAM Identity Center with Profile ARN',
        type: 'oauth' as const,
        prompts: [
          {
            type: 'text' as const,
            key: 'start_url',
            message: configStartUrl
              ? `IAM Identity Center Start URL (current: ${configStartUrl}, leave blank to keep)`
              : 'IAM Identity Center Start URL (leave blank for AWS Builder ID)',
            placeholder: 'https://your-company.awsapps.com/start',
            validate: (value: string) => {
              if (!value) return undefined
              try {
                new URL(value)
                return undefined
              } catch {
                return 'Please enter a valid URL'
              }
            }
          },
          {
            type: 'text' as const,
            key: 'idc_region',
            message:
              configRegion && configRegion !== 'us-east-1'
                ? `IAM Identity Center region (sso_region) (current: ${configRegion}, leave blank to keep)`
                : 'IAM Identity Center region (sso_region) (leave blank for us-east-1)',
            placeholder: 'us-east-1',
            validate: (value: string) => {
              if (!value) return undefined
              return RegionSchema.safeParse(value.trim()).success
                ? undefined
                : 'Please enter a valid AWS region'
            }
          },
          {
            type: 'text' as const,
            key: 'profile_arn',
            message: this.config.idc_profile_arn
              ? `Profile ARN (current: ${this.config.idc_profile_arn}, leave blank to keep)`
              : 'Profile ARN (e.g. arn:aws:codewhisperer:eu-central-1:428597928572:profile/HE7XVERQ9VXW)',
            placeholder: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/XXXXXXXXXX',
            validate: (value: string) => {
              if (!value && this.config.idc_profile_arn) return undefined
              if (!value) return 'Profile ARN is required for this method'
              return value.startsWith('arn:aws:codewhisperer:') ||
                value.startsWith('arn:aws:qdeveloper:')
                ? undefined
                : 'Please enter a valid CodeWhisperer or Q Developer profile ARN'
            }
          }
        ],
        authorize: (inputs?: any) => idcMethod.authorize(inputs)
      }
    ]
  }
}
