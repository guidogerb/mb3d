/**
 * Render parameter serialization — converts MandHeader to Float64Array/Uint32Array
 * for passing to the WASM module.
 *
 * This bridges the TypeScript MandHeader state to the Rust RenderParams struct.
 */

import type { MandHeader } from './header.js';

/**
 * Formula name → numeric ID mapping (must match formula_id_from_u32 in lib.rs).
 */
const FORMULA_NAME_TO_ID: Record<string, number> = {
  '(none)': 0,
  'Mandelbulb Power 2': 1,
  'Mandelbulb Power 8': 2,
  'Amazing Box': 3,
  'Amazing Surf': 4,
  'Quaternion Julia': 5,
  'Tricorn': 6,
  'Bulbox': 7,
  'Folding IntPow': 8,
  'Real Power': 9,
  'Aexion C': 10,
};

const HYBRID_MODE_TO_ID: Record<string, number> = {
  'alternating': 0,
  'interpolated': 1,
  '4d': 2,
};

/**
 * Build the render_params Float64Array for the WASM render_scanlines call.
 *
 * Layout (30 f64s):
 * [0]  width
 * [1]  height
 * [2-4]  camera_pos (x, y, z)
 * [5-7]  ray_dir_base (x, y, z)
 * [8-10]  ray_dx (x, y, z)
 * [11-13] ray_dy (x, y, z)
 * [14] de_stop
 * [15] step_width
 * [16] max_ray_length
 * [17] max_iterations
 * [18] bailout
 * [19] fov_factor
 * [20] julia (0 or 1)
 * [21-23] julia_c (x, y, z)
 * [24] cut_enabled (0 or 1)
 * [25-27] cut_normal (x, y, z)
 * [28] cut_d
 * [29] bin_search_steps
 */
export function buildRenderParams(header: MandHeader): Float64Array {
  const params = new Float64Array(30);

  // Compute camera setup from header
  // The rotation matrix is row-major: [r00, r01, r02, r10, r11, r12, r20, r21, r22]
  const r = header.rotation;

  // Camera position from header
  params[0] = header.width;
  params[1] = header.height;
  params[2] = header.posX;
  params[3] = header.posY;
  params[4] = header.posZ;

  // Camera faces along the Z column of the rotation matrix, offset by zoom
  // Base ray direction (center of screen → forward direction)
  const fwd_x = r[2];
  const fwd_y = r[5];
  const fwd_z = r[8];
  params[5] = fwd_x;
  params[6] = fwd_y;
  params[7] = fwd_z;

  // Per-pixel steps in world space: right and up vectors scaled by FOV/aspect
  const aspect = header.width / header.height;
  const fovScale = header.fov > 0 ? Math.tan(header.fov * 0.5) : 0.5;

  // Right vector (X column of rotation matrix)
  params[8] = r[0] * fovScale * aspect;
  params[9] = r[3] * fovScale * aspect;
  params[10] = r[6] * fovScale * aspect;

  // Up vector (Y column of rotation matrix, negated for screen coords)
  params[11] = -r[1] * fovScale;
  params[12] = -r[4] * fovScale;
  params[13] = -r[7] * fovScale;

  // Rendering parameters
  params[14] = header.deStop;
  params[15] = header.stepWidth;
  params[16] = 50.0;  // max ray length
  params[17] = header.iterations;
  params[18] = 16.0;  // bailout
  params[19] = header.fov > 0 ? header.fov * 0.001 : 0.0;  // FOV factor for DE scaling
  params[20] = header.julia ? 1.0 : 0.0;
  params[21] = header.juliaX;
  params[22] = header.juliaY;
  params[23] = header.juliaZ;
  params[24] = header.cutEnabled ? 1.0 : 0.0;
  params[25] = header.cutPlaneNormal[0];
  params[26] = header.cutPlaneNormal[1];
  params[27] = header.cutPlaneNormal[2];
  params[28] = header.cutPlaneDistance;
  params[29] = 3.0;   // binary search steps

  return params;
}

/**
 * Build the formula_ids Uint32Array for the WASM render_scanlines call.
 *
 * Layout: [num_slots, id1, iters1, id2, iters2, ..., hybrid_mode]
 */
