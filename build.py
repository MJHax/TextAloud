#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Caleb McDougall
"""Build a clean, upload-ready ZIP of the extension.

Usage:
    python build.py

Output:
    dist/textaloud-v<version>.zip

Only the files Chrome needs are included; docs, scripts, and VCS files are
excluded so the package stays minimal for the Chrome Web Store.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"

# Extension files (and directories) that belong in the package.
INCLUDE = [
    "manifest.json",
    "background.js",
    "content.js",
    "filestore.js",
    "offscreen.html",
    "offscreen.js",
    "options.html",
    "options.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "icons",
    "LICENSE",
    "NOTICE",
]


def iter_files():
    for entry in INCLUDE:
        path = ROOT / entry
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file():
                    yield child
        elif path.is_file():
            yield path
        else:
            raise SystemExit(f"Missing file listed in INCLUDE: {entry}")


def main() -> int:
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    DIST.mkdir(exist_ok=True)
    out = DIST / f"textaloud-v{version}.zip"

    files = list(iter_files())
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            zf.write(path, path.relative_to(ROOT).as_posix())

    print(f"Built {out.relative_to(ROOT)} ({len(files)} files, {out.stat().st_size:,} bytes)")
    for path in files:
        print(f"  + {path.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
