/// Core ray marching engine — port of Calc.pas + CalcThread.pas
///
/// Implements sphere-tracing / distance-estimator ray marching with:
/// - Adaptive step regulation (RSFmul) from CalcThread.pas MandCalc
/// - Binary search surface refinement
/// - Per-pixel normal estimation via central differences
/// - Dynamic fog accumulation
/// - Cutting plane support
/// - G-buffer output (SiLight5 packed format)

use crate::engine::types::*;
use crate::math::math3d;
use crate::math::utils;
use crate::formulas::hybrid::HybridFormula;

/// Complete render parameters deserialized from the JS side.
#[derive(Clone)]
pub struct RenderParams {
    /// Image dimensions
    pub width: u32,
    pub height: u32,
    /// Camera position (world space)
    pub camera_pos: Vec3D,
    /// View ray origin offsets (screen-space → world-space mapping)
    /// Computed from FOV and rotation matrix
    pub ray_dir_base: Vec3D,     // center ray direction
    pub ray_dx: Vec3D,           // per-pixel X step in world space
    pub ray_dy: Vec3D,           // per-pixel Y step in world space
    /// Distance estimator threshold
    pub de_stop: f64,
    /// Step width multiplier (quality vs speed tradeoff)
    pub step_width: f64,
    /// Maximum ray travel distance
    pub max_ray_length: f64,
    /// Maximum fractal iterations
    pub max_iterations: u32,
    /// Bailout radius squared
    pub bailout: f64,
    /// FOV factor for distance-dependent DE scaling
    pub fov_factor: f64,
    /// Julia mode
    pub julia: bool,
    pub julia_c: Vec3D,
    /// Cutting plane
    pub cut_enabled: bool,
    pub cut_normal: Vec3D,
    pub cut_d: f64,
    /// Binary search refinement steps
    pub bin_search_steps: u32,
}

impl Default for RenderParams {
    fn default() -> Self {
        Self {
            width: 800,
            height: 600,
            camera_pos: Vec3D { x: 0.0, y: 0.0, z: -2.5 },
            ray_dir_base: Vec3D { x: 0.0, y: 0.0, z: 1.0 },
            ray_dx: Vec3D { x: 1.0 / 400.0, y: 0.0, z: 0.0 },
            ray_dy: Vec3D { x: 0.0, y: 1.0 / 300.0, z: 0.0 },
            de_stop: 0.0005,
            step_width: 0.8,
            max_ray_length: 50.0,
            max_iterations: 12,
            bailout: 16.0,
            fov_factor: 0.0,
            julia: false,
            julia_c: Vec3D::default(),
            cut_enabled: false,
            cut_normal: Vec3D { x: 0.0, y: 1.0, z: 0.0 },
            cut_d: 0.0,
            bin_search_steps: 3,
        }
    }
}

/// Result of a single ray march.
#[derive(Clone, Default)]
pub struct RayMarchResult {
    /// Did the ray hit the surface?
    pub hit: bool,
    /// Total distance traveled along the ray
    pub total_distance: f64,
    /// Surface normal at hit point
    pub normal: Vec3D,
    /// Smooth iteration value for coloring
    pub smooth_iteration: f64,
    /// Orbit trap value
    pub orbit_trap: f64,
    /// Number of ray marching steps taken (for ambient occlusion)
    pub steps: u32,
    /// Dynamic fog accumulation
    pub fog: f64,
    /// Hit position in world space
    pub hit_pos: Vec3D,
}

