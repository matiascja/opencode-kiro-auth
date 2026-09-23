import { MODEL_MAPPING, SUPPORTED_MODELS, isLongContextModel } from '../constants'
import { getAdvertisedContextWindow } from './model-context.js'

export function resolveKiroModel(model: string): string {
  const resolved = MODEL_MAPPING[model]
  if (!resolved) {
    throw new Error(`Unsupported model: ${model}. Supported models: ${SUPPORTED_MODELS.join(', ')}`)
  }
  return resolved
}

/**
 * Context window used to turn Kiro's `contextUsagePercentage` into a token count.
 *
 * This MUST agree with the `limit.context` the registry advertises to OpenCode.
 * When the two disagree, OpenCode sizes its context bar and auto-compaction off
 * one number while usage is estimated off the other, so a model can be silently
 * truncated while the UI still reports headroom.
 *
 * `getAdvertisedContextWindow` is the registry's value; the `-1m` alias heuristic
 * stays as the fallback for IDs the registry does not advertise (it only publishes
 * a curated subset of MODEL_MAPPING).
 */
export function getContextWindowSize(model: string): number {
  const advertised = getAdvertisedContextWindow(model)
  if (advertised !== undefined) {
    return advertised
  }

  return isLongContextModel(model) ? 1000000 : 200000
}
