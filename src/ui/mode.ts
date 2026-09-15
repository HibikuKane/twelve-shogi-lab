export type GameMode = "local" | "ai";

export const GAME_MODES: ReadonlyArray<GameMode> = ["local", "ai"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "local" || value === "ai";
}
