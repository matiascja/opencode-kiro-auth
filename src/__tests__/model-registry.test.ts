import { describe, expect, test } from 'bun:test'
import { SUPPORTED_MODELS } from '../constants.js'
import type { Effort } from '../plugin/config/schema.js'
import { budgetToEffort, THINKING_BUDGETS } from '../plugin/effort.js'
import { buildModelRegistry } from '../plugin/model-registry.js'
import { getContextWindowSize, resolveKiroModel } from '../plugin/models.js'

const registry = buildModelRegistry() as Record<string, any>

// Reasoning capability is no longer inferable from the model ID: Claude exposes it
// on a `-thinking` companion, GPT-5.6 on the base model itself. Select on the flag.
const reasoningIDs = Object.entries(registry)
  .filter(([, model]) => model.reasoning === true)
  .map(([id]) => id)

const companionIDs = Object.keys(registry).filter((id) => id.endsWith('-thinking'))

const GPT_IDS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']

const XHIGH_MODELS = [
  'claude-opus-4-7-thinking',
  'claude-opus-4-8-thinking',
  'claude-opus-5-thinking',
  'claude-sonnet-5-thinking',
  ...GPT_IDS
]

describe('model registry', () => {
  test('every advertised model is resolvable to a Kiro model ID', () => {
    for (const modelID of Object.keys(registry)) {
      expect(SUPPORTED_MODELS).toContain(modelID)
    }
  })

  test('advertises a thinking companion for each effort-capable Claude model', () => {
    expect(companionIDs.sort()).toEqual(
      [
        'claude-opus-4-5-thinking',
        'claude-opus-4-6-thinking',
        'claude-opus-4-7-thinking',
        'claude-opus-4-8-thinking',
        'claude-opus-5-thinking',
        'claude-sonnet-4-5-thinking',
        'claude-sonnet-4-6-thinking',
        'claude-sonnet-5-thinking'
      ].sort()
    )
  })

  describe('GPT 5.6 tiers', () => {
    // GPT-5.6 reasoning is intrinsic and controlled through reasoning.effort, so the
    // base model is the reasoning model. A `-thinking` companion would be a second
    // entry for the same thing.
    test('carry reasoning on the base model, with no companion', () => {
      for (const id of GPT_IDS) {
        expect(registry[id].reasoning).toBe(true)
        expect(registry[id].interleaved).toEqual({ field: 'reasoning_content' })
        expect(registry[`${id}-thinking`]).toBeUndefined()
      }
    })

    test('keep the 1M window and two-tier rate label', () => {
      // Kiro moved the family to 1M on 2026-09-14 and split billing short/long.
      expect(registry['gpt-5.6-sol']).toMatchObject({
        name: 'GPT 5.6 Sol (4.4x/8.8x)',
        limit: { context: 1000000, output: 64000 }
      })
    })

    test('offer the full effort ladder', () => {
      // The live API reports their enum as none/low/medium/high/xhigh/max, so every
      // shared level is reachable.
      for (const id of GPT_IDS) {
        expect(Object.keys(registry[id].variants)).toEqual([
          'low',
          'medium',
          'high',
          'xhigh',
          'max'
        ])
      }
    })
  })

  // The advertised limit drives OpenCode's context bar and auto-compaction, while
  // getContextWindowSize turns Kiro's contextUsagePercentage into a token count.
  // If they disagree, a model is silently truncated while the UI reports headroom.
  test('advertised limits match the window used for usage estimation', () => {
    for (const [modelID, model] of Object.entries(registry)) {
      expect(getContextWindowSize(modelID)).toBe(model.limit.context)
    }
  })

  test('thinking companions inherit their base model limit', () => {
    for (const id of companionIDs) {
      const base = id.replace(/-thinking$/, '')
      expect(registry[id].limit).toEqual(registry[base].limit)
    }
  })

  describe('reasoning capability flags', () => {
    // Both are required: `reasoning` declares the capability, `interleaved.field`
    // tells OpenCode reasoning arrives as `reasoning_content` deltas. Missing
    // either one means reasoning chunks are silently dropped.
    test('every reasoning model declares reasoning and the reasoning_content field', () => {
      expect(reasoningIDs.length).toBeGreaterThan(0)
      for (const id of reasoningIDs) {
        expect(registry[id].reasoning).toBe(true)
        expect(registry[id].interleaved).toEqual({ field: 'reasoning_content' })
      }
    })

    test('models without reasoning declare neither flag nor variants', () => {
      for (const [id, model] of Object.entries(registry)) {
        if (reasoningIDs.includes(id)) continue
        expect(model.reasoning).toBeUndefined()
        expect(model.interleaved).toBeUndefined()
        expect(model.variants).toBeUndefined()
      }
    })

    test('Claude base models stay non-reasoning so thinking remains opt-in', () => {
      expect(registry['claude-opus-5'].reasoning).toBeUndefined()
      expect(registry['claude-sonnet-4-6'].reasoning).toBeUndefined()
    })
  })

  describe('reasoning variants', () => {
    test('offers xhigh only on models Kiro documents as xhigh-capable', () => {
      for (const id of reasoningIDs) {
        const hasXHigh = Object.keys(registry[id].variants).includes('xhigh')
        expect(hasXHigh).toBe(XHIGH_MODELS.includes(id))
      }
    })

    test('variant budgets map back to the effort level they are named for', () => {
      for (const id of reasoningIDs) {
        const kiroModel = resolveKiroModel(id)
        for (const [name, variant] of Object.entries<any>(registry[id].variants)) {
          const level = name as Effort
          const budget = variant.thinkingConfig.thinkingBudget
          expect(budget).toBe(THINKING_BUDGETS[level])
          expect(budgetToEffort(budget, kiroModel)).toBe(level)
        }
      }
    })

    test('variants are ordered low to max', () => {
      for (const id of reasoningIDs) {
        const budgets = Object.values<any>(registry[id].variants).map(
          (v) => v.thinkingConfig.thinkingBudget
        )
        expect(budgets).toEqual([...budgets].sort((a, b) => a - b))
      }
    })
  })

  test('carries limit and modalities through to both entries', () => {
    expect(registry['claude-opus-5'].limit).toEqual({ context: 1000000, output: 64000 })
    expect(registry['claude-opus-5-thinking'].limit).toEqual(registry['claude-opus-5'].limit)
    expect(registry['claude-opus-5-thinking'].modalities).toEqual(
      registry['claude-opus-5'].modalities
    )
  })
})