export function buildFormulaIds(header: MandHeader): Uint32Array {
  const activeSlots = header.formulaSlots.filter(s => s.name && s.name !== '(none)' && s.name !== '');
  const numSlots = activeSlots.length || 1;

  // +1 for count, +2 per slot (id, iters), +1 for hybrid mode
  const arr = new Uint32Array(1 + numSlots * 2 + 1);
  arr[0] = numSlots;

  if (activeSlots.length === 0) {
    // Default to Mandelbulb Power 8
    arr[1] = 2; // MandelbulbPower8
    arr[2] = 1;
    arr[3] = 0; // alternating
  } else {
    let idx = 1;
    for (const slot of activeSlots) {
      arr[idx] = FORMULA_NAME_TO_ID[slot.name] ?? 0;
      arr[idx + 1] = slot.iterations || 1;
      idx += 2;
    }
    arr[idx] = HYBRID_MODE_TO_ID[header.hybridMode] ?? 0;
  }

  return arr;
}

/**
 * Build the paint_params Float64Array for the WASM paint_gbuffer call.
 *
 * Layout: [num_lights,
 *   per light: [dir_x, dir_y, dir_z, col_r, col_g, col_b, amplitude, spec_size, spec_intensity],
 *   ambient_r, ambient_g, ambient_b, ambient_intensity,
 *   fog_density, fog_r, fog_g, fog_b,
 *   bg_r, bg_g, bg_b,
 *   view_dir_x, view_dir_y, view_dir_z,
 *   ao_strength,
 *   num_gradient_stops,
 *   per stop: [position, r, g, b]]
 */
export function buildPaintParams(header: MandHeader): Float64Array {
  const lights = header.lighting.lights.filter(l => l.amplitude > 0.001);
  const numLights = lights.length;
  const numStops = header.lighting.surfaceColors.length;

  // Calculate total size
  const size = 1 + numLights * 9 + 4 + 4 + 3 + 3 + 1 + 1 + numStops * 4;
  const params = new Float64Array(size);
  let idx = 0;

  // Lights
  params[idx++] = numLights;
  for (const light of lights) {
    // Convert spherical (theta, phi) to Cartesian direction
    const st = Math.sin(light.theta);
    const ct = Math.cos(light.theta);
    const sp = Math.sin(light.phi);
    const cp = Math.cos(light.phi);
    params[idx++] = st * cp;   // dir_x
    params[idx++] = st * sp;   // dir_y
    params[idx++] = ct;        // dir_z

    // Parse hex color
    const [cr, cg, cb] = hexToRgb(light.color);
    params[idx++] = cr;
    params[idx++] = cg;
    params[idx++] = cb;
    params[idx++] = light.amplitude;
    params[idx++] = light.specularSize * 64.0; // Map 0-1 to exponent range
    params[idx++] = 0.5; // specular intensity
  }

  // Ambient
  const [ar, ag, ab] = hexToRgb(header.lighting.ambientColor);
  params[idx++] = ar;
  params[idx++] = ag;
  params[idx++] = ab;
  params[idx++] = header.lighting.ambientIntensity;

  // Fog
  params[idx++] = header.lighting.fogDensity;
  const [fr, fg, fb] = hexToRgb(header.lighting.fogColor);
  params[idx++] = fr;
  params[idx++] = fg;
  params[idx++] = fb;

  // Background
  params[idx++] = 0.02;
  params[idx++] = 0.02;
  params[idx++] = 0.05;

  // View direction (forward Z in default view)
  const r = header.rotation;
  params[idx++] = r[2];
  params[idx++] = r[5];
  params[idx++] = r[8];

  // AO strength
  params[idx++] = 0.5;

  // Gradient stops
  params[idx++] = numStops;
  for (const stop of header.lighting.surfaceColors) {
    params[idx++] = stop.position;
    const [sr, sg, sb] = hexToRgb(stop.color);
    params[idx++] = sr;
    params[idx++] = sg;
    params[idx++] = sb;
  }

  return params;
}

/** Parse "#RRGGBB" to [r, g, b] as floats in [0, 1]. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length < 6) return [0, 0, 0];
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}
