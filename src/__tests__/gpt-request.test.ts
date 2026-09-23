import { describe, expect, test } from 'bun:test'
import { transformToSdkRequest } from '../plugin/request.js'

const auth: any = {
  access: 'access-token',
  refresh: 'refresh-token',
  expires: Date.now() + 60_000,
  authMethod: 'idc',
  region: 'us-east-1'
}

const body = {
  messages: [
    { role: 'system', content: 'Follow the instructions.' },
    { role: 'user', content: 'Solve this.' }
  ]
}

/**
 * GPT-5.6 and Claude take effort through different `additionalModelRequestFields`
 * keys, and Kiro rejects the wrong one outright. Verified against the live API:
 *
 *   claude-opus-5 + reasoning.effort     -> "property 'reasoning' is not defined in the schema"
 *   gpt-5.6-sol   + output_config.effort -> "property 'output_config' is not defined in the schema"
 *
 * GPT-5.6 also does not use Claude's `<thinking>` tag protocol, so those tags must
 * stay out of its prompt and history.
 */
describe('GPT 5.6 request contract', () => {
  test('routes effort through reasoning and omits Claude thinking tags', () => {
    const prepared = transformToSdkRequest(body, 'gpt-5.6-sol', auth, true, 128000)
    const serialized = JSON.stringify(prepared.conversationState)

    expect(prepared.effectiveModel).toBe('gpt-5.6-sol')
    expect(prepared.effort).toBe('max')
    expect(prepared.effortSchemaPath).toBe('reasoning')
    expect(serialized).not.toContain('<thinking_mode>')
    expect(serialized).not.toContain('<max_thinking_length>')
  })

  test('does not replay assistant reasoning as Claude thinking tags', () => {
    // Two distinct code paths: a historical assistant message goes through
    // buildHistory, a trailing one through the inline loop in request.ts.
    const withPriorReasoning = transformToSdkRequest(
      {
        messages: [
          { role: 'user', content: 'First question.' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'hidden prior reasoning' },
              { type: 'text', text: 'Prior answer' }
            ]
          },
          { role: 'user', content: 'Second question.' }
        ]
      },
      'gpt-5.6-sol',
      auth,
      true,
      65536
    )

    const withTrailingReasoning = transformToSdkRequest(
      {
        messages: [
          { role: 'user', content: 'First question.' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'hidden current reasoning' },
              { type: 'text', text: 'Current answer' }
            ]
          }
        ]
      },
      'gpt-5.6-sol',
      auth,
      true,
      65536
    )

    const prior = JSON.stringify(withPriorReasoning.conversationState)
    expect(prior).not.toContain('<thinking>')
    expect(prior).not.toContain('hidden prior reasoning')
    expect(prior).toContain('Prior answer')

    const trailing = JSON.stringify(withTrailingReasoning.conversationState)
    expect(trailing).not.toContain('<thinking>')
    expect(trailing).not.toContain('hidden current reasoning')
    expect(trailing).toContain('Current answer')
  })

  test('preserves Claude output_config effort and its compatibility tags', () => {
    const prepared = transformToSdkRequest(body, 'claude-opus-5-thinking', auth, true, 98304)
    const serialized = JSON.stringify(prepared.conversationState)

    expect(prepared.effectiveModel).toBe('claude-opus-5')
    expect(prepared.effort).toBe('xhigh')
    expect(prepared.effortSchemaPath).toBe('output_config')
    expect(serialized).toContain('<thinking_mode>enabled</thinking_mode>')
    expect(serialized).toContain('<max_thinking_length>98304</max_thinking_length>')
  })

  test('still replays Claude reasoning as thinking tags', () => {
    const prepared = transformToSdkRequest(
      {
        messages: [
          { role: 'user', content: 'First question.' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'prior claude reasoning' },
              { type: 'text', text: 'Prior answer' }
            ]
          },
          { role: 'user', content: 'Second question.' }
        ]
      },
      'claude-opus-5-thinking',
      auth,
      true,
      65536
    )

    const serialized = JSON.stringify(prepared.conversationState)
    expect(serialized).toContain('<thinking>')
    expect(serialized).toContain('prior claude reasoning')
  })

  test('omits the schema path when the model takes no effort', () => {
    const prepared = transformToSdkRequest(body, 'glm-5', auth, true, 65536)

    expect(prepared.effort).toBeUndefined()
    expect(prepared.effortSchemaPath).toBeUndefined()
  })
})
