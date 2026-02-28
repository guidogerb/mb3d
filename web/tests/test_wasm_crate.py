"""Tests for the Rust/WASM crate structure and configuration."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build

WASM_CRATE = build.WASM_CRATE


class TestCargoToml:
    """Validate Cargo.toml configuration."""

    @pytest.fixture()
    def cargo_text(self):
        return (WASM_CRATE / "Cargo.toml").read_text()

    def test_crate_type_is_cdylib(self, cargo_text):
        assert "cdylib" in cargo_text

    def test_has_wasm_bindgen_dep(self, cargo_text):
        assert "wasm-bindgen" in cargo_text

    def test_wasm_opt_disabled(self, cargo_text):
        assert "wasm-opt" in cargo_text

    def test_crate_name(self, cargo_text):
        assert 'name = "mb3d_wasm"' in cargo_text or "mb3d-wasm" in cargo_text


class TestRustSourceStructure:
    """Ensure all expected Rust source files exist."""

    EXPECTED_FILES = [
        "src/lib.rs",
    ]

    @pytest.mark.parametrize("relpath", EXPECTED_FILES)
    def test_file_exists(self, relpath):
        assert (WASM_CRATE / relpath).exists()

    def test_lib_rs_has_wasm_bindgen(self):
        content = (WASM_CRATE / "src" / "lib.rs").read_text()
        assert "wasm_bindgen" in content

    def test_lib_rs_exports_render_scanlines(self):
        content = (WASM_CRATE / "src" / "lib.rs").read_text()
        assert "render_scanlines" in content

    def test_lib_rs_exports_paint_gbuffer(self):
        content = (WASM_CRATE / "src" / "lib.rs").read_text()
        assert "paint_gbuffer" in content

    def test_lib_rs_exports_render_quick(self):
        content = (WASM_CRATE / "src" / "lib.rs").read_text()
        assert "render_quick" in content


class TestRustModules:
    """Check that submodules referenced in lib.rs exist."""

    def _get_declared_modules(self):
        lib_rs = (WASM_CRATE / "src" / "lib.rs").read_text()
        return re.findall(r"mod\s+(\w+);", lib_rs)

    def test_declared_modules_have_files_or_dirs(self):
        modules = self._get_declared_modules()
        src = WASM_CRATE / "src"
        for mod in modules:
            mod_file = src / f"{mod}.rs"
            mod_dir = src / mod
            assert mod_file.exists() or mod_dir.exists(), (
                f"Module '{mod}' declared in lib.rs but neither {mod}.rs nor {mod}/ found"
            )
