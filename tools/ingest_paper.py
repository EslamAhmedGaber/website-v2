"""
Canonical past-paper ingestion pipeline for v2.

Drop a PDF into tools/inbox/ (Linear 4MA1 or Modular 4WM1H/4WM2H),
run this script, and it will:

  1. Auto-detect paper type by exam code in the filename / first page:
       4MA1   → Linear paper (no forced modular unit)
       4WM1H  → Modular Unit 1
       4WM2H  → Modular Unit 2
       4MA1R / 4WM1HR / 4WM2HR  → corresponding resits
  2. Crop every question using the "Total for Question N is M marks"
     footer markers — multi-page aware.
  3. Run a heuristic topic classifier (mirrors topic-normalizer.js).
  4. Write a per-paper JSON to src/data/questions/<slug>.json.
  5. Copy each cropped PNG to public/assets/questions/<descriptive>.png.
  6. Move the processed PDF to tools/processed/.

After it runs, `npm run build` picks up the new paper automatically:
  - /pastpapers/<slug>/ page exists
  - /pastpapers/ catalogue shows the new entry
  - /practice question grid includes the new questions

Run from anywhere:
    python tools/ingest_paper.py
"""

from __future__ import annotations

import io
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageChops, ImageOps

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
INBOX = ROOT / "tools" / "inbox"
PROCESSED = ROOT / "tools" / "processed"
DATA_QUESTIONS = ROOT / "src" / "data" / "questions"
DATA_PAPERS = ROOT / "src" / "data" / "papers.json"
PUBLIC_IMG = ROOT / "public" / "assets" / "questions"

for d in (INBOX, PROCESSED, DATA_QUESTIONS, PUBLIC_IMG):
    d.mkdir(parents=True, exist_ok=True)

QUESTION_TOTAL_RE = re.compile(r"Total for Question\s+(\d+)\s+is\s+(\d+)\s+marks?", re.IGNORECASE)

# --- Paper code detection -------------------------------------------

PAPER_CODE_PATTERNS = [
    # Modular
    (re.compile(r"\b4WM1H?[Rr]\b|\b4wm1h-?0?1r\b", re.IGNORECASE), {"code": "4WM1HR", "unit": "Unit 1", "linear": False}),
    (re.compile(r"\b4WM2H?[Rr]\b|\b4wm2h-?0?1r\b", re.IGNORECASE), {"code": "4WM2HR", "unit": "Unit 2", "linear": False}),
    (re.compile(r"\b4WM1H?\b|\b4wm1h\b", re.IGNORECASE),            {"code": "4WM1H",  "unit": "Unit 1", "linear": False}),
    (re.compile(r"\b4WM2H?\b|\b4wm2h\b", re.IGNORECASE),            {"code": "4WM2H",  "unit": "Unit 2", "linear": False}),
    # Linear (use non-word boundaries since filenames use _ as separator,
    # and _ is itself a word char so \b fails next to it)
    (re.compile(r"(?:^|[\s_\-/])p1hr(?:[\s_\-.]|$)", re.IGNORECASE), {"code": "P1HR",   "unit": None,    "linear": True}),
    (re.compile(r"(?:^|[\s_\-/])p2hr(?:[\s_\-.]|$)", re.IGNORECASE), {"code": "P2HR",   "unit": None,    "linear": True}),
    (re.compile(r"(?:^|[\s_\-/])p1h(?:[\s_\-.]|$)", re.IGNORECASE),  {"code": "P1H",    "unit": None,    "linear": True}),
    (re.compile(r"(?:^|[\s_\-/])p2h(?:[\s_\-.]|$)", re.IGNORECASE),  {"code": "P2H",    "unit": None,    "linear": True}),
]

DATE_NUM_RE = re.compile(r"(\d{4})(\d{2})(\d{2})")
MONTH_WORD_RE = re.compile(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z\-_\s]*(\d{4})", re.IGNORECASE)
MONTH_MAP = {1: "Jan", 2: "Feb", 5: "May", 6: "Jun", 10: "Oct", 11: "Nov", 12: "Nov"}


