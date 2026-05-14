"""
Build Elite IGCSE v2 classified books from the normalized site data.

Public outputs are question-only books for public/downloads.
Private outputs are answer books for private_output and must not be published.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
QUESTION_DIR = ROOT / "src" / "data" / "questions"
SOLUTION_DIR = ROOT / "src" / "data" / "solutions"
PUBLIC_BOOK_DIR = ROOT / "public" / "downloads"
PRIVATE_BOOK_DIR = ROOT / "private_output"

A4_WIDTH = 595
A4_HEIGHT = 842
MARGIN = 42
NAVY = (17 / 255, 34 / 255, 64 / 255)
GOLD = (191 / 255, 147 / 255, 56 / 255)
INK = (28 / 255, 32 / 255, 38 / 255)
MUTED = (92 / 255, 99 / 255, 112 / 255)


@dataclass(frozen=True)
class BookSpec:
    filename: str
    title: str
    bank: str
    include_solutions: bool
    private: bool


PUBLIC_BOOKS = (
    BookSpec(
        filename="classified_problems.pdf",
        title="Elite IGCSE Classified Problems",
        bank="all",
        include_solutions=False,
        private=False,
    ),
    BookSpec(
        filename="Classified_Expertise.pdf",
        title="Elite IGCSE Classified Expertise",
        bank="expertise",
        include_solutions=False,
        private=False,
    ),
)

PRIVATE_BOOKS = (
    BookSpec(
        filename="classified_answers.pdf",
        title="Elite IGCSE Classified Answers",
        bank="all",
        include_solutions=True,
        private=True,
    ),
    BookSpec(
        filename="Classified_Expertise_Answers.pdf",
        title="Elite IGCSE Classified Expertise Answers",
        bank="expertise",
        include_solutions=True,
        private=True,
    ),
)

UNICODE_REPLACEMENTS = {
    "\u00a0": " ",
    "\u00b0": " degrees",
    "\u00d7": " x ",
    "\u00f7": " / ",
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u2212": "-",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u2248": "~=",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def clean_text(text: str) -> str:
    for old, new in UNICODE_REPLACEMENTS.items():
        text = text.replace(old, new)
    return text.encode("latin-1", "replace").decode("latin-1")


def solution_markdown_to_text(markdown: str) -> str:
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\\\[(.*?)\\\]", lambda m: "\n" + m.group(1).strip() + "\n", text, flags=re.S)
    text = text.replace(r"\(", "").replace(r"\)", "")
    text = text.replace(r"\[", "").replace(r"\]", "")
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "- ", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return clean_text(text.strip())


def question_image_path(question: dict[str, Any]) -> Path:
    image = str(question.get("image") or "")
    if image.startswith("/"):
        image = image[1:]
    return ROOT / "public" / image


def load_questions() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(QUESTION_DIR.glob("*.json")):
        paper = load_json(path)
        paper_fields = {
            "paper": paper.get("paper") or path.stem,
            "paperSlug": paper.get("paperSlug") or path.stem,
            "session": paper.get("session") or "",
            "code": paper.get("code") or "",
            "isModular": bool(paper.get("isModular")),
            "modularUnit": paper.get("modularUnit"),
        }
        for question in paper.get("questions", []):
            row = dict(question)
            row.update(paper_fields)
            rows.append(row)
    return rows


def load_solutions() -> dict[str, dict[str, Any]]:
    solutions: dict[str, dict[str, Any]] = {}
    for path in sorted(SOLUTION_DIR.glob("*.json")):
        data = load_json(path)
        for question_id, solution in (data.get("solutions") or {}).items():
            solutions[question_id] = solution
    return solutions


def sort_key(row: dict[str, Any]) -> tuple[int, str, str, int, str]:
    topic_order = row.get("topicOrder")
    if not isinstance(topic_order, int):
        topic_order = 9999
    q_number = row.get("q")
    if not isinstance(q_number, int):
        q_number = 0
    return (
        topic_order,
        str(row.get("topic") or ""),
        str(row.get("paperSlug") or ""),
        q_number,
        str(row.get("id") or ""),
    )


def group_rows(rows: list[dict[str, Any]], bank: str, limit: int | None = None) -> list[dict[str, Any]]:
    filtered = [row for row in rows if row.get("bank") == bank]
    filtered.sort(key=sort_key)
    if limit is not None:
        return filtered[:limit]
    return filtered


def add_footer(page: fitz.Page, label: str, page_number: int) -> None:
    page.insert_text(
        (MARGIN, A4_HEIGHT - 24),
        clean_text(label),
        fontsize=8,
        fontname="helv",
        color=MUTED,
    )
    page.insert_text(
        (A4_WIDTH - MARGIN - 28, A4_HEIGHT - 24),
        str(page_number),
        fontsize=8,
        fontname="helv",
        color=MUTED,
    )


def add_cover(doc: fitz.Document, spec: BookSpec, row_count: int) -> None:
    page = doc.new_page(width=A4_WIDTH, height=A4_HEIGHT)
    page.draw_rect(fitz.Rect(0, 0, A4_WIDTH, A4_HEIGHT), color=None, fill=(250 / 255, 249 / 255, 245 / 255))
    page.draw_rect(fitz.Rect(0, 0, 12, A4_HEIGHT), color=None, fill=GOLD)
    page.insert_textbox(
        fitz.Rect(MARGIN, 132, A4_WIDTH - MARGIN, 225),
        clean_text(spec.title),
        fontsize=25,
        fontname="helv",
        color=NAVY,
        align=fitz.TEXT_ALIGN_CENTER,
    )
    subtitle = "Private answer book" if spec.private else "Question-only classified book"
    page.insert_textbox(
        fitz.Rect(MARGIN, 238, A4_WIDTH - MARGIN, 300),
        f"{subtitle}\n{row_count} questions",
        fontsize=13,
        fontname="helv",
        color=MUTED,
        align=fitz.TEXT_ALIGN_CENTER,
    )
    policy = "Keep this file private." if spec.private else "Public download file."
    page.insert_textbox(
        fitz.Rect(MARGIN, 620, A4_WIDTH - MARGIN, 700),
        clean_text(policy),
        fontsize=10,
        fontname="helv",
        color=INK,
        align=fitz.TEXT_ALIGN_CENTER,
    )


def add_topic_page(doc: fitz.Document, topic: str, count: int) -> None:
    page = doc.new_page(width=A4_WIDTH, height=A4_HEIGHT)
    page.draw_rect(fitz.Rect(0, 0, A4_WIDTH, A4_HEIGHT), color=None, fill=(247 / 255, 249 / 255, 251 / 255))
    page.draw_rect(fitz.Rect(MARGIN, 220, A4_WIDTH - MARGIN, 222), color=GOLD, fill=GOLD)
    page.insert_textbox(
        fitz.Rect(MARGIN, 250, A4_WIDTH - MARGIN, 340),
        clean_text(topic),
        fontsize=22,
        fontname="helv",
        color=NAVY,
        align=fitz.TEXT_ALIGN_CENTER,
    )
    page.insert_textbox(
        fitz.Rect(MARGIN, 350, A4_WIDTH - MARGIN, 392),
        f"{count} questions",
        fontsize=12,
        fontname="helv",
        color=MUTED,
        align=fitz.TEXT_ALIGN_CENTER,
    )


def image_rect(path: Path, top: float) -> fitz.Rect:
    with Image.open(path) as image:
        width, height = image.size
    max_width = A4_WIDTH - (MARGIN * 2)
    max_height = A4_HEIGHT - top - MARGIN - 28
    scale = min(max_width / width, max_height / height)
    rendered_width = width * scale
    rendered_height = height * scale
    left = (A4_WIDTH - rendered_width) / 2
    return fitz.Rect(left, top, left + rendered_width, top + rendered_height)


def add_question_page(doc: fitz.Document, row: dict[str, Any], book_label: str, page_number: int) -> None:
    page = doc.new_page(width=A4_WIDTH, height=A4_HEIGHT)
    topic = str(row.get("topic") or "Unclassified")
    question = row.get("q") or "?"
    marks = row.get("marks") or "?"
    paper = str(row.get("paper") or row.get("paperSlug") or "")
    header = f"{topic}\n{paper} - Question {question} - {marks} marks"
    page.insert_textbox(
        fitz.Rect(MARGIN, 30, A4_WIDTH - MARGIN, 78),
        clean_text(header),
        fontsize=10.5,
        fontname="helv",
        color=NAVY,
    )
    page.draw_line((MARGIN, 84), (A4_WIDTH - MARGIN, 84), color=GOLD, width=0.7)

    path = question_image_path(row)
    if path.exists():
        page.insert_image(image_rect(path, 98), filename=str(path), keep_proportion=True)
    else:
        page.insert_textbox(
            fitz.Rect(MARGIN, 170, A4_WIDTH - MARGIN, 250),
            f"Missing image: {rel(path)}",
            fontsize=11,
            fontname="helv",
            color=(0.7, 0.0, 0.0),
        )
    add_footer(page, book_label, page_number)


def wrapped_lines(text: str, width: int = 88) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line:
            lines.append("")
            continue
        if line.startswith(("-", "Answer:", "Topic check:", "Method", "Solution")):
            initial = ""
        else:
            initial = ""
        wrapped = textwrap.wrap(line, width=width, replace_whitespace=False, break_long_words=False)
        lines.extend(wrapped or [initial])
    return lines


def add_solution_pages(
    doc: fitz.Document,
    row: dict[str, Any],
    solution: dict[str, Any] | None,
    book_label: str,
    page_counter: list[int],
) -> None:
    source = "No website solution is saved yet."
    status = "missing"
    if solution:
        source = str(solution.get("source") or "No solution text is saved yet.")
        status = str(solution.get("status") or "saved")

    title = f"Solution - {row.get('paper')} Q{row.get('q')} ({status})"
    lines = wrapped_lines(solution_markdown_to_text(source))
    lines_per_page = 50
    chunks = [lines[i : i + lines_per_page] for i in range(0, len(lines), lines_per_page)] or [[]]

    for index, chunk in enumerate(chunks, start=1):
        page_counter[0] += 1
        page = doc.new_page(width=A4_WIDTH, height=A4_HEIGHT)
        heading = title if len(chunks) == 1 else f"{title} - page {index}"
        page.insert_textbox(
            fitz.Rect(MARGIN, 30, A4_WIDTH - MARGIN, 70),
            clean_text(heading),
            fontsize=11,
            fontname="helv",
            color=NAVY,
        )
        page.draw_line((MARGIN, 78), (A4_WIDTH - MARGIN, 78), color=GOLD, width=0.7)
        y = 104
        for line in chunk:
            page.insert_text((MARGIN, y), clean_text(line), fontsize=9.5, fontname="helv", color=INK)
            y += 13
        add_footer(page, book_label, page_counter[0])


def build_pdf(
    spec: BookSpec,
    rows: list[dict[str, Any]],
    solutions: dict[str, dict[str, Any]],
    output_path: Path,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    doc.set_metadata(
        {
            "title": spec.title,
            "author": "Dr Eslam Ahmed",
            "subject": "Elite IGCSE Mathematics classified questions",
        }
    )
    add_cover(doc, spec, len(rows))

    topic_counts: dict[str, int] = {}
    for row in rows:
        topic = str(row.get("topic") or "Unclassified")
        topic_counts[topic] = topic_counts.get(topic, 0) + 1

    toc: list[list[int | str]] = [[1, spec.title, 1]]
    current_topic: str | None = None
    page_counter = [1]

    for row in rows:
        topic = str(row.get("topic") or "Unclassified")
        if topic != current_topic:
            current_topic = topic
            page_counter[0] += 1
            add_topic_page(doc, topic, topic_counts[topic])
            toc.append([1, topic, page_counter[0]])

        page_counter[0] += 1
        add_question_page(doc, row, spec.title, page_counter[0])
        if spec.include_solutions:
            add_solution_pages(doc, row, solutions.get(str(row.get("id"))), spec.title, page_counter)

    if toc:
        doc.set_toc(toc)
    temp_path = output_path.with_name(f"{output_path.stem}.tmp{output_path.suffix}")
    if temp_path.exists():
        temp_path.unlink()
    doc.save(temp_path, garbage=4, deflate=True)
    doc.close()
    temp_path.replace(output_path)


def collect_issues(rows: list[dict[str, Any]], solutions: dict[str, dict[str, Any]]) -> tuple[list[str], list[str]]:
    missing_images: list[str] = []
    missing_solutions: list[str] = []
    for row in rows:
        image = question_image_path(row)
        if not image.exists():
            missing_images.append(f"{row.get('id')} -> {rel(image)}")
        if str(row.get("id")) not in solutions:
            missing_solutions.append(str(row.get("id")))
    return missing_images, missing_solutions


def print_plan(rows: list[dict[str, Any]], solutions: dict[str, dict[str, Any]], limit: int | None) -> int:
    exit_code = 0
    print("Elite IGCSE v2 book build plan")
    print(f"Question rows loaded: {len(rows)}")
    print(f"Website solutions loaded: {len(solutions)}")
    if limit is not None:
        print(f"Limit per book: {limit}")
    for spec in (*PUBLIC_BOOKS, *PRIVATE_BOOKS):
        book_rows = group_rows(rows, spec.bank, limit)
        missing_images, missing_solutions = collect_issues(book_rows, solutions)
        target_dir = PRIVATE_BOOK_DIR if spec.private else PUBLIC_BOOK_DIR
        print(f"- {spec.filename}: {len(book_rows)} questions -> {rel(target_dir / spec.filename)}")
        if missing_images:
            exit_code = 1
            print(f"  missing images: {len(missing_images)}")
            for item in missing_images[:8]:
                print(f"    {item}")
        if spec.include_solutions and missing_solutions:
            exit_code = 1
            print(f"  missing solutions: {len(missing_solutions)}")
            for item in missing_solutions[:8]:
                print(f"    {item}")
    return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build v2 classified question and answer books.")
    parser.add_argument("--dry-run", action="store_true", help="Show the book plan without writing PDFs.")
    parser.add_argument("--public", action="store_true", help="Write public question-only books.")
    parser.add_argument("--private", action="store_true", help="Write private answer books.")
    parser.add_argument("--all", action="store_true", help="Write both public and private books.")
    parser.add_argument("--limit", type=int, default=None, help="Limit questions per book for a smoke build.")
    parser.add_argument("--public-dir", type=Path, default=PUBLIC_BOOK_DIR, help="Output directory for public books.")
    parser.add_argument("--private-dir", type=Path, default=PRIVATE_BOOK_DIR, help="Output directory for private books.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = load_questions()
    solutions = load_solutions()

    if args.dry_run or not (args.public or args.private or args.all):
        return print_plan(rows, solutions, args.limit)

    selected: list[BookSpec] = []
    if args.public or args.all:
        selected.extend(PUBLIC_BOOKS)
    if args.private or args.all:
        selected.extend(PRIVATE_BOOKS)

    for spec in selected:
        output_dir = args.private_dir if spec.private else args.public_dir
        output_path = output_dir / spec.filename
        book_rows = group_rows(rows, spec.bank, args.limit)
        missing_images, missing_solutions = collect_issues(book_rows, solutions)
        if missing_images:
            print(f"{spec.filename}: cannot build; {len(missing_images)} images are missing.", file=sys.stderr)
            return 1
        if spec.include_solutions and missing_solutions:
            print(f"{spec.filename}: cannot build; {len(missing_solutions)} solutions are missing.", file=sys.stderr)
            return 1
        print(f"Building {rel(output_path)} with {len(book_rows)} questions...")
        build_pdf(spec, book_rows, solutions, output_path)
        print(f"Saved {rel(output_path)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
