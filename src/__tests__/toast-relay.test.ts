import { describe, expect, test } from 'bun:test'
import { createToastQueue, KiroToastRpc, registerToastRpc } from '../plugin/toast-relay.js'

// OpenCode V2 gives a server plugin no toast API, so plugin toasts are queued on the
// server and drained by the TUI entrypoint over RPC.
describe('toast queue', () => {
  test('drains queued toasts in order and empties the queue', () => {
    const queue = createToastQueue()
    queue.enqueue('first', 'info')
    queue.enqueue('second', 'warning')
    expect(queue.drain()).toEqual([
      { message: 'first', variant: 'info' },
      { message: 'second', variant: 'warning' }
    ])
    expect(queue.drain()).toEqual([])
  })

  test('keeps only the newest toasts when nobody drains', () => {
    const queue = createToastQueue(2)
    queue.enqueue('a', 'info')
    queue.enqueue('b', 'info')
    queue.enqueue('c', 'info')
    expect(queue.drain().map((t) => t.message)).toEqual(['b', 'c'])
  })

  test('notifies a listener on every enqueue', () => {
    const queue = createToastQueue()
    let calls = 0
    queue.onEnqueue(() => calls++)
    queue.enqueue('a', 'info')
    queue.enqueue('b', 'error')
    expect(calls).toBe(2)
  })
})

describe('toast RPC registration', () => {
  test('serves queued toasts through drain and announces new ones', async () => {
    let definition: any
    let handlers: any
    const emitted: any[] = []
    const ctx = {
      rpc: {
        register: async (def: any, h: any) => {
          definition = def
          handlers = h
          return {
            events: { emit: async (...args: any[]) => emitted.push(args) },
            dispose: async () => {}
          }
        }
      }
    }
    const queue = createToastQueue()
    await registerToastRpc(ctx as any, queue)

    expect(definition).toBe(KiroToastRpc)
    queue.enqueue('Kiro usage (a@b.c): 10/100 (10%)', 'info')
    expect(emitted).toEqual([['queued', {}]])
    expect(await handlers.drain({}, {})).toEqual({
      toasts: [{ message: 'Kiro usage (a@b.c): 10/100 (10%)', variant: 'info' }]
    })
    expect(await handlers.drain({}, {})).toEqual({ toasts: [] })
  })
})
