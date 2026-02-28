# Mandelbulb3D → Web Port: Strategy Document

## Executive Summary

Port the Mandelbulb3D Delphi/Win32 fractal renderer to a browser-native application using **HTML5 Web Components** for the UI and **Rust → WebAssembly** for all performance-critical computation. The result is a zero-install, cross-platform fractal renderer that runs entirely client-side.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Browser Tab                          │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           HTML5 Web Components (UI Shell)           │ │
│  │  <mb3d-app>                                         │ │
│  │    <mb3d-viewer>        ← Canvas / OffscreenCanvas  │ │
│  │    <mb3d-navigator>     ← Real-time preview         │ │
│  │    <mb3d-formula-panel> ← Formula selector & hybrid │ │
│  │    <mb3d-light-editor>  ← 6-light config            │ │
│  │    <mb3d-color-picker>  ← Gradient editor           │ │
│  │    <mb3d-animation>     ← Keyframe timeline         │ │
│  │    <mb3d-postprocess>   ← DOF / SSAO / Monte Carlo │ │
│  │    <mb3d-controls>      ← Params / quality / render │ │
│  │    <mb3d-export>        ← Image / mesh / voxel      │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                    postMessage()                          │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Web Worker Pool (N workers)             │ │
│  │                                                      │ │
│  │  ┌────────────────────────────────────────────────┐  │ │
│  │  │         Rust/WASM Compute Engine               │  │ │
│  │  │                                                │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │ │
│  │  │  │ Ray March│ │ Formulas │ │ Distance Est. │  │  │ │
│  │  │  └──────────┘ └──────────┘ └───────────────┘  │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │ │
│  │  │  │ Lighting │ │ Shadows  │ │ Monte Carlo   │  │  │ │
│  │  │  └──────────┘ └──────────┘ └───────────────┘  │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │ │
│  │  │  │ Math3D   │ │ Normals  │ │ DOF / Post    │  │  │ │
│  │  │  └──────────┘ └──────────┘ └───────────────┘  │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                  SharedArrayBuffer                        │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │         Shared Pixel / G-Buffer Memory               │ │
│  │    (ImageData ↔ Canvas / OffscreenCanvas)            │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Source Module Mapping: Delphi → Web

### 2.1 Computation → Rust/WASM (`web/src/wasm/`)

These modules contain the hot inner loops. They MUST be in Rust compiled to WASM for acceptable performance. The original Delphi code uses x86 SSE2 inline assembly which cannot run in the browser — Rust with `#[target_feature(enable = "simd128")]` provides the WASM SIMD equivalent.

| Delphi Source | Rust WASM Module | Notes |
|---|---|---|
| `Calc.pas` | `wasm/src/engine/raymarcher.rs` | Core sphere-tracing loop, DE dispatch, step logic |
| `CalcThread.pas` | `wasm/src/engine/calc_thread.rs` | Per-scanline ray march (runs in Web Workers) |
| `CalcSR.pas` | `wasm/src/engine/reflections.rs` | Secondary ray tracing (reflection/refraction) |
| `CalcHardShadow.pas` | `wasm/src/engine/hard_shadow.rs` | Shadow ray marching |
| `CalcAmbShadowDE.pas` | `wasm/src/engine/ambient_occlusion.rs` | DE-based AO calculation |
| `AmbShadowCalcThreadN.pas` | `wasm/src/engine/ao_thread.rs` | Threaded AO (à-trous wavelet) |
| `CalcMonteCarlo.pas` | `wasm/src/engine/monte_carlo.rs` | Path tracer with Halton sequences |
| `CalcPart.pas` | `wasm/src/engine/calc_part.rs` | Partial/progressive calculation |
| `CalcThread2D.pas` | `wasm/src/engine/calc_2d.rs` | 2D slice renderer |
| `CalcVoxelSliceThread.pas` | `wasm/src/engine/voxel_slice.rs` | Voxel computation |
| `DOF.pas` | `wasm/src/engine/dof.rs` | Depth-of-field blur |
| `ColorSSAO.pas` | `wasm/src/engine/ssao.rs` | Screen-space AO |
| `formulas.pas` | `wasm/src/formulas/builtin.rs` | All built-in fractal iteration functions |
| `CustomFormulas.pas` | `wasm/src/formulas/custom.rs` | Custom formula runtime (rewrite — no x86 binary loading) |
| `IFS.pas` | `wasm/src/formulas/ifs.rs` | Iterated Function Systems |
| `FormulaClass.pas` | `wasm/src/formulas/formula_class.rs` | Formula abstraction & hybrid dispatch |
| `Math3D.pas` | `wasm/src/math/math3d.rs` | Vec3/Mat3/Quaternion ops with WASM SIMD |
| `MathUtils.pas` | `wasm/src/math/utils.rs` | Clamping, trig tables, fast approx |
| `Interpolation.pas` | `wasm/src/math/interpolation.rs` | Quaternion SLERP, spline |
| `Paint.pas` | `wasm/src/lighting/paint.rs` | G-buffer → RGB Phong shading |
| `PaintThread.pas` | `wasm/src/lighting/paint_thread.rs` | Parallel painting |
| `ColorMapper.pas` | `wasm/src/lighting/color_mapper.rs` | Color gradient lookup |
| `ImageProcess.pas` | `wasm/src/engine/image_process.rs` | Normals smoothing, post-process |
| `DivUtils.pas` | `wasm/src/math/div_utils.rs` | Color/math utilities |
| `FFT.pas` | `wasm/src/math/fft.rs` | Fourier transform |
| `OTrapDEcalc.pas` | `wasm/src/formulas/otrap.rs` | Orbit trap DE |
| `calcBlocky.pas` | `wasm/src/engine/calc_blocky.rs` | Block-based progressive render |
| `CalcMissed.pas` | `wasm/src/engine/calc_missed.rs` | Fill missed pixels |
| `LinarBitmap.pas` | `wasm/src/engine/bitmap.rs` | Pixel buffer management |

