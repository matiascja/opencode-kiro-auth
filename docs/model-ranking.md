# Model ranking

Best to worst for coding and agentic work, among the models this plugin advertises.
Last reviewed: 2026-11-11, against `kiro-cli chat --list-models` (CLI 3.1.0).

The ranking is an editorial judgment built from public benchmarks, not a measurement
the plugin makes. Scores come from different harnesses and effort settings, so treat
gaps of a few points as ties. Where no comparable score exists, the row says so.

| # | Model | Credits | Why |
| --- | --- | --- | --- |
| 1 | `claude-opus-5-5` | 2.0x | Beats GPT-5.6 Sol on 19 of 20 shared Vals AI benchmarks and Grok 4.7 on 23 of 25. Terminal-Bench 4.0: 66.4% vs Sol's 37.3%. Cheaper than Opus 5. |
| 2 | `gpt-5.6-sol` | 4.4x/8.8x | OpenAI's best: 96.2% SWE-bench Verified, 85.8% Terminal-Bench 2.1 (Vals AI). More than twice the cost of Opus 5.5. |
| 3 | `claude-opus-5` | 2.2x | Highest SWE-bench score TensorFeed tracks (97%), but Opus 5.5 replaces it at a lower price. |
| 4 | `claude-sonnet-5-5` | 1.3x | Best quality per credit. Kiro reports coding performance approaching Opus 5.5; no independent benchmark confirms it yet. |
| 5 | `gpt-5.6-terra` | 2.2x/4.4x | 95.4% SWE-bench (TensorFeed), 87.4% Terminal-Bench 2.1 (OpenAI). Same price as Opus 5 with lower scores. |
| 6 | `grok-4.7` | 2.7x/5.4x | Experimental in Kiro. Vals Index 55.0, below Sol (63.7) and just under Terra (56.5); coding average 43.5% vs Opus 5.5's 67.6%. Expensive for what it delivers. |
| 7 | `gpt-5.6-luna` | 0.6x/1.2x | 93% SWE-bench (TensorFeed) at a low price. The best-evidenced cheap option. |
| 8 | `claude-opus-4-8` | 2.2x | 88.6% SWE-bench (TensorFeed). Superseded and pricier than Opus 5.5. |
| 9 | `claude-opus-4-7` | 2.2x | 87.6% SWE-bench (TensorFeed). Superseded and pricier than Opus 5.5. |
| 10 | `claude-sonnet-5` | 1.3x | 85.2% SWE-bench (vendor-reported). Sonnet 5.5 replaces it at the same price. |
| 11 | `claude-haiku-5-5` | 0.06x/0.3x | No coding benchmark found. Kiro positions it for high-volume, quick-response work; good for sub-agents and simple tasks. |
| 12 | `auto` | 1.0x | Kiro routes each request to a model by task, so quality varies with the routed model. |
| 13 | `claude-opus-4-6` | 2.2x | 80.8% SWE-bench (TensorFeed). Previous generation. |
| 14 | `claude-sonnet-4-6` | 1.3x | Previous generation; no current comparable score. |
| 15 | `claude-opus-4-5` | 2.2x | Obsolete; 200K window. |
| 16 | `claude-sonnet-4-5` | 1.3x | Obsolete; 200K window. |
| 17 | `claude-haiku-4-5` | 0.4x | Obsolete; Haiku 5.5 is cheaper. |
| 18 | `glm-5` | 0.5x | Older than the GLM-5.3 versions in current leaderboards. Trivial or bulk tasks only. |
| 19 | `qwen3-coder-next` | 0.05x | Experimental in Kiro; no current comparable score. Trivial or bulk tasks only. |
| 20 | `deepseek-3.2` | 0.25x | Experimental in Kiro; older than the DeepSeek V4 versions in current leaderboards. |
| 21 | `minimax-m2.5` | 0.25x | No current comparable score. Trivial or bulk tasks only. |
| 22 | `minimax-m2.1` | 0.15x | Experimental in Kiro; superseded by M2.5. |
| 23 | `claude-sonnet-4` | 1.3x | Reached end of life in Kiro on 2026-10-14; requests may fail. Kept only because the plugin still advertises it. |

Credits with two values bill short/long context tiers (see the README's model notes).

## Sources

- Vals AI comparisons, Opus 5.5 vs GPT-5.6 Sol and vs Grok 4.7: https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-openai_gpt-5.6-sol, https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-grok_grok-4.7
- Vals AI, GPT-5.6 Sol: https://www.vals.ai/models/openai_gpt-5.6-sol
- TensorFeed SWE-bench leaderboard (2026-11-09): https://tensorfeed.ai/benchmarks/swe_bench
- OpenAI, GPT-5.6 launch tables: https://openai.com/index/gpt-5-6
- Kiro model changelog: https://kiro.dev/changelog/models

## Updating this ranking

`src/__tests__/model-ranking.test.ts` fails whenever this table and the model registry
disagree, so any change to the advertised models must update this file in the same
commit:

1. Run `kiro-cli chat --list-models --format json` and update `src/constants.ts`,
   `src/plugin/model-registry.ts`, and `src/plugin/model-context.ts`.
2. Add, remove, or re-rank the affected rows here, citing a source for every score.
3. Update the "Last reviewed" date and CLI version above.
4. Run `bun test`.
