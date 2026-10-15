import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { Integration, Model, Plugin, Provider } from '@opencode/plugin'
import { KIRO_CONSTANTS } from './constants.js'
import { KiroOAuthPlugin } from './plugin.js'
import { loadConfig } from './plugin/config/index.js'
import { buildModelRegistry } from './plugin/model-registry.js'

const PROVIDER_ID = Provider.ID.make('kiro-auth')

type KiroV2Model = Omit<ReturnType<typeof Model.Info.default>, 'name' | 'variants'> & {
  name: string
  compatibility: { reasoningField?: string }
  variants: Array<{
    id: ReturnType<typeof Model.VariantID.make>
    settings: Record<string, unknown>
  }>
}

export function buildV2Models(): KiroV2Model[] {
  return Object.entries(buildModelRegistry()).map(([id, value]) => {
    const source = value as any
    return {
      ...Model.Info.default(PROVIDER_ID, Model.ID.make(id)),
      name: source.name,
      limit: source.limit,
      capabilities: {
        tools: true,
        input: source.modalities.input,
        output: source.modalities.output
      },
      compatibility: source.reasoning ? { reasoningField: 'reasoning_content' } : {},
      // AI SDK provider options carry the same thinking budget consumed by the
      // existing Kiro request adapter. No provider IDs or model IDs are renamed.
      variants: Object.entries(source.variants ?? {}).map(([variant, options]) => ({
        id: Model.VariantID.make(variant),
        settings: options as Record<string, unknown>
      }))
    }
  })
}

// Kept separate from initialization so registration can be tested without
// reading credentials, synchronizing Kiro CLI, or making network requests.
export async function registerKiroV2(ctx: Plugin.Context, hooks: any, baseURL: string) {
  const runtime = await hooks.auth.loader(async () => undefined)
  await ctx.aisdk.hook(
    'sdk',
    (event) => {
      const thinkingConfig = (event.model as unknown as { settings?: Record<string, unknown> })
        ?.settings?.thinkingConfig
      event.sdk = createOpenAICompatible({
        name: 'kiro-auth',
        baseURL,
        apiKey: 'managed-by-kiro-plugin',
        fetch: Object.assign(
          async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            // The generic SDK drops unknown provider options. Reinsert the selected
            // Kiro effort budget at the transport boundary, including GPT variants.
            if (thinkingConfig && typeof init?.body === 'string') {
              const body = { ...JSON.parse(init.body), thinkingConfig }
              return runtime.fetch(input, { ...init, body: JSON.stringify(body) })
            }
            return runtime.fetch(input, init)
          },
          { preconnect: fetch.preconnect }
        )
      })
    },
    { providerID: PROVIDER_ID }
  )

  await ctx.integration.transform((editor) => {
    hooks.auth.methods.forEach((method: any, index: number) => {
      const methodID = Integration.MethodID.make(`idc-${index}`)
      editor.method.update({
        integrationID: PROVIDER_ID,
        method: {
          id: methodID,
          type: 'oauth',
          label: method.label,
          form: (method.prompts ?? []).map((prompt: any) => ({
            key: prompt.key,
            type: 'string' as const,
            title: prompt.message,
            placeholder: prompt.placeholder
          }))
        },
        async authorize(answer) {
          for (const prompt of method.prompts ?? []) {
            const error = prompt.validate?.(String(answer[prompt.key] ?? ''))
            if (error) throw new Error(error)
          }
          const auth = await method.authorize(answer)
          return {
            url: auth.url,
            instructions: auth.instructions,
            mode: 'auto' as const,
            callback: (async () => {
              const result = await auth.callback()
              if (result.type !== 'success') throw new Error('Kiro authentication failed')
              // Real tokens and refresh state remain in Kiro's existing account
              // store. This durable connection marker is not an AWS credential.
              return {
                type: 'oauth' as const,
                methodID,
                access: 'managed-by-kiro-plugin',
                refresh: '',
                expires: Number.MAX_SAFE_INTEGER,
                metadata: { credentialStore: 'kiro-accounts' }
              }
            })()
          }
        }
      })
    })
  })

  await ctx.tool.transform((editor) => {
    for (const [name, definition] of Object.entries(hooks.tool ?? {})) {
      const tool = definition as any
      editor.add({
        name,
        description: tool.description,
        input: {
          type: 'object',
          properties: { query: { type: 'string', maxLength: 200 } },
          required: ['query'],
          additionalProperties: false
        },
        execute: async (input, context) => ({ content: await tool.execute(input, context) })
      })
    }
  })

  await ctx.provider.transform((editor) => {
    editor.add({
      info: {
        ...Provider.Info.empty(PROVIDER_ID),
        name: 'Kiro',
        activation: 'enabled',
        integrationID: Integration.ID.make('kiro-auth'),
        package: 'aisdk:@ai-sdk/openai-compatible',
        settings: { baseURL }
      },
      models: buildV2Models()
    })
  })
}

export async function setupKiroV2(ctx: Plugin.Context) {
  const directory = (ctx.location as unknown as { directory: string }).directory
  const config = loadConfig(directory)
  const baseURL = KIRO_CONSTANTS.BASE_URL.replace('/generateAssistantResponse', '').replace(
    '{{region}}',
    config.default_region || 'us-east-1'
  )
  const hooks = await KiroOAuthPlugin({
    directory,
    client: {
      tui: { showToast: async ({ body }: any) => console.log(`[kiro-auth] ${body.message}`) },
      // V1 silently started OAuth from a model request. V2 must expose its URL
      // in the connection UI rather than open a hidden server-side login flow.
      provider: {
        oauth: {
          authorize: async () => {
            throw new Error(
              'Kiro requires sign-in. Use /connect and select Kiro, or sign in with Kiro CLI.'
            )
          }
        }
      }
    }
  })
  await registerKiroV2(ctx, hooks, baseURL)
}
