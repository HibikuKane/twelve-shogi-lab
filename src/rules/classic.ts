import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  fromIndex,
  isInsideBoard,
  opponentOf,
  samePosition,
  toIndex,
  type Board,
  type GameAction,
  type GameState,
  type Piece,
  type PieceKind,
  type Player,
  type Position,
} from "../core/model";
import type { Ruleset } from "../core/ruleset";

type Vector = readonly [row: number, column: number];

const SOUTH_VECTORS: Record<PieceKind, ReadonlyArray<Vector>> = {
  lion: [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ],
  giraffe: [[-1, 0], [0, -1], [0, 1], [1, 0]],
  elephant: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  chick: [[-1, 0]],
  hen: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
};

function piece(id: string, kind: PieceKind, owner: Player): Piece {
  return { id, kind, owner };
}

function vectorsFor(kind: PieceKind, owner: Player): ReadonlyArray<Vector> {
  if (owner === "south") return SOUTH_VECTORS[kind];
  return SOUTH_VECTORS[kind].map(([row, column]) => [-row, column] as const);
}

function farRank(player: Player): number {
  return player === "south" ? 0 : BOARD_ROWS - 1;
}

function isActionEqual(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "move" && right.type === "move") {
    return samePosition(left.from, right.from) && samePosition(left.to, right.to);
  }
  if (left.type === "drop" && right.type === "drop") {
    return (
      left.player === right.player &&
      left.handIndex === right.handIndex &&
      samePosition(left.to, right.to)
    );
  }
  return false;
}

function isSquareAttacked(board: Board, target: Position, attacker: Player): boolean {
  return board.some((candidate, index) => {
    if (!candidate || candidate.owner !== attacker) return false;
    const origin = fromIndex(index);
    return vectorsFor(candidate.kind, attacker).some(([row, column]) =>
      samePosition(target, { row: origin.row + row, column: origin.column + column }),
    );
  });
}

function findLion(board: Board, owner: Player): Position | null {
  const index = board.findIndex((candidate) => candidate?.owner === owner && candidate.kind === "lion");
  return index < 0 ? null : fromIndex(index);
}

function executeAction(state: GameState, action: GameAction): GameState {
  const board = [...state.board];
  const hands = {
    north: [...state.hands.north],
    south: [...state.hands.south],
  };

  if (action.type === "move") {
    const from = toIndex(action.from);
    const to = toIndex(action.to);
    const moving = board[from];
    if (!moving) return state;

    const captured = board[to];
    if (captured && captured.kind !== "lion") {
      hands[moving.owner].push({
        ...captured,
        kind: captured.kind === "hen" ? "chick" : captured.kind,
        owner: moving.owner,
      });
    }

    const promoted =
      moving.kind === "chick" && action.to.row === farRank(moving.owner)
        ? { ...moving, kind: "hen" as const }
        : moving;
    board[from] = null;
    board[to] = promoted;

    return {
      ...state,
      board,
      hands,
      lastEvent: {
        type: "move", player: moving.owner, piece: moving.kind,
        captured: captured?.kind ?? null, promoted: promoted.kind !== moving.kind,
      },
    };
  }

  const hand = hands[action.player];
  const dropped = hand[action.handIndex];
  if (!dropped) return state;
  board[toIndex(action.to)] = dropped;
  hand.splice(action.handIndex, 1);

  return {
    ...state,
    board,
    hands,
    lastEvent: { type: "drop", player: dropped.owner, piece: dropped.kind },
  };
}

function keepsLionSafe(state: GameState, action: GameAction, player: Player): boolean {
  const next = executeAction(state, action);
  const lion = findLion(next.board, player);
  return lion !== null && !isSquareAttacked(next.board, lion, opponentOf(player));
}

function legalActionsForPlayer(state: GameState, player: Player): ReadonlyArray<GameAction> {
  const actions: GameAction[] = [];

  state.board.forEach((candidate, index) => {
    if (!candidate || candidate.owner !== player) return;
    const from = fromIndex(index);

    vectorsFor(candidate.kind, player).forEach(([row, column]) => {
      const to = { row: from.row + row, column: from.column + column };
      if (!isInsideBoard(to)) return;
      const target = state.board[toIndex(to)];
      if (target?.owner === player) return;

      const action: GameAction = { type: "move", from, to };
      if (keepsLionSafe(state, action, player)) actions.push(action);
    });
  });

  state.hands[player].forEach((_candidate, handIndex) => {
    state.board.forEach((target, index) => {
      if (target) return;
      const action: GameAction = {
        type: "drop",
        player,
        handIndex,
        to: fromIndex(index),
      };
      if (keepsLionSafe(state, action, player)) actions.push(action);
    });
  });

  return actions;
}