/// March a single ray using sphere tracing with adaptive step regulation.
///
/// Full port of the MandCalc procedure from CalcThread.pas.
pub fn march_ray(
    origin: &Vec3D,
    direction: &Vec3D,
    params: &RenderParams,
    formula: &HybridFormula,
) -> RayMarchResult {
    let mut result = RayMarchResult::default();
    let mut pos = *origin;
    let mut total_dist = 0.0f64;
    let max_steps = 8000u32;

    // Adaptive step regulation state (port of RSFmul from CalcThread.pas)
    let mut last_de = f64::MAX;
    let mut last_step = 0.0f64;
    let mut rsf_mul = 1.0f64; // Step regulation factor

    // Dynamic fog accumulation
    let mut fog_accum = 0.0f64;

    let julia_c = if params.julia { Some(&params.julia_c) } else { None };

    for step in 0..max_steps {
        // Check cutting plane
        if params.cut_enabled {
            let plane_dist = math3d::vec3d_dot(&pos, &params.cut_normal) - params.cut_d;
            if plane_dist < 0.0 {
                // Behind the cutting plane — skip forward
                let cos_angle = math3d::vec3d_dot(direction, &params.cut_normal);
                if cos_angle.abs() > 1e-10 {
                    let t = -plane_dist / cos_angle;
                    if t > 0.0 {
                        pos.x += direction.x * t;
                        pos.y += direction.y * t;
                        pos.z += direction.z * t;
                        total_dist += t;
                    }
                }
            }
        }

        // Distance-dependent DE threshold (like FOV-scaled DEstop in MB3D)
        let de_threshold = if params.fov_factor > 0.0 {
            params.de_stop * (1.0 + total_dist * params.fov_factor)
        } else {
            params.de_stop
        };

        // Evaluate the distance estimator at current position
        let fr = formula.compute_de(&pos, julia_c);

        let mut de = fr.de;

        // Adaptive step regulation — port from CalcThread.pas MandCalc
        // Prevents overstepping by capping the step based on previous DE estimate
        if step > 0 {
            let max_allowed = last_de + last_step;
            if de > max_allowed {
                de = max_allowed;
                // Reduce the regulation factor when DE jumps
                rsf_mul = (rsf_mul * 0.9).max(0.5);
            } else {
                // Slowly restore regulation factor
                rsf_mul = (rsf_mul * 1.01).min(1.0);
            }
        }

        // Check if we hit the surface
        if de < de_threshold {
            result.hit = true;
            result.total_distance = total_dist;
            result.hit_pos = pos;
            result.smooth_iteration = fr.smooth_it;
            result.orbit_trap = fr.orbit_trap;
            result.steps = step;
            result.fog = fog_accum;

            // Binary search refinement for precise surface location
            if params.bin_search_steps > 0 {
                binary_search_refine(
                    &mut result.hit_pos,
                    direction,
                    &last_step,
                    params,
                    formula,
                );
            }

            // Calculate surface normal via central differences
            result.normal = calculate_normal(&result.hit_pos, params, formula);

            return result;
        }

        // Check if we exceeded maximum ray length
        if total_dist > params.max_ray_length || de.is_nan() || de.is_infinite() {
            result.hit = false;
            result.total_distance = total_dist;
            result.steps = step;
            result.fog = fog_accum;
            return result;
        }

        // Compute step size with regulation
        let step_size = de * params.step_width * rsf_mul;

        // Advance along the ray
        pos.x += direction.x * step_size;
        pos.y += direction.y * step_size;
        pos.z += direction.z * step_size;
        total_dist += step_size;

        // Update regulation state
        last_de = de;
        last_step = step_size;

        // Accumulate fog (based on proximity to surface)
        fog_accum += 1.0 / (1.0 + de * de * 100.0);
    }

    result.steps = max_steps;
    result.fog = fog_accum;
    result
}

/// Binary search refinement — port of RMdoBinSearch from CalcThread.pas.
/// Refines the hit position by binary searching along the last step.
fn binary_search_refine(
    hit_pos: &mut Vec3D,
    direction: &Vec3D,
    last_step: &f64,
    params: &RenderParams,
    formula: &HybridFormula,
) {
    let julia_c = if params.julia { Some(&params.julia_c) } else { None };
    let mut step = *last_step;
    let mut pos = *hit_pos;

    // Step back to before the hit
    pos.x -= direction.x * step;
    pos.y -= direction.y * step;
    pos.z -= direction.z * step;

    for _ in 0..params.bin_search_steps {
        step *= 0.5;
        let test_pos = Vec3D {
            x: pos.x + direction.x * step,
            y: pos.y + direction.y * step,
            z: pos.z + direction.z * step,
        };
        let fr = formula.compute_de(&test_pos, julia_c);
        if fr.de < params.de_stop {
            // Still hitting — don't move forward
        } else {
            // Not hitting — move forward
            pos.x += direction.x * step;
            pos.y += direction.y * step;
            pos.z += direction.z * step;
        }
    }

    // One final forward step
    hit_pos.x = pos.x + direction.x * step;
    hit_pos.y = pos.y + direction.y * step;
    hit_pos.z = pos.z + direction.z * step;
}

/// Calculate surface normal via central differences on the DE function.
///
/// Port of RMCalculateNormals from CalcThread.pas.
fn calculate_normal(
    pos: &Vec3D,
    params: &RenderParams,
    formula: &HybridFormula,
) -> Vec3D {
    let eps = params.de_stop * 0.5;
    let julia_c = if params.julia { Some(&params.julia_c) } else { None };

    let dx = formula.compute_de(
        &Vec3D { x: pos.x + eps, y: pos.y, z: pos.z }, julia_c,
    ).de - formula.compute_de(
        &Vec3D { x: pos.x - eps, y: pos.y, z: pos.z }, julia_c,
    ).de;

    let dy = formula.compute_de(
        &Vec3D { x: pos.x, y: pos.y + eps, z: pos.z }, julia_c,
    ).de - formula.compute_de(
        &Vec3D { x: pos.x, y: pos.y - eps, z: pos.z }, julia_c,
    ).de;

    let dz = formula.compute_de(
        &Vec3D { x: pos.x, y: pos.y, z: pos.z + eps }, julia_c,
    ).de - formula.compute_de(
        &Vec3D { x: pos.x, y: pos.y, z: pos.z - eps }, julia_c,
    ).de;

    let mut normal = Vec3D { x: dx, y: dy, z: dz };
    math3d::vec3d_normalize(&mut normal);
    normal
}

