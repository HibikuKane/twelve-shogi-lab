// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabApp } from "../src/ui/app";

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  new LabApp(root);
  // Pin the locale so assertions do not depend on the test environment's languages.
  choose(root, "language", "ko");
  return root;
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`no element for ${selector}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function choose(root: HTMLElement, id: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(`#${id}`);
  if (!select) throw new Error(`no select #${id}`);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Play one south move by taking the first piece that has a legal target. */
function playSouthMove(root: HTMLElement): void {
  const cells = Array.from(root.querySelectorAll<HTMLButtonElement>(".board__cell"));
  for (const cell of cells) {
    if (cell.disabled || !cell.querySelector(".piece--south")) continue;
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const target = root.querySelector<HTMLButtonElement>(".board__cell.is-legal");
    if (target) {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return;
    }
  }
  throw new Error("no legal south move found");
}

function playableCells(root: HTMLElement): number {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(".board__cell"))
    .filter((cell) => !cell.disabled).length;
}

function turnText(root: HTMLElement): string {
  return root.querySelector(".game__turn")?.textContent?.trim() ?? "";
}

describe("AI turn lifecycle in the UI", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("resumes the AI turn after a restart prompt is cancelled", () => {
    const root = mount();
    // Two-player mode: south moves, so it is now north's turn.
    playSouthMove(root);
    expect(turnText(root)).toContain("북쪽");

    // Open the restart prompt, switch to AI mode while it is open, then cancel.
    click(root, "[data-reset]");
    expect(root.querySelector(".restart-prompt")).not.toBeNull();
    choose(root, "mode", "ai");
    click(root, "[data-cancel-reset]");

    vi.runAllTimers();

    // The AI owed a move here. It must have played it, handing the turn back.
    expect(turnText(root)).toContain("남쪽");
    expect(playableCells(root)).toBeGreaterThan(0);
  });

  it("locks the board while the AI is to move and unlocks it afterwards", () => {
    const root = mount();
    choose(root, "mode", "ai");
    playSouthMove(root);
    expect(playableCells(root)).toBe(0);
    vi.runAllTimers();
    expect(turnText(root)).toContain("남쪽");
    expect(playableCells(root)).toBeGreaterThan(0);
  });

  it("does not apply a search started before a restart to the new match", () => {
    const root = mount();
    choose(root, "mode", "ai");
    playSouthMove(root);
    const movesBeforeRestart = turnText(root);
    // Restart while the AI is still thinking.
    click(root, "[data-reset]");
    click(root, "[data-confirm-reset]");
    vi.runAllTimers();
    expect(movesBeforeRestart).toContain("북쪽");
    // A fresh match is south to move at move 1, and the discarded AI reply must not appear.
    expect(turnText(root)).toContain("1");
    expect(turnText(root)).toContain("남쪽");
  });

  it("keeps the two-player baseline working with no AI involvement", () => {
    const root = mount();
    playSouthMove(root);
    vi.runAllTimers();
    expect(turnText(root)).toContain("북쪽");
    expect(playableCells(root)).toBeGreaterThan(0);
  });
});
