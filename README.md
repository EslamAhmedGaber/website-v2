# Elite IGCSE Mathematics v2

Scalable Astro rebuild for Dr Eslam Ahmed's Elite IGCSE Mathematics website.

The project goal is simple:

`new paper -> classify questions -> add website solutions -> update public classified books -> update private answer books -> verify -> publish`

## Important Folders

- `src/data/questions/`: per-paper classified question data
- `src/data/solutions/`: worked website solutions for `Show solution`
- `public/assets/questions/`: cropped question images
- `public/downloads/`: public classified question books
- `private_output/`: private answer books and private solution exports
- `tools/inbox/`: drop new paper PDFs here
- `tools/processed/`: processed source PDFs

Old projects are feature references only:

- `C:\Users\Eslam\Documents\New project 5\classified_exam_problems`
- `C:\Users\Eslam\Documents\Elite IGCSE v2\website`

Do not copy their old structure into v2.

## Commands

```powershell
npm run dev
npm run ingest:paper
npm run books:dry-run
npm run books:public
npm run books:private
npm run verify:pipeline
npm run build
npm run check
```

## Adding A New Paper

1. Put the paper PDF in `tools/inbox/`.
2. Run `npm run ingest:paper`.
3. Review classifications in `src/data/questions/`.
4. Add website-only worked solutions in `src/data/solutions/`.
5. Run `npm run books:dry-run`.
6. Regenerate public classified books with `npm run books:public`.
7. Regenerate private answer books with `npm run books:private`.
8. Run `npm run check`.
9. Commit and push.

Read [PIPELINE_CONTRACT.md](./PIPELINE_CONTRACT.md) before changing the paper pipeline.

## Privacy Rule

Solutions are visible on the website only through `Show solution`.

Answer books, mark schemes, and private solution exports must stay out of `public/`, `public/downloads/`, and `dist/`.
