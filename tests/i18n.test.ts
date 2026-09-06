import { describe, expect, it } from "vitest";
import { createClassicState, applyClassicAction } from "../src/rules/classic";
import { dictionaries, formatEvent, loadLocale, resolveLocale, saveLocale, LOCALE_STORAGE_KEY } from "../src/i18n";
import type { GameEvent } from "../src/core/model";

describe("language preferences", () => {
  it("uses an explicit saved choice before the browser language", () => {
    expect(resolveLocale("ja", ["ko-KR", "en-US"])).toBe("ja");
    expect(resolveLocale(null, ["fr-FR", "ja-JP", "en-US"])).toBe("ja");
    expect(resolveLocale("invalid", ["KO-kr"])).toBe("ko");
    expect(resolveLocale(null, ["de-DE"])).toBe("en");
  });
  it("stores a choice and loads it on the next visit", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    saveLocale("ja", () => storage);
    expect(data.get(LOCALE_STORAGE_KEY)).toBe("ja");
    expect(loadLocale(["ko-KR"], () => storage)).toBe("ja");
  });
  it("keeps working when storage is unavailable", () => {
    const denied = () => { throw new Error("storage denied"); };
    expect(loadLocale(["ja-JP"], denied)).toBe("ja");
    expect(() => saveLocale("ko", denied)).not.toThrow();
  });
});

describe("language-independent game events", () => {
  it("retranslates a capture without changing the game or losing its hand", () => {
    const state = applyClassicAction(createClassicState(), {
      type: "move", from: { row: 2, column: 1 }, to: { row: 1, column: 1 },
    });
    const snapshot = JSON.stringify(state);
    expect(formatEvent(state.lastEvent, dictionaries.ko)).toBe("남쪽: 병아리 → 병아리 포획.");
    expect(formatEvent(state.lastEvent, dictionaries.ja)).toBe("下側：ひよこでひよこを取りました。");
    expect(formatEvent(state.lastEvent, dictionaries.en)).toBe("South: Chick captured Chick.");
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.hands.south).toHaveLength(1);
  });
  it("formats promotion, drop and all terminal outcomes in every language", () => {
    const events: GameEvent[] = [
      { type: "start", player: "south" },
      { type: "move", player: "south", piece: "chick", captured: null, promoted: true },
      { type: "drop", player: "north", piece: "elephant" },
      { type: "win", winner: "north", reason: "capture" },
      { type: "win", winner: "south", reason: "try" },
      { type: "win", winner: "south", reason: "no-actions" },
      { type: "draw", reason: "repetition" },
    ];
    for (const messages of Object.values(dictionaries)) {
      for (const event of events) {
        expect(formatEvent(event, messages).length).toBeGreaterThan(0);
        expect(formatEvent(event, messages)).not.toMatch(/undefined|\[object Object\]/);
      }
      expect(formatEvent(events[1], messages)).toContain(messages.promotion);
    }
  });
});