/// Render a complete image region (set of scanlines).
///
/// This is the main entry point called from WASM, rendering interleaved
/// scanlines for parallel workers.
pub fn render_scanlines(
    params: &RenderParams,
    formula: &HybridFormula,
    gbuffer: &mut [SiLight5],
    worker_id: u32,
    worker_count: u32,
) -> u32 {
    let w = params.width;
    let h = params.height;
    let hw = w as f64 * 0.5;
    let hh = h as f64 * 0.5;
    let mut rows_rendered = 0u32;

    let julia_c = if params.julia { Some(&params.julia_c) } else { None };
    let _ = julia_c; // used inside march_ray via params

    let mut y = worker_id;
    while y < h {
        for x in 0..w {
            let px = (x as f64 - hw) / hw;
            let py = (y as f64 - hh) / hh;

            // Compute ray direction for this pixel
            let mut dir = Vec3D {
                x: params.ray_dir_base.x + px * params.ray_dx.x + py * params.ray_dy.x,
                y: params.ray_dir_base.y + px * params.ray_dx.y + py * params.ray_dy.y,
                z: params.ray_dir_base.z + px * params.ray_dx.z + py * params.ray_dy.z,
            };
            math3d::vec3d_normalize(&mut dir);

            // March the ray
            let mr = march_ray(&params.camera_pos, &dir, params, formula);

            // Write to G-buffer
            let idx = (y * w + x) as usize;
            if idx < gbuffer.len() {
                if mr.hit {
                    gbuffer[idx] = SiLight5 {
                        sn_x: utils::min_max_clip_15bit(mr.normal.x),
                        sn_y: utils::min_max_clip_15bit(mr.normal.y),
                        sn_z: utils::min_max_clip_15bit(mr.normal.z),
                        z_pos: utils::min_max_clip_16bit(
                            utils::clamp(mr.total_distance / params.max_ray_length, 0.0, 1.0)
                        ),
                        shadow: 0,
                        ambient: ((mr.steps as f64 / 200.0).min(1.0) * 65535.0) as u16,
                        color_gradient: ((mr.smooth_iteration % 256.0) / 256.0 * 65535.0) as u16,
                        orbit_trap: utils::min_max_clip_16bit(
                            utils::clamp(1.0 - mr.orbit_trap.min(1.0), 0.0, 1.0)
                        ),
                        roughness: 0,
                    };
                } else {
                    // Background — mark as no-hit
                    gbuffer[idx] = SiLight5 {
                        sn_x: 0,
                        sn_y: 0,
                        sn_z: 0,
                        z_pos: 65535,
                        shadow: 0,
                        ambient: 0,
                        color_gradient: 0,
                        orbit_trap: 0,
                        roughness: 0,
                    };
                }
            }
        }
        rows_rendered += 1;
        y += worker_count;
    }

    rows_rendered
}

/// Build RenderParams from the serialized parameter buffer.
///
/// The buffer layout matches the TypeScript RenderParamsBuffer structure.
pub fn params_from_buffer(data: &[f64]) -> RenderParams {
    if data.len() < 32 {
        return RenderParams::default();
    }

    // Layout: [width, height, camera xyz, base_dir xyz, dx xyz, dy xyz,
    //          de_stop, step_width, max_ray_length, max_iter, bailout,
    //          fov_factor, julia, julia xyz, cut_enabled, cut_normal xyz, cut_d, bin_search]
    RenderParams {
        width: data[0] as u32,
        height: data[1] as u32,
        camera_pos: Vec3D { x: data[2], y: data[3], z: data[4] },
        ray_dir_base: Vec3D { x: data[5], y: data[6], z: data[7] },
        ray_dx: Vec3D { x: data[8], y: data[9], z: data[10] },
        ray_dy: Vec3D { x: data[11], y: data[12], z: data[13] },
        de_stop: data[14],
        step_width: data[15],
        max_ray_length: data[16],
        max_iterations: data[17] as u32,
        bailout: data[18],
        fov_factor: data[19],
        julia: data[20] != 0.0,
        julia_c: Vec3D { x: data[21], y: data[22], z: data[23] },
        cut_enabled: data[24] != 0.0,
        cut_normal: Vec3D { x: data[25], y: data[26], z: data[27] },
        cut_d: data[28],
        bin_search_steps: data[29] as u32,
    }
}

