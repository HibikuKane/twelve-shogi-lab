import {
  fromIndex, samePosition, toIndex,
  type GameAction, type GameState, type Piece, type PieceKind,
  type Player, type Position, type Selection,
} from "../core/model";
import type { Ruleset } from "../core/ruleset";
import { classicRuleset } from "../rules/classic";
import { createStandardOpponent, type SearchResult } from "../ai";
import { GAME_MODES, isGameMode, type GameMode } from "./mode";
import {
  dictionaries, formatEvent, isLocale, loadLocale, localeNames, saveLocale,
  type Locale, type Messages,
} from "../i18n";

/** The AI always plays north; south stays the human seat in both modes. */
const AI_SIDE: Player = "north";

/** Let the "thinking" line paint before the search blocks the main thread,
 *  and keep the reply from feeling instantaneous. */
const AI_THINK_DELAY_MS = 120;

const GLYPHS: Record<PieceKind, string> = {
  lion: "🦁", giraffe: "🦒", elephant: "🐘", chick: "🐣", hen: "🐔",
};

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export class LabApp {
  private readonly ruleset: Ruleset = classicRuleset;
  private state: GameState = this.ruleset.createInitialState();
  private selection: Selection | null = null;
  private locale: Locale = loadLocale(navigator.languages, () => window.localStorage);
  private confirmRestart = false;
  private mode: GameMode = "local";
  private thinking = false;
  /** Bumped whenever the current match or mode changes, so a search that is
   *  already running can tell that its result no longer applies. */
  private matchToken = 0;
  private aiSeed = Date.now();
  private lastSearch: SearchResult | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      if (select.id === "mode" && isGameMode(select.value)) {
        this.setMode(select.value);
        return;
      }
      if (select.id !== "language" || !isLocale(select.value)) return;
      // Language is presentation only: it must never disturb the match or a running search.
      this.locale = select.value;
      saveLocale(this.locale, () => window.localStorage);
      this.render();
    });
    this.render();
  }

  private get messages(): Messages { return dictionaries[this.locale]; }

  /** Last AI decision, exposed for debugging and future profile balancing. */
  get lastAiSearch(): SearchResult | null { return this.lastSearch; }

  private selectedActions(): ReadonlyArray<GameAction> {
    const selection = this.selection;
    if (!selection) return [];
    return this.ruleset.legalActions(this.state).filter((action) => {
      if (selection.type === "board" && action.type === "move") return samePosition(selection.position, action.from);
      return selection.type === "hand" && action.type === "drop"
        && selection.player === action.player && selection.index === action.handIndex;
    });
  }

  /** True while the human must not touch the board: the AI is to move, or is thinking. */
  private get locked(): boolean {
    return this.thinking || this.isAiTurn();
  }

  private isAiTurn(): boolean {
    return this.mode === "ai" && this.state.result.type === "playing" && this.state.turn === AI_SIDE;
  }

  private setMode(mode: GameMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Discard any in-flight search; the board itself is deliberately kept so
    // switching modes never throws away a game in progress.
    this.matchToken += 1;
    this.thinking = false;
    this.selection = null;
    this.render();
    this.scheduleAiMove();
  }

  /** Hand the position to the AI, off the current task so the UI can repaint first. */
  private scheduleAiMove(): void {
    if (!this.isAiTurn() || this.thinking || this.confirmRestart) return;
    this.thinking = true;
    const token = this.matchToken;
    this.render();
    window.setTimeout(() => this.playAiMove(token), AI_THINK_DELAY_MS);
  }

  private playAiMove(token: number): void {
    if (token !== this.matchToken) return;
    // Seeding per move keeps tie-breaking varied within a match while a whole
    // match stays reproducible from `aiSeed`.
    const opponent = createStandardOpponent(this.ruleset, AI_SIDE, this.aiSeed + this.state.moveNumber);
    const result = opponent.chooseMove(this.state);
    // The match may have been restarted or the mode switched while we searched.
    if (token !== this.matchToken) return;

    this.thinking = false;
    this.lastSearch = result;
    this.reportSearch(result);
    if (result.action) this.state = this.ruleset.applyAction(this.state, result.action);
    this.render();
    this.scheduleAiMove();
  }

  /** Spec item 21: enough to answer "why did it think that was good?" without UI work. */
  private reportSearch(result: SearchResult): void {
    const chosen = result.action
      ? result.action.type === "move"
        ? `${result.action.from.row},${result.action.from.column} -> ${result.action.to.row},${result.action.to.column}`
        : `drop -> ${result.action.to.row},${result.action.to.column}`
      : "none";
    console.debug("[ai]", {
      move: chosen, score: result.score, depth: result.depth,
      nodes: result.nodes, elapsedMs: result.elapsedMs,
      evaluation: result.breakdown && {
        material: result.breakdown.material, mobility: result.breakdown.mobility,
        boardControl: result.breakdown.boardControl, lionSafety: result.breakdown.lionSafety,
        tryProgress: result.breakdown.tryProgress, total: result.breakdown.total,
      },
    });
  }

  private selectBoard(position: Position): void {
    if (this.state.result.type !== "playing" || this.confirmRestart || this.locked) return;
    const action = this.selectedActions().find((candidate) => samePosition(candidate.to, position));
    if (action) {
      this.state = this.ruleset.applyAction(this.state, action);
      this.selection = null;
      this.render();
      this.scheduleAiMove();
      return;
    }
    const piece = this.state.board[toIndex(position)];
    this.selection = piece?.owner === this.state.turn ? { type: "board", position } : null;
    this.render();
  }

  private handleClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-reset")) {
      this.confirmRestart = this.state.moveNumber > 1 && this.state.result.type === "playing";
      if (!this.confirmRestart) this.reset();
      else this.render();
    } else if (button.hasAttribute("data-confirm-reset")) {
      this.reset();
    } else if (button.hasAttribute("data-cancel-reset")) {
      this.confirmRestart = false;
      this.render();
    } else if (button.dataset.cell !== undefined) {
      this.selectBoard(fromIndex(Number(button.dataset.cell)));
    } else if (button.dataset.handPlayer && !this.confirmRestart && !this.locked && this.state.result.type === "playing") {
      const player = button.dataset.handPlayer as Player;
      if (player !== this.state.turn) return;
      this.selection = { type: "hand", player, index: Number(button.dataset.handIndex) };
      this.render();
    }
  }

  private reset(): void {
    // Invalidate any search still running against the previous match.
    this.matchToken += 1;
    this.thinking = false;
    this.lastSearch = null;
    this.aiSeed = Date.now();
    this.state = this.ruleset.createInitialState();
    this.selection = null;
    this.confirmRestart = false;
    this.render();
    this.scheduleAiMove();
  }

  private resultText(): string {
    const { result, turn, moveNumber } = this.state;
    const m = this.messages;
    if (result.type === "playing") return m.turn(m.sides[turn], moveNumber);
    if (result.type === "draw") return m.draw;
    return m.win(m.sides[result.winner], m.reasons[result.reason]);
  }

  private pieceMarkup(piece: Piece): string {
    return `<span class="piece piece--${piece.owner}" aria-hidden="true">
      <span class="piece__glyph">${GLYPHS[piece.kind]}</span>
      <span class="piece__name">${escape(this.messages.pieces[piece.kind])}</span>
    </span>`;
  }

  private renderHand(player: Player): string {
    const m = this.messages;
    const label = m.hand(m.sides[player]);
    const content = this.state.hands[player].map((piece, index) => {
      const selected = this.selection?.type === "hand" && this.selection.player === player && this.selection.index === index;
      const disabled = player !== this.state.turn || this.state.result.type !== "playing"
        || this.confirmRestart || this.locked;
      return `<button class="hand-piece${selected ? " is-selected" : ""}"
        data-hand-player="${player}" data-hand-index="${index}" data-focus="hand-${player}-${index}"
        aria-label="${escape(m.place(m.pieces[piece.kind]))}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>
        ${this.pieceMarkup(piece)}</button>`;
    }).join("") || `<span class="hand__empty">${escape(m.emptyHand)}</span>`;
    return `<section class="hand hand--${player}" aria-label="${escape(label)}">
      <span class="hand__label">${escape(label)}</span><div class="hand__pieces">${content}</div></section>`;
  }

  private renderBoard(): string {
    const m = this.messages;
    const actions = this.selectedActions();
    const cells = this.state.board.map((piece, index) => {
      const position = fromIndex(index);
      const selected = this.selection?.type === "board" && samePosition(this.selection.position, position);
      const legal = actions.some((action) => samePosition(action.to, position));
      const occupant = piece ? `${m.sides[piece.owner]} ${m.pieces[piece.kind]}` : m.emptySquare;
      const label = m.square(position.row + 1, position.column + 1, occupant, legal);
      return `<button class="board__cell${selected ? " is-selected" : ""}${legal ? " is-legal" : ""}${legal && piece ? " is-capture" : ""}"
        data-cell="${index}" data-focus="cell-${index}" aria-label="${escape(label)}" aria-pressed="${Boolean(selected)}"
        ${this.confirmRestart || this.state.result.type !== "playing" || this.locked ? "disabled" : ""}>
        ${piece ? this.pieceMarkup(piece) : ""}</button>`;
    }).join("");
    return `<div class="board" role="group" aria-label="${escape(m.boardLabel)}">${cells}</div>`;
  }

  private selectionHint(): string {
    const m = this.messages;
    const selection = this.selection;
    if (!selection) return `<p>${escape(m.selectHint)}</p>`;
    const piece = selection.type === "board"
      ? this.state.board[toIndex(selection.position)] : this.state.hands[selection.player][selection.index];
    if (!piece) return "";
    const hint = this.selectedActions().length === 0 ? m.noTargets
      : selection.type === "hand" ? m.dropHint : m.movement[piece.kind];
    return `<strong>${escape(m.selected(m.pieces[piece.kind]))}</strong><p>${escape(hint)}</p>`;
  }

  private render(): void {
    const m = this.messages;
    const focused = document.activeElement?.getAttribute("data-focus");
    const helpOpen = this.root.querySelector<HTMLDetailsElement>("details")?.open ?? false;
    document.documentElement.lang = this.locale;
    document.title = `${m.title} · Twelve Shogi Lab`;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", m.description);
    this.root.innerHTML = `<main class="shell">
      <header class="topbar">
        <div><p class="brand">TWELVE SHOGI LAB</p><h1>${escape(m.title)}</h1><p class="mode">${escape(this.mode === "ai" ? m.modeAi : m.mode)}</p></div>
        <div class="topbar__controls">
          <div class="mode-control"><label for="mode">${escape(m.modeLabel)}</label>
            <select id="mode" data-focus="mode">${GAME_MODES.map((mode) =>
              `<option value="${mode}" ${mode === this.mode ? "selected" : ""}>${escape(m.modes[mode])}</option>`).join("")}</select>
          </div>
          <div class="language-control"><label for="language">${escape(m.language)}</label>
            <select id="language" data-focus="language">${Object.entries(localeNames).map(([locale, name]) =>
              `<option value="${locale}" lang="${locale}" ${locale === this.locale ? "selected" : ""}>${name}</option>`).join("")}</select>
          </div>
        </div>
      </header>
      <div class="play-layout">
        <section class="game" aria-label="${escape(m.title)}">
          <div class="game__status"><div role="status" aria-live="polite" aria-atomic="true">
            <h2 class="game__turn">${escape(this.resultText())}</h2>
            <p class="game__event">${escape(formatEvent(this.state.lastEvent, m))}</p>
            ${this.thinking ? `<p class="game__thinking">${escape(m.aiThinking)}</p>` : ""}
          </div><button class="reset-button" data-reset data-focus="reset">${escape(m.restart)}</button></div>
          ${this.confirmRestart ? `<section class="restart-prompt" aria-label="${escape(m.restartQuestion)}">
            <p>${escape(m.restartQuestion)}</p><div>
              <button data-cancel-reset data-focus="cancel-reset">${escape(m.cancel)}</button>
              <button data-confirm-reset data-focus="confirm-reset">${escape(m.restart)}</button>
            </div></section>` : ""}
          ${this.renderHand("north")}${this.renderBoard()}${this.renderHand("south")}
          <div class="selection-hint" aria-live="polite">${this.state.result.type === "playing" ? this.selectionHint() : `<p>${escape(this.resultText())}</p>`}</div>
        </section>
        <aside class="guide"><details ${helpOpen ? "open" : ""}><summary data-focus="help">${escape(m.helpTitle)}</summary>
          <ol>${[...m.help, ...(this.mode === "ai" ? [m.aiHelp] : [])]
            .map((text) => `<li>${escape(text)}</li>`).join("")}</ol>
          <ul class="piece-guide">${Object.entries(m.pieces).map(([kind, name]) => `<li>
            <span aria-hidden="true">${GLYPHS[kind as PieceKind]}</span><div><strong>${escape(name)}</strong>
            <p>${escape(m.movement[kind as PieceKind])}</p></div></li>`).join("")}</ul>
        </details></aside>
      </div>
    </main>`;
    if (focused) {
      const next = Array.from(this.root.querySelectorAll<HTMLElement>("[data-focus]")).find((element) => element.dataset.focus === focused);
      (next ?? this.root.querySelector<HTMLElement>("[data-reset]"))?.focus({ preventScroll: true });
    }
  }
}
