# Elite IGCSE v2 Pipeline Contract

This project stays scalable by keeping one source of truth:

- questions: `src/data/questions/*.json`
- website solutions: `src/data/solutions/*.json`
- public question assets: `public/assets/questions/`
- public classified books: `public/downloads/`
- private answer books: `private_output/`

Old folders are feature references only:

- `C:\Users\Eslam\Documents\New project 5\classified_exam_problems`
- `C:\Users\Eslam\Documents\Elite IGCSE v2\website`

Do not copy their old monolithic structure into v2.

## New Paper Workflow

When Dr Eslam gives a new paper:

1. Drop the question-paper PDF into `tools/inbox/`.
2. Run `npm run ingest:paper`.
3. Review the classified output in `src/data/questions/`.
4. Add or generate worked website solutions in `src/data/solutions/`.
5. Build/update public classified books in `public/downloads/`.
6. Build/update private answer books in `private_output/`.
7. Run `npm run verify:pipeline`.
8. Run `npm run build`.
9. Commit and push only after verification passes.

## Classification Requirements

Every question must carry:

- stable `id`
- `paperSlug`
- question number
- marks
- image path
- topic
- Linear chapter/unit
- Modular unit where applicable
- searchable text

Mistags are allowed only as temporary working states. Stable fixes belong in the classifier/normalizer so the next paper becomes easier.

## Solution Privacy

Website worked solutions live in `src/data/solutions/` and are shown only through the website's `Show solution` action.

Generated answer books are private. Keep them in `private_output/`. Do not put answer books, mark schemes, worked-solution books, or private exports under:

- `public/`
- `public/downloads/`
- `dist/`

The verifier checks filenames for this risk.

## Book Outputs

Public classified question books can be published under `public/downloads/`.

Private answer books must be generated under `private_output/`, then shared manually outside the public deploy when needed.

## Verification Gate

`npm run verify:pipeline` checks:

- JSON readability
- duplicate question ids
- required question fields
- paper catalogue counts
- question image existence
- solution ids matching real questions
- public download leak-risk names
- private output guardrails

This command should run before every commit that changes question data, solutions, or books.