@dataclass
class PaperInfo:
    src: Path
    code: str       # e.g. P1H, 4WM1H
    session: str    # e.g. May2025, Nov2024
    modular_unit: str | None
    is_linear: bool

    @property
    def slug(self) -> str:
        return f"{self.session}_{self.code}"

    @property
    def display(self) -> str:
        m = re.match(r"([A-Za-z]+)(\d{4})", self.session)
        if m:
            return f"{m.group(1)} {m.group(2)} {self.code}"
        return f"{self.session} {self.code}"


def detect_paper(pdf_path: Path, page_text: str = "") -> PaperInfo | None:
    """Detect paper code + session from filename and first-page text."""
    haystack = f"{pdf_path.name} {page_text}".lower()
    info = None
    for rx, meta in PAPER_CODE_PATTERNS:
        if rx.search(haystack):
            info = meta
            break
    if not info:
        return None

    # Session
    session = None
    m = DATE_NUM_RE.search(pdf_path.stem)
    if m:
        year = m.group(1)
        month = int(m.group(2))
        session = f"{MONTH_MAP.get(month, 'Jan')}{year}"
    else:
        m2 = MONTH_WORD_RE.search(haystack)
        if m2:
            mon = m2.group(1).capitalize()[:3]
            session = f"{mon}{m2.group(2)}"
        else:
            session = "Unknown"

    return PaperInfo(
        src=pdf_path,
        code=info["code"],
        session=session,
        modular_unit=info["unit"],
        is_linear=info["linear"],
    )


# --- Cropping --------------------------------------------------------

@dataclass
class Block:
    q: int
    marks: int
    start_page: int
    start_y: float
    end_page: int
    end_y: float
    text: str = ""
    topic: str = ""
    filename: str = ""


def locate_blocks(doc: fitz.Document) -> list[Block]:
    footers: list[tuple[int, int, int, float, float]] = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        for blk in page.get_text("blocks"):
            text = blk[4]
            for m in QUESTION_TOTAL_RE.finditer(text):
                footers.append((int(m.group(1)), int(m.group(2)), page_num, float(blk[1]), float(blk[3])))

    footers.sort(key=lambda t: t[0])
    out: list[Block] = []
    for i, (q, marks, end_page, fy0, fy1) in enumerate(footers):
        if i == 0:
            start_page = 2 if len(doc) > 2 else 0
            start_y = 0.0
        else:
            prev_end_page = footers[i - 1][2]
            prev_fy1 = footers[i - 1][4]
            start_page = prev_end_page
            start_y = prev_fy1 + 4
            prev_page = doc.load_page(prev_end_page)
            if prev_fy1 + 25 >= prev_page.rect.height:
                start_page = prev_end_page + 1
                start_y = 0.0
        out.append(Block(q=q, marks=marks, start_page=start_page, start_y=start_y, end_page=end_page, end_y=fy1 + 6))
    return out


def render_block(doc, block: Block, zoom: float = 2.0) -> Image.Image:
    mat = fitz.Matrix(zoom, zoom)
    parts: list[Image.Image] = []
    for p in range(block.start_page, block.end_page + 1):
        page = doc.load_page(p)
        if p == block.start_page and p == block.end_page:
            clip = fitz.Rect(0, block.start_y, page.rect.width, block.end_y)
        elif p == block.start_page:
            clip = fitz.Rect(0, block.start_y, page.rect.width, page.rect.height)
        elif p == block.end_page:
            clip = fitz.Rect(0, 0, page.rect.width, block.end_y)
        else:
            clip = page.rect
        clip = clip & page.rect
        if clip.is_empty or clip.height < 10:
            continue
        pix = page.get_pixmap(matrix=mat, clip=clip)
        parts.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
    if not parts:
        raise RuntimeError(f"Q{block.q}: nothing to render")
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts)
    stitched = Image.new("RGB", (w, h), (255, 255, 255))
    y = 0
    for p in parts:
        stitched.paste(p, (0, y))
        y += p.height
    bg = Image.new(stitched.mode, stitched.size, (255, 255, 255))
    diff = ImageChops.add(ImageChops.difference(stitched, bg), ImageChops.difference(stitched, bg), 2.0, -100)
    bbox = diff.getbbox()
    if bbox:
        stitched = stitched.crop(bbox)
    return ImageOps.expand(stitched, border=24, fill=(255, 255, 255))


