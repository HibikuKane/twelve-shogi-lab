import { classicRuleset } from "../rules/classic";

export interface ExperimentEntry {
  readonly id: string;
  readonly name: string;
  readonly status: "playable" | "queued";
  readonly question: string;
}

export const experimentCatalog: ReadonlyArray<ExperimentEntry> = [
  {
    id: classicRuleset.id,
    name: "00 · 원형 십이장기",
    status: "playable",
    question: "원래 규칙에서 실제로 재미를 만드는 압력은 무엇인가?",
  },
  {
    id: "hp-battle",
    name: "01 · HP 전투",
    status: "queued",
    question: "사자 포획을 HP 피해로 바꾸면 판 읽기가 더 풍부해지는가?",
  },
  {
    id: "item-behavior",
    name: "02 · 장비 변이",
    status: "queued",
    question: "장비 하나가 말의 이동 또는 포획 규칙을 바꾸면 선택이 생기는가?",
  },
  {
    id: "fusion",
    name: "03 · 비대칭 융합",
    status: "queued",
    question: "몸체와 능력을 서로 다른 말에서 가져오면 조합이 읽히는가?",
  },
];
