# Working agreement for coding agents

This repository is a lab for disposable twelve-shogi roguelike experiments.

## Architecture

- Keep game rules deterministic and independent from the DOM.
- A ruleset owns initial state, legal action generation, and state transitions.
- Add or update tests before changing capture, promotion, check, try, drop, item, or fusion behavior.
- Do not add a UI framework, state library, backend, or asset pipeline without documenting why the current setup blocks the experiment.
- Prefer data-driven effects to one-off conditionals in UI code.
- Preserve usable mobile touch targets and keyboard-visible focus states.
- Keep all in-game copy in `src/i18n/` with matching Korean, Japanese and English entries. Game rules emit typed `GameEvent` data, never localized sentences. Switching locale must preserve the current match and selection.
- Keep development plans and speculative experiments in documents; only expose functioning player controls and relevant help in-game.
- Keep future run state (roster, stage, rewards) separate from single-match `GameState`. Early-stage enemies should start with fewer pieces than the player; exact setups are still undecided.

## Experiments

- Keep the classic ruleset available as the comparison baseline.
- Give each experiment one primary question.
- Record rejected experiments and the observation that rejected them.
- Prototype with CSS, text, emoji, or placeholders before requiring final art.
- Put generated art in `public/assets/<experiment-id>/` and record its model/source and license assumptions nearby.
- Core rules must not depend on image dimensions or frame-based animation.
