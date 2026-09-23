import { CodeWhispererStreamingClient } from '@aws/codewhisperer-streaming-client'
import { KIRO_CONSTANTS } from '../constants.js'
import { buildEffortRequestFields, type EffortSchemaPath } from './effort.js'
import type { Effort, KiroAuthDetails } from './types'

/**
 * Cache key includes effort and its schema path to ensure separate clients per
 * configuration, since middleware is configured at client creation time.
 */
interface ClientCacheEntry {
  client: CodeWhispererStreamingClient
  token: string
  effort?: Effort
  effortSchemaPath?: EffortSchemaPath
}

const clientCache = new Map<string, ClientCacheEntry>()
const KIRO_CLI_MAX_ATTEMPTS = 3

export function createSdkClient(
  auth: KiroAuthDetails,
  region: string,
  effort?: Effort,
  effortSchemaPath?: EffortSchemaPath
): CodeWhispererStreamingClient {
  // Default to Claude's key so existing callers that pass only an effort keep
  // their current behavior.
  const schemaPath: EffortSchemaPath | undefined = effort
    ? (effortSchemaPath ?? 'output_config')
    : undefined
  const cacheKey = `${region}:${auth.email || 'default'}:${effort || 'none'}:${schemaPath || 'none'}`
  const cached = clientCache.get(cacheKey)

  if (
    cached &&
    cached.token === auth.access &&
    cached.effort === effort &&
    cached.effortSchemaPath === schemaPath
  ) {
    return cached.client
  }

  const token = auth.access
  const client = new CodeWhispererStreamingClient({
    region,
    endpoint: `https://q.${region}.amazonaws.com`,
    token: () => Promise.resolve({ token }),
    maxAttempts: KIRO_CLI_MAX_ATTEMPTS,
    retryMode: 'standard',
    customUserAgent: [[KIRO_CONSTANTS.USER_AGENT]]
  })

  // Add Kiro-specific headers
  client.middlewareStack.add(
    (next: any) => async (args: any) => {
      args.request.headers['x-amzn-kiro-agent-mode'] = 'vibe'
      return next(args)
    },
    { step: 'build', name: 'addKiroHeaders' }
  )

  // Inject additionalModelRequestFields for effort-based reasoning control, using
  // whichever schema key the target model accepts.
  if (effort && schemaPath) {
    client.middlewareStack.add(
      (next: any) => async (args: any) => {
        // The SDK serializes input to args.input, we need to modify the body
        // before it's sent. The body is in args.request.body as a string.
        if (args.request?.body) {
          try {
            const body = JSON.parse(args.request.body)
            body.additionalModelRequestFields = buildEffortRequestFields(effort, schemaPath)
            args.request.body = JSON.stringify(body)
          } catch (error) {
            // Swallowing this would silently drop the effort setting and leave the
            // caller believing it applied, so surface it instead.
            const detail = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to inject Kiro effort configuration: ${detail}`)
          }
        }
        return next(args)
      },
      { step: 'build', name: 'addEffortConfig', priority: 'high' }
    )
  }

  clientCache.set(cacheKey, { client, token, effort, effortSchemaPath: schemaPath })
  return client
}

export function clearSdkClientCache(): void {
  for (const entry of clientCache.values()) {
    entry.client.destroy()
  }
  clientCache.clear()
}
