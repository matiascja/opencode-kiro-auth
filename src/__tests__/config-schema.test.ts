import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG, KiroConfigSchema } from '../plugin/config/schema.js'

describe('usage refresh interval config', () => {
  test('defaults to 10 minutes in the schema and the generated template', () => {
    expect(KiroConfigSchema.parse({}).usage_refresh_interval_ms).toBe(600000)
    expect(DEFAULT_CONFIG.usage_refresh_interval_ms).toBe(600000)
  })

  test('rejects intervals shorter than one minute', () => {
    expect(KiroConfigSchema.safeParse({ usage_refresh_interval_ms: 1000 }).success).toBe(false)
  })

  test('accepts 0 to turn periodic refresh off', () => {
    expect(KiroConfigSchema.parse({ usage_refresh_interval_ms: 0 }).usage_refresh_interval_ms).toBe(
      0
    )
  })
})