def block_text(doc, block: Block) -> str:
    chunks: list[str] = []
    for p in range(block.start_page, block.end_page + 1):
        page = doc.load_page(p)
        if p == block.start_page and p == block.end_page:
            clip = fitz.Rect(0, block.start_y, page.rect.width, block.end_y)
        elif p == block.start_page:
            clip = fitz.Rect(0, block.start_y, page.rect.width, page.rect.height)
        elif p == block.end_page:
            clip = fitz.Rect(0, 0, page.rect.width, block.end_y)
        else:
            clip = page.rect
        chunks.append(page.get_text(clip=clip))
    return re.sub(r"\s+", " ", " ".join(chunks)).strip()


# --- Classification (mirrors topic-normalizer.js) -------------------

LINEAR_UNIT_BY_TOPIC = {
    # ... abbreviated. Importer relies on the in-app normalizer to
    # finalise the routing per pathway; we just need a plausible
    # raw topic so the normalizer has something to work with.
}


def strip_boilerplate(t: str) -> str:
    t = re.sub(r"do not write in this area", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"answer all [a-z\- ]+ questions", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\(total for question \d+ is \d+ marks?\)", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\.{2,}", " ", t)
    t = re.sub(r"^\s*\d{1,2}\s+", "", t)
    return re.sub(r"\s+", " ", t).strip()


def classify(text: str) -> tuple[str, str]:
    t = strip_boilerplate(text).lower()

    def has(*w):
        return any(x in t for x in w)

    if "inequalit" in t or re.search(r"\by\s*[<>]=?|x\s*[<>]=?", t):
        return ("Graphing Inequalities" if has("graph", "shade", "region") else "Solving Inequalities",
                "Equations, Formulae & Identities")
    if has("standard form", "scientific notation"): return ("Powers, Roots & Standard Form", "Numbers & the Number System")
    if has("recurring", "repeating decimal"):       return ("Fractions, Decimals & Percentages", "Numbers & the Number System")
    if has("compound interest", "depreciat"):       return ("Compound Interest & Depreciation", "Numbers & the Number System")
    if has("reverse percent", "original price"):    return ("Percentages", "Numbers & the Number System")
    if "percent" in t or "%" in t:                  return ("Percentages", "Numbers & the Number System")
    if has("hcf", "lcm", "prime factor"):           return ("Prime Factors, HCF & LCM", "Numbers & the Number System")
    if "surd" in t:                                 return ("Surds", "Numbers & the Number System")
    if has("upper bound", "lower bound"):           return ("Rounding, Estimation & Bounds", "Numbers & the Number System")
    if has("simultaneous"):                         return ("Simultaneous Equations", "Equations, Formulae & Identities")
    if has("complete the square"):                  return ("Completing the Square", "Equations, Formulae & Identities")
    if has("quadratic formula"):                    return ("Solving Quadratic Equations", "Equations, Formulae & Identities")
    if has("factorise", "factorize"):               return ("Factorising", "Equations, Formulae & Identities")
    if has("expand"):                               return ("Expanding Brackets", "Equations, Formulae & Identities")
    if has("rearrange", "make x the subject"):      return ("Rearranging Formulas", "Equations, Formulae & Identities")
    if has("prove that", "algebraic proof"):        return ("Algebraic Proof", "Equations, Formulae & Identities")
    if has("nth term", "sequence"):                 return ("Sequences", "Sequences, Functions & Graphs")
    if has("differentiate", "turning point"):       return ("Differentiation", "Sequences, Functions & Graphs")
    if has("gradient", "midpoint", "perpendicular", "parallel line"): return ("Coordinate Geometry", "Sequences, Functions & Graphs")
    if has("circle theorem"):                       return ("Circle Theorems", "Geometry & Trigonometry")
    if has("arc", "sector"):                        return ("Circles, Arcs & Sectors", "Geometry & Trigonometry")
    if has("sine rule", "cosine rule"):             return ("Sine, Cosine Rule & Area of Triangles", "Geometry & Trigonometry")
    if has("pythagoras"):                           return ("Right-Angled Triangles - Pythagoras & Trigonometry", "Geometry & Trigonometry")
    if has("similar", "scale factor"):              return ("Congruence, Similarity & Geometrical Proof", "Geometry & Trigonometry")
    if has("polygon", "interior angle"):            return ("Angles in Polygons & Parallel Lines", "Geometry & Trigonometry")
    if "bearing" in t:                              return ("Bearings, Scale Drawing & Constructions", "Geometry & Trigonometry")
    if "vector" in t:                               return ("Vectors", "Vectors & Transformation Geometry")
    if has("histogram", "frequency density"):       return ("Histograms", "Statistics & Probability")
    if has("cumulative frequency"):                 return ("Cumulative Frequency Diagrams", "Statistics & Probability")
    if has("tree diagram"):                         return ("Probability Diagrams - Venn & Tree Diagrams", "Statistics & Probability")
    if has("venn", "set notation"):                 return ("Set Notation & Venn Diagrams", "Statistics & Probability")
    if "probabilit" in t:                           return ("Probability Toolkit", "Statistics & Probability")
    if has("find the area", "perimeter of"):        return ("Area & Perimeter", "Geometry & Trigonometry")
    if has("volume", "surface area"):               return ("Volume & Surface Area", "Geometry & Trigonometry")
    return ("Algebra Toolkit", "Equations, Formulae & Identities")


