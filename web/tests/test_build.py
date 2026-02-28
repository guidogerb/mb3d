"""Tests for build.py — project metadata, validation helpers, CLI."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest

# Ensure the web/ dir is on sys.path so we can import build
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build

# ------------------------------------------------------------------ #
#  Metadata                                                          #
# ------------------------------------------------------------------ #


class TestGetProjectMetadata:
    def test_returns_dict_with_expected_keys(self):
        meta = build.get_project_metadata()
        assert isinstance(meta, dict)
        for key in ("root", "wasm_crate", "wasm_pkg", "dist"):
            assert key in meta

    def test_root_is_absolute(self):
        meta = build.get_project_metadata()
        assert Path(meta["root"]).is_absolute()

    def test_wasm_crate_under_root(self):
        meta = build.get_project_metadata()
        assert meta["wasm_crate"].startswith(meta["root"])


# ------------------------------------------------------------------ #
#  JS file validation                                                #
# ------------------------------------------------------------------ #


class TestValidateJsFiles:
    def test_all_expected_files_exist(self):
        results = build.validate_js_files()
        assert len(results) == 13
        for r in results:
            assert r["exists"], f"{r['path']} does not exist"
            assert r["size"] > 0, f"{r['path']} is empty"

    def test_result_structure(self):
        results = build.validate_js_files()
        for r in results:
            assert "path" in r
            assert "exists" in r
            assert "size" in r


# ------------------------------------------------------------------ #
#  index.html validation                                             #
# ------------------------------------------------------------------ #


class TestValidateIndexHtml:
    def test_index_exists_and_valid(self):
        info = build.validate_index_html()
        assert info["exists"]
        assert info["valid_script"], "index.html still references .ts"
        assert info["has_components"], "index.html missing web component tags"


# ------------------------------------------------------------------ #
#  No TypeScript residue                                             #
# ------------------------------------------------------------------ #


class TestValidateNoTypescript:
    def test_no_ts_files_in_src(self):
        ts_files = build.validate_no_typescript()
        assert ts_files == [], f"Found TypeScript files: {ts_files}"


# ------------------------------------------------------------------ #
#  No Node.js artifacts                                              #
# ------------------------------------------------------------------ #


class TestValidateNoNodeArtifacts:
    def test_all_node_artifacts_removed(self):
        items = build.validate_no_node_artifacts()
        for name, present in items.items():
            assert not present, f"{name} still exists"


# ------------------------------------------------------------------ #
#  WASM crate validation                                             #
# ------------------------------------------------------------------ #


class TestValidateWasmCrate:
    def test_cargo_toml_exists(self):
        info = build.validate_wasm_crate()
        assert info["cargo_toml_exists"]

    def test_lib_rs_exists(self):
        info = build.validate_wasm_crate()
        assert info["lib_rs_exists"]

    def test_cargo_toml_nonempty(self):
        info = build.validate_wasm_crate()
        assert info["cargo_toml_size"] > 0


# ------------------------------------------------------------------ #
#  JS export / import parsing                                        #
# ------------------------------------------------------------------ #


class TestParseJsExports:
    def test_header_exports(self):
        exports = build.parse_js_exports("src/core/types/header.js")
        assert "createDefaultHeader" in exports

    def test_params_exports(self):
        exports = build.parse_js_exports("src/core/types/params.js")
        assert "hexToRgb" in exports
        assert "buildRenderParams" in exports

    def test_state_exports(self):
        exports = build.parse_js_exports("src/core/engine/state.js")
        assert "AppState" in exports

    def test_worker_pool_exports(self):
        exports = build.parse_js_exports("src/core/engine/worker_pool.js")
        assert "WorkerPool" in exports

    def test_app_component_exports(self):
        exports = build.parse_js_exports("src/components/app/mb3d-app.js")
        assert "MB3DApp" in exports

    def test_viewer_component_exports(self):
        exports = build.parse_js_exports("src/components/viewer/mb3d-viewer.js")
        assert "MB3DViewer" in exports

    def test_navigator_component_exports(self):
        exports = build.parse_js_exports("src/components/navigator/mb3d-navigator.js")
        assert "MB3DNavigator" in exports

    def test_controls_component_exports(self):
        exports = build.parse_js_exports("src/components/controls/mb3d-controls.js")
        assert "MB3DControls" in exports

    def test_formula_panel_exports(self):
        exports = build.parse_js_exports("src/components/formulas/mb3d-formula-panel.js")
        assert "MB3DFormulaPanel" in exports

    def test_light_editor_exports(self):
        exports = build.parse_js_exports("src/components/lighting/mb3d-light-editor.js")
        assert "MB3DLightEditor" in exports

    def test_color_picker_exports(self):
        exports = build.parse_js_exports("src/components/color/mb3d-color-picker.js")
        assert "MB3DColorPicker" in exports

    def test_nonexistent_file_returns_empty(self):
        exports = build.parse_js_exports("src/nonexistent.js")
        assert exports == []


class TestParseJsImports:
    def test_main_imports(self):
        imports = build.parse_js_imports("src/main.js")
        assert "./core/engine/state.js" in imports
        assert "./core/types/header.js" in imports
        assert "./components/app/mb3d-app.js" in imports

    def test_state_imports(self):
        imports = build.parse_js_imports("src/core/engine/state.js")
        assert any("header" in i for i in imports)

    def test_nonexistent_file_returns_empty(self):
        imports = build.parse_js_imports("src/nonexistent.js")
        assert imports == []


# ------------------------------------------------------------------ #
#  JS content validation                                             #
# ------------------------------------------------------------------ #


class TestReadJsFile:
    def test_read_header_js(self):
        content = build.read_js_file("src/core/types/header.js")
        assert "createDefaultHeader" in content
        assert "export" in content

    def test_read_nonexistent_returns_empty(self):
        content = build.read_js_file("src/nonexistent.js")
        assert content == ""


class TestJsContentIntegrity:
    """Verify JS files contain no TypeScript syntax residue."""

    JS_FILES = [
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

    @pytest.mark.parametrize("filepath", JS_FILES)
    def test_no_typescript_syntax(self, filepath):
        """Ensure no TS-only keywords leak into JS files."""
        import re

        content = build.read_js_file(filepath)
        assert content, f"{filepath} is empty or missing"
        # No TypeScript type annotations like ": string", ": number" in function sigs
        # (but allow inside JSDoc comments and string literals)
        lines = content.split("\n")
        for i, line in enumerate(lines):
            stripped = line.strip()
            # Skip JSDoc lines, comments, strings
            if stripped.startswith("*") or stripped.startswith("//") or stripped.startswith("/*"):
                continue
            # Check for TS interface/type/enum keywords at start of line
            assert not re.match(r"^(interface|type|enum)\s+\w+", stripped), (
                f"{filepath}:{i + 1} has TypeScript keyword: {stripped}"
            )

    @pytest.mark.parametrize("filepath", JS_FILES)
    def test_has_export_or_import(self, filepath):
        content = build.read_js_file(filepath)
        # calc-worker.js uses self.addEventListener, no exports needed
        if "calc-worker" in filepath:
            assert "self.addEventListener" in content
        elif "main.js" in filepath:
            # Entry point only imports, doesn't export
            assert "import" in content
        else:
            assert "export" in content, f"{filepath} has no exports"

    @pytest.mark.parametrize("filepath", JS_FILES)
    def test_no_require_statements(self, filepath):
        content = build.read_js_file(filepath)
        assert "require(" not in content, f"{filepath} uses CommonJS require()"

    @pytest.mark.parametrize("filepath", JS_FILES)
    def test_uses_es6_modules(self, filepath):
        """All non-worker files should use ES module import/export."""
        content = build.read_js_file(filepath)
        if "calc-worker" in filepath:
            # Worker uses dynamic import
            assert "import(" in content
        else:
            assert "import" in content or "export" in content


# ------------------------------------------------------------------ #
#  Header defaults                                                    #
# ------------------------------------------------------------------ #


class TestHeaderDefaults:
    """Validate the default header values match expected fractal params."""

    def _read_header_source(self):
        return build.read_js_file("src/core/types/header.js")

    def test_has_default_dimensions(self):
        src = self._read_header_source()
        assert "800" in src  # width
        assert "600" in src  # height

    def test_has_default_iterations(self):
        src = self._read_header_source()
        assert "12" in src  # iMaxIter

    def test_has_default_formula(self):
        src = self._read_header_source()
        assert "Mandelbulb Power 8" in src

    def test_has_zoom_parameter(self):
        src = self._read_header_source()
        assert "zoom" in src


# ------------------------------------------------------------------ #
#  Params module                                                     #
# ------------------------------------------------------------------ #


class TestParamsModule:
    def _read_params_source(self):
        return build.read_js_file("src/core/types/params.js")

    def test_has_hex_to_rgb(self):
        src = self._read_params_source()
        assert "hexToRgb" in src

    def test_has_build_render_params(self):
        src = self._read_params_source()
        assert "buildRenderParams" in src
        assert "Float64Array" in src

    def test_has_build_formula_ids(self):
        src = self._read_params_source()
        assert "buildFormulaIds" in src
        assert "Uint32Array" in src

    def test_has_build_paint_params(self):
        src = self._read_params_source()
        assert "buildPaintParams" in src

    def test_has_formula_mapping(self):
        src = self._read_params_source()
        assert "FORMULA_NAME_TO_ID" in src

    def test_has_hybrid_mode_mapping(self):
        src = self._read_params_source()
        assert "HYBRID_MODE_TO_ID" in src


# ------------------------------------------------------------------ #
#  Web Component structure                                           #
# ------------------------------------------------------------------ #


class TestWebComponentStructure:
    COMPONENTS = {
        "src/components/app/mb3d-app.js": "MB3DApp",
        "src/components/viewer/mb3d-viewer.js": "MB3DViewer",
        "src/components/navigator/mb3d-navigator.js": "MB3DNavigator",
        "src/components/controls/mb3d-controls.js": "MB3DControls",
        "src/components/formulas/mb3d-formula-panel.js": "MB3DFormulaPanel",
        "src/components/lighting/mb3d-light-editor.js": "MB3DLightEditor",
        "src/components/color/mb3d-color-picker.js": "MB3DColorPicker",
    }

    @pytest.mark.parametrize("filepath,classname", list(COMPONENTS.items()))
    def test_extends_html_element(self, filepath, classname):
        content = build.read_js_file(filepath)
        assert "extends HTMLElement" in content, f"{filepath} doesn't extend HTMLElement"

    @pytest.mark.parametrize("filepath,classname", list(COMPONENTS.items()))
    def test_has_shadow_dom(self, filepath, classname):
        content = build.read_js_file(filepath)
        assert "attachShadow" in content, f"{filepath} missing Shadow DOM"

    @pytest.mark.parametrize("filepath,classname", list(COMPONENTS.items()))
    def test_has_connected_callback(self, filepath, classname):
        content = build.read_js_file(filepath)
        assert "connectedCallback" in content, f"{filepath} missing connectedCallback"

    @pytest.mark.parametrize("filepath,classname", list(COMPONENTS.items()))
    def test_exports_class(self, filepath, classname):
        exports = build.parse_js_exports(filepath)
        assert classname in exports, f"{filepath} doesn't export {classname}"


# ------------------------------------------------------------------ #
#  Worker structure                                                  #
# ------------------------------------------------------------------ #


class TestCalcWorker:
    def test_handles_init_message(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "'init'" in content or '"init"' in content

    def test_handles_render_message(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "'render'" in content or '"render"' in content

    def test_handles_paint_message(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "'paint'" in content or '"paint"' in content

    def test_handles_render_quick_message(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "'render-quick'" in content or '"render-quick"' in content

    def test_posts_messages_back(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "self.postMessage" in content

    def test_uses_wasm_imports(self):
        content = build.read_js_file("src/workers/calc-worker.js")
        assert "render_scanlines" in content
        assert "paint_gbuffer" in content
        assert "render_quick" in content


# ------------------------------------------------------------------ #
#  CLI smoke tests                                                   #
# ------------------------------------------------------------------ #


class TestCli:
    def test_unknown_command_prints_usage(self):
        result = subprocess.run(
            [sys.executable, str(build.ROOT / "build.py"), "nonexistent"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1
        assert "Usage:" in result.stderr or "Usage:" in result.stdout

    def test_no_args_prints_usage(self):
        result = subprocess.run(
            [sys.executable, str(build.ROOT / "build.py")],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1

    def test_clean_runs_successfully(self):
        result = subprocess.run(
            [sys.executable, str(build.ROOT / "build.py"), "clean"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0


# ------------------------------------------------------------------ #
#  build_dist assembly                                               #
# ------------------------------------------------------------------ #


class TestBuildDist:
    def test_dist_creates_directory(self, tmp_path):
        """Test dist assembly copies index.html and src/."""
        # We can test the actual build_dist function
        build.build_dist()
        assert build.DIST.exists()
        assert (build.DIST / "index.html").exists()
        assert (build.DIST / "src" / "main.js").exists()

    def test_dist_excludes_wasm_source(self):
        """The wasm source crate should not be in dist/src/wasm/src/."""
        build.build_dist()
        # The raw .rs source should NOT be copied
        assert not (build.DIST / "src" / "wasm" / "src").exists()

    def test_count_files_helper(self, tmp_path):
        (tmp_path / "a.txt").write_text("hello")
        (tmp_path / "sub").mkdir()
        (tmp_path / "sub" / "b.txt").write_text("world")
        assert build._count_files(tmp_path) == 2


# ------------------------------------------------------------------ #
#  COOP handler                                                      #
# ------------------------------------------------------------------ #


class TestCOOPHandler:
    def test_cross_origin_headers_defined(self):
        assert "Cross-Origin-Opener-Policy" in build._CROSS_ORIGIN_HEADERS
        assert "Cross-Origin-Embedder-Policy" in build._CROSS_ORIGIN_HEADERS

    def test_coop_value(self):
        assert build._CROSS_ORIGIN_HEADERS["Cross-Origin-Opener-Policy"] == "same-origin"

    def test_coep_value(self):
        assert build._CROSS_ORIGIN_HEADERS["Cross-Origin-Embedder-Policy"] == "require-corp"


# ------------------------------------------------------------------ #
#  Main entry point routing                                          #
# ------------------------------------------------------------------ #


class TestMainEntryPoint:
    def test_commands_dict_has_expected_keys(self):
        expected = {"wasm", "dist", "serve", "clean", "all", "lint", "fmt", "test"}
        assert set(build.COMMANDS.keys()) == expected

    def test_main_calls_correct_command(self):
        with mock.patch.object(build, "clean") as mock_clean:
            # Must also patch COMMANDS dict to use the mock
            with (
                mock.patch.dict(build.COMMANDS, {"clean": mock_clean}),
                mock.patch("sys.argv", ["build.py", "clean"]),
            ):
                build.main()
            mock_clean.assert_called_once()

    def test_main_exits_on_unknown(self):
        with mock.patch("sys.argv", ["build.py", "bogus"]), pytest.raises(SystemExit):
            build.main()


# ------------------------------------------------------------------ #
#  build_wasm (mocked subprocess)                                    #
# ------------------------------------------------------------------ #


class TestBuildWasm:
    def test_build_wasm_calls_wasm_pack(self):
        with mock.patch("build.subprocess.run") as mock_run:
            build.build_wasm()
        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert args[0] == "wasm-pack"
        assert args[1] == "build"
        assert "--target" in args
        assert "web" in args

    def test_build_wasm_passes_check_true(self):
        with mock.patch("build.subprocess.run") as mock_run:
            build.build_wasm()
        assert mock_run.call_args[1].get("check") is True


# ------------------------------------------------------------------ #
#  lint / fmt / test (mocked subprocess)                             #
# ------------------------------------------------------------------ #


class TestLintFmtTest:
    def test_lint_calls_ruff_check(self):
        with mock.patch("build.subprocess.run", return_value=mock.Mock(returncode=0)) as mock_run:
            rc = build.lint()
        assert rc == 0
        args = mock_run.call_args[0][0]
        assert args[0] == "ruff"
        assert args[1] == "check"

    def test_fmt_calls_ruff_format(self):
        with mock.patch("build.subprocess.run", return_value=mock.Mock(returncode=0)) as mock_run:
            rc = build.fmt()
        assert rc == 0
        args = mock_run.call_args[0][0]
        assert args[0] == "ruff"
        assert args[1] == "format"

    def test_test_calls_pytest(self):
        with mock.patch("build.subprocess.run", return_value=mock.Mock(returncode=0)) as mock_run:
            rc = build.test()
        assert rc == 0
        args = mock_run.call_args[0][0]
        assert args[0] == "pytest"

    def test_lint_returns_nonzero_on_failure(self):
        with mock.patch("build.subprocess.run", return_value=mock.Mock(returncode=1)):
            rc = build.lint()
        assert rc == 1

    def test_fmt_returns_nonzero_on_failure(self):
        with mock.patch("build.subprocess.run", return_value=mock.Mock(returncode=2)):
            rc = build.fmt()
        assert rc == 2


# ------------------------------------------------------------------ #
#  serve (mocked server)                                             #
# ------------------------------------------------------------------ #


class TestServe:
    def test_serve_creates_http_server(self):
        mock_server = mock.MagicMock()
        mock_server.serve_forever.side_effect = KeyboardInterrupt
        with mock.patch("http.server.HTTPServer", return_value=mock_server) as mock_cls:
            build.serve(port=9999)
        mock_cls.assert_called_once()
        call_args = mock_cls.call_args[0]
        assert call_args[0] == ("", 9999)


# ------------------------------------------------------------------ #
#  clean with existing artifacts                                     #
# ------------------------------------------------------------------ #


class TestCleanWithArtifacts:
    def test_clean_removes_dist_when_exists(self, tmp_path):
        # Create a fake dist directory
        fake_dist = tmp_path / "dist"
        fake_dist.mkdir()
        (fake_dist / "test.txt").write_text("test")
        with (
            mock.patch.object(build, "DIST", fake_dist),
            mock.patch.object(build, "WASM_PKG", tmp_path / "nonexistent"),
            mock.patch.object(build, "ROOT", tmp_path),
        ):
            build.clean()
        assert not fake_dist.exists()


# ------------------------------------------------------------------ #
#  _COOPHandler                                                      #
# ------------------------------------------------------------------ #


class TestCOOPHandlerClass:
    def test_handler_class_exists(self):
        assert hasattr(build, "_COOPHandler")

    def test_handler_inherits_simple_http(self):
        assert issubclass(build._COOPHandler, build.http.server.SimpleHTTPRequestHandler)

    def test_handler_has_end_headers(self):
        assert hasattr(build._COOPHandler, "end_headers")

    def test_handler_has_log_message(self):
        assert hasattr(build._COOPHandler, "log_message")
