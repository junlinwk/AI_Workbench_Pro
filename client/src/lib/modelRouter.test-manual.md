# modelRouter — Manual QA Cases

Quick reference for Phase 5 QA. Assumes default `RoutingPrefs`:
vision=gpt-4o, reasoning=o1, cheap=gpt-4o-mini, longContext=gemini-2.5-pro,
balanced=claude-sonnet-4-6, classifier=gpt-4o-mini.

All cases assume `availableModelIds` is a non-empty set that includes the
expected target, unless otherwise noted.

| # | Input                                                                         | Expected bucket | Expected modelId     | Tier        |
| - | ----------------------------------------------------------------------------- | --------------- | -------------------- | ----------- |
| 1 | `hasImage=true`, text=`"describe this photo"`                                 | vision          | gpt-4o               | heuristic   |
| 2 | `hasPdf=true`, text=`"summarize this paper"`                                  | longContext     | gemini-2.5-pro       | heuristic   |
| 3 | `totalHistoryTokens=80000`, text=`"continue"`                                 | longContext     | gemini-2.5-pro       | heuristic   |
| 4 | text=`"prove that sqrt(2) is irrational step by step"`                        | reasoning       | o1                   | heuristic   |
| 5 | text=`"hi"` (length<30, greeting)                                             | cheap           | gpt-4o-mini          | heuristic   |
| 6 | text=`"你好"`                                                                  | cheap           | gpt-4o-mini          | heuristic   |
| 7 | text=`"what's a good dinner recipe?"`, mode=`"heuristic"`                     | balanced        | claude-sonnet-4-6    | heuristic   |
| 8 | text=`"rewrite this email"`, mode=`"ai-assisted"` (classifier → `cheap`)      | cheap           | gpt-4o-mini          | ai-assisted |

## Availability guardrail

- If tier-1 picks `gpt-4o` but it is not in `availableModelIds`, the decision
  keeps `bucket="vision"` but the `modelId` falls through to
  `prefs.defaults.balanced` (or the first available entry), and `reason`
  gets ` (fallback)` appended.
- When `availableModelIds` is empty (caller did not filter), the chosen
  model is returned as-is.

## Classifier failure

- If `callAI` throws during tier-2, decision is `balanced` with reason
  `"classifier failed — fallback to balanced"` and `tier="ai-assisted"`.
