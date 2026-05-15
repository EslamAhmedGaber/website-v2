# V2 Feature Migration

Decision: keep building `website-v2`. Do not return to editing the old static site except as a feature reference.

## Why v2 stays the base

- Per-paper JSON files in `src/data/questions/` keep new paper additions scalable.
- Astro generates the catalogue and paper pages automatically.
- The old site has strong features, but the code is duplicated across many HTML files and depends on monolithic generated files.
- The old project remains the source for PDF book builders, solution style, and feature behavior until those pieces are ported cleanly.

## Old Features To Port

Done in v2:
- Scalable paper pipeline contract
- Pipeline verifier for data/assets/solutions/privacy guardrails
- Public classified book builder from v2 data
- Private answer book builder into `private_output/`
- Unit 1 and Unit 2 classified book routing for linear and modular papers
- Linear and Modular pathway gate
- Practice filters
- Grid/list question cards
- Solved, selected, and mistake tracking
- Study timer
- Topic mastery summary
- Full mock exam builder with timed self-marking, history, printable papers, and weak-topic return links
- Worked solution dialog
- Fix Topic admin flow
- Past-paper catalogue and per-paper pages
- Downloads page
- Google progress sync wiring
- Worksheet builder and print selected questions
- Multi-scope print center for selected, filtered, topic, chapter/unit, and whole-bank output
- Spaced-repetition Mistake Box with due, saved, and mastered views
- Full progress dashboard: topic sheet, backup export/import, WhatsApp summary
- Topic roadmap page
- Readiness check page
- Study plan generator
- Notes library page with restored visual notes
- Lead/enrollment dialog
- PWA manifest, offline page, and service worker

Next:
- Optional marketing / parent-facing polish if wanted
- Add new visual notes chapters when the material is ready

No core old student workflow is still missing from v2.

## Rule

Port behavior, not clutter. Every old feature should become either:
- an Astro page,
- a small public script,
- a data file under `src/data/`,
- or a tool under `tools/`.

Do not add a second source of truth for question metadata.

## New Paper Rule

When a new paper arrives, v2 must support the full chain:

`ingest -> classify -> save -> solve -> update website -> update public classified books -> update private answer books -> verify -> publish`.

Website solutions stay in `src/data/solutions/` and appear only through `Show solution`.
Answer books stay private in `private_output/`.

## 4WM Modular Status

The May/Nov 2025 `4WM1` and `4WM2` imports were removed because the crops were not clean enough to publish or solve reliably. The Unit 1 and Unit 2 classified books remain active from the linear bank. Clean 4WM1 papers should join Unit 1 and the complete classified book; clean 4WM2 papers should join Unit 2 and the complete classified book.