# --- Slug helpers ----------------------------------------------------

def hyphen(topic: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", topic).strip("-")


def make_filename(slug: str, q: int, marks: int, start_page: int, end_page: int, topic: str) -> str:
    page_range = f"{start_page+1:02d}-{end_page+1:02d}"
    return f"{slug}__Q{q:02d}__p{page_range}__m{marks:02d}__{hyphen(topic)}.png"


# --- Per-paper writer ----------------------------------------------

def process_paper(pdf_path: Path) -> dict | None:
    doc = fitz.open(str(pdf_path))
    first_text = doc.load_page(0).get_text() if len(doc) > 0 else ""
    info = detect_paper(pdf_path, first_text)
    if not info:
        print(f"  ! Could not detect paper code in {pdf_path.name} — skipping")
        return None

    print(f"  Detected: {info.display} ({info.slug})")

    blocks = locate_blocks(doc)
    print(f"    {len(blocks)} questions found")

    questions: list[dict] = []
    for blk in blocks:
        blk.text = block_text(doc, blk)
        topic, linear_unit = classify(blk.text)
        blk.topic = topic
        blk.filename = make_filename(info.slug, blk.q, blk.marks, blk.start_page, blk.end_page, topic)
        try:
            img = render_block(doc, blk)
            img.save(PUBLIC_IMG / blk.filename)
        except Exception as exc:
            print(f"      ! Q{blk.q} render failed: {exc}")
            continue
        questions.append({
            "id": f"all::{blk.filename.rsplit('.', 1)[0]}",
            "bank": "all",
            "q": blk.q,
            "marks": blk.marks,
            "topic": topic,
            "unit": linear_unit,
            "topicOrder": None,
            "image": f"/assets/questions/{blk.filename}",
            "filename": blk.filename,
            "text": blk.text[:1500],
            "modularForceUnit": info.modular_unit,
        })

    doc.close()

    paper_data = {
        "paper": info.display,
        "paperSlug": info.slug,
        "session": info.session,
        "code": info.code,
        "isModular": info.modular_unit is not None,
        "modularUnit": info.modular_unit,
        "questionCount": len(questions),
        "questions": questions,
    }
    (DATA_QUESTIONS / f"{info.slug}.json").write_text(
        json.dumps(paper_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"    Wrote src/data/questions/{info.slug}.json")
    return paper_data


def update_catalogue():
    papers = []
    for f in sorted(DATA_QUESTIONS.glob("*.json")):
        if f.name == "papers.json":
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        papers.append({
            "paperSlug": data["paperSlug"],
            "paper": data["paper"],
            "session": data.get("session", ""),
            "code": data.get("code", ""),
            "isModular": data.get("isModular", False),
            "modularUnit": data.get("modularUnit"),
            "questionCount": data["questionCount"],
            "hasSolutions": False,  # solutions tracked separately
        })
    DATA_PAPERS.write_text(json.dumps(papers, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated catalogue: {len(papers)} papers in src/data/papers.json")


def main() -> None:
    pdfs = sorted(INBOX.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {INBOX}")
        return

    for pdf in pdfs:
        print(f"Processing {pdf.name}")
        data = process_paper(pdf)
        if data:
            shutil.move(str(pdf), str(PROCESSED / pdf.name))

    update_catalogue()
    print()
    print("Done. Now run `npm run build` to regenerate the site.")


if __name__ == "__main__":
    main()
