"""
Verify the Elite IGCSE v2 paper pipeline.

This is the pre-commit gate for new papers, classifications,
solutions, public classified books, and private answer-book safety.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "src" / "data"
QUESTION_DIR = DATA_DIR / "questions"
SOLUTION_DIR = DATA_DIR / "solutions"
TOPICS_PATH = DATA_DIR / "topics.json"
PAPERS_PATH = DATA_DIR / "papers.json"
PUBLIC_DIR = ROOT / "public"
DOWNLOADS_DIR = PUBLIC_DIR / "downloads"
PRIVATE_OUTPUT = ROOT / "private_output"
GITIGNORE = ROOT / ".gitignore"

LINEAR_UNITS = {
    "Numbers & the Number System",
    "Equations, Formulae & Identities",
    "Sequences, Functions & Graphs",
    "Geometry & Trigonometry",
    "Vectors & Transformation Geometry",
    "Statistics & Probability",
}

CANONICAL_TOPICS = {
    "Number Toolkit",
    "Prime Factors, HCF & LCM",
    "Fractions",
    "Fractions, Decimals & Percentages",
    "Recurring Decimals",
    "Percentages",
    "Compound Interest & Depreciation",
    "Reverse Percentages",
    "Rounding, Estimation & Bounds",
    "Powers & Roots",
    "Standard Form",
    "Surds",
    "Using a Calculator",
    "Ratio Toolkit",
    "Standard & Compound Units",
    "Algebra Toolkit",
    "Expanding Brackets",
    "Factorising",
    "Algebraic Fractions",
    "Algebraic Roots & Indices",
    "Linear Equations",
    "Forming & Solving Equations",
    "Rearranging Formulae",
    "Simultaneous Equations",
    "Inequalities (Solving & Graphing)",
    "Completing the Square",
    "Quadratic Formula",
    "Quadratic Equations",
    "Algebraic Proof",
    "Sequences",
    "Direct & Inverse Proportion",
    "Linear Graphs",
    "Graphs of Functions",
    "Functions",
    "Differentiation & Turning Points",
    "Transformations of Graphs",
    "Kinematic Graphs",
    "Angles in Polygons & Parallel Lines",
    "Constructions & Loci",
    "Perimeter & Area",
    "Circles, Arcs & Sectors",
    "Volume & Surface Area",
    "Right-Angled Triangles - Pythagoras & Trigonometry",
    "3D Pythagoras & Trigonometry",
    "Sine & Cosine Rules",
    "Congruent Shapes",
    "Similar Shapes",
    "Area & Volume of Similar Shapes",
    "Circle Theorems",
    "Bearings",
    "Transformations",
    "Vectors",
    "Statistics Toolkit",
    "Averages from Frequency Tables",
    "Histograms",
    "Cumulative Frequency Diagrams",
    "Probability Toolkit",
    "Tree Diagrams & Conditional Probability",
    "Set Notation & Venn Diagrams",
}

REQUIRED_QUESTION_FIELDS = {
    "id",
    "bank",
    "q",
    "marks",
    "topic",
    "unit",
    "image",
    "filename",
    "text",
}

PUBLIC_LEAK_RE = re.compile(
    r"(answer|answers|mark[-_\s]?scheme|markscheme|worked[-_\s]?solution|solutions|private)",
    re.IGNORECASE,
)

REQUIRED_PUBLIC_BOOKS = {
    "classified_problems.pdf",
    "Classified_Expertise.pdf",
    "Classified_4WM1.pdf",
    "Classified_4WM2.pdf",
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.stats: dict[str, int] = {}

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def set(self, key: str, value: int) -> None:
        self.stats[key] = value


def read_json(path: Path, report: Report) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - verifier should report all parse failures
        report.error(f"{path.relative_to(ROOT)} is not valid JSON: {exc}")
        return None


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def verify_guardrails(report: Report) -> None:
    if not PRIVATE_OUTPUT.exists():
        report.error("private_output/ is missing; private answer books need a safe home.")

    ignore_text = GITIGNORE.read_text(encoding="utf-8") if GITIGNORE.exists() else ""
    if "private_output/*" not in ignore_text:
        report.error(".gitignore must keep generated private answer books out of git.")

    if DOWNLOADS_DIR.exists():
        for file in DOWNLOADS_DIR.rglob("*"):
            if file.is_file() and PUBLIC_LEAK_RE.search(file.name):
                report.error(f"Potential private answer/solution file in public downloads: {rel(file)}")
        for filename in sorted(REQUIRED_PUBLIC_BOOKS):
            if not (DOWNLOADS_DIR / filename).is_file():
                report.error(f"Required public classified book is missing: public/downloads/{filename}")
    else:
        report.error("public/downloads/ is missing; public classified books need a deploy folder.")


def verify_questions(report: Report) -> tuple[dict[str, dict[str, Any]], set[str], set[str]]:
    topics_doc = read_json(TOPICS_PATH, report) or {}
    known_topics = set(topics_doc.get("topics") or []) | CANONICAL_TOPICS
    question_by_id: dict[str, dict[str, Any]] = {}
    paper_slugs: set[str] = set()
    used_topics: set[str] = set()

    files = sorted(QUESTION_DIR.glob("*.json"))
    report.set("question_files", len(files))

    for path in files:
      data = read_json(path, report)
      if not data:
          continue

      slug = data.get("paperSlug")
      paper_slugs.add(slug or path.stem)
      questions = data.get("questions")
      if not isinstance(questions, list):
          report.error(f"{rel(path)} has no questions array.")
          continue
      if data.get("questionCount") != len(questions):
          report.error(f"{rel(path)} questionCount is {data.get('questionCount')} but found {len(questions)} questions.")
      if slug and path.stem != slug:
          report.error(f"{rel(path)} filename does not match paperSlug {slug}.")

      seen_q_numbers: set[tuple[str, int]] = set()
      for index, question in enumerate(questions, start=1):
          if not isinstance(question, dict):
              report.error(f"{rel(path)} question #{index} is not an object.")
              continue
          missing = sorted(REQUIRED_QUESTION_FIELDS - set(question))
          if missing:
              report.error(f"{rel(path)} Q{question.get('q', index)} missing fields: {', '.join(missing)}")

          qid = question.get("id")
          if not qid:
              report.error(f"{rel(path)} Q{question.get('q', index)} has no id.")
          elif qid in question_by_id:
              report.error(f"Duplicate question id: {qid}")
          else:
              question_by_id[qid] = question

          q_number = question.get("q")
          bank = question.get("bank")
          if bank not in {"all", "expertise"}:
              report.error(f"{rel(path)} Q{q_number} has unexpected bank: {bank}")
          elif isinstance(q_number, int):
              q_key = (bank, q_number)
              if q_key in seen_q_numbers:
                  report.error(f"{rel(path)} repeats {bank} question number {q_number}.")
              seen_q_numbers.add(q_key)

          topic = question.get("topic")
          if topic:
              used_topics.add(str(topic))
              if known_topics and topic not in known_topics:
                  report.warn(f"{rel(path)} Q{q_number} uses topic outside topics.json: {topic}")

          unit = question.get("unit")
          if unit not in LINEAR_UNITS:
              report.error(f"{rel(path)} Q{q_number} has unexpected Linear unit: {unit}")

          image = str(question.get("image") or "")
          image_path = PUBLIC_DIR / image.removeprefix("/")
          if not image.startswith("/assets/questions/"):
              report.error(f"{rel(path)} Q{q_number} image must be under /assets/questions/: {image}")
          elif not image_path.exists():
              report.error(f"{rel(path)} Q{q_number} image is missing: {image}")

          if not str(question.get("text") or "").strip():
              report.warn(f"{rel(path)} Q{q_number} has empty searchable text.")

    report.set("questions", len(question_by_id))
    report.set("topics_used", len(used_topics))
    return question_by_id, paper_slugs, used_topics


def verify_catalogue(report: Report, paper_slugs: set[str]) -> None:
    data = read_json(PAPERS_PATH, report)
    if not isinstance(data, list):
        report.error("src/data/papers.json must be a list.")
        return

    catalogue_slugs = {item.get("paperSlug") for item in data if isinstance(item, dict)}
    missing = sorted(paper_slugs - catalogue_slugs)
    extra = sorted(catalogue_slugs - paper_slugs)
    if missing:
        report.error(f"papers.json missing paperSlugs: {', '.join(missing[:10])}")
    if extra:
        report.error(f"papers.json has paperSlugs without question files: {', '.join(extra[:10])}")
    report.set("catalogue_papers", len(catalogue_slugs))


def verify_solutions(report: Report, question_by_id: dict[str, dict[str, Any]]) -> None:
    files = sorted(SOLUTION_DIR.glob("*.json"))
    solution_count = 0
    checked_count = 0

    for path in files:
        data = read_json(path, report)
        if not data:
            continue
        if path.stem != data.get("paperSlug"):
            report.error(f"{rel(path)} filename does not match paperSlug {data.get('paperSlug')}.")
        solutions = data.get("solutions")
        if not isinstance(solutions, dict):
            report.error(f"{rel(path)} has no solutions object.")
            continue
        for qid, solution in solutions.items():
            solution_count += 1
            if qid not in question_by_id:
                report.error(f"{rel(path)} has solution for unknown question id: {qid}")
                continue
            if not isinstance(solution, dict):
                report.error(f"{rel(path)} solution for {qid} is not an object.")
                continue
            source = str(solution.get("source") or "").strip()
            if not source:
                report.error(f"{rel(path)} solution for {qid} has empty source.")
            if solution.get("status") == "checked":
                checked_count += 1

    missing_solution_count = max(0, len(question_by_id) - solution_count)
    if missing_solution_count:
        report.warn(f"{missing_solution_count} questions do not yet have website solutions.")
    report.set("solutions", solution_count)
    report.set("checked_solutions", checked_count)


def print_report(report: Report) -> int:
    print("Elite IGCSE pipeline verification")
    print("--------------------------------")
    for key, value in report.stats.items():
        print(f"{key}: {value}")

    if report.warnings:
        print()
        print("Warnings:")
        for warning in report.warnings[:30]:
            print(f"  - {warning}")
        if len(report.warnings) > 30:
            print(f"  - ... {len(report.warnings) - 30} more warnings")

    if report.errors:
        print()
        print("Errors:")
        for error in report.errors:
            print(f"  - {error}")
        return 1

    print()
    print("OK: pipeline guardrails passed.")
    return 0


def main() -> int:
    report = Report()
    verify_guardrails(report)
    question_by_id, paper_slugs, _used_topics = verify_questions(report)
    verify_catalogue(report, paper_slugs)
    verify_solutions(report, question_by_id)
    return print_report(report)


if __name__ == "__main__":
    sys.exit(main())
