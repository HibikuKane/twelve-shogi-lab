export type GameMode = "local" | "ai";

export const GAME_MODES: ReadonlyArray<GameMode> = ["local", "ai"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "local" || value === "ai";
}

/**
 * Search depths offered in the UI.
 *
 * This is a provisional development control, not the difficulty system. It
 * exists so the AI's strength can be observed and compared during balancing;
 * a real difficulty model is expected to replace it. Measured when it was
 * added, 20 games per pairing: a depth 4 opponent beat depth 2 and depth 1
 * by 20-0 each, playing either colour.
 */
export const SEARCH_DEPTHS: ReadonlyArray<number> = [1, 2, 3, 4];

export function isSearchDepth(value: unknown): value is number {
  return typeof value === "number" && SEARCH_DEPTHS.includes(value);
}
