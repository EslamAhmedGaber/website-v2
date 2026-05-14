# V2 Feature Migration

Decision: keep building `website-v2`. Do not return to editing the old static site except as a feature reference.

## Why v2 stays the base

- Per-paper JSON files in `src/data/questions/` keep new paper additions scalable.
- Astro generates the catalogue and paper pages automatically.
- The old site has strong features, but the code is duplicated across many HTML files and depends on monolithic generated files.
- The old project remains the source for PDF book builders, solution style, and feature behavior until those pieces are ported cleanly.

## Old Features To Port

Done in v2:
- Linear and Modular pathway gate
- Practice filters
- Grid/list question cards
- Solved, selected, and mistake tracking
- Study timer
- Topic mastery summary
- Mock exam builder
- Worked solution dialog
- Fix Topic admin flow
- Past-paper catalogue and per-paper pages
- Downloads page
- Google progress sync wiring
- Worksheet builder and print selected questions
- Spaced-repetition Mistake Box with due, saved, and mastered views

Next:
- Full progress dashboard: topic sheet, backup export/import, WhatsApp summary
- Exam page with timed self-marking and score history
- Topic roadmap page
- Readiness check page
- Study plan generator
- Notes library page
- Lead/enrollment dialog and parent-facing pages
- PWA/offline shell
- PDF book builder port or mirror into the old book workspace

## Rule

Port behavior, not clutter. Every old feature should become either:
- an Astro page,
- a small public script,
- a data file under `src/data/`,
- or a tool under `tools/`.

Do not add a second source of truth for question metadata.
