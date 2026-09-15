import type { GameAction, GameState, Player } from "../core/model";
import type { Ruleset } from "../core/ruleset";
import type { EvaluationBreakdown, Evaluator } from "./evaluate";
import { createRandom } from "./random";

/**
 * Terminal scores. They must be unreachable by evaluation so that an actual win
 * or loss always outranks any material or positional judgement. The standard
 * profile's largest imaginable swing is a few thousand; a million leaves room
 * for far heavier future profiles.
 */
export const WIN_SCORE = 1_000_000;
export const LOSE_SCORE = -WIN_SCORE;

export interface SearchOptions {
  /** The player the AI is playing as. Its turns maximise, the opponent's minimise. */
  readonly perspective: Player;
  /** Overrides the profile's depth; used by tests. */
  readonly depth?: number;
  /** Seed for tie-breaking between equally scored moves. */
  readonly seed?: number;
}

export interface CandidateMove {
  readonly action: GameAction;
  readonly score: number;
}

export interface SearchResult {
  readonly action: GameAction | null;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly elapsedMs: number;
  /** Every root move with its exact score, best first. */
  readonly candidates: ReadonlyArray<CandidateMove>;
  /** Evaluation of the position the chosen move leads to, for debugging. */
  readonly breakdown: EvaluationBreakdown | null;
}

export interface SearchEngine {
  search(state: GameState, options: SearchOptions): SearchResult;
}

/**
 * Minimax with alpha-beta pruning.
 *
 * The engine knows nothing about piece values, enemy personalities or this
 * ruleset's specific pieces. It only knows: ask the ruleset for legal actions,
 * ask the ruleset to apply one, read `state.result` for terminal outcomes, and
 * ask the evaluator for a number at the horizon.
 */
export function createSearchEngine(ruleset: Ruleset, evaluator: Evaluator): SearchEngine {
  function terminalScore(state: GameState, perspective: Player, ply: number): number | null {
    const { result } = state;
    if (result.type === "playing") return null;
    if (result.type === "draw") return 0;
    // Prefer a win that arrives sooner and a loss that arrives later.
    return result.winner === perspective ? WIN_SCORE - ply : LOSE_SCORE + ply;
  }

  return {
    search(state, options) {
      const startedAt = Date.now();
      const perspective = options.perspective;
      const depth = options.depth ?? evaluator.profile.searchDepth;
      const random = createRandom(options.seed ?? 1);
      let nodes = 0;

      /** Captures first: cheap ordering that makes alpha-beta actually prune.
       *  It changes only the visiting order, never the returned score. */
      function ordered(current: GameState): ReadonlyArray<GameAction> {
        return [...ruleset.legalActions(current)].sort(
          (left, right) => evaluator.orderingScore(current, right) - evaluator.orderingScore(current, left),
        );
      }

      function visit(current: GameState, remaining: number, alphaIn: number, betaIn: number, ply: number): number {
        nodes += 1;
        const terminal = terminalScore(current, perspective, ply);
        if (terminal !== null) return terminal;
        if (remaining === 0) return evaluator.evaluate(current, perspective);

        const actions = ordered(current);
        if (actions.length === 0) return evaluator.evaluate(current, perspective);

        const maximising = current.turn === perspective;
        let alpha = alphaIn;
        let beta = betaIn;
        let best = maximising ? -Infinity : Infinity;

        for (const action of actions) {
          const score = visit(ruleset.applyAction(current, action), remaining - 1, alpha, beta, ply + 1);
          if (maximising) {
            if (score > best) best = score;
            if (best > alpha) alpha = best;
          } else {
            if (score < best) best = score;
            if (best < beta) beta = best;
          }
          if (beta <= alpha) break;
        }
        return best;
      }

      const rootActions = ordered(state);
      if (state.result.type !== "playing" || rootActions.length === 0) {
        return {
          action: null, score: terminalScore(state, perspective, 0) ?? 0, depth,
          nodes, elapsedMs: Date.now() - startedAt, candidates: [], breakdown: null,
        };
      }

      // Root uses a full window per move rather than a shared alpha. Pruning at
      // the root would return bounds instead of exact scores for the moves that
      // fail low, and we need exact scores to detect genuine ties and to report
      // a trustworthy candidate list. Alpha-beta still prunes every subtree, so
      // the cost is bounded; spec item 3 puts clarity and verifiability first.
      const candidates = rootActions
        .map((action) => ({
          action,
          score: visit(ruleset.applyAction(state, action), depth - 1, -Infinity, Infinity, 1),
        }))
        .sort((left, right) => right.score - left.score);

      const best = candidates[0].score;
      const tied = candidates.filter((candidate) => candidate.score === best);
      const chosen = tied[Math.floor(random() * tied.length)] ?? tied[0];

      return {
        action: chosen.action,
        score: chosen.score,
        depth,
        nodes,
        elapsedMs: Date.now() - startedAt,
        candidates,
        breakdown: evaluator.explain(ruleset.applyAction(state, chosen.action), perspective),
      };
    },
  };
}