### 2.2 Data Types → Shared Rust/TypeScript (`web/src/core/types/`)

| Delphi Source | Web Module | Notes |
|---|---|---|
| `TypeDefinitions.pas` → `TMandHeader10` | `types/header.ts` + `wasm/src/engine/types.rs` | Mirrored in both TS (for UI) and Rust (for compute) |
| `TypeDefinitions.pas` → `TsiLight5` | `wasm/src/engine/types.rs` | G-buffer pixel — Rust only |
| `TypeDefinitions.pas` → `TMCTparameter` | `wasm/src/engine/types.rs` | Thread params — Rust only |
| `TypeDefinitions.pas` → `TLightingParas9` | `types/lighting.ts` + Rust | Both sides need this |
| `TypeDefinitions.pas` → `TIteration3Dext` | `wasm/src/formulas/types.rs` | Iteration state — Rust only |

### 2.3 UI → HTML5 Web Components (`web/src/components/`)

| Delphi Form (DFM/PAS) | Web Component | Description |
|---|---|---|
| `Mand.dfm/pas` | `<mb3d-app>` | Root shell, layout, menus, toolbar |
| `Mand.dfm` image panel | `<mb3d-viewer>` | Canvas-based image display with zoom/pan |
| `Navigator.dfm/pas` | `<mb3d-navigator>` | Real-time fly-through with pointer lock |
| `formula/FormulaGUI.dfm/pas` | `<mb3d-formula-panel>` | Formula selection & 6-slot hybrid config |
| `formula/JITFormulaEditGUI.dfm/pas` | `<mb3d-formula-editor>` | Formula code editor (Monaco?) |
| `formula/ParamValueEditGUI.dfm/pas` | `<mb3d-param-editor>` | Formula parameter sliders |
| `LightAdjust.dfm/pas` | `<mb3d-light-editor>` | 6-light config panel |
| `ColorPick.dfm/pas` | `<mb3d-color-picker>` | Gradient palette editor |
| `ColorOptionForm.dfm/pas` | `<mb3d-color-options>` | Color mapping options |
| `Animation.dfm/pas` | `<mb3d-animation>` | Keyframe timeline |
| `AniPreviewWindow.dfm/pas` | `<mb3d-animation-preview>` | Animation playback |
| `AniProcess.dfm/pas` | `<mb3d-animation-progress>` | Render progress overlay |
| `MonteCarloForm.dfm/pas` | `<mb3d-montecarlo>` | MC renderer controls |
| `PostProcessForm.dfm/pas` | `<mb3d-postprocess>` | DOF, SSAO, tone mapping |
| `BatchForm.dfm/pas` | `<mb3d-batch>` | Batch render queue |
| `Tiling.dfm/pas` | `<mb3d-tiling>` | Tiled big render config |
| `VoxelExport.dfm/pas` | `<mb3d-export-voxel>` | Voxel export dialog |
| `bulbtracer2/BulbTracer2UI.dfm/pas` | `<mb3d-export-mesh>` | Mesh export (OBJ/PLY/glTF) |
| `opengl/MeshPreviewUI.dfm/pas` | `<mb3d-mesh-preview>` | WebGL mesh viewer |
| `TextBox.dfm/pas` | `<mb3d-textbox>` | Info dialog |
| `BRInfoWindow.dfm/pas` | `<mb3d-render-info>` | Big render progress |
| `uMapCalcWindow.dfm/pas` | `<mb3d-map-calc>` | Map calc progress |
| `maps/MapSequencesGUI.dfm/pas` | `<mb3d-map-sequences>` | Map management |
| `script/ScriptUI.dfm/pas` | `<mb3d-script-editor>` | Script editor |
| `mutagen/MutaGenGUI.dfm/pas` | `<mb3d-mutagen>` | Parameter mutation |
| `heightmapgen/HeightMapGenUI.dfm/pas` | `<mb3d-heightmap>` | Height map generation |
| `zbuf16bit/ZBuf16BitGenUI.dfm/pas` | `<mb3d-zbuf-export>` | 16-bit depth export |
| `prefs/IniDirsForm.dfm/pas` | `<mb3d-preferences>` | Settings dialog |
| `prefs/VisualThemesGUI.dfm/pas` | `<mb3d-themes>` | Theme selector |
| `FormulaParser.dfm/pas` | `<mb3d-formula-text>` | Formula text editor |

### 2.4 Orchestration / Glue → TypeScript (`web/src/core/`)

