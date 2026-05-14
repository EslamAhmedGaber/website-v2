# Pipeline Tools

These tools keep paper updates repeatable.

## Main Commands

Run from the repo root:

```powershell
npm run ingest:paper
npm run verify:pipeline
npm run build
```

## Folder Map

```text
tools/
  inbox/              Drop new paper PDFs here
  processed/          Processed source PDFs move here
  ingest_paper.py     Split/crop/classify new papers
  verify_pipeline.py  Check data, assets, solutions, books, and privacy guardrails
  migrate_from_v1.py  One-time migration helper from the old site
```

## New Paper Workflow

1. Drop the question-paper PDF into `tools/inbox/`.
2. Run `npm run ingest:paper`.
3. Review `src/data/questions/<paper-slug>.json`.
4. Add solutions in `src/data/solutions/<paper-slug>.json`.
5. Regenerate public classified books into `public/downloads/`.
6. Regenerate private answer books into `private_output/`.
7. Run `npm run verify:pipeline`.
8. Run `npm run build`.

## Current Ingest Behavior

`ingest_paper.py`:

- detects Edexcel paper code and session,
- crops every question using "Total for Question N is M marks" footer markers,
- runs the heuristic topic classifier,
- writes `src/data/questions/<paper-slug>.json`,
- saves cropped images to `public/assets/questions/`,
- refreshes `src/data/papers.json`,
- moves the source PDF to `tools/processed/`.

## Classification Fixes

Mistags should be fixed first through the website admin `Fix topic` flow. Stable repeated fixes should then be promoted into the classifier/normalizer so the next paper improves automatically.

## Privacy

Public classified question books can be published from `public/downloads/`.

Generated answer books and private solution exports must stay in `private_output/`.

Never put answer books, mark schemes, or private worked-solution books into `public/` or `dist/`.
