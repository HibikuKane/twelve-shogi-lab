import type { GameAction, GameState } from "./model";

export interface Ruleset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  createInitialState(): GameState;
  legalActions(state: GameState): ReadonlyArray<GameAction>;
  applyAction(state: GameState, action: GameAction): GameState;
}
