#!/usr/bin/env python3
"""build.py — Python build & serve toolchain for Mandelbulb3D Web.

Commands
--------
  python build.py wasm        Build the Rust/WASM engine via wasm-pack
  python build.py dist        Copy static assets into dist/
  python build.py serve       Start a dev server with COOP/COEP headers
  python build.py clean       Remove build artefacts
  python build.py all         wasm + dist (full build)
  python build.py lint        Run ruff check on Python sources
  python build.py fmt         Run ruff format on Python sources
  python build.py test        Run pytest with coverage
"""

from __future__ import annotations

import http.server
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WASM_CRATE = ROOT / "src" / "wasm"
WASM_PKG = WASM_CRATE / "pkg"
DIST = ROOT / "dist"

# ------------------------------------------------------------------ #
#  WASM build                                                        #
# ------------------------------------------------------------------ #


def build_wasm() -> None:
    """Compile the Rust crate to WASM via wasm-pack."""
    print("==> Building WASM …")
    cmd = [
        "wasm-pack",
        "build",
        str(WASM_CRATE),
        "--target",
        "web",
        "--out-dir",
        str(WASM_PKG),
    ]
    subprocess.run(cmd, check=True)
    print("==> WASM build complete.")


# ------------------------------------------------------------------ #
#  Static dist assembly                                              #
# ------------------------------------------------------------------ #


def build_dist() -> None:
    """Assemble the dist/ folder from source assets."""
    print("==> Assembling dist/ …")
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    # Copy index.html
    shutil.copy2(ROOT / "index.html", DIST / "index.html")

    # Copy src/ (JS modules)
    src_dest = DIST / "src"
    shutil.copytree(ROOT / "src", src_dest, ignore=shutil.ignore_patterns("wasm"))

    # Copy WASM pkg if it exists
    if WASM_PKG.exists():
        shutil.copytree(WASM_PKG, src_dest / "wasm" / "pkg")

    # Copy assets/
    assets_src = ROOT / "assets"
    if assets_src.exists():
        shutil.copytree(assets_src, DIST / "assets")

    print(f"==> dist/ assembled ({_count_files(DIST)} files).")


def _count_files(directory: Path) -> int:
    return sum(1 for _ in directory.rglob("*") if _.is_file())


# ------------------------------------------------------------------ #
#  Dev server with COOP / COEP headers                               #
# ------------------------------------------------------------------ #

_CROSS_ORIGIN_HEADERS = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cache-Control": "no-cache",
}