export function positionKey(state: Pick<GameState, "board" | "hands" | "turn">): string {
  const board = state.board
    .map((candidate) => candidate ? `${candidate.owner[0]}:${candidate.kind}` : "_")
    .join("|");
  const north = state.hands.north.map((candidate) => candidate.kind).sort().join(",");
  const south = state.hands.south.map((candidate) => candidate.kind).sort().join(",");
  return `${board}#n=${north}#s=${south}#turn=${state.turn}`;
}

export function createClassicState(): GameState {
  const board: Array<Piece | null> = Array(BOARD_ROWS * BOARD_COLUMNS).fill(null);
  board[toIndex({ row: 0, column: 0 })] = piece("n-elephant", "elephant", "north");
  board[toIndex({ row: 0, column: 1 })] = piece("n-lion", "lion", "north");
  board[toIndex({ row: 0, column: 2 })] = piece("n-giraffe", "giraffe", "north");
  board[toIndex({ row: 1, column: 1 })] = piece("n-chick", "chick", "north");
  board[toIndex({ row: 2, column: 1 })] = piece("s-chick", "chick", "south");
  board[toIndex({ row: 3, column: 0 })] = piece("s-giraffe", "giraffe", "south");
  board[toIndex({ row: 3, column: 1 })] = piece("s-lion", "lion", "south");
  board[toIndex({ row: 3, column: 2 })] = piece("s-elephant", "elephant", "south");

  const state: GameState = {
    board,
    hands: { north: [], south: [] },
    turn: "south",
    result: { type: "playing" },
    history: [],
    moveNumber: 1,
    lastEvent: { type: "start", player: "south" },
  };
  return { ...state, history: [positionKey(state)] };
}

export function legalClassicActions(state: GameState): ReadonlyArray<GameAction> {
  if (state.result.type !== "playing") return [];
  return legalActionsForPlayer(state, state.turn);
}

export function applyClassicAction(state: GameState, action: GameAction): GameState {
  const legal = legalClassicActions(state);
  if (!legal.some((candidate) => isActionEqual(candidate, action))) return state;

  const moving =
    action.type === "move"
      ? state.board[toIndex(action.from)]
      : state.hands[action.player][action.handIndex];
  const captured = action.type === "move" ? state.board[toIndex(action.to)] : null;
  const moved = executeAction(state, action);

  if (captured?.kind === "lion") {
    return {
      ...moved,
      result: { type: "win", winner: state.turn, reason: "capture" },
      lastEvent: { type: "win", winner: state.turn, reason: "capture" },
    };
  }

  if (
    moving?.kind === "lion" &&
    action.to.row === farRank(state.turn) &&
    !isSquareAttacked(moved.board, action.to, opponentOf(state.turn))
  ) {
    return {
      ...moved,
      result: { type: "win", winner: state.turn, reason: "try" },
      lastEvent: { type: "win", winner: state.turn, reason: "try" },
    };
  }

  const advanced: GameState = {
    ...moved,
    turn: opponentOf(state.turn),
    moveNumber: state.moveNumber + 1,
  };
  const key = positionKey(advanced);
  const history = [...state.history, key];
  const occurrences = history.filter((candidate) => candidate === key).length;

  // This baseline prevents self-check; resolve a blocked player explicitly.
  if (legalActionsForPlayer(advanced, advanced.turn).length === 0) {
    return {
      ...advanced,
      history,
      result: { type: "win", winner: state.turn, reason: "no-actions" },
      lastEvent: { type: "win", winner: state.turn, reason: "no-actions" },
    };
  }

  if (occurrences >= 3) {
    return {
      ...advanced,
      history,
      result: { type: "draw", reason: "repetition" },
      lastEvent: { type: "draw", reason: "repetition" },
    };
  }

  return { ...advanced, history };
}

export const classicRuleset: Ruleset = {
  id: "classic",
  name: "Experiment 00 · 원형",
  summary: "로그라이크 변형을 비교하기 위한, 작동하는 십이장기 기준점.",
  createInitialState: createClassicState,
  legalActions: legalClassicActions,
  applyAction: applyClassicAction,
};
