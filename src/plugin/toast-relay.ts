import { Rpc } from '@opencode/plugin/rpc'

/**
 * Server-to-TUI toast relay for OpenCode V2.
 *
 * A V2 server plugin context has no toast API (its event domain only subscribes),
 * so toasts raised by the plugin are queued here and drained by the TUI entrypoint
 * (`src/tui.ts`) through this RPC. The `queued` event tells a connected TUI to drain
 * now; the TUI also drains once on startup, so toasts raised before it connected
 * (such as the startup usage summary) are not lost.
 */
export const KiroToastRpc = Rpc.define({
  id: 'kiro-toast',
  methods: {
    drain: {
      input: { type: 'object' },
      output: {
        type: 'object',
        properties: {
          toasts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { message: { type: 'string' }, variant: { type: 'string' } },
              required: ['message', 'variant']
            }
          }
        },
        required: ['toasts']
      }
    }
  },
  events: {
    queued: { schema: { type: 'object' } }
  }
})

export type ToastVariant = 'info' | 'warning' | 'success' | 'error'

export interface QueuedToast {
  message: string
  variant: ToastVariant
}

export interface ToastQueue {
  enqueue(message: string, variant: ToastVariant): void
  drain(): QueuedToast[]
  onEnqueue(listener: () => void): void
}

/** Bounded so a session without a TUI attached cannot grow it without limit. */
export function createToastQueue(max = 20): ToastQueue {
  const items: QueuedToast[] = []
  const listeners: Array<() => void> = []
  return {
    enqueue(message, variant) {
      items.push({ message, variant })
      if (items.length > max) items.splice(0, items.length - max)
      for (const listener of listeners) listener()
    },
    drain() {
      return items.splice(0, items.length)
    },
    onEnqueue(listener) {
      listeners.push(listener)
    }
  }
}

interface RpcHost {
  rpc: {
    register: (
      definition: typeof KiroToastRpc,
      handlers: { drain: () => Promise<{ toasts: QueuedToast[] }> }
    ) => Promise<{ events: { emit: (name: 'queued', data: object) => Promise<void> } }>
  }
}

export async function registerToastRpc(ctx: RpcHost, queue: ToastQueue): Promise<void> {
  const registration = await ctx.rpc.register(KiroToastRpc, {
    drain: async () => ({ toasts: queue.drain() })
  })
  queue.onEnqueue(() => {
    registration.events.emit('queued', {}).catch(() => {})
  })
}
