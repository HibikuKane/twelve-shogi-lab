import { describe, expect, it } from "vitest";
import { toIndex, type GameState, type Piece } from "../src/core/model";
import {
  applyClassicAction,
  createClassicState,
  legalClassicActions,
  positionKey,
} from "../src/rules/classic";

function stateWith(entries: ReadonlyArray<[number, number, Piece]>): GameState {
  const board: Array<Piece | null> = Array(12).fill(null);
  entries.forEach(([row, column, candidate]) => {
    board[toIndex({ row, column })] = candidate;
  });
  return {
    board,
    hands: { north: [], south: [] },
    turn: "south",
    result: { type: "playing" },
    history: [],
    moveNumber: 1,
    lastEvent: "test",
  };
}

describe("classic twelve shogi rules", () => {
  it("ends when the opponent has no safe action instead of freezing", () => {
    const state = stateWith([
      [2, 1, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 0, { id: "n-lion", kind: "lion", owner: "north" }],
      [1, 2, { id: "s-giraffe", kind: "giraffe", owner: "south" }],
    ]);
    const next = applyClassicAction(state, {
      type: "move", from: { row: 1, column: 2 }, to: { row: 0, column: 2 },
    });
    expect(next.result).toEqual({ type: "win", winner: "south", reason: "no-actions" });
    expect(legalClassicActions(next)).toEqual([]);
  });

  it("drops a captured chick without promotion and leaves the input unchanged", () => {
    const base = stateWith([
      [3, 1, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 2, { id: "n-lion", kind: "lion", owner: "north" }],
    ]);
    const state = { ...base, hands: { north: [], south: [{ id: "hand", kind: "chick" as const, owner: "south" as const }] } };
    const snapshot = JSON.stringify(state);
    const next = applyClassicAction(state, {
      type: "drop", player: "south", handIndex: 0, to: { row: 0, column: 0 },
    });
    expect(next.board[0]).toMatchObject({ kind: "chick", owner: "south" });
    expect(next.hands.south).toHaveLength(0);
    expect(next.turn).toBe("north");
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("wins by safe try and ignores actions after the game ends", () => {
    const state = stateWith([
      [1, 0, { id: "s-lion", kind: "lion", owner: "south" }],
      [3, 2, { id: "n-lion", kind: "lion", owner: "north" }],
    ]);
    const action = { type: "move" as const, from: { row: 1, column: 0 }, to: { row: 0, column: 0 } };
    const next = applyClassicAction(state, action);
    expect(next.result).toEqual({ type: "win", winner: "south", reason: "try" });
    expect(applyClassicAction(next, action)).toBe(next);
  });

  it("draws on the third identical position including the side to move", () => {
    const state = createClassicState();
    const action = legalClassicActions(state)[0];
    const next = applyClassicAction(state, action);
    const repeated = { ...state, history: [positionKey(next), positionKey(next)] };
    expect(applyClassicAction(repeated, action).result).toEqual({ type: "draw", reason: "repetition" });
    expect(positionKey({ ...next, turn: state.turn })).not.toBe(positionKey(next));
  });

  it("rejects illegal moves and drops on occupied squares", () => {
    const state = createClassicState();
    expect(applyClassicAction(state, { type: "move", from: { row: 3, column: 0 }, to: { row: 0, column: 0 } })).toBe(state);
    expect(applyClassicAction(state, { type: "drop", player: "south", handIndex: 0, to: { row: 3, column: 1 } })).toBe(state);
  });

  it("creates the canonical 3 × 4 starting position", () => {
    const state = createClassicState();

    expect(state.board).toHaveLength(12);
    expect(state.board.filter(Boolean)).toHaveLength(8);
    expect(state.board[toIndex({ row: 3, column: 1 })]).toMatchObject({
      kind: "lion",
      owner: "south",
    });
    expect(state.turn).toBe("south");
  });

  it("demotes a captured hen before adding it to the captor's hand", () => {
    const state = stateWith([
      [3, 1, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 1, { id: "n-lion", kind: "lion", owner: "north" }],
      [2, 0, { id: "s-giraffe", kind: "giraffe", owner: "south" }],
      [1, 0, { id: "n-hen", kind: "hen", owner: "north" }],
    ]);

    const next = applyClassicAction(state, {
      type: "move",
      from: { row: 2, column: 0 },
      to: { row: 1, column: 0 },
    });

    expect(next.hands.south).toHaveLength(1);
    expect(next.hands.south[0]).toMatchObject({ kind: "chick", owner: "south" });
  });

  it("promotes a chick that reaches the far rank", () => {
    const state = stateWith([
      [3, 1, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 2, { id: "n-lion", kind: "lion", owner: "north" }],
      [1, 0, { id: "s-chick", kind: "chick", owner: "south" }],
    ]);

    const next = applyClassicAction(state, {
      type: "move",
      from: { row: 1, column: 0 },
      to: { row: 0, column: 0 },
    });

    expect(next.board[toIndex({ row: 0, column: 0 })]).toMatchObject({ kind: "hen" });
  });

  it("does not let a lion walk into an attacked square", () => {
    const state = stateWith([
      [3, 1, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 2, { id: "n-lion", kind: "lion", owner: "north" }],
      [1, 0, { id: "n-elephant", kind: "elephant", owner: "north" }],
    ]);

    const actions = legalClassicActions(state);
    expect(actions).not.toContainEqual({
      type: "move",
      from: { row: 3, column: 1 },
      to: { row: 2, column: 1 },
    });
  });

  it("wins immediately when the opposing lion is captured", () => {
    const state = stateWith([
      [3, 2, { id: "s-lion", kind: "lion", owner: "south" }],
      [0, 0, { id: "n-lion", kind: "lion", owner: "north" }],
      [1, 0, { id: "s-giraffe", kind: "giraffe", owner: "south" }],
    ]);

    const next = applyClassicAction(state, {
      type: "move",
      from: { row: 1, column: 0 },
      to: { row: 0, column: 0 },
    });

    expect(next.result).toEqual({ type: "win", winner: "south", reason: "capture" });
  });
});
