import { KiroToastRpc } from './plugin/toast-relay.js'

/**
 * OpenCode V2 TUI entrypoint. OpenCode loads it from the plugin's `tui` subpath
 * (`tui.ts` at the package root re-exports this module).
 *
 * It shows the toasts the server plugin queues, such as the periodic Kiro usage
 * summary, because a V2 server plugin cannot reach the TUI's toast API itself.
 */
interface TuiContext {
  ui: { toast: { show(options: { title?: string; message: string; variant?: string }): void } }
  client: { rpc(definition: typeof KiroToastRpc): any }
}

export default {
  id: 'kiro',
  setup(ctx: TuiContext) {
    const api = ctx.client.rpc(KiroToastRpc)

    // Serialized so a startup drain and an event-triggered drain never interleave.
    let pending: Promise<void> = Promise.resolve()
    const drain = () => {
      pending = pending.then(async () => {
        try {
          const { toasts } = await api.drain({})
          for (const toast of toasts) {
            ctx.ui.toast.show({ title: 'Kiro', message: toast.message, variant: toast.variant })
          }
        } catch {
          // The server plugin may not have registered the RPC yet; the next
          // `queued` event drains again.
        }
      })
      return pending
    }

    const unsubscribe = api.events.on('queued', () => drain())
    void drain()
    return () => unsubscribe()
  }
}
