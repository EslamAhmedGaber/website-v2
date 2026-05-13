# Pipeline tools

The canonical ingestion chain for Elite IGCSE v2. Drop a PDF here,
run one command, push the build.

## What lives here

```
tools/
├── inbox/              ← drop new past-paper PDFs here
├── processed/          ← script moves PDFs here once done
├── migrate_from_v1.py  ← one-time migration script (Phase 1, already run)
├── ingest_paper.py     ← canonical ingest pipeline (Phase 4)
└── README.md           ← this file
```

## Adding a new past paper — full workflow

1. Drop the question-paper PDF into `tools/inbox/`.
   Naming: any filename works as long as the Edexcel paper code is in
   the filename or on the cover page. Auto-detected codes:
     - `4WM1H`  → Modular Unit 1
     - `4WM1HR` → Modular Unit 1 (Resit)
     - `4WM2H`  → Modular Unit 2
     - `4WM2HR` → Modular Unit 2 (Resit)
     - `P1H` / `P2H` / `P1HR` / `P2HR` → Linear (4MA1) papers

2. From the repo root, run:
   ```powershell
   python tools/ingest_paper.py
   ```
   This will:
   - detect paper code + session from the filename
   - crop every question (multi-page aware, via the "Total for
     Question N is M marks" footer markers)
   - run the heuristic topic classifier
   - write `src/data/questions/<paper-slug>.json`
   - copy each PNG into `public/assets/questions/`
   - refresh `src/data/papers.json` (the catalogue)
   - move the source PDF to `tools/processed/`

3. (Optional) write worked solutions for the new questions at
   `src/data/solutions/<paper-slug>.json`. Format:
   ```json
   {
     "paperSlug": "May2025_4WM1H",
     "solutions": {
       "all::May2025_4WM1H__Q01__...": { "source": "**Topic check:** ...\n\n**Solution**\n\n..." }
     }
   }
   ```
   (Phase 4.2 will add a helper that converts loose markdown files
   into this JSON.)

4. Rebuild and deploy:
   ```powershell
   npm run build
   git add -A
   git commit -m "Add <Session> <Code> past paper"
   git push
   ```
   GitHub Pages picks up the new build automatically (Phase 5 wires
   the Actions workflow that runs `npm ci && npm run build` on push).

## How classification works

The classifier in `ingest_paper.py` is a fast heuristic — it tags
every question with one of the 54 raw topics in the v1 taxonomy.
Mistags happen; that's by design. The fix workflow is one click:

1. Sign in on the live site as an `eslam*@*` Google account.
2. On any misclassified question card, open the kebab menu and pick
   **Fix topic**.
3. Choose the correct topic from the dropdown. Save.

The correction stores in localStorage right now. Phase 4.2 will
promote it to Firestore and emit a `src/data/corrections.json` file
that the build picks up so corrections survive across devices and
deployments.

## When something goes wrong

- **Paper code not detected**: rename the PDF to include the code
  in the filename (e.g. `Jun2024_4MA1_P1H.pdf`) and re-run.
- **Questions missing**: PDF probably has unusual "Total for
  Question" wording. Inspect with `python -c "import fitz; print(fitz.open('path').load_page(0).get_text())"`.
- **Image crop too large/small**: tune the `+ 4` / `+ 6` padding
  in `locate_blocks()`.

## What stays out of this pipeline

- The PDF book builder (`build_modular_books.py` etc.) is a separate
  generator that reads from the same `src/data/questions/*.json`
  files. Phase 4.2 will port it from `New project 5\classified_exam_problems\`
  into `website-v2/tools/build_books.py`.
- Solution generation: still manual / LLM-assisted. The next
  assistant will write worked solutions into `src/data/solutions/`
  (see `SOLUTION_HANDOVER.md` in the parent folder).
