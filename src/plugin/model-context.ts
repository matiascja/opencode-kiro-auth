/**
 * Context limits for the models this plugin advertises.
 *
 * Single source of truth, deliberately kept in its own module so both sides that
 * need it can import it without a cycle:
 *
 * - `model-registry.ts` renders these into the `limit` OpenCode reads, which drives
 *   the context bar and auto-compaction.
 * - `models.ts` (`getContextWindowSize`) uses them to turn Kiro's
 *   `contextUsagePercentage` into a token count.
 *
 * When those two disagree, a model can be silently truncated server-side while the
 * client still believes it has headroom, so they must come from one place.
 */

export interface ContextLimit {
  context: number
  output: number
}

export const CONTEXT_200K: ContextLimit = { context: 200000, output: 64000 }
export const CONTEXT_1M: ContextLimit = { context: 1000000, output: 64000 }

/**
 * Values below are cross-checked against Kiro's own catalog, which the Kiro CLI
 * exposes with `kiro-cli chat --list-models --format json`
 * (`models[].context_window_tokens`). That is the authoritative per-account view;
 * re-run it after Kiro ships model changes to confirm these still agree.
 */

/**
 * Advertised context limits, keyed by the OpenCode-facing base model ID.
 *
 * `-thinking` companions share their base model's limit, so they are resolved by
 * stripping the suffix rather than duplicating entries.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, ContextLimit> = {
  // Kiro's catalog reports 1M for `auto`, since routing can land on a 1M model.
  auto: CONTEXT_1M,

  // Claude Sonnet
  'claude-sonnet-4': CONTEXT_200K,
  'claude-sonnet-4-5': CONTEXT_200K,
  'claude-sonnet-4-6': CONTEXT_1M,
  'claude-sonnet-5': CONTEXT_1M,

  // Claude Haiku
  'claude-haiku-4-5': CONTEXT_200K,

  // Claude Opus
  'claude-opus-4-5': CONTEXT_200K,
  'claude-opus-4-6': CONTEXT_1M,
  'claude-opus-4-7': CONTEXT_1M,
  'claude-opus-4-8': CONTEXT_1M,
  'claude-opus-5': CONTEXT_1M,

  // OpenAI GPT 5.6. Kiro raised the family from 272K to a 1M window on 2026-09-14.
  'gpt-5.6-sol': CONTEXT_1M,
  'gpt-5.6-terra': CONTEXT_1M,
  'gpt-5.6-luna': CONTEXT_1M,

  // Open weight models
  // Kiro's catalog reports 164000 for DeepSeek 3.2, not the 128000 assumed before.
  'deepseek-3.2': { context: 164000, output: 64000 },
  'glm-5': CONTEXT_200K,
  'minimax-m2.5': { context: 196000, output: 64000 },
  'minimax-m2.1': { context: 196000, output: 64000 },
  'qwen3-coder-next': { context: 256000, output: 64000 }
}

/**
 * Limit advertised for a model ID, or undefined when the registry does not
 * advertise it. The registry publishes a curated subset of `MODEL_MAPPING`, so
 * resolvable-but-unadvertised IDs fall back to the caller's own heuristic.
 */
export function getAdvertisedContextLimit(model: string): ContextLimit | undefined {
  const base = model.replace(/-thinking$/, '')
  return MODEL_CONTEXT_LIMITS[base]
}

export function getAdvertisedContextWindow(model: string): number | undefined {
  return getAdvertisedContextLimit(model)?.context
}
