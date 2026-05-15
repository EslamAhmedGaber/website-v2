from __future__ import annotations

import argparse
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "dist"
DEFAULT_LIVE_REPO = REPO_ROOT.parent / "website"
PRESERVE_NAMES = {".git"}


def visible_entries(path: Path) -> list[Path]:
    return sorted(path.iterdir(), key=lambda item: item.name.lower())


def validate_paths(live_repo: Path) -> None:
    if not DIST_DIR.is_dir():
        raise SystemExit(f"Missing build output: {DIST_DIR}")
    if not (DIST_DIR / "index.html").is_file():
        raise SystemExit("dist/ is missing index.html; build the site before publishing.")
    if not (DIST_DIR / "CNAME").is_file():
        raise SystemExit("dist/ is missing CNAME; refusing to publish without the custom domain marker.")
    if not (live_repo / ".git").is_dir():
        raise SystemExit(f"Live repo is missing .git/: {live_repo}")


def plan_sync(live_repo: Path) -> tuple[list[Path], list[Path]]:
    source_names = {entry.name for entry in visible_entries(DIST_DIR)}
    remove_items = [
        entry
        for entry in visible_entries(live_repo)
        if entry.name not in PRESERVE_NAMES and entry.name not in source_names
    ]
    copy_items = visible_entries(DIST_DIR)
    return remove_items, copy_items


def remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def copy_path(source: Path, target: Path) -> None:
    if source.is_dir():
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mirror built v2 output into the legacy live GitHub Pages repository."
    )
    parser.add_argument(
        "--live-repo",
        type=Path,
        default=DEFAULT_LIVE_REPO,
        help="Path to the live repository that owns eliteigcse.com.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the sync. Without this flag the script prints a dry-run plan only.",
    )
    args = parser.parse_args()
    live_repo = args.live_repo.resolve()

    validate_paths(live_repo)
    remove_items, copy_items = plan_sync(live_repo)

    print(f"Source: {DIST_DIR}")
    print(f"Target: {live_repo}")
    print(f"Remove stale entries: {len(remove_items)}")
    for item in remove_items:
        print(f"  - {item.name}")
    print(f"Copy build entries: {len(copy_items)}")
    for item in copy_items:
        print(f"  + {item.name}")

    if not args.apply:
        print("Dry run only. Re-run with --apply to publish into the live repo.")
        return

    for item in remove_items:
        remove_path(item)
    for item in copy_items:
        copy_path(item, live_repo / item.name)
    (live_repo / ".nojekyll").touch()
    print("Live repo mirror updated.")


if __name__ == "__main__":
    main()