| Delphi Source | Web Module | Notes |
|---|---|---|
| `FileHandling.pas` | `core/io/file_handling.ts` | File API / IndexedDB serialization |
| `HeaderTrafos.pas` | `core/engine/header_trafos.ts` | Header transforms, MCTparas builder |
| `Undo.pas` | `core/engine/undo.ts` | Undo stack for parameters |
| `Monitor.pas` | `core/engine/monitor.ts` | Thread progress tracking |
| `ThreadUtils.pas` | `core/engine/worker_pool.ts` | Web Worker pool management |
| `Spin.pas` | Built-in `<input type="range">` | Spin control → slider |
| `TrackBarEx.pas` | Built-in `<input type="range">` | Trackbar → slider |
| `ListBoxEx.pas` | `<select>` or custom | List box |
| `SpeedButtonEx.pas` | `<button>` | Toolbar button |
| `M3DfractalClass.pas` | `core/engine/fractal_class.ts` | Top-level fractal object coordinator |
| `M3Iregister.pas` | `core/io/m3i_register.ts` | M3I file format registration |
| `RegisterM3Pgraphic.pas` | `core/io/m3p_register.ts` | M3P graphic format registration |
| `Streams.pas`, `BufStream.pas`, `MemStream.pas`, `DelphiStream.pas` | `core/io/streams.ts` | Binary reader/writer on ArrayBuffer |
| `Adler32.pas`, `CRC32Stream.pas`, `Deflate.pas`, `Huffman.pas`, `BitStream.pas` | Use browser `CompressionStream` | Built-in zlib |
| `GifImage.pas`, `pngimage.pas` | Canvas `.toBlob()` | Browser-native image codecs |
| `FTGifAnimate.pas` | `core/io/gif_encoder.ts` | GIF animation (use gif.js library) |
| `DoubleSize.pas` | `core/engine/double_size.ts` | Image resampling |
| `formula/FormulaNames.pas` | `core/formulas/formula_names.ts` | Name registry |
| `formula/FormulaCompiler.pas` | `core/formulas/formula_compiler.ts` | Formula → WASM compiler |
| `formula/JITFormulas.pas` | `core/formulas/jit_formulas.ts` | JIT runtime (compile to WASM) |
| `maps/Maps.pas`, `maps/MapSequences.pas` | `core/engine/maps.ts` | Texture/lightmap management |
| `script/ScriptCompiler.pas`, `script/CompilerUtil.pas` | `core/engine/script.ts` | Script engine |
| `mutagen/MutaGen.pas` | `core/engine/mutagen.ts` | Parameter mutation |
| `facade/MB3DFacade.pas` | `core/engine/facade.ts` | Public API facade |
| `render/PreviewRenderer.pas` | `core/engine/preview_renderer.ts` | Progressive preview |
| `bulbtracer2/*.pas` | `core/export/mesh_*.ts` | Mesh generation/export |
| `opengl/*.pas` | Use Three.js/WebGL | Mesh preview |
| `heightmapgen/*.pas` | `core/export/heightmap.ts` | Height map generator |
| `zbuf16bit/*.pas` | `core/export/zbuf16.ts` | Z-buffer export |
| `prefs/*.pas` | `core/engine/prefs.ts` | localStorage preferences |
| `PNGLoader.pas` | Browser `<img>` / `createImageBitmap` | Native |

---

## 3. Phased Implementation Plan

### Phase 0: Foundation (Weeks 1–3)

**Goal:** Project scaffolding, build toolchain, core types, and a "hello world" WASM render.

| Task | Deliverable |
|---|---|
| Initialize `web/` as npm workspace with TypeScript | `package.json`, `tsconfig.json` |
| Set up Rust/WASM toolchain with `wasm-pack` | `web/src/wasm/Cargo.toml` |
| Configure build: Vite + `vite-plugin-wasm` | `vite.config.ts` |
| Port `TypeDefinitions.pas` core structs to Rust | `wasm/src/engine/types.rs` |
| Port `TypeDefinitions.pas` header to TypeScript | `core/types/header.ts` |
| Port `Math3D.pas` vector/matrix ops to Rust with WASM SIMD | `wasm/src/math/math3d.rs` |
| Create `<mb3d-app>` shell component | Basic layout renders |
| Create `<mb3d-viewer>` with `<canvas>` | Canvas displays test image |
| Build Worker pool manager | `core/engine/worker_pool.ts` |
| Wire WASM → Worker → Canvas pipeline | A pixel buffer flows end-to-end |
| Unit tests for Math3D (Rust) vs known-good Delphi outputs | Numerical parity validated |

### Phase 1: Core Ray Marcher (Weeks 4–8)

**Goal:** A single formula (Mandelbulb power-8) renders correctly in the browser.

| Task | Deliverable |
|---|---|
| Port `Calc.pas` — `CalcDE`, step logic, DE dispatch | `wasm/src/engine/raymarcher.rs` |
| Port `CalcThread.pas` — per-scanline march | `wasm/src/engine/calc_thread.rs` |
| Port `formulas.pas` — `HybridIteration8` (power-8 Mandelbulb) | `wasm/src/formulas/builtin.rs` |
| Port `FormulaClass.pas` — formula abstraction | `wasm/src/formulas/formula_class.rs` |
| Port `HeaderTrafos.pas` — `getMCTparasFromHeader` | `core/engine/header_trafos.ts` (or Rust) |
| Port `Paint.pas` — basic Phong shading (1 light) | `wasm/src/lighting/paint.rs` |
| Port `ColorMapper.pas` — gradient lookup | `wasm/src/lighting/color_mapper.rs` |
| Port `ImageProcess.pas` — normals from Z-buffer | `wasm/src/engine/image_process.rs` |
| Implement `<mb3d-controls>` — resolution, zoom, position | Basic parameter editing |
| Implement `FileHandling.pas` — load `.m3p` from drag-drop | `core/io/file_handling.ts` |
| **Milestone: Open an existing .m3p → see correct render** | Screenshot comparison |

### Phase 2: Formula System (Weeks 9–13)

**Goal:** Full formula library, hybrid modes, and custom formula support.

| Task | Deliverable |
|---|---|
| Port all ~20 built-in formulas from `formulas.pas` | `wasm/src/formulas/builtin.rs` (each fn) |
| Port hybrid dispatch modes (alternating, interpolated, 4D) | `wasm/src/formulas/hybrid.rs` |
| Port `IFS.pas` — IFS primitives | `wasm/src/formulas/ifs.rs` |
| Port `OTrapDEcalc.pas` — orbit trap DE | `wasm/src/formulas/otrap.rs` |
| Build formula registry & name mapping | `core/formulas/formula_names.ts` |
| Design custom formula DSL (replacing x86 .m3f plugins) | Spec document |
| Build formula compiler: DSL → Rust → WASM (or interpret) | `core/formulas/formula_compiler.ts` |
| Implement `<mb3d-formula-panel>` — 6-slot hybrid selector | Web component |
| Implement `<mb3d-formula-editor>` — code editor | Monaco-based editor |
| Implement `<mb3d-param-editor>` — formula params | Slider/input panel |
| Parse `.m3f` format metadata (names, options, descriptions) | Load `.m3f` option info (not x86 code) |

