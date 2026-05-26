import { KIRO_CONSTANTS } from './constants.js'
import { AuthHandler } from './core/auth/auth-handler.js'
import { RequestHandler } from './core/request/request-handler.js'
import { AccountCache } from './infrastructure/database/account-cache.js'
import { AccountRepository } from './infrastructure/database/account-repository.js'
import { AccountManager } from './plugin/accounts.js'
import { loadConfig } from './plugin/config/index.js'

type ToastFunction = (message: string, variant: string) => void

const KIRO_PROVIDER_ID = 'kiro-auth'

export const createKiroPlugin =
  (id: string) =>
  async ({ client, directory }: any) => {
    const config = loadConfig(directory)

    const showToast: ToastFunction = (message: string, variant: string) => {
      client.tui.showToast({ body: { message, variant } }).catch(() => {})
    }

    const cache = new AccountCache(60000)
    const repository = new AccountRepository(cache)

    const authHandler = new AuthHandler(config, repository)
    const accountManager = await AccountManager.loadFromDisk(config.account_selection_strategy)
    authHandler.setAccountManager(accountManager)

    const requestHandler = new RequestHandler(accountManager, config, repository, client)

    return {
      config: async (input: any) => {
        if (!input.provider) input.provider = {}
        if (!input.provider[id]) input.provider[id] = {}
        input.provider[id].npm = '@ai-sdk/openai-compatible'
        if (!input.provider[id].models) {
          input.provider[id].models = {
            auto: {
              name: 'Auto (1.0x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-sonnet-4-5': {
              name: 'Claude Sonnet 4.5 (1.3x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-sonnet-4-5-thinking': {
              name: 'Claude Sonnet 4.5 Thinking (1.3x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-sonnet-4-5-1m': {
              name: 'Claude Sonnet 4.5 (1M Context)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-sonnet-4-5-1m-thinking': {
              name: 'Claude Sonnet 4.5 (1M Context) Thinking',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-sonnet-4-6': {
              name: 'Claude Sonnet 4.6 (1.3x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-sonnet-4-6-thinking': {
              name: 'Claude Sonnet 4.6 Thinking (1.3x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-sonnet-4-6-1m': {
              name: 'Claude Sonnet 4.6 (1M Context)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-sonnet-4-6-1m-thinking': {
              name: 'Claude Sonnet 4.6 (1M Context) Thinking',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-sonnet-4': {
              name: 'Claude Sonnet 4.0 (1.3x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-3-7-sonnet': {
              name: 'Claude 3.7 Sonnet',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-haiku-4-5': {
              name: 'Claude Haiku 4.5 (0.4x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image'], output: ['text'] }
            },
            'claude-haiku-4-5-thinking': {
              name: 'Claude Haiku 4.5 Thinking (0.4x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-opus-4-5': {
              name: 'Claude Opus 4.5 (2.2x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-opus-4-5-thinking': {
              name: 'Claude Opus 4.5 Thinking (2.2x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-opus-4-6': {
              name: 'Claude Opus 4.6 (2.2x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-opus-4-6-thinking': {
              name: 'Claude Opus 4.6 Thinking (2.2x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-opus-4-6-1m': {
              name: 'Claude Opus 4.6 (1M Context)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-opus-4-6-1m-thinking': {
              name: 'Claude Opus 4.6 (1M Context) Thinking',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'claude-opus-4-7': {
              name: 'Claude Opus 4.7 (2.2x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }
            },
            'claude-opus-4-7-thinking': {
              name: 'Claude Opus 4.7 Thinking (2.2x)',
              limit: { context: 1000000, output: 64000 },
              modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
              variants: {
                low: { thinkingConfig: { thinkingBudget: 8192 } },
                medium: { thinkingConfig: { thinkingBudget: 16384 } },
                max: { thinkingConfig: { thinkingBudget: 32768 } }
              }
            },
            'nova-swe': {
              name: 'Nova SWE',
              limit: { context: 128000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'gpt-oss-120b': {
              name: 'GPT OSS 120B',
              limit: { context: 128000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'minimax-m2': {
              name: 'MiniMax M2',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'minimax-m2.5': {
              name: 'MiniMax M2.5 (0.25x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'minimax-m2.1': {
              name: 'MiniMax M2.1 (0.15x)',
              limit: { context: 200000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'kimi-k2-thinking': {
              name: 'Kimi K2 Thinking',
              limit: { context: 128000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'deepseek-3.2': {
              name: 'DeepSeek 3.2 (0.25x)',
              limit: { context: 128000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            },
            'qwen3-coder-next': {
              name: 'Qwen3 Coder Next (0.05x)',
              limit: { context: 256000, output: 64000 },
              modalities: { input: ['text'], output: ['text'] }
            }
          }
        }
      },
      auth: {
        provider: id,
        loader: async (getAuth: any) => {
          await getAuth()
          await authHandler.initialize(showToast as any)

          return {
            apiKey: '',
            baseURL: KIRO_CONSTANTS.BASE_URL.replace('/generateAssistantResponse', '').replace(
              '{{region}}',
              config.default_region || 'us-east-1'
            ),
            fetch: (input: any, init?: any) => requestHandler.handle(input, init, showToast)
          }
        },
        methods: authHandler.getMethods()
      },
      provider: {
        id,
        models: async (provider: any) => {
          const models = provider?.models || {}
          const normalized: Record<string, any> = {}

          for (const [modelID, model] of Object.entries(models)) {
            const modelInfo = model as any
            normalized[modelID] = {
              ...modelInfo,
              api: {
                ...(modelInfo.api || {}),
                npm: '@ai-sdk/openai-compatible'
              }
            }
          }

          return normalized
        }
      }
    }
  }

export const KiroOAuthPlugin = createKiroPlugin(KIRO_PROVIDER_ID)
