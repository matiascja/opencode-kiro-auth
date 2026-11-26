import { describe, expect, test } from 'bun:test'
import { KiroToastRpc } from '../plugin/toast-relay.js'
import tuiPlugin from '../tui.js'

function makeContext(batches: Array<Array<{ message: string; variant: string }>>) {
  const shown: any[] = []
  let requestedDefinition: any
  let onQueued: (() => void) | undefined
  let unsubscribed = false
  const ctx = {
    ui: { toast: { show: (options: any) => shown.push(options) } },
    client: {
      rpc: (definition: any) => {
        requestedDefinition = definition
        return {
          drain: async () => ({ toasts: batches.shift() ?? [] }),
          events: {
            on: (name: string, handler: () => void) => {
              if (name === 'queued') onQueued = handler
              return () => {
                unsubscribed = true
              }
            }
          }
        }
      }
    }
  }
  return {
    ctx,
    shown,
    definition: () => requestedDefinition,
    fireQueued: () => onQueued?.(),
    unsubscribed: () => unsubscribed
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('TUI entrypoint', () => {
  test('shows server toasts on startup and when the server announces new ones', async () => {
    const harness = makeContext([
      [{ message: 'Kiro usage (a@b.c): 6385.96/10000 (64%)', variant: 'info' }],
      [{ message: 'Kiro usage (a@b.c): 9100/10000 (91%)', variant: 'warning' }]
    ])
    const cleanup = await tuiPlugin.setup(harness.ctx as any)
    await flush()

    expect(tuiPlugin.id).toBe('kiro')
    expect(harness.definition()).toBe(KiroToastRpc)
    expect(harness.shown).toEqual([
      { title: 'Kiro', message: 'Kiro usage (a@b.c): 6385.96/10000 (64%)', variant: 'info' }
    ])

    harness.fireQueued()
    await flush()
    expect(harness.shown[1]).toEqual({
      title: 'Kiro',
      message: 'Kiro usage (a@b.c): 9100/10000 (91%)',
      variant: 'warning'
    })

    if (typeof cleanup === 'function') await cleanup()
    expect(harness.unsubscribed()).toBe(true)
  })

  test('ignores drain failures while the server plugin is not ready', async () => {
    const harness = makeContext([])
    harness.ctx.client.rpc = () =>
      ({
        drain: async () => {
          throw new Error('rpc not registered')
        },
        events: { on: () => () => {} }
      }) as any
    const cleanup = await tuiPlugin.setup(harness.ctx as any)
    await flush()
    expect(harness.shown).toEqual([])
    if (typeof cleanup === 'function') await cleanup()
  })
})
