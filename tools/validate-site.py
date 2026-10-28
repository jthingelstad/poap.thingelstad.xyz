#!/usr/bin/env python3
"""Validate the built site in dist/: routes, links, metadata, and published media.

Every page needs a title, a canonical link and a main landmark, and no class that
microformats parsers read as a legacy root. Every internal link must resolve to a built file. Every media URL must be a key in data/media.json (or, with
LOCAL_MEDIA=1, a file in media/). Media files must not be in the build. llms.txt must
be in the shape the llmstxt.org reference parser reads. The sitemap index and every
sitemap URL carry a W3C lastmod (tools/content-date.mjs), never in the future, and
every sitemap URL is a built page.
"""

from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MEDIA_PREFIXES = ("art/", "raster/")  # same as tools/delivery-plan.mjs
# Class names microformats2 parsers take as classic microformat roots when a page has no
# h-* root: `class="item"` made every drop and token page parse as an empty h-item
# (open-web audit, 2026-10-25). The site has no microformats, so none may appear. The
# list is microformats-parser's, plus hrecipe, which mf2py and php-mf2 also read.
LEGACY_ROOTS = {
    "adr",
    "geo",
    "hentry",
    "hfeed",
    "hnews",
    "hproduct",
    "hrecipe",
    "hresume",
    "hreview",
    "hreview-aggregate",
    "item",
    "vcard",
    "vevent",
}
# The llmstxt.org reference parser (llms-txt 0.0.7) starts a section at every line
# beginning "##" and reads every other non-empty line after it as one
# "- [name](url): notes" link; a line without a link fails the whole parse, and a
# second link on a line is dropped. Prose belongs above the first heading.
LLMS_LINK = re.compile(r"- \[[^\]]+\]\(https?:[^)\s]+\)(: \S.*)?")


def llms_problems(text):
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines or not re.fullmatch(r"# \S.*", lines[0]):
        return ["llms.txt: the first line is not a # title"]
    problems = []
    section = None
    for line in lines[1:]:
        if line.startswith("##"):
            section = line
            if not re.fullmatch(r"## \S.*", line):
                problems.append(f"llms.txt: use ## headings only: {line}")
        elif section is None:
            if line.startswith("#"):
                problems.append(f"llms.txt: heading above the first ## section: {line}")
        elif not LLMS_LINK.fullmatch(line) or line.count("](") != 1:
            problems.append(f"llms.txt: not one '- [name](url): notes' link: {line}")
    if section is None:
        problems.append("llms.txt: no ## section")
    return problems


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.title = False
        self.canonical = False
        self.main = False
        self.classes = set()

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        self.title |= tag == "title"
        self.main |= tag == "main"
        self.canonical |= tag == "link" and data.get("rel") == "canonical"
        self.classes.update((data.get("class") or "").split())
        for key in ("href", "src", "data-src"):
            if data.get(key):
                self.refs.append(data[key])
        for candidate in (data.get("srcset") or "").split(","):
            if candidate.strip():
                self.refs.append(candidate.split()[0])


W3C_INSTANT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z")


def sitemap_problems():
    """Every sitemap URL is a built page with a valid lastmod; the index's too."""
    problems = []
    index = DIST / "sitemap-index.xml"
    if not index.exists():
        return ["no sitemap-index.xml"]
    now = datetime.now(timezone.utc)
    site = "https://poap.thingelstad.xyz/"

    def check(entry, kind):
        loc = re.search(r"<loc>([^<]+)</loc>", entry)
        stamp = re.search(r"<lastmod>([^<]+)</lastmod>", entry)
        where = loc[1] if loc else entry[:80]
        if not stamp or not W3C_INSTANT.fullmatch(stamp[1]):
            problems.append(f"{kind} {where} has no valid lastmod")
        elif datetime.fromisoformat(stamp[1].replace("Z", "+00:00")) > now:
            problems.append(f"{kind} {where} has a future lastmod")
        return loc[1] if loc else ""

    for entry in re.findall(r"<sitemap>(.*?)</sitemap>", index.read_text(), re.S):
        child = check(entry, "sitemap")
        text = (DIST / child.removeprefix(site)).read_text()
        for url in re.findall(r"<url>(.*?)</url>", text, re.S):
            loc = check(url, "sitemap URL")
            if not (DIST / loc.removeprefix(site) / "index.html").exists() and loc != site:
                problems.append(f"sitemap URL {loc} is not a built page")
    return problems


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
    llms = DIST / "llms.txt"
    problems = llms_problems(llms.read_text()) if llms.exists() else ["no llms.txt"]
    problems += sitemap_problems()
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
        for name in sorted(parser.classes & LEGACY_ROOTS):
            problems.append(f"{rel}: class {name} parses as a legacy microformat")
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
    print(
        f"{len(pages)} pages, {len(media_refs)} media references, links, metadata, sitemap lastmods and llms.txt valid"
    )


if __name__ == "__main__":
    main()
