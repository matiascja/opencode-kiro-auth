import { describe, expect, test } from 'bun:test'
import { collapseAgenticLoops } from '../infrastructure/transformers/history-builder.js'

describe('collapseAgenticLoops', () => {
  test('does not expose internal continuation markers to the model', () => {
    const history: any[] = [
      {
        assistantResponseMessage: {
          content: 'I will inspect the file.',
          toolUses: [{ toolUseId: 'call-1', name: 'read', input: { path: 'a.txt' } }]
        }
      },
      {
        userInputMessage: {
          content: 'Tool results provided.',
          userInputMessageContext: { toolResults: [{ toolUseId: 'call-1' }] }
        }
      },
      {
        assistantResponseMessage: {
          content: 'The file suggests running a check.',
          toolUses: [{ toolUseId: 'call-2', name: 'bash', input: { command: 'check' } }]
        }
      },
      {
        userInputMessage: {
          content: 'Tool results provided.',
          userInputMessageContext: { toolResults: [{ toolUseId: 'call-2' }] }
        }
      }
    ]

    const collapsed = collapseAgenticLoops(history)

    expect(collapsed[0]?.assistantResponseMessage?.content).toBe('I will inspect the file.')
    expect(collapsed[2]?.assistantResponseMessage).toEqual({
      content: '',
      toolUses: [{ toolUseId: 'call-2', name: 'bash', input: { command: 'check' } }]
    })
    expect(JSON.stringify(collapsed)).not.toContain('[system: tool calling continues]')
  })
})