class _COOPHandler(http.server.SimpleHTTPRequestHandler):
    """Adds COOP/COEP headers required for SharedArrayBuffer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        for key, value in _CROSS_ORIGIN_HEADERS.items():
            self.send_header(key, value)
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[serve] {args[0]}")


def serve(port: int = 8000) -> None:
    """Start a local dev server on *port* with COOP/COEP headers."""
    print(f"==> Serving on http://localhost:{port}")
    server = http.server.HTTPServer(("", port), _COOPHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n==> Server stopped.")


# ------------------------------------------------------------------ #
#  Cleanup                                                           #
# ------------------------------------------------------------------ #


def clean() -> None:
    """Remove build artefacts."""
    for path in (DIST, WASM_PKG):
        if path.exists():
            shutil.rmtree(path)
            print(f"==> Removed {path.relative_to(ROOT)}")
    print("==> Clean complete.")


# ------------------------------------------------------------------ #
#  Lint / Format / Test helpers                                      #
# ------------------------------------------------------------------ #


def lint() -> int:
    """Run ruff check."""
    return subprocess.run(["ruff", "check", str(ROOT)]).returncode


def fmt() -> int:
    """Run ruff format."""
    return subprocess.run(["ruff", "format", str(ROOT)]).returncode


def test() -> int:
    """Run pytest with coverage."""
    return subprocess.run(
        ["pytest", "--cov=.", "--cov-report=term-missing", "--cov-config=pyproject.toml"],
        cwd=str(ROOT),
    ).returncode


# ------------------------------------------------------------------ #
#  Metadata (used by tests)                                          #
# ------------------------------------------------------------------ #


def get_project_metadata() -> dict:
    """Return basic project metadata as a dict."""
    return {
        "root": str(ROOT),
        "wasm_crate": str(WASM_CRATE),
        "wasm_pkg": str(WASM_PKG),
        "dist": str(DIST),
    }


def validate_js_files() -> list[dict]:
    """Check that all expected JS source files exist and are non-empty.

    Returns a list of dicts with 'path', 'exists', and 'size' keys.
    """
    expected = [
        "src/main.js",
        "src/core/types/header.js",
        "src/core/types/params.js",
        "src/core/engine/state.js",
        "src/core/engine/worker_pool.js",
        "src/components/app/mb3d-app.js",
        "src/components/viewer/mb3d-viewer.js",
        "src/components/navigator/mb3d-navigator.js",
        "src/components/controls/mb3d-controls.js",
        "src/components/formulas/mb3d-formula-panel.js",
        "src/components/lighting/mb3d-light-editor.js",
        "src/components/color/mb3d-color-picker.js",
        "src/workers/calc-worker.js",
    ]
    results = []
    for rel in expected:
        p = ROOT / rel
        results.append(
            {"path": rel, "exists": p.exists(), "size": p.stat().st_size if p.exists() else 0}
        )
    return results


def validate_index_html() -> dict:
    """Validate index.html references .js (not .ts) and contains expected elements."""
    index = ROOT / "index.html"
    if not index.exists():
        return {"exists": False, "valid_script": False, "has_components": False}
    text = index.read_text()
    return {
        "exists": True,
        "valid_script": "src/main.js" in text and "src/main.ts" not in text,
        "has_components": all(
            tag in text
            for tag in [
                "mb3d-app",
                "mb3d-viewer",
                "mb3d-navigator",
                "mb3d-controls",
                "mb3d-formula-panel",
                "mb3d-light-editor",
                "mb3d-color-picker",
            ]
        ),
    }


def parse_js_exports(filepath: str) -> list[str]:
    """Parse named exports from a JS file (simple regex-based)."""
    import re

    p = ROOT / filepath
    if not p.exists():
        return []
    text = p.read_text()
    # Match: export class Foo, export function foo, export const foo
    return re.findall(r"export\s+(?:class|function|const|let|var)\s+(\w+)", text)


def parse_js_imports(filepath: str) -> list[str]:
    """Parse import specifiers from a JS file."""
    import re

    p = ROOT / filepath
    if not p.exists():
        return []
    text = p.read_text()
    return re.findall(r"""from\s+['"]([^'"]+)['"]""", text)


def validate_no_typescript() -> list[str]:
    """Return list of .ts files under src/ (should be empty)."""
    src = ROOT / "src"
    return [str(p.relative_to(ROOT)) for p in src.rglob("*.ts")]


def validate_no_node_artifacts() -> dict:
    """Check that Node.js artifacts are absent."""
    items = {
        "package.json": (ROOT / "package.json").exists(),
        "package-lock.json": (ROOT / "package-lock.json").exists(),
        "node_modules": (ROOT / "node_modules").exists(),
        "tsconfig.json": (ROOT / "tsconfig.json").exists(),
        "vite.config.ts": (ROOT / "vite.config.ts").exists(),
    }
    return items


def validate_wasm_crate() -> dict:
    """Validate the Rust/WASM crate structure."""
    cargo = WASM_CRATE / "Cargo.toml"
    lib_rs = WASM_CRATE / "src" / "lib.rs"
    return {
        "cargo_toml_exists": cargo.exists(),
        "lib_rs_exists": lib_rs.exists(),
        "cargo_toml_size": cargo.stat().st_size if cargo.exists() else 0,
    }


def read_js_file(filepath: str) -> str:
    """Read and return contents of a JS file relative to ROOT."""
    p = ROOT / filepath
    if not p.exists():
        return ""
    return p.read_text()


# ------------------------------------------------------------------ #
#  CLI entry point                                                   #
# ------------------------------------------------------------------ #

COMMANDS = {
    "wasm": build_wasm,
    "dist": build_dist,
    "serve": lambda: serve(),
    "clean": clean,
    "all": lambda: (build_wasm(), build_dist()),
    "lint": lambda: sys.exit(lint()),
    "fmt": lambda: sys.exit(fmt()),
    "test": lambda: sys.exit(test()),
}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"Usage: python build.py {{{','.join(COMMANDS)}}}")
        sys.exit(1)
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