### Phase 3: Lighting & Color (Weeks 14–17)

**Goal:** Full 6-light system, color palette, and painting pipeline.

| Task | Deliverable |
|---|---|
| Port `Paint.pas` — full 6-light Phong/specular shading | Complete `paint.rs` |
| Port `LightAdjust.pas` lighting parameter model | `core/types/lighting.ts` |
| Port `CalcHardShadow.pas` — hard shadow rays | `wasm/src/engine/hard_shadow.rs` |
| Port `CalcAmbShadowDE.pas` — DE-based AO | `wasm/src/engine/ambient_occlusion.rs` |
| Port `AmbShadowCalcThreadN.pas` — threaded AO | `wasm/src/engine/ao_thread.rs` |
| Port `ColorSSAO.pas` — SSAO | `wasm/src/engine/ssao.rs` |
| Port `ColorMapper.pas` — full gradient system | `wasm/src/lighting/color_mapper.rs` |
| Port `DOF.pas` — depth of field | `wasm/src/engine/dof.rs` |
| Implement `<mb3d-light-editor>` — 6 lights UI | Web component |
| Implement `<mb3d-color-picker>` — gradient editor | Web component |
| Implement `<mb3d-color-options>` — color mapping | Web component |
| Implement `<mb3d-postprocess>` — DOF/SSAO controls | Web component |
| **Milestone: Full-quality still render matches Delphi** | Pixel-level comparison |

### Phase 4: Navigation & Interactivity (Weeks 18–21)

**Goal:** Real-time fly-through navigator and progressive rendering.

| Task | Deliverable |
|---|---|
| Port `NaviCalcThread.pas` — low-res progressive render | `wasm/src/engine/navi_thread.rs` |
| Port `Navigator.pas` — mouse/keyboard navigation logic | `<mb3d-navigator>` |
| Implement Pointer Lock API for FPS-style navigation | Mouse capture |
| Port `calcBlocky.pas` — progressive block render | `wasm/src/engine/calc_blocky.rs` |
| Port `CalcMissed.pas` — fill missing pixels | `wasm/src/engine/calc_missed.rs` |
| Port `render/PreviewRenderer.pas` — preview pipeline | `core/engine/preview_renderer.ts` |
| Implement progressive refinement (blocky → full) | Visual feedback during render |
| Port `Undo.pas` — navigation undo stack | `core/engine/undo.ts` |
| Keyboard shortcut system (matching original where sensible) | Event handlers |

### Phase 5: Monte Carlo & Advanced Rendering (Weeks 22–26)

**Goal:** Full Monte Carlo path tracer and advanced features.

| Task | Deliverable |
|---|---|
| Port `CalcMonteCarlo.pas` — path tracer | `wasm/src/engine/monte_carlo.rs` |
| Port Halton sequence generator | `wasm/src/math/halton.rs` |
| Port `CalcSR.pas` — reflection/refraction | `wasm/src/engine/reflections.rs` |
| Port `FFT.pas` — Fourier transform | `wasm/src/math/fft.rs` |
| Implement `<mb3d-montecarlo>` — MC controls | Web component |
| Port `Tiling.pas` — tiled big render | `core/engine/tiling.ts` |
| Implement `<mb3d-tiling>` — tile config | Web component |

### Phase 6: Animation System (Weeks 27–30)

**Goal:** Keyframe animation with preview and render.

| Task | Deliverable |
|---|---|
| Port `Interpolation.pas` — quaternion SLERP keyframes | `wasm/src/math/interpolation.rs` |
| Port `Animation.pas` — keyframe management | `core/engine/animation.ts` |
| Port `AniProcess.pas` — animation render pipeline | `core/engine/animation_render.ts` |
| Port `AniPreviewWindow.pas` — playback | `<mb3d-animation-preview>` |
| Implement `<mb3d-animation>` — timeline UI | Web component |
| Video export via `MediaRecorder` API or ffmpeg.wasm | Browser-native video |

### Phase 7: Export & Interop (Weeks 31–34)

**Goal:** File I/O, mesh export, and parameter compatibility.

| Task | Deliverable |
|---|---|
| Full `.m3p` / `.m3i` file parser (load & save) | `core/io/file_handling.ts` |
| Port header version converters (v4→10) | `core/io/header_convert.ts` |
| Port `bulbtracer2/*.pas` — marching cubes mesh | `core/export/mesh_scanner.ts` + Rust |
| Mesh export: OBJ, PLY, glTF | `core/export/mesh_writer.ts` |
| Port `VoxelExport.pas` — voxel slice export | `core/export/voxel.ts` |
| Port height map generator | `core/export/heightmap.ts` |
| Port Z-buffer 16-bit export | `core/export/zbuf16.ts` |
| Image export: PNG, JPEG, BMP via Canvas API | Browser-native |
| GIF animation export via gif.js | `core/io/gif_encoder.ts` |
| Clipboard parameter text copy/paste | `core/io/clipboard.ts` |
| IndexedDB-based parameter library | `core/io/param_library.ts` |

### Phase 8: Polish & Parity (Weeks 35–40)

**Goal:** Feature parity, script system, mutagen, and final UX.

| Task | Deliverable |
|---|---|
| Port `script/ScriptCompiler.pas` — script engine | `core/engine/script.ts` |
| Implement `<mb3d-script-editor>` — script UI | Web component |
| Port `mutagen/MutaGen.pas` — parameter mutation | `core/engine/mutagen.ts` |
| Implement `<mb3d-mutagen>` — mutation grid UI | Web component |
| Port batch rendering | `<mb3d-batch>` component |
| Port map/texture sequence system | `core/engine/maps.ts` |
| Implement `<mb3d-preferences>` and `<mb3d-themes>` | Web components |
| Responsive layout / mobile touch support | CSS / touch events |
| Accessibility audit (ARIA, keyboard nav) | Compliant UI |
| Performance profiling and optimization | Benchmarks |
| Comprehensive test suite | Jest + wasm-pack test |

