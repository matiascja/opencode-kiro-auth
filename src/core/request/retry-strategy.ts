import * as logger from '../../plugin/logger'

interface RetryConfig {
  max_request_iterations: number
  request_timeout_ms: number
}

interface RetryContext {
  iterations: number
  startTime: number
}

export class RetryStrategy {
  constructor(private config: RetryConfig) {}

  shouldContinue(context: RetryContext): { canContinue: boolean; error?: string } {
    context.iterations++

    if (context.iterations > this.config.max_request_iterations) {
      const elapsedMs = Date.now() - context.startTime
      logger.warn('Request aborted: max iterations exceeded', {
        iterations: context.iterations,
        max_request_iterations: this.config.max_request_iterations,
        elapsed_ms: elapsedMs
      })
      return {
        canContinue: false,
        error: `Exceeded max iterations (${this.config.max_request_iterations})`
      }
    }

    const elapsedMs = Date.now() - context.startTime
    if (elapsedMs > this.config.request_timeout_ms) {
      logger.warn('Request aborted: total timeout exceeded', {
        elapsed_ms: elapsedMs,
        request_timeout_ms: this.config.request_timeout_ms,
        iterations: context.iterations
      })
      return {
        canContinue: false,
        error: 'Request timeout'
      }
    }

    return { canContinue: true }
  }

  createContext(): RetryContext {
    return {
      iterations: 0,
      startTime: Date.now()
    }
  }
}
