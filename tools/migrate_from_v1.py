"""
One-time migration script: take the v1 site's flat data files and
split them into per-paper JSON files + descriptive-named image
files for the v2 Astro site.

Inputs (read-only):
  Elite IGCSE v2/website/questions-data.js     (1343 entries)
  Elite IGCSE v2/website/solutions-data.js     (1188 entries)
  Elite IGCSE v2/website/assets/questions_all/all_qNNNN.png
  Elite IGCSE v2/website/assets/questions_expertise/expertise_qNNNN.png

Outputs:
  website-v2/src/data/questions/<paper-slug>.json    one per paper
  website-v2/src/data/solutions/<paper-slug>.json    one per paper
  website-v2/src/data/papers.json                    catalogue
  website-v2/src/data/topics.json                    taxonomy
  website-v2/public/assets/questions/<filename>.png  renamed images

Each per-paper file:
{
  "paper":      "May 2025 4WM1H",
  "paperSlug":  "May2025_4WM1H",
  "session":    "May 2025",
  "code":       "4WM1H",
  "isModular":  true,
  "modularUnit":"Unit 1",
  "questionCount": 25,
  "questions": [ { id, q, marks, topic, unit, image, text }, ... ]
}

Each per-paper solutions file:
{
  "paperSlug": "May2025_4WM1H",
  "solutions": { "<question-id>": { "markdown": "..." }, ... }
}

Run from anywhere:
  python tools/migrate_from_v1.py
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# ---- Paths ---------------------------------------------------------
V2_ROOT = Path(__file__).resolve().parent.parent
V1_ROOT = V2_ROOT.parent / "website"

V1_QUESTIONS_JS = V1_ROOT / "questions-data.js"
V1_SOLUTIONS_JS = V1_ROOT / "solutions-data.js"
V1_IMG_ALL = V1_ROOT / "assets" / "questions_all"
V1_IMG_EXPERTISE = V1_ROOT / "assets" / "questions_expertise"

DATA_DIR = V2_ROOT / "src" / "data"
QUESTIONS_DIR = DATA_DIR / "questions"
SOLUTIONS_DIR = DATA_DIR / "solutions"
PAPERS_JSON = DATA_DIR / "papers.json"
TOPICS_JSON = DATA_DIR / "topics.json"
PUBLIC_IMG = V2_ROOT / "public" / "assets" / "questions"

for d in (QUESTIONS_DIR, SOLUTIONS_DIR, PUBLIC_IMG):
    d.mkdir(parents=True, exist_ok=True)

# ---- Parse the v1 JS files -----------------------------------------

def load_v1_questions() -> tuple[dict, list[dict]]:
    """Return (site_meta, questions[])."""
    text = V1_QUESTIONS_JS.read_text(encoding="utf-8")
    # SITE_META block
    m = re.search(r"window\.SITE_META\s*=\s*(\{.+?\});\s*window\.QUESTION_DATA", text, re.DOTALL)
    if not m:
        sys.exit("Could not find SITE_META in v1 questions-data.js")
    site_meta = json.loads(m.group(1))
    # QUESTION_DATA block
    m2 = re.search(r"window\.QUESTION_DATA\s*=\s*(\[.+?\]);?\s*$", text, re.DOTALL)
    if not m2:
        sys.exit("Could not find QUESTION_DATA in v1 questions-data.js")
    questions = json.loads(m2.group(1))
    return site_meta, questions


def load_v1_solutions() -> dict:
    """Return {questionId: {source: "markdown..."}}."""
    if not V1_SOLUTIONS_JS.exists():
        return {}
    text = V1_SOLUTIONS_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.SOLUTION_DATA\s*=\s*(\{.+\});\s*$", text, re.DOTALL)
    if not m:
        sys.exit("Could not find SOLUTION_DATA in v1 solutions-data.js")
    return json.loads(m.group(1))


# ---- Paper slug + display ------------------------------------------

def paper_slug(paper: str, filename: str) -> str:
    """Convert 'May 2025 4WM1H' (or whatever the `paper` field is)
       into a stable slug like 'May2025_4WM1H'. Prefer the prefix of
       `filename` since it's already in slug form."""
    # filename is e.g. May2025_4WM1H__Q01__p03-03__m03__Linear-Graphs.png
    if filename and "__" in filename:
        return filename.split("__", 1)[0]
    # Fallback: collapse spaces in paper
    return re.sub(r"\s+", "", paper or "Unknown")


def paper_display(paper: str, slug: str) -> str:
    """Reverse: 'May2025_4WM1H' -> 'May 2025 4WM1H' if we don't already have it."""
    if paper:
        return paper
    m = re.match(r"(Jan|Feb|May|Jun|Nov|Oct)(\d{4})_(\S+)", slug)
    if m:
        return f"{m.group(1)} {m.group(2)} {m.group(3)}"
    return slug


# ---- Image migration -----------------------------------------------

