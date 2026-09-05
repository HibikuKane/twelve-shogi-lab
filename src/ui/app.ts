import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  fromIndex,
  samePosition,
  toIndex,
  type GameAction,
  type GameState,
  type Piece,
  type PieceKind,
  type Player,
  type Position,
  type Selection,
} from "../core/model";
import type { Ruleset } from "../core/ruleset";
import { experimentCatalog } from "../experiments/catalog";
import { classicRuleset } from "../rules/classic";

const PIECE_INFO: Record<PieceKind, { readonly glyph: string; readonly ko: string }> = {
  lion: { glyph: "🦁", ko: "사자" },
  giraffe: { glyph: "🦒", ko: "기린" },
  elephant: { glyph: "🐘", ko: "코끼리" },
  chick: { glyph: "🐣", ko: "병아리" },
  hen: { glyph: "🐔", ko: "닭" },
};

const PLAYER_LABEL: Record<Player, string> = {
  north: "북쪽",
  south: "남쪽",
};

function pieceMarkup(candidate: Piece): string {
  const info = PIECE_INFO[candidate.kind];
  return `
    <span class="piece piece--${candidate.owner}" aria-hidden="true">
      <span class="piece__glyph">${info.glyph}</span>
      <span class="piece__name">${info.ko}</span>
    </span>
  `;
}

function actionForTarget(actions: ReadonlyArray<GameAction>, target: Position): GameAction | undefined {
  return actions.find((action) => samePosition(action.to, target));
}

export class LabApp {
  private readonly root: HTMLElement;
  private readonly ruleset: Ruleset = classicRuleset;
  private state: GameState = this.ruleset.createInitialState();
  private selection: Selection | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  private selectedActions(): ReadonlyArray<GameAction> {
    if (!this.selection) return [];
    return this.ruleset.legalActions(this.state).filter((action) => {
      if (this.selection?.type === "board" && action.type === "move") {
        return samePosition(this.selection.position, action.from);
      }
      if (this.selection?.type === "hand" && action.type === "drop") {
        return (
          action.player === this.selection.player &&
          action.handIndex === this.selection.index
        );
      }
      return false;
    });
  }

  private selectBoard(position: Position): void {
    if (this.state.result.type !== "playing") return;
    const selectedActions = this.selectedActions();
    const chosen = actionForTarget(selectedActions, position);
    if (chosen) {
      this.state = this.ruleset.applyAction(this.state, chosen);
      this.selection = null;
      this.render();
      return;
    }

    const candidate = this.state.board[toIndex(position)];
    this.selection = candidate?.owner === this.state.turn
      ? { type: "board", position }
      : null;
    this.render();
  }

  private selectHand(player: Player, index: number): void {
    if (player !== this.state.turn || this.state.result.type !== "playing") return;
    this.selection = { type: "hand", player, index };
    this.render();
  }

  private reset(): void {
    this.state = this.ruleset.createInitialState();
    this.selection = null;
    this.render();
  }

  private resultText(): string {
    if (this.state.result.type === "playing") {
      return `${PLAYER_LABEL[this.state.turn]} 차례 · ${this.state.moveNumber}수`;
    }
    if (this.state.result.type === "draw") return "무승부 · 반복 국면";
    const reason = { capture: "사자 포획", try: "트라이", "no-actions": "상대 합법 수 없음" }[this.state.result.reason];
    return `${PLAYER_LABEL[this.state.result.winner]} 승리 · ${reason}`;
  }

  private renderHand(player: Player): string {
    const pieces = this.state.hands[player];
    const content = pieces.length === 0
      ? `<span class="hand__empty">잡은 말 없음</span>`
      : pieces.map((candidate, index) => {
          const selected =
            this.selection?.type === "hand" &&
            this.selection.player === player &&
            this.selection.index === index;
          return `
            <button
              class="hand-piece${selected ? " is-selected" : ""}"
              data-hand-player="${player}"
              data-hand-index="${index}"
              aria-label="${PIECE_INFO[candidate.kind].ko}를 판에 놓기"
              ${player !== this.state.turn ? "disabled" : ""}
            >${pieceMarkup(candidate)}</button>
          `;
        }).join("");

    return `
      <section class="hand hand--${player}" aria-label="${PLAYER_LABEL[player]}이 잡은 말">
        <span class="hand__label">${PLAYER_LABEL[player]}의 손</span>
        <div class="hand__pieces">${content}</div>
      </section>
    `;
  }

