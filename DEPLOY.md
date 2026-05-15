# Deploy v2 to `eliteigcse.com`

The new site at `website-v2/` is ready to take over from the legacy
`website/` folder. Here's the safe switch-over procedure.

## Current same-domain publish path

Until the custom domain is moved to the v2 GitHub repository, keep
`website-v2/` as the source of truth and use the legacy `website/`
repository only as the live deploy mirror:

```powershell
npm run check
python tools/publish_live_site.py --apply
cd "..\website"
git add -A
git commit -m "Publish v2 site"
git push
```

`tools/publish_live_site.py` mirrors `dist/` into the live repository,
keeps the domain marker, and writes `.nojekyll` so GitHub Pages serves
Astro's `_astro/` assets correctly.

## Before the switch

- [ ] Test `npm run build` finishes clean.
- [ ] Open `npm run preview` and confirm:
  - [ ] `/` shows the pathway gate
  - [ ] Picking Modular shows the unit gate
  - [ ] `/practice` shows the command bar + question grid
  - [ ] At least one paper page like `/pastpapers/May2025_4WM1H/` renders
  - [ ] `/downloads`, `/progress`, `/exam` all load
- [ ] Test the Fix Topic admin button while signed in (placeholder OK for now)

## Two switch-over options

### Option A — Preview subdomain first (recommended)

Lowest risk. Set up `next.eliteigcse.com` to point at v2, leave
`eliteigcse.com` on v1 until v2 is confirmed solid.

1. **Push v2 to its own repo.** Create a new GitHub repo, e.g.
   `EslamAhmedGaber/elite-igcse-v2`. From `website-v2/`:
   ```
   git remote add origin https://github.com/EslamAhmedGaber/elite-igcse-v2.git
   git push -u origin main
   ```
2. **Enable Pages on the new repo.** Settings → Pages → Source: GitHub
   Actions. The workflow at `.github/workflows/deploy.yml` will
   auto-deploy on every push to `main`.
3. **Wait for the first build.** Actions tab → wait for green ✓.
   The site will be live at `https://eslamahmedgaber.github.io/elite-igcse-v2/`.
4. **Add custom subdomain.** In the new repo's Pages settings, set
   custom domain to `next.eliteigcse.com`. Then in your DNS provider,
   add a CNAME record `next` → `eslamahmedgaber.github.io`.
5. **Verify on `next.eliteigcse.com`.** Run through the smoke test.
6. **Flip.** When everything checks out:
   - In the legacy repo (`elite-igcse-math`), Settings → Pages →
     remove the custom domain.
   - In the v2 repo, change the custom domain from
     `next.eliteigcse.com` to `eliteigcse.com`.
   - Update the CNAME record so the apex points to the new repo
     (or update the GitHub Pages routing).
   - The legacy `website/` folder can stay in the old repo for
     rollback. Optionally rename it to `website-legacy/`.

### Option B — Replace in the same repo (faster, riskier)

Push v2 INTO the existing `elite-igcse-math` repo as the new source.

1. In `elite-igcse-math` (the live repo), rename `website/` →
   `website-legacy/` and copy everything from `website-v2/` to a new
   `website/` directory.
2. Update `.github/workflows/deploy.yml` so it builds from this new
   `website/`. Pages settings → Source: GitHub Actions.
3. Commit + push. Pages auto-rebuilds.

I recommend Option A unless time pressure makes Option B necessary.

## Smoke test (live)

After the switch, in incognito at `https://eliteigcse.com`:

1. Pathway gate renders.
2. Click Modular → unit gate → Unit 1 → lands on /practice scoped
   to Unit 1.
3. Search "trigonometry" → results filter live.
4. Click any card → viewer opens with the question image.
5. Click "Show solution" on a card that has one → markdown + MathJax
   renders.
6. Sidebar timer starts/pauses/resets correctly.
7. Mistake box: open kebab → "Add to Mistake Box" → mistakes count
   increases → review filter shows it.
8. `/pastpapers/` lists all 46 papers.
9. `/downloads/` shows the 6 books with three groups; public ones
   download.

## Rollback

If something breaks live:
- **Option A**: in the v2 repo's Pages settings, remove the custom
  domain. Re-add it to the legacy repo. v1 is back live in ~2 min.
- **Option B**: revert the commit that swapped `website/` →
  `website-v2/` content, push.

Either way the legacy code is preserved verbatim, no destruction.
