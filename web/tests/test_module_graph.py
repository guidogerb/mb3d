"""Tests for JavaScript module graph integrity and import resolution."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build

ROOT = build.ROOT


def _resolve_import(source_file: str, specifier: str) -> Path:
    """Resolve a relative import specifier to an absolute path."""
    source = ROOT / source_file
    return (source.parent / specifier).resolve()


class TestModuleGraph:
    """Verify every import in every JS file resolves to an existing file."""

    JS_FILES = build.validate_js_files()

    @pytest.mark.parametrize(
        "filepath",
        [r["path"] for r in JS_FILES if r["exists"]],
    )
    def test_all_imports_resolve(self, filepath):
        imports = build.parse_js_imports(filepath)
        for specifier in imports:
            # Skip WASM pkg imports — they're generated at build time
            if "wasm/pkg" in specifier:
                continue
            resolved = _resolve_import(filepath, specifier)
            assert resolved.exists(), (
                f"{filepath}: import '{specifier}' resolves to {resolved} which does not exist"
            )


class TestMainImportsAllComponents:
    """main.js must import every component and register them."""

    def test_imports_all_component_modules(self):
        imports = build.parse_js_imports("src/main.js")
        expected_fragments = [
            "mb3d-app",
            "mb3d-viewer",
            "mb3d-navigator",
            "mb3d-controls",
            "mb3d-formula-panel",
            "mb3d-light-editor",
            "mb3d-color-picker",
        ]
        for fragment in expected_fragments:
            assert any(fragment in imp for imp in imports), f"main.js missing import for {fragment}"

    def test_imports_state(self):
        imports = build.parse_js_imports("src/main.js")
        assert any("state" in imp for imp in imports)

    def test_imports_header(self):
        imports = build.parse_js_imports("src/main.js")
        assert any("header" in imp for imp in imports)

    def test_registers_custom_elements(self):
        content = build.read_js_file("src/main.js")
        expected_tags = [
            "mb3d-app",
            "mb3d-viewer",
            "mb3d-navigator",
            "mb3d-controls",
            "mb3d-formula-panel",
            "mb3d-light-editor",
            "mb3d-color-picker",
        ]
        for tag in expected_tags:
            assert f"'{tag}'" in content or f'"{tag}"' in content, (
                f"main.js doesn't register <{tag}>"
            )


class TestStateImports:
    """state.js must import from types modules."""

    def test_imports_header(self):
        imports = build.parse_js_imports("src/core/engine/state.js")
        assert any("header" in i for i in imports)

    def test_imports_worker_pool(self):
        imports = build.parse_js_imports("src/core/engine/state.js")
        assert any("worker_pool" in i for i in imports)

    def test_imports_params(self):
        imports = build.parse_js_imports("src/core/engine/state.js")
        assert any("params" in i for i in imports)


class TestNoCircularDeps:
    """Simple cycle detection — components should not import from main."""

    COMPONENT_FILES = [
        "src/components/app/mb3d-app.js",
        "src/components/viewer/mb3d-viewer.js",
        "src/components/navigator/mb3d-navigator.js",
        "src/components/controls/mb3d-controls.js",
        "src/components/formulas/mb3d-formula-panel.js",
        "src/components/lighting/mb3d-light-editor.js",
        "src/components/color/mb3d-color-picker.js",
    ]

    @pytest.mark.parametrize("filepath", COMPONENT_FILES)
    def test_component_does_not_import_main(self, filepath):
        imports = build.parse_js_imports(filepath)
        assert not any("main" in i for i in imports), f"{filepath} imports from main.js (circular)"