  private renderBoard(): string {
    const legalTargets = this.selectedActions();
    const cells = Array.from({ length: BOARD_ROWS * BOARD_COLUMNS }, (_value, index) => {
      const position = fromIndex(index);
      const candidate = this.state.board[index];
      const selected =
        this.selection?.type === "board" &&
        samePosition(this.selection.position, position);
      const targetAction = actionForTarget(legalTargets, position);
      const isCapture = Boolean(targetAction && candidate);
      const classes = [
        "board__cell",
        selected ? "is-selected" : "",
        targetAction ? "is-legal" : "",
        isCapture ? "is-capture" : "",
      ].filter(Boolean).join(" ");
      const label = candidate
        ? `${PLAYER_LABEL[candidate.owner]} ${PIECE_INFO[candidate.kind].ko}`
        : "빈 칸";

      return `
        <button
          class="${classes}"
          data-row="${position.row}"
          data-column="${position.column}"
          aria-label="${position.row + 1}행 ${position.column + 1}열, ${label}"
        >${candidate ? pieceMarkup(candidate) : ""}</button>
      `;
    }).join("");

    return `<div class="board" role="group" aria-label="3열 4행 십이장기 판">${cells}</div>`;
  }

  private renderExperiments(): string {
    return experimentCatalog.map((entry) => `
      <article class="experiment-card experiment-card--${entry.status}">
        <div class="experiment-card__topline">
          <span>${entry.name}</span>
          <span class="status-chip">${entry.status === "playable" ? "PLAYABLE" : "QUEUED"}</span>
        </div>
        <p>${entry.question}</p>
      </article>
    `).join("");
  }

  private render(): void {
    this.root.innerHTML = `
      <main class="shell">
        <header class="hero">
          <p class="eyebrow">TWELVE SHOGI LAB · EXPERIMENT 00</p>
          <h1>작은 판에서<br /><em>규칙을 부순다.</em></h1>
          <p class="hero__copy">
            십이장기를 기준점으로 삼아 HP, 장비, 융합을 하나씩 끼워 보고
            재미없으면 안전하게 버리는 로그라이크 실험실.
          </p>
        </header>

        <section class="workbench">
          <aside class="brief">
            <span class="brief__number">00</span>
            <p class="eyebrow">CURRENT RULESET</p>
            <h2>${this.ruleset.name}</h2>
            <p>${this.ruleset.summary}</p>
            <dl class="rules-list">
              <div><dt>판</dt><dd>3 × 4</dd></div>
              <div><dt>승리</dt><dd>사자 포획 / 안전한 트라이</dd></div>
              <div><dt>핵심</dt><dd>잡은 말을 내 편으로 재투입</dd></div>
            </dl>
            <p class="tip">로컬 2인 테스트판 · 양쪽을 직접 조작한다. 말을 누르면 갈 수 있는 칸이 빛난다. 잡은 말은 손패에서 골라 빈 칸에 놓는다.</p>
          </aside>

          <section class="game" aria-live="polite">
            <div class="game__status">
              <div>
                <span class="game__turn">${this.resultText()}</span>
                <p>${this.state.lastEvent}</p>
              </div>
              <button class="reset-button" data-reset>다시 시작</button>
            </div>
            ${this.renderHand("north")}
            ${this.renderBoard()}
            ${this.renderHand("south")}
          </section>
        </section>

        <section class="queue">
          <div class="queue__heading">
            <p class="eyebrow">TEST QUEUE</p>
            <h2>한 번에 큰 질문 하나.</h2>
          </div>
          <div class="experiment-grid">${this.renderExperiments()}</div>
        </section>

        <footer>
          <span>HIBIKUKANE / TWELVE-SHOGI-LAB</span>
          <span>BUILD SMALL · LEARN FAST · KEEP THE WEIRD</span>
        </footer>
      </main>
    `;

    this.root.querySelectorAll<HTMLElement>("[data-row]").forEach((cell) => {
      cell.addEventListener("click", () => {
        this.selectBoard({
          row: Number(cell.dataset.row),
          column: Number(cell.dataset.column),
        });
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-hand-player]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectHand(button.dataset.handPlayer as Player, Number(button.dataset.handIndex));
      });
    });

    this.root.querySelector<HTMLElement>("[data-reset]")?.addEventListener("click", () => this.reset());
  }
}
