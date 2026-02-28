"""Tests for project-level configuration and documentation."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build

ROOT = build.ROOT


class TestProjectConfig:
    def test_pyproject_toml_exists(self):
        assert (ROOT / "pyproject.toml").exists()

    def test_pyproject_has_ruff_config(self):
        content = (ROOT / "pyproject.toml").read_text()
        assert "[tool.ruff]" in content

    def test_pyproject_has_pytest_config(self):
        content = (ROOT / "pyproject.toml").read_text()
        assert "[tool.pytest" in content

    def test_pyproject_has_coverage_config(self):
        content = (ROOT / "pyproject.toml").read_text()
        assert "[tool.coverage" in content
        assert "fail_under = 90" in content

    def test_gitignore_has_python_entries(self):
        content = (ROOT / ".gitignore").read_text()
        assert "__pycache__" in content
        assert ".pytest_cache" in content
        assert ".coverage" in content

    def test_gitignore_excludes_node_modules(self):
        """node_modules line should be removed since we no longer use Node."""
        content = (ROOT / ".gitignore").read_text()
        assert "node_modules" not in content


class TestCopilotInstructions:
    def test_instructions_file_exists(self):
        assert (ROOT / ".github" / "copilot-instructions.md").exists()

    def test_mentions_pure_javascript(self):
        content = (ROOT / ".github" / "copilot-instructions.md").read_text()
        assert "pure JavaScript" in content

    def test_mentions_90_percent_coverage(self):
        content = (ROOT / ".github" / "copilot-instructions.md").read_text()
        assert "90%" in content

    def test_forbids_third_party_js(self):
        content = (ROOT / ".github" / "copilot-instructions.md").read_text()
        assert "third-party JavaScript" in content or "third-party JS" in content


class TestIndexHtml:
    def test_doctype(self):
        content = (ROOT / "index.html").read_text()
        assert "<!DOCTYPE html>" in content

    def test_lang_attribute(self):
        content = (ROOT / "index.html").read_text()
        assert 'lang="en"' in content

    def test_type_module_script(self):
        content = (ROOT / "index.html").read_text()
        assert 'type="module"' in content

    def test_references_js_not_ts(self):
        content = (ROOT / "index.html").read_text()
        assert "main.js" in content
        assert "main.ts" not in content

    def test_has_css_link(self):
        content = (ROOT / "index.html").read_text()
        assert "mb3d.css" in content


class TestBuildScript:
    def test_build_py_exists(self):
        assert (ROOT / "build.py").exists()

    def test_build_py_is_executable_python(self):
        content = (ROOT / "build.py").read_text()
        assert "#!/usr/bin/env python3" in content

    def test_has_serve_function(self):
        content = (ROOT / "build.py").read_text()
        assert "def serve" in content

    def test_has_build_wasm_function(self):
        content = (ROOT / "build.py").read_text()
        assert "def build_wasm" in content

    def test_has_build_dist_function(self):
        content = (ROOT / "build.py").read_text()
        assert "def build_dist" in content

    def test_has_clean_function(self):
        content = (ROOT / "build.py").read_text()
        assert "def clean" in content
