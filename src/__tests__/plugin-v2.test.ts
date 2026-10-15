import { Model } from '@opencode/plugin'
import { describe, expect, test } from 'bun:test'
import { buildV2Models, registerKiroV2 } from '../plugin-v2.js'

describe('OpenCode V2 adapter', () => {
  test('preserves model IDs, capabilities, thinking budgets and limits', () => {
    const models = buildV2Models()
    expect(models.length).toBeGreaterThan(20)
    for (const model of models) {
      Model.Info.make(model)
      expect(String(model.providerID)).toBe('kiro-auth')
      expect(model.capabilities.tools).toBe(true)
    }
    const thinking = models.find((model) => model.id === 'claude-opus-5-5-thinking')!
    expect(thinking.compatibility.reasoningField).toBe('reasoning_content')
    expect(thinking.variants.find((variant) => variant.id === 'high')?.settings).toHaveProperty(
      'thinkingConfig'
    )
    expect(thinking.limit.context).toBeGreaterThan(200_000)
  })

  test('registers scoped SDK transport, provider, tools and deferred OAuth', async () => {
    let sdkHook: any
    let scope: any
    let provider: any
    const methods: any[] = []
    const tools: any[] = []
    let authorized = false
    let fetched = false
    let requestBody: any
    const hooks = {
      auth: {
        loader: async () => ({
          fetch: async (_input: any, init: any) => {
            fetched = true
            requestBody = JSON.parse(init.body)
            return new Response('{}')
          }
        }),
        methods: [
          {
            label: 'Test IDC',
            prompts: [{ key: 'start_url', message: 'Start URL', validate: () => undefined }],
            authorize: async () => {
              authorized = true
              return {
                url: 'https://example.com',
                instructions: 'Sign in',
                callback: async () => ({ type: 'success', key: 'private-token' })
              }
            }
          }
        ]
      },
      tool: { kiro_web_search: { description: 'Search', execute: async () => 'results' } }
    }
    const ctx = {
      aisdk: {
        hook: async (_name: string, callback: any, filter: any) => {
          sdkHook = callback
          scope = filter
        }
      },
      integration: {
        transform: async (fn: any) =>
          fn({ method: { update: (method: any) => methods.push(method) } })
      },
      tool: { transform: async (fn: any) => fn({ add: (tool: any) => tools.push(tool) }) },
      provider: {
        transform: async (fn: any) =>
          fn({
            add: (value: any) => {
              provider = value
            }
          })
      }
    }
    await registerKiroV2(ctx as any, hooks, 'https://codewhisperer.us-east-1.amazonaws.com')
    expect(authorized).toBe(false)
    expect(scope.providerID).toBe('kiro-auth')
    expect(provider.info.activation).toBe('enabled')
    expect(provider.info.package).toBe('aisdk:@ai-sdk/openai-compatible')
    const event: any = { model: { settings: { thinkingConfig: { thinkingBudget: 16384 } } } }
    sdkHook(event)
    const model = event.sdk.languageModel('test')
    expect(model.specificationVersion).toBe('v3')
    // Exercise the SDK's actual fetch path without contacting AWS.
    await model
      .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }] })
      .catch(() => {})
    expect(fetched).toBe(true)
    expect(requestBody.thinkingConfig.thinkingBudget).toBe(16384)
    expect(await tools[0].execute({ query: 'test' }, {})).toEqual({ content: 'results' })
    const auth = await methods[0].authorize({ start_url: '' })
    const credential = await auth.callback
    expect(authorized).toBe(true)
    expect(credential.access).toBe('managed-by-kiro-plugin')
    expect(JSON.stringify(credential)).not.toContain('private-token')
  })
})
