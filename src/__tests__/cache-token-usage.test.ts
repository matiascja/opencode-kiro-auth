import { describe, expect, test } from 'bun:test'
import { transformSdkStream } from '../plugin/streaming/sdk-stream-transformer.js'
import { transformKiroStream } from '../plugin/streaming/stream-transformer.js'

const MODEL = 'claude-opus-5'

function sdkStreamOf(events: any[]) {
  return {
    generateAssistantResponseResponse: (async function* () {
      for (const event of events) yield event
    })()
  }
}

/**
 * Usage from the final `message_delta` chunk, which is where the plugin reports
 * per-request token accounting.
 */
async function usageFromSdk(events: any[]) {
  let usage: any
  for await (const chunk of transformSdkStream(sdkStreamOf(events), MODEL, 'conversation-1')) {
    if (chunk?.usage) usage = chunk.usage
  }
  return usage
}

describe('cache token usage', () => {
  describe('SDK streaming path', () => {
    test('reports the cache figures the backend sent', async () => {
      const usage = await usageFromSdk([
        { assistantResponseEvent: { content: 'Answer.' } },
        {
          metadataEvent: {
            tokenUsage: {
              inputTokens: 5000,
              outputTokens: 10,
              cacheReadInputTokens: 800,
              cacheWriteInputTokens: 1200
            }
          }
        }
      ])

      expect(usage.cache_read_input_tokens).toBe(800)
      expect(usage.cache_creation_input_tokens).toBe(1200)
    })

    test('falls back to zero when tokenUsage omits the cache fields', async () => {
      const usage = await usageFromSdk([
        { assistantResponseEvent: { content: 'Answer.' } },
        { metadataEvent: { tokenUsage: { inputTokens: 5000, outputTokens: 10 } } }
      ])

      expect(usage.cache_read_input_tokens).toBe(0)
      expect(usage.cache_creation_input_tokens).toBe(0)
    })

    test('falls back to zero when no metadataEvent arrives', async () => {
      const usage = await usageFromSdk([{ assistantResponseEvent: { content: 'Answer.' } }])

      expect(usage.cache_read_input_tokens).toBe(0)
      expect(usage.cache_creation_input_tokens).toBe(0)
    })

    test('reports a cache read with no write', async () => {
      const usage = await usageFromSdk([
        { assistantResponseEvent: { content: 'Answer.' } },
        { metadataEvent: { tokenUsage: { cacheReadInputTokens: 4096 } } }
      ])

      expect(usage.cache_read_input_tokens).toBe(4096)
      expect(usage.cache_creation_input_tokens).toBe(0)
    })
  })

  describe('raw HTTP streaming path', () => {
    // This wire format only carries contextUsagePercentage, never per-request token
    // usage, so zero is the correct answer rather than a missed fix. Pinned so the
    // deliberate non-fix is not mistaken for a regression.
    test('stays at zero because the wire format carries no token usage', async () => {
      const response = new Response(
        'data: {"type":"assistantResponseEvent","data":{"content":"Answer."}}\n\n'
      )

      let usage: any
      for await (const chunk of transformKiroStream(response, MODEL, 'conversation-1')) {
        if (chunk?.usage) usage = chunk.usage
      }

      expect(usage.cache_read_input_tokens).toBe(0)
      expect(usage.cache_creation_input_tokens).toBe(0)
    })
  })
})
