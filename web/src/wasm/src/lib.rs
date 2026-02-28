use wasm_bindgen::prelude::*;

pub mod engine;
pub mod formulas;
pub mod lighting;
pub mod math;

/// Initialize the WASM module (call once from JS).
#[wasm_bindgen(start)]
pub fn init() {
    // Panic hook for better error messages in the browser console
    // console_error_panic_hook can be added as a feature later
}

/// Render scanlines into a pre-allocated G-buffer.
///
/// Called from each Web Worker with its assigned scanline range.
///
/// `render_params` — Float64Array of render parameters (see RenderParams layout)
/// `formula_ids` — Uint32Array of [num_formulas, id1, iters1, id2, iters2, ..., hybrid_mode]
/// `gbuffer` — Uint8Array view into SharedArrayBuffer (width * height * 18 bytes)
/// `worker_id` / `worker_count` — interleaved scanline assignment
#[wasm_bindgen]
pub fn render_scanlines(
    render_params: &[f64],
    formula_ids: &[u32],
    gbuffer: &mut [u8],
    worker_id: u32,
    worker_count: u32,
) -> u32 {
    // Parse render parameters
    let params = engine::raymarcher::params_from_buffer(render_params);

    // Build formula from IDs
    let formula = build_formula_from_ids(formula_ids, params.max_iterations, params.bailout);

    // Interpret gbuffer as slice of SiLight5 (18 bytes each)
    let pixel_count = (params.width * params.height) as usize;
    let gbuf_pixels = unsafe {
        let ptr = gbuffer.as_mut_ptr() as *mut engine::types::SiLight5;
        std::slice::from_raw_parts_mut(ptr, pixel_count.min(gbuffer.len() / 18))
    };

    // Render assigned scanlines
    engine::raymarcher::render_scanlines(&params, &formula, gbuf_pixels, worker_id, worker_count)
}

/// Paint the G-buffer into an RGBA pixel buffer for display.
///
/// `gbuffer` — Uint8Array: the G-buffer from render_scanlines
/// `rgba_out` — Uint8Array: output RGBA (width * height * 4 bytes)
/// `paint_params` — Float64Array of paint/lighting parameters
#[wasm_bindgen]
pub fn paint_gbuffer(
    gbuffer: &[u8],
    rgba_out: &mut [u8],
    width: u32,
    height: u32,
    paint_params: &[f64],
) {
    let config = lighting::paint::paint_config_from_buffer(paint_params);

    // Interpret gbuffer as SiLight5 slice
    let pixel_count = (width * height) as usize;
    let gbuf_pixels = unsafe {
        let ptr = gbuffer.as_ptr() as *const engine::types::SiLight5;
        std::slice::from_raw_parts(ptr, pixel_count.min(gbuffer.len() / 18))
    };

    lighting::paint::paint_gbuffer(gbuf_pixels, rgba_out, width, height, &config);
}

/// Quick render — combined ray march + paint in one call.
/// Useful for single-threaded preview rendering.
///
/// Returns RGBA bytes directly (width * height * 4).
#[wasm_bindgen]
pub fn render_quick(
    render_params: &[f64],
    formula_ids: &[u32],
    paint_params: &[f64],
    rgba_out: &mut [u8],
) {
    let params = engine::raymarcher::params_from_buffer(render_params);
    let formula = build_formula_from_ids(formula_ids, params.max_iterations, params.bailout);

    let pixel_count = (params.width * params.height) as usize;
    let mut gbuffer = vec![engine::types::SiLight5::default(); pixel_count];

    // Render all scanlines (single worker)
    engine::raymarcher::render_scanlines(&params, &formula, &mut gbuffer, 0, 1);

    // Paint
    let config = lighting::paint::paint_config_from_buffer(paint_params);
    lighting::paint::paint_gbuffer(&gbuffer, rgba_out, params.width, params.height, &config);
}

/// Build a HybridFormula from the formula_ids array.
///
/// Layout: [num_slots, id1, iters1, id2, iters2, ..., hybrid_mode]
/// hybrid_mode: 0 = alternating, 1 = interpolated, 2 = 4D
fn build_formula_from_ids(
    formula_ids: &[u32],
    max_iterations: u32,
    bailout: f64,
) -> formulas::hybrid::HybridFormula {
    use formulas::{FormulaId, hybrid::HybridMode};

    if formula_ids.is_empty() {
        // Default: single Mandelbulb power 8
        return formulas::hybrid::HybridFormula::new(
            &[(FormulaId::MandelbulbPower8, 1)],
            HybridMode::Alternating,
            max_iterations,
            bailout,
        );
    }

    let num_slots = formula_ids[0] as usize;
    let mut slots = Vec::new();

    let mut idx = 1;
    for _ in 0..num_slots.min(6) {
        if idx + 1 >= formula_ids.len() { break; }
        let id = formula_id_from_u32(formula_ids[idx]);
        let iters = formula_ids[idx + 1];
        slots.push((id, iters));
        idx += 2;
    }

    let hybrid_mode = if idx < formula_ids.len() {
        match formula_ids[idx] {
            1 => HybridMode::Interpolated,
            2 => HybridMode::FourD,
            _ => HybridMode::Alternating,
        }
    } else {
        HybridMode::Alternating
    };

    if slots.is_empty() {
        slots.push((FormulaId::MandelbulbPower8, 1));
    }

    formulas::hybrid::HybridFormula::new(&slots, hybrid_mode, max_iterations, bailout)
}

/// Map a u32 formula ID to FormulaId enum.
fn formula_id_from_u32(id: u32) -> formulas::FormulaId {
    match id {
        1 => formulas::FormulaId::MandelbulbPower2,
        2 => formulas::FormulaId::MandelbulbPower8,
        3 => formulas::FormulaId::AmazingBox,
        4 => formulas::FormulaId::AmazingSurf,
        5 => formulas::FormulaId::QuaternionJulia,
        6 => formulas::FormulaId::Tricorn,
        7 => formulas::FormulaId::Bulbox,
        8 => formulas::FormulaId::FoldingIntPow,
        9 => formulas::FormulaId::RealPower,
        10 => formulas::FormulaId::AexionC,
        _ => formulas::FormulaId::None,
    }
}

