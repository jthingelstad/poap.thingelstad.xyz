#!/usr/bin/env python3
"""Validate the built site in dist/: routes, links, metadata, and published media.

Every page needs a title, a canonical link and a main landmark. Every internal link must
resolve to a built file. Every media URL must be a key in data/media.json (or, with
LOCAL_MEDIA=1, a file in media/). Media files must not be in the build.
"""

from html.parser import HTMLParser
import json
import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MEDIA_PREFIXES = ("art/", "raster/")  # same as tools/delivery-plan.mjs


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.title = False
        self.canonical = False
        self.main = False

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        self.title |= tag == "title"
        self.main |= tag == "main"
        self.canonical |= tag == "link" and data.get("rel") == "canonical"
        for key in ("href", "src", "data-src"):
            if data.get(key):
                self.refs.append(data[key])
        for candidate in (data.get("srcset") or "").split(","):
            if candidate.strip():
                self.refs.append(candidate.split()[0])


def main():
    local = os.environ.get("LOCAL_MEDIA") == "1"
    published = set(json.loads((ROOT / "data/media.json").read_text())["objects"])
    pages = sorted(DIST.rglob("*.html"))
    if not pages:
        sys.exit("No pages in dist/")
    for path in DIST.rglob("*"):
        rel = path.relative_to(DIST).as_posix()
        if path.is_file() and rel.startswith(MEDIA_PREFIXES):
            sys.exit(f"Media in the build: {rel}")
    problems = []
    media_refs = set()
    for page in pages:
        parser = Page()
        parser.feed(page.read_text())
        rel = page.relative_to(DIST).as_posix()
        for flag, name in (
            (parser.title, "title"),
            (parser.canonical, "canonical"),
            (parser.main, "main"),
        ):
            if not flag:
                problems.append(f"{rel}: no {name}")
        for ref in parser.refs:
            parts = urlsplit(ref)
            if (
                parts.scheme
                or ref.startswith("//")
                or ref.startswith("#")
                or ref.startswith("data:")
            ):
                continue
            target = unquote(parts.path)
            if not target.startswith("/"):
                target = "/" + (page.parent.relative_to(DIST).as_posix() + "/" + target).lstrip("/")
            key = target.lstrip("/")
            if key.startswith(MEDIA_PREFIXES):
                media_refs.add(key)
                continue
            file = DIST / key
            if key.endswith("/") or key == "":
                file = DIST / key / "index.html"
            if not file.exists():
                problems.append(f"{rel}: broken link {ref}")
    for key in sorted(media_refs):
        if local:
            if not (ROOT / "media" / key).exists():
                problems.append(f"media not in media/: {key}")
        elif key not in published:
            problems.append(f"media not published: {key}")
    if problems:
        sys.exit(
            "\n".join(problems[:40])
            + (f"\n... {len(problems)} problems" if len(problems) > 40 else "")
        )
    print(f"{len(pages)} pages, {len(media_refs)} media references, links and metadata valid")


if __name__ == "__main__":
    main()