def copy_image(question: dict) -> str | None:
    """Copy the v1 PNG to public/assets/questions/<descriptive>.png.
       Returns the new public path (or None if image missing)."""
    v1_rel = question.get("image", "")
    if not v1_rel:
        return None
    src = V1_ROOT / v1_rel
    if not src.exists():
        return None

    descriptive = question.get("filename") or src.name
    # Make sure descriptive ends with .png
    if not descriptive.lower().endswith(".png"):
        descriptive += ".png"
    dst = PUBLIC_IMG / descriptive
    if not dst.exists():
        shutil.copy2(src, dst)
    return f"/assets/questions/{descriptive}"


# ---- Main ----------------------------------------------------------

def main() -> None:
    print("Loading v1 questions...")
    site_meta, questions = load_v1_questions()
    print(f"  {len(questions)} questions loaded")

    print("Loading v1 solutions...")
    solutions = load_v1_solutions()
    print(f"  {len(solutions)} solutions loaded")

    # Group by paper slug
    by_paper: dict[str, dict] = {}
    skipped_no_image = 0

    for q in questions:
        slug = paper_slug(q.get("paper", ""), q.get("filename", ""))
        if slug not in by_paper:
            code_match = re.search(r"_(\S+)$", slug)
            code = code_match.group(1) if code_match else ""
            session_match = re.match(r"([A-Za-z]+)(\d{4})_", slug)
            session = f"{session_match.group(1)} {session_match.group(2)}" if session_match else ""
            is_modular = code.startswith("4WM")
            modular_unit = None
            if code.startswith("4WM1"):
                modular_unit = "Unit 1"
            elif code.startswith("4WM2"):
                modular_unit = "Unit 2"

            by_paper[slug] = {
                "paper": paper_display(q.get("paper", ""), slug),
                "paperSlug": slug,
                "session": session,
                "code": code,
                "isModular": is_modular,
                "modularUnit": modular_unit,
                "questions": [],
            }

        # Copy image
        new_image = copy_image(q)
        if not new_image:
            skipped_no_image += 1
            continue

        # Compact per-paper record (id is the v1 id minus the "all::" / "expertise::" prefix)
        q_id = q.get("id", "")
        record = {
            "id": q_id,
            "bank": q.get("bank", "all"),
            "q": q.get("question"),
            "marks": q.get("marks"),
            "topic": q.get("topic"),
            "unit": q.get("unit"),
            "topicOrder": q.get("topic_order"),
            "image": new_image,
            "filename": q.get("filename"),
            "text": q.get("question_text", ""),
            "modularForceUnit": q.get("modular_force_unit"),
        }
        by_paper[slug]["questions"].append(record)

    print(f"  {skipped_no_image} questions skipped (missing source image)")
    print(f"  {len(by_paper)} papers identified")

    # Write per-paper JSON files
    for slug, paper_data in by_paper.items():
        paper_data["questionCount"] = len(paper_data["questions"])
        # Sort by question number for stable output
        paper_data["questions"].sort(key=lambda r: (r.get("q") or 0))
        out = QUESTIONS_DIR / f"{slug}.json"
        out.write_text(json.dumps(paper_data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(by_paper)} per-paper JSONs to {QUESTIONS_DIR}")

    # Group solutions by paper slug too
    sol_by_paper: dict[str, dict] = {slug: {} for slug in by_paper}
    for q_id, sol in solutions.items():
        # q_id like "all::May2025_4WM1H__Q01__..."
        m = re.match(r"(?:all|expertise)::(\S+)__Q", q_id)
        if not m:
            continue
        slug = m.group(1)
        if slug in sol_by_paper:
            sol_by_paper[slug][q_id] = sol

    sol_papers = 0
    for slug, sol_map in sol_by_paper.items():
        if not sol_map:
            continue
        out = SOLUTIONS_DIR / f"{slug}.json"
        out.write_text(json.dumps({
            "paperSlug": slug,
            "solutions": sol_map,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        sol_papers += 1
    print(f"Wrote {sol_papers} per-paper solutions JSONs to {SOLUTIONS_DIR}")

    # Catalogue: papers.json
    catalogue = []
    for slug, paper_data in sorted(by_paper.items(), key=lambda kv: kv[0]):
        catalogue.append({
            "paperSlug": slug,
            "paper": paper_data["paper"],
            "session": paper_data["session"],
            "code": paper_data["code"],
            "isModular": paper_data["isModular"],
            "modularUnit": paper_data["modularUnit"],
            "questionCount": paper_data["questionCount"],
            "hasSolutions": bool(sol_by_paper.get(slug)),
        })
    PAPERS_JSON.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote catalogue with {len(catalogue)} entries to {PAPERS_JSON}")

    # Topics: copy from SITE_META
    topics = site_meta.get("topics", [])
    TOPICS_JSON.write_text(json.dumps({
        "topics": topics,
        "totalQuestions": sum(p["questionCount"] for p in by_paper.values()),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(topics)} topics to {TOPICS_JSON}")

    print()
    print("Migration complete.")
    print(f"  Papers:    {len(catalogue)}")
    print(f"  Questions: {sum(p['questionCount'] for p in by_paper.values())}")
    print(f"  Images:    {len(list(PUBLIC_IMG.glob('*.png')))}")


if __name__ == "__main__":
    main()
