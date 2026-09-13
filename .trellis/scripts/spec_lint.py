#!/usr/bin/env python3
"""spec_lint.py - mechanical facts about `.trellis/spec`, and no judgement.

Step 0 of the `trellis-spec-review` skill. This script only MEASURES. Deciding
what to keep, tighten, merge or delete is the skill's job, and it needs the user
to approve the result before anything is written.

Usage:
    python3 ./.trellis/scripts/spec_lint.py [--root DIR] [--json]
                                            [--stale-months N]
                                            [--max-lines N] [--max-bytes N]

Exit code is 0 whenever the scan completed. Findings are data, not failure: a
spec file over budget is not an error, it is a row in the report.

Why this is a script and not a checklist: every fact below is deterministic.
Asking a model to `wc -l` and `grep -rn` across a spec tree costs a lot of
tokens, runs at a different depth every time, and gets skipped when the tree is
large - which is exactly when it matters.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Defaults (overridable from the CLI)
# ---------------------------------------------------------------------------

SPEC_DIR_NAME = "spec"
WORKFLOW_DIR_NAME = ".trellis"

MAX_LINES = 200
MAX_BYTES = 12 * 1024
STALE_MONTHS = 3
MIN_DUPLICATE_CHARS = 120

# Frontmatter key that declares which source paths a spec governs.
PATHS_KEY_RE = re.compile(r"^paths\s*:", re.MULTILINE)

CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".toml", ".yaml",
    ".yml", ".md", ".sh", ".ps1", ".txt",
}

_EXT_ALT = "|".join(sorted(e.lstrip(".") for e in CODE_EXTENSIONS))

# A file path inside prose, with an optional `:symbol` anchor. This repo's
# dominant spec anchor style is `packages/cli/src/x.ts:symbolName`, so the
# symbol must be captured separately: matching only the path silently skips
# every stale symbol reference in the tree. A directory separator is required,
# otherwise bare filenames like `prd.md` are reported as dead paths.
ANCHOR_REF_RE = re.compile(
    r"`((?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+\.(?:" + _EXT_ALT + r"))"
    r"(?::([A-Za-z_][A-Za-z0-9_]*))?`"
)

# A CLI flag: `--something` or a bare --something.
FLAG_REF_RE = re.compile(r"`?(--[a-z][a-z0-9-]{1,40})`?")

# Any backticked identifier. The earlier pattern required `(` immediately
# after the name, which skipped every symbol mentioned without a call site.
IDENT_REF_RE = re.compile(r"`([A-Za-z_][A-Za-z0-9_]{3,60})`")

# Markdown link target inside an index file.
MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)#]+?)(?:#[^)]*)?\)")

# Narrative signals. The issue pattern requires 3+ digits on purpose: this
# repo's specs cite cases as `#1`..`#27`, and a 2-digit pattern turned every
# such list into a false narrative hit.
NARRATIVE_PATTERNS = (
    ("date", re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b")),
    ("issue", re.compile(r"(?:^|[\s(])#\d{3,6}\b")),
    ("version", re.compile(r"\bv?\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?\b")),
    ("story", re.compile(r"cautionary tale|post-?mortem|incident|scenario", re.I)),
)

_HEADING_RE = re.compile(r"^(#{2,4})\s+(.*)$", re.MULTILINE)


def looks_like_identifier(token: str) -> bool:
    """True for code-shaped names, false for ordinary English words.

    Without this filter the identifier scan reports every prose word it cannot
    find in the code, which buries the real findings.
    """
    return "_" in token or any(c.isupper() for c in token[1:])


def search_bases(root: Path) -> list[Path]:
    """Directories a spec path reference may be relative to.

    Specs in this repo are written relative to a package root (`packages/cli/`)
    or the repo root, not always the repository root, so `(root / ref).exists()`
    alone reported roughly half of all live references as dead.
    """
    bases = [root]
    packages = root / "packages"
    if packages.is_dir():
        bases.append(packages)
        for pkg in sorted(packages.iterdir()):
            if pkg.is_dir():
                bases.extend((pkg, pkg / "src", pkg / "test"))
    bases.extend((root / ".trellis", root / ".trellis" / "scripts"))
    return bases


def package_sources(root: Path) -> dict[str, Path]:
    """Map a package name to its source root.

    The specs write `core/mem/sessions.ts` for `packages/core/src/mem/...`:
    the leading segment names the package, and the package's source root is
    `packages/<name>/src/`. That rewrite cannot be expressed as a fixed base.
    """
    out: dict[str, Path] = {}
    packages = root / "packages"
    if packages.is_dir():
        for pkg in sorted(packages.iterdir()):
            src = pkg / "src"
            if src.is_dir():
                out[pkg.name] = src
    return out


def resolve_ref(bases: list[Path], pkg_src: dict[str, Path], ref: str) -> bool:
    for base in bases:
        try:
            if (base / ref).exists():
                return True
        except OSError:
            continue
    head, _, tail = ref.partition("/")
    src = pkg_src.get(head)
    if src is not None and tail:
        try:
            if (src / tail).exists():
                return True
        except OSError:
            pass
    return False


def is_generated_layout_ref(ref: str) -> bool:
    """True for a path that describes a USER project, not this repository.

    Specs legitimately name platform artifacts the CLI writes into someone
    else's project — `.opencode/package.json`, `.github/copilot/hooks.json`.
    Those never exist here, and reporting them as dead buries the real ones.
    """
    return ref.startswith(".") and not ref.startswith("./")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_repo_root(start: Path) -> Path:
    """Walk up until a directory containing ``.trellis`` is found."""
    current = start.resolve()
    for candidate in (current, *current.parents):
        if (candidate / WORKFLOW_DIR_NAME).is_dir():
            return candidate
    return current


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def normalize_paragraph(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def split_paragraphs(text: str) -> list[str]:
    """Paragraphs = blocks separated by a blank line, ignoring code fences.

    Fenced code is dropped: duplicated shell snippets are expected and noisy.
    """
    body = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    return [p for p in re.split(r"\n\s*\n", body) if p.strip()]


def month_cutoff(months: int) -> datetime:
    now = datetime.now(timezone.utc)
    # 30.44 days is the mean Gregorian month; precise enough for a review hint.
    return now - timedelta(days=int(months * 30.44))


# ---------------------------------------------------------------------------
# Facts
# ---------------------------------------------------------------------------

def build_code_index(root: Path) -> str:
    """One concatenated blob of the repo's code, for existence checks.

    Deliberately a substring search over a big string rather than an AST: the
    question is "does this identifier appear anywhere in the code", and a false
    "it exists" is far cheaper than a false "it is dead".
    """
    chunks: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in CODE_EXTENSIONS:
            continue
        parts = set(path.parts)
        if parts & {"node_modules", ".git", "dist", ".venv", "__pycache__"}:
            continue
        if SPEC_DIR_NAME in parts and WORKFLOW_DIR_NAME in parts:
            continue  # the spec tree is not code
        try:
            if path.stat().st_size > 512 * 1024:
                continue
        except OSError:
            continue
        chunks.append(read_text(path))
    return "\n".join(chunks)


def scan(spec_root: Path, root: Path, args: argparse.Namespace) -> dict:
    # Review artifacts live under the spec tree but are not specs: linting the
    # proposal against itself produces noise the reviewer has to filter out.
    excluded = {".review", "REVIEW-LOG.md"}
    files = sorted(
        p for p in spec_root.rglob("*.md")
        if p.is_file() and not (set(p.parts) & excluded) and p.name not in excluded
    )
    cutoff = month_cutoff(args.stale_months)
    code_blob = build_code_index(root)

    inventory: list[dict] = []
    texts: dict[Path, str] = {}
    paragraphs: dict[str, list[str]] = {}
    narrative: list[dict] = []
    dead_paths: list[dict] = []
    dead_flags: list[dict] = []
    dead_idents: list[dict] = []
    dead_anchors: list[dict] = []
    bases = search_bases(root)
    # Specs also reference their own siblings as `guides/x.md`, relative to the
    # spec root rather than the repository root.
    bases.append(spec_root)
    pkg_src = package_sources(root)

    for path in files:
        text = read_text(path)
        texts[path] = text
        rel = path.relative_to(root).as_posix()
        try:
            stat = path.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            size = stat.st_size
        except OSError:
            mtime, size = datetime.now(timezone.utc), len(text.encode())

        lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
        headings = [
            {"level": len(m.group(1)), "line": text[: m.start()].count("\n") + 1,
             "title": m.group(2).strip()}
            for m in _HEADING_RE.finditer(text)
        ]
        inventory.append({
            "path": rel,
            "lines": lines,
            "bytes": size,
            "modified": mtime.date().isoformat(),
            "has_paths": bool(PATHS_KEY_RE.search(text)),
            "over_lines": lines > args.max_lines,
            "over_bytes": size > args.max_bytes,
            "stale": mtime < cutoff,
            # Step 1 splits the file at H2/H3; having the list here saves the
            # reader from counting headings by hand.
            "heading_count": len(headings),
            "headings": headings,
        })

        # Duplicate paragraphs (normalized, long enough to be prose not a label).
        for para in split_paragraphs(text):
            norm = normalize_paragraph(para)
            if len(norm) >= MIN_DUPLICATE_CHARS:
                paragraphs.setdefault(norm, []).append(rel)

        # Narrative signals (counted per file as well as listed).
        file_signals = 0
        for para in split_paragraphs(text):
            hits = [name for name, rx in NARRATIVE_PATTERNS if rx.search(para)]
            if hits:
                file_signals += 1
                narrative.append({
                    "path": rel,
                    "signals": hits,
                    "excerpt": re.sub(r"\s+", " ", para)[:110],
                })
        inventory[-1]["narrative_signals"] = file_signals

        # Dead references. A path is only dead when it resolves against no
        # candidate base; a `path:symbol` anchor is additionally checked
        # against the code index.
        for ref, symbol in set(ANCHOR_REF_RE.findall(text)):
            if ref.startswith(("http://", "https://")):
                continue
            if is_generated_layout_ref(ref):
                continue
            if not resolve_ref(bases, pkg_src, ref):
                dead_paths.append({"path": rel, "ref": ref})
            elif symbol and symbol not in code_blob:
                dead_anchors.append({"path": rel, "ref": f"{ref}:{symbol}"})
        for flag in set(FLAG_REF_RE.findall(text)):
            if flag not in code_blob:
                dead_flags.append({"path": rel, "ref": flag})
        for ident in set(IDENT_REF_RE.findall(text)):
            if not looks_like_identifier(ident):
                continue
            if ident not in code_blob:
                dead_idents.append({"path": rel, "ref": ident})

    # Cross-file reference counts (how many spec files name another spec file).
    for entry in inventory:
        name = Path(entry["path"]).name
        entry["inbound_refs"] = sum(
            1 for other, text in texts.items()
            if other.name != name and name in text
        )
        entry["referenced_by_index"] = any(
            Path(o.name).stem == "index" and name in t
            for o, t in texts.items()
        )

    # Duplicates: keep only groups that actually repeat.
    duplicates = [
        {"paragraph": key[:160], "count": len(locs), "locations": sorted(set(locs))}
        for key, locs in paragraphs.items()
        if len(set(locs)) > 1 or len(locs) > 1
    ]
    duplicates.sort(key=lambda d: -d["count"])

    # Index consistency: links in an index vs files that exist.
    index_issues: list[dict] = []
    for path, text in texts.items():
        if path.stem != "index":
            continue
        rel = path.relative_to(root).as_posix()
        linked: set[str] = set()
        for target in MD_LINK_RE.findall(text):
            target = target.strip().split()[0] if target.strip() else ""
            if not target or target.startswith(("http://", "https://", "#")):
                continue
            resolved = (path.parent / target).resolve()
            linked.add(resolved.name)
            if not resolved.exists():
                index_issues.append({"index": rel, "kind": "missing", "target": target})
        for sibling in path.parent.glob("*.md"):
            if sibling.name == "index.md" or sibling.name in linked:
                continue
            index_issues.append({
                "index": rel,
                "kind": "unlisted",
                "target": sibling.name,
            })

    return {
        "spec_root": spec_root.relative_to(root).as_posix(),
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "thresholds": {
            "max_lines": args.max_lines,
            "max_bytes": args.max_bytes,
            "stale_months": args.stale_months,
        },
        "totals": {
            "files": len(inventory),
            "lines": sum(e["lines"] for e in inventory),
            "bytes": sum(e["bytes"] for e in inventory),
        },
        "over_budget": [
            e for e in inventory if e["over_lines"] or e["over_bytes"]
        ],
        "stale": [e for e in inventory if e["stale"]],
        "no_paths": [e for e in inventory if not e["has_paths"]],
        "unreferenced": [e for e in inventory if not e["referenced_by_index"]],
        "duplicate_paragraphs": duplicates,
        "dead_references": {
            "paths": dead_paths,
            "anchors": dead_anchors,
            "flags": dead_flags,
            "identifiers": dead_idents,
        },
        "narrative_signals": narrative,
        "index_inconsistencies": index_issues,
        "inventory": inventory,
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def report(report_data: dict) -> None:
    totals = report_data["totals"]
    print(f"spec root : {report_data['spec_root']}")
    print(f"generated : {report_data['generated']}")
    print(f"totals    : {totals['files']} files, {totals['lines']} lines, "
          f"{totals['bytes']} bytes")
    print()

    def section(title: str, rows: list, render) -> None:
        print(f"## {title} ({len(rows)})")
        if not rows:
            print("  none")
        else:
            for row in rows:
                print("  " + render(row))
        print()

    t = report_data["thresholds"]
    section("over budget", report_data["over_budget"],
            lambda e: f"{e['lines']:>5} lines {e['bytes']:>7} B  {e['path']}")
    section("stale", report_data["stale"],
            lambda e: f"last modified {e['modified']}  {e['path']}")
    section("no `paths:` frontmatter", report_data["no_paths"],
            lambda e: e["path"])
    section("not linked from any index", report_data["unreferenced"],
            lambda e: e["path"])
    section("duplicate paragraphs", report_data["duplicate_paragraphs"],
            lambda d: f"x{d['count']:<3} {', '.join(d['locations'])} :: {d['paragraph'][:70]}")
    section("dead file paths", report_data["dead_references"]["paths"],
            lambda d: f"{d['ref']}  (in {d['path']})")
    section("dead `path:symbol` anchors",
            report_data["dead_references"]["anchors"],
            lambda d: f"{d['ref']}  (in {d['path']})")
    section("dead CLI flags", report_data["dead_references"]["flags"],
            lambda d: f"{d['ref']}  (in {d['path']})")
    section("identifiers not found in code",
            report_data["dead_references"]["identifiers"],
            lambda d: f"{d['ref']}  (in {d['path']})")
    section("narrative signals", report_data["narrative_signals"],
            lambda d: f"[{','.join(d['signals'])}] {d['path']} :: {d['excerpt']}")
    section("index inconsistencies", report_data["index_inconsistencies"],
            lambda d: f"{d['kind']:<9} {d['target']}  (from {d['index']})")

    print(f"thresholds: max {t['max_lines']} lines / {t['max_bytes']} bytes, "
          f"stale after {t['stale_months']} months")
    print("note      : headings per file are in the JSON inventory "
          "(`heading_count` / `headings`); a file may pass the line budget "
          "and still fail the byte budget.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Collect mechanical facts about .trellis/spec (no judgement).",
    )
    parser.add_argument("--root", default=None,
                        help="repo root; default: walk up from cwd for .trellis/")
    parser.add_argument("--json", action="store_true",
                        help="emit JSON instead of the human report")
    parser.add_argument("--stale-months", type=int, default=STALE_MONTHS)
    parser.add_argument("--max-lines", type=int, default=MAX_LINES)
    parser.add_argument("--max-bytes", type=int, default=MAX_BYTES)
    args = parser.parse_args(argv)

    root = Path(args.root).resolve() if args.root else find_repo_root(Path.cwd())
    spec_root = root / WORKFLOW_DIR_NAME / SPEC_DIR_NAME
    if not spec_root.is_dir():
        print(f"No spec directory at {spec_root}", file=sys.stderr)
        return 1

    data = scan(spec_root, root, args)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        report(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