---

## 4. Technical Deep Dives

### 4.1 Rust/WASM Computation Engine

#### Crate Structure

```
web/src/wasm/
├── Cargo.toml
├── src/
│   ├── lib.rs              # wasm-bindgen entry points
│   ├── engine/
│   │   ├── mod.rs
│   │   ├── types.rs        # TMandHeader10, TMCTparameter, TsiLight5
│   │   ├── raymarcher.rs   # CalcDE, step logic, surface detection
│   │   ├── calc_thread.rs  # Per-scanline march (called from Worker)
│   │   ├── hard_shadow.rs  # Shadow rays
│   │   ├── ambient_occlusion.rs
│   │   ├── reflections.rs  # Reflection/refraction rays
│   │   ├── monte_carlo.rs  # Path tracer
│   │   ├── dof.rs          # Depth-of-field
│   │   ├── ssao.rs         # Screen-space AO
│   │   ├── image_process.rs
│   │   ├── bitmap.rs       # Pixel buffer
│   │   ├── calc_blocky.rs  # Progressive block render
│   │   └── calc_missed.rs
│   ├── math/
│   │   ├── mod.rs
│   │   ├── math3d.rs       # Vec3D, Matrix3, Quaternion + SIMD
│   │   ├── utils.rs        # clamping, trig, fast approx
│   │   ├── interpolation.rs
│   │   ├── fft.rs
│   │   ├── halton.rs       # Quasi-random sequences
│   │   └── div_utils.rs
│   ├── formulas/
│   │   ├── mod.rs
│   │   ├── types.rs        # TIteration3Dext
│   │   ├── builtin.rs      # All built-in fractal formulas
│   │   ├── hybrid.rs       # Hybrid dispatch modes
│   │   ├── ifs.rs           # IFS primitives
│   │   ├── otrap.rs        # Orbit trap
│   │   ├── formula_class.rs
│   │   └── custom.rs       # Custom formula interpreter
│   └── lighting/
│       ├── mod.rs
│       ├── paint.rs        # G-buffer → RGB shading
│       ├── paint_thread.rs # Parallel painting
│       └── color_mapper.rs # Gradient lookup
```

#### Key Rust Patterns

```rust
// Cargo.toml
[package]
name = "mb3d-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }

[profile.release]
opt-level = 3
lto = true
codegen-units = 1

// Example: math3d.rs with WASM SIMD
use std::arch::wasm32::*;

#[repr(C, align(16))]
pub struct Vec3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3D {
    #[inline(always)]
    pub fn dot(&self, other: &Vec3D) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    #[inline(always)]
    pub fn normalize(&mut self) {
        let len = (self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if len > 1e-30 {
            let inv = 1.0 / len;
            self.x *= inv;
            self.y *= inv;
            self.z *= inv;
        }
    }
}

// Example: raymarcher.rs
#[wasm_bindgen]
pub fn render_scanlines(
    params_ptr: *const u8,     // Serialized TMCTparameter
    gbuffer_ptr: *mut u8,      // Output TsiLight5 array
    y_start: u32,
    y_step: u32,
    height: u32,
    width: u32,
) {
    // Deserialize params, march rays, write G-buffer
}
```

#### WASM SIMD Strategy

The original Delphi code uses **SSE2 inline assembly** for double-precision SIMD. WASM SIMD has `v128` which supports `f64x2` operations — a direct match for SSE2 `movapd`/`mulpd`/`addpd`:

| x86 SSE2 | WASM SIMD | Rust intrinsic |
|---|---|---|
| `movapd xmm0, [addr]` | `v128.load` | `v128_load(ptr)` |
| `mulpd xmm0, xmm1` | `f64x2.mul` | `f64x2_mul(a, b)` |
| `addpd xmm0, xmm1` | `f64x2.add` | `f64x2_add(a, b)` |
| `subpd xmm0, xmm1` | `f64x2.sub` | `f64x2_sub(a, b)` |
| `sqrtpd xmm0, xmm1` | `f64x2.sqrt` | `f64x2_sqrt(a)` |
| `maxpd xmm0, xmm1` | `f64x2.max` | `f64x2_max(a, b)` |
| `shufpd` | `i64x2.shuffle` | `i64x2_shuffle::<L, R>(a, b)` |

Each SSE2 assembly block in `formulas.pas` can be mechanically translated to equivalent WASM SIMD intrinsics via Rust's `std::arch::wasm32`.

### 4.2 Threading Model: Web Workers + SharedArrayBuffer

```
Main Thread                 Worker 0           Worker 1          Worker N-1
    │                          │                  │                  │
    │── spawn workers ────────►│                  │                  │
    │── load WASM ────────────►│ (each loads .wasm)                  │
    │                          │                  │                  │
    │── postMessage ──────────►│                  │                  │
    │   { cmd: 'render',       │                  │                  │
    │     params: SharedAB,    │                  │                  │
    │     gbuffer: SharedAB,   │                  │                  │
    │     workerId: 0,         │                  │                  │
    │     workerCount: N }     │                  │                  │
    │                          │                  │                  │
    │   (same to all workers)  │                  │                  │
    │                          │                  │                  │
    │                    ┌─────┴─────┐      ┌─────┴─────┐           │
    │                    │ March rows│      │ March rows│           │
    │                    │ 0, N, 2N..│      │ 1,N+1,..  │           │
    │                    │ → gbuffer │      │ → gbuffer │           │
    │                    └─────┬─────┘      └─────┬─────┘           │
    │                          │                  │                  │
    │◄── postMessage('done') ──┤                  │                  │
    │◄── postMessage('done') ──┼──────────────────┤                  │
    │                          │                  │                  │
    │── read gbuffer from SharedArrayBuffer ──────────────────────── │
    │── paint to canvas ──────────────────────────────────────────── │
```

