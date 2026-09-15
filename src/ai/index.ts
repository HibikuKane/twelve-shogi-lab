import type { GameState, Player } from "../core/model";
import type { Ruleset } from "../core/ruleset";
import { createEvaluator } from "./evaluate";
import { standardClassicProfile, type EvaluationProfile } from "./profile";
import { createSearchEngine, type SearchResult } from "./search";

export type { EvaluationBreakdown, EvaluationFeatures, Evaluator } from "./evaluate";
export type { EvaluationProfile, EvaluationWeights } from "./profile";
export type { CandidateMove, SearchEngine, SearchOptions, SearchResult } from "./search";
export { createEvaluator } from "./evaluate";
export { createSearchEngine, LOSE_SCORE, WIN_SCORE } from "./search";
export { standardClassicProfile } from "./profile";

export interface AiConfig {
  readonly profile: EvaluationProfile;
  readonly perspective: Player;
  readonly seed: number;
}

/**
 * One opponent, ready to be asked for a move. Swapping in a different profile
 * is the only change needed for a different personality.
 */
export interface AiOpponent {
  readonly config: AiConfig;
  chooseMove(state: GameState): SearchResult;
}

export function createAiOpponent(ruleset: Ruleset, config: AiConfig): AiOpponent {
  const engine = createSearchEngine(ruleset, createEvaluator(ruleset, config.profile));
  return {
    config,
    chooseMove: (state) =>
      engine.search(state, { perspective: config.perspective, seed: config.seed }),
  };
}

export function createStandardOpponent(
  ruleset: Ruleset,
  perspective: Player,
  seed: number,
): AiOpponent {
  return createAiOpponent(ruleset, { profile: standardClassicProfile, perspective, seed });
}