**Key requirements:**
- `Cross-Origin-Isolation` headers (`COOP` + `COEP`) for `SharedArrayBuffer`
- Each Worker loads its own WASM instance (shared Memory is the `SharedArrayBuffer`)
- Progress reporting via `Atomics.store` / `Atomics.load` on a shared progress array
- Cancellation via an `Atomics`-based flag (replaces Delphi's `MCalcStop: LongBool`)

```typescript
// worker_pool.ts
export class WorkerPool {
  private workers: Worker[] = [];
  private sharedParams: SharedArrayBuffer;
  private sharedGBuffer: SharedArrayBuffer;
  private progressArray: Int32Array;

  constructor(private workerCount: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < this.workerCount; i++) {
      this.workers.push(new Worker(
        new URL('../workers/calc-worker.ts', import.meta.url),
        { type: 'module' }
      ));
    }
  }

  async render(header: MandHeader, width: number, height: number): Promise<ImageData> {
    const gbufferSize = width * height * 18; // TsiLight5 = 18 bytes
    this.sharedGBuffer = new SharedArrayBuffer(gbufferSize);

    const cancelFlag = new SharedArrayBuffer(4);
    const cancelView = new Int32Array(cancelFlag);
    Atomics.store(cancelView, 0, 0);

    const promises = this.workers.map((worker, i) =>
      new Promise<void>(resolve => {
        worker.onmessage = () => resolve();
        worker.postMessage({
          cmd: 'render',
          gbuffer: this.sharedGBuffer,
          workerId: i,
          workerCount: this.workerCount,
          cancelFlag,
          width, height,
          // ... serialized params
        });
      })
    );

    await Promise.all(promises);
    return this.paintGBuffer(this.sharedGBuffer, width, height);
  }

  cancel() {
    Atomics.store(new Int32Array(this.cancelFlag), 0, 1);
  }
}
```

### 4.3 Web Component Architecture

All components use **vanilla Web Components** (no framework dependency):

```typescript
// components/viewer/mb3d-viewer.ts
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; position: relative; overflow: hidden; }
    canvas { width: 100%; height: 100%; image-rendering: pixelated; }
    .overlay { position: absolute; top: 8px; right: 8px; }
  </style>
  <canvas></canvas>
  <div class="overlay">
    <slot name="controls"></slot>
  </div>
`;

export class MB3DViewer extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;

  static get observedAttributes() {
    return ['width', 'height', 'zoom'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
  }

  connectedCallback() {
    this.resizeCanvas();
    new ResizeObserver(() => this.resizeCanvas()).observe(this);
  }

  attributeChangedCallback(name: string, _old: string, val: string) {
    if (name === 'width' || name === 'height') this.resizeCanvas();
  }

  displayImage(imageData: ImageData) {
    this.imageData = imageData;
    this.ctx.putImageData(imageData, 0, 0);
    this.dispatchEvent(new CustomEvent('frame-rendered'));
  }

  private resizeCanvas() {
    const w = parseInt(this.getAttribute('width') || '800');
    const h = parseInt(this.getAttribute('height') || '600');
    this.canvas.width = w;
    this.canvas.height = h;
  }
}

customElements.define('mb3d-viewer', MB3DViewer);
```

**State management** uses a simple event bus (no Redux/MobX needed):

```typescript
// core/engine/state.ts
export class MB3DState extends EventTarget {
  private _header: MandHeader;

  get header() { return this._header; }
  set header(h: MandHeader) {
    this._header = h;
    this.dispatchEvent(new CustomEvent('header-changed', { detail: h }));
  }
}
```

Components subscribe to state changes and re-render their Shadow DOM locally.

### 4.4 Custom Formula Strategy

The Delphi app loads `.m3f` files containing **raw x86 machine code** — this is fundamentally incompatible with the browser. Three replacement strategies:

| Strategy | Effort | Performance | Compatibility |
|---|---|---|---|
| **A. Pre-port all 320 formulas to Rust** | Very High | Native WASM speed | Full (but frozen set) |
| **B. Formula DSL → WASM compile** | High | Near-native | New formulas supported |
| **C. Interpreter in Rust** | Medium | 5–10× slower | Any formula if parseable |

**Recommended: Hybrid A + B**
1. Pre-port the **~20 built-in formulas** and the **most popular ~50 custom formulas** to Rust (Phase 1–2).
2. Build a **formula DSL** (similar to the existing JIT formula language) that compiles to Rust source → WASM via a server-side compilation service or a WASM-based compiler (Phase 2–3).
3. Parse `.m3f` metadata (names, options, descriptions) for UI compatibility — just skip the x86 code.
4. Long-term: evaluate compiling the DSL to WASM directly using Cranelift or a custom backend.

### 4.5 File Format Compatibility

`.m3p` and `.m3i` files use **packed binary records** with Delphi-specific layout. The strategy:

1. **Write a binary parser in TypeScript** using `DataView` over `ArrayBuffer`:
   - Little-endian throughout (matches Delphi x86)
   - Handle all header versions (v4→10) with converter chain
   - Field offsets derived from Delphi `packed record` layout

2. **Serialize header → Rust** for computation via a flat `ArrayBuffer` shared between TS and WASM.

3. **Text parameter format** (clipboard): Parse/generate the same text format for parameter exchange with the desktop version.

```typescript
// core/io/file_handling.ts
export function loadM3P(buffer: ArrayBuffer): MandHeader {
  const view = new DataView(buffer);
  let offset = 0;

  const header: Partial<MandHeader> = {};
  header.Width = view.getInt32(offset, true); offset += 4;
  header.Height = view.getInt32(offset, true); offset += 4;
  header.Iterations = view.getInt32(offset, true); offset += 4;
  // ... continue for all ~840 bytes of TMandHeader10
  // Handle version detection and conversion

  return header as MandHeader;
}
```

---

## 5. Performance Optimization Strategies

### 5.1 WASM-Specific

| Technique | Impact | How |
|---|---|---|
| **WASM SIMD** | 2× on math-heavy loops | `std::arch::wasm32::*` intrinsics for `f64x2` |
| **Memory pre-allocation** | Avoid GC pauses | Single large WASM linear memory, manual bump allocator |
| **Inlining** | Critical for formulas | `#[inline(always)]` on hot functions |
| **LTO** | 10–20% overall | `lto = true` in Cargo release profile |
| **`codegen-units = 1`** | Better optimization | Single codegen unit |
| **`opt-level = 3`** | Maximum optimization | Release profile |
| **Branch-free code** | Avoid mispredicts | `select` patterns, `min`/`max` instead of `if` |

### 5.2 Web-Specific

| Technique | Impact | How |
|---|---|---|
| **Web Workers** | Near-linear scaling | N workers × interleaved scanlines |
| **SharedArrayBuffer** | Zero-copy sharing | G-buffer shared between workers and main thread |
| **OffscreenCanvas** | Non-blocking paint | Paint in worker, transfer bitmap |
| **`requestIdleCallback`** | Smooth UI | Low-priority progressive refinement |
| **`createImageBitmap`** | Fast texture upload | For lightmap loading |
| **Streaming compilation** | Fast startup | `WebAssembly.compileStreaming()` |
| **Module caching** | Instant reload | Cache compiled WASM in `Cache` API |

### 5.3 Progressive Rendering

Match the Delphi app's UX of showing results quickly:

1. **Block pass**: 8×8 blocks, 1 ray each → instant preview (0.5s)
2. **Coarse pass**: Every 4th pixel → fills in (1–2s)
3. **Full pass**: Every pixel → final quality (5–30s)
4. **Post-processing**: Shadows, AO, DOF applied incrementally
5. **Monte Carlo**: Continuous accumulation with realtime display

---

## 6. Build & Development Toolchain

```
web/
├── package.json            # npm workspace, scripts
├── tsconfig.json           # TypeScript strict mode
├── vite.config.ts          # Dev server + WASM plugin
├── index.html              # Entry point
├── src/
│   ├── main.ts             # Bootstrap, register components
│   ├── components/         # Web Components (TS)
│   ├── core/               # Business logic (TS)
│   ├── workers/            # Web Worker entry points
│   └── wasm/
│       ├── Cargo.toml      # Rust crate
│       ├── src/            # Rust source
│       └── pkg/            # wasm-pack output (generated)
├── assets/                 # Static assets
├── workers/                # Worker scripts
├── tests/                  # Test suites
└── docs/                   # Documentation
```

**Build commands:**
```bash
# Development
cd web && npm run dev          # Vite dev server with HMR
cd web/src/wasm && wasm-pack build --target web --dev  # Debug WASM

# Production
cd web/src/wasm && wasm-pack build --target web --release  # Optimized WASM
cd web && npm run build        # Vite production build

# Testing
cd web/src/wasm && cargo test                    # Rust unit tests
cd web && npm test                                # TS + integration tests
cd web/src/wasm && wasm-pack test --headless --chrome  # WASM in browser
```

**Required headers** (for SharedArrayBuffer):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## 7. Risk Assessment & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Performance gap vs native** | High | WASM SIMD closes most of the gap; Workers provide parallelism; accept 2–3× slower as baseline |
| **320 custom formulas need porting** | High | Prioritize top 50 by usage; build DSL compiler for the rest; accept some won't port initially |
| **x86 ASM blocks hard to translate** | Medium | Systematic approach: each SSE2 instruction maps 1:1 to WASM SIMD; mechanical translation |
| **SharedArrayBuffer requires COOP/COEP** | Medium | Configure server headers; provide degraded single-threaded fallback |
| **Binary file format compatibility** | Medium | Exhaustive tests with suite of .m3p/.m3i files from M3Parameter/ |
| **Numerical precision differences** | Medium | Test against known-good renders; Rust f64 matches Delphi Double exactly |
| **Large WASM binary size** | Low | Tree-shaking, LTO, gzip (typically 500KB–1MB compressed) |
| **Browser memory limits** | Low | 4GB WASM memory limit; stream large renders as tiles |
| **Formula JIT security** | Low | DSL is sandboxed; no arbitrary code execution |

---

## 8. Testing Strategy

### 8.1 Numerical Parity Tests

Generate reference data from the Delphi app for automated comparison:

1. **Vector/matrix ops**: Input/output pairs from `Math3D.pas` → validate Rust `math3d.rs`
2. **Formula outputs**: Known iteration sequences for each formula → validate `builtin.rs`
3. **DE values**: Known distance estimates at specific points → validate `raymarcher.rs`
4. **Pixel colors**: Reference render of test parameters → pixel-level comparison

### 8.2 Visual Regression Tests

1. Render each `.m3p` file from `M3Parameter/` at 320×240
2. Compare against reference images (SSIM > 0.99)
3. Run as CI step

### 8.3 Performance Benchmarks

1. Time-to-first-pixel for standard test scenes
2. Full render time at 1920×1080
3. Navigator FPS at 320×240
4. Memory usage under load
5. Worker scaling efficiency (1, 2, 4, 8 threads)

---

## 9. File Tree Summary

```
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── PORTING_STRATEGY.md           ← This document
│
├── src/
│   ├── main.ts                   # Entry: register all components
│   │
│   ├── components/
│   │   ├── app/
│   │   │   └── mb3d-app.ts       # Root shell
│   │   ├── viewer/
│   │   │   └── mb3d-viewer.ts    # Canvas display
│   │   ├── navigator/
│   │   │   └── mb3d-navigator.ts # Fly-through
│   │   ├── controls/
│   │   │   └── mb3d-controls.ts  # Parameters panel
│   │   ├── formulas/
│   │   │   ├── mb3d-formula-panel.ts
│   │   │   ├── mb3d-formula-editor.ts
│   │   │   └── mb3d-param-editor.ts
│   │   ├── lighting/
│   │   │   └── mb3d-light-editor.ts
│   │   ├── color/
│   │   │   ├── mb3d-color-picker.ts
│   │   │   └── mb3d-color-options.ts
│   │   ├── animation/
│   │   │   ├── mb3d-animation.ts
│   │   │   └── mb3d-animation-preview.ts
│   │   ├── postprocess/
│   │   │   └── mb3d-postprocess.ts
│   │   ├── montecarlo/
│   │   │   └── mb3d-montecarlo.ts
│   │   ├── batch/
│   │   │   └── mb3d-batch.ts
│   │   └── export/
│   │       ├── mb3d-export-mesh.ts
│   │       ├── mb3d-export-voxel.ts
│   │       ├── mb3d-heightmap.ts
│   │       └── mb3d-zbuf-export.ts
│   │
│   ├── core/
│   │   ├── engine/
│   │   │   ├── state.ts          # Centralized state + events
│   │   │   ├── worker_pool.ts    # Web Worker management
│   │   │   ├── header_trafos.ts  # Parameter transforms
│   │   │   ├── facade.ts         # Public API
│   │   │   ├── preview_renderer.ts
│   │   │   ├── undo.ts
│   │   │   ├── monitor.ts
│   │   │   ├── tiling.ts
│   │   │   ├── animation.ts
│   │   │   ├── animation_render.ts
│   │   │   ├── maps.ts
│   │   │   ├── script.ts
│   │   │   ├── mutagen.ts
│   │   │   └── prefs.ts
│   │   ├── types/
│   │   │   ├── header.ts         # TMandHeader10 in TS
│   │   │   ├── lighting.ts       # TLightingParas9 in TS
│   │   │   └── formulas.ts       # Formula metadata
│   │   ├── formulas/
│   │   │   ├── formula_names.ts
│   │   │   ├── formula_compiler.ts
│   │   │   └── jit_formulas.ts
│   │   ├── io/
│   │   │   ├── file_handling.ts  # .m3p/.m3i parser
│   │   │   ├── streams.ts       # Binary ArrayBuffer reader/writer
│   │   │   ├── header_convert.ts
│   │   │   ├── clipboard.ts
│   │   │   ├── param_library.ts  # IndexedDB store
│   │   │   ├── gif_encoder.ts
│   │   │   ├── m3i_register.ts
│   │   │   └── m3p_register.ts
│   │   └── export/
│   │       ├── mesh_scanner.ts
│   │       ├── mesh_writer.ts
│   │       ├── voxel.ts
│   │       ├── heightmap.ts
│   │       └── zbuf16.ts
│   │
│   ├── workers/
│   │   ├── calc-worker.ts       # Main render worker
│   │   ├── paint-worker.ts      # G-buffer → RGB worker
│   │   └── mc-worker.ts         # Monte Carlo worker
│   │
│   └── wasm/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── engine/
│           │   ├── mod.rs
│           │   ├── types.rs
│           │   ├── raymarcher.rs
│           │   ├── calc_thread.rs
│           │   ├── hard_shadow.rs
│           │   ├── ambient_occlusion.rs
│           │   ├── ao_thread.rs
│           │   ├── reflections.rs
│           │   ├── monte_carlo.rs
│           │   ├── dof.rs
│           │   ├── ssao.rs
│           │   ├── image_process.rs
│           │   ├── bitmap.rs
│           │   ├── calc_blocky.rs
│           │   ├── calc_missed.rs
│           │   ├── calc_2d.rs
│           │   └── voxel_slice.rs
│           ├── math/
│           │   ├── mod.rs
│           │   ├── math3d.rs
│           │   ├── utils.rs
│           │   ├── interpolation.rs
│           │   ├── fft.rs
│           │   ├── halton.rs
│           │   └── div_utils.rs
│           ├── formulas/
│           │   ├── mod.rs
│           │   ├── types.rs
│           │   ├── builtin.rs
│           │   ├── hybrid.rs
│           │   ├── ifs.rs
│           │   ├── otrap.rs
│           │   ├── formula_class.rs
│           │   └── custom.rs
│           └── lighting/
│               ├── mod.rs
│               ├── paint.rs
│               ├── paint_thread.rs
│               └── color_mapper.rs
│
├── assets/
│   ├── icons/               # Ported from icons/
│   ├── maps/                # Subset of M3Maps/
│   ├── shaders/             # From shaders/ (if WebGL used)
│   └── styles/
│       └── mb3d.css         # Global styles + CSS custom properties
│
├── tests/
│   ├── math3d.test.ts
│   ├── formulas.test.ts
│   ├── file_handling.test.ts
│   ├── visual_regression/
│   └── benchmarks/
│
└── docs/
    ├── architecture.md
    ├── formula-porting-guide.md
    └── component-api.md
```

---

## 10. Quick-Start: Phase 0 Bootstrap Checklist

- [ ] `cd web && npm init -y`
- [ ] Install: `npm i -D typescript vite vite-plugin-wasm vite-plugin-top-level-await`
- [ ] `npx tsc --init --strict --target ES2022 --module ESNext`
- [ ] Install Rust + wasm-pack: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`
- [ ] `cd src/wasm && cargo init --lib`
- [ ] Add `wasm-bindgen` dependency
- [ ] Write `math3d.rs` with `Vec3D`, `Matrix3`, `Quaternion`
- [ ] Write `types.rs` with `MandHeader`, `SiLight5`, `MCTParameter`
- [ ] Write `calc-worker.ts` that loads WASM and awaits messages
- [ ] Write `mb3d-viewer.ts` that creates a canvas
- [ ] Write `mb3d-app.ts` that composes the viewer
- [ ] Write `index.html` with `<mb3d-app>`
- [ ] Build and verify: canvas shows a solid color from WASM
