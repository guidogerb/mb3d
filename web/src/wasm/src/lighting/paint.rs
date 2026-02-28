/// Paint module — port of PaintThread.pas CalcPixelColor2.
///
/// Performs deferred shading on the G-buffer to produce final RGBA pixels.
/// Implements Phong lighting with up to 6 lights, color gradient mapping,
/// ambient occlusion, fog, and specular highlights.

use crate::engine::types::{SiLight5, Vec3D};
use crate::math::{math3d, utils};
use super::gradient::ColorGradient;

/// Light source configuration for the paint pass.
#[derive(Clone, Debug)]
pub struct LightConfig {
    /// Light direction (normalized, pointing toward the light)
    pub direction: Vec3D,
    /// Light color (r, g, b) in [0, 1]
    pub color: (f64, f64, f64),
    /// Diffuse intensity [0, 2]
    pub amplitude: f64,
    /// Specular exponent
    pub specular_size: f64,
    /// Specular intensity multiplier
    pub specular_intensity: f64,
}

/// Full lighting/painting configuration.
#[derive(Clone)]
pub struct PaintConfig {
    /// Up to 6 lights
    pub lights: Vec<LightConfig>,
    /// Surface color gradient
    pub gradient: ColorGradient,
    /// Ambient light color + intensity
    pub ambient_color: (f64, f64, f64),
    pub ambient_intensity: f64,
    /// Fog parameters
    pub fog_density: f64,
    pub fog_color: (f64, f64, f64),
    /// Background color
    pub bg_color: (f64, f64, f64),
    /// Camera direction (for specular calculation)
    pub view_dir: Vec3D,
    /// AO strength multiplier
    pub ao_strength: f64,
}

impl Default for PaintConfig {
    fn default() -> Self {
        Self {
            lights: vec![
                LightConfig {
                    direction: Vec3D { x: 0.577, y: 0.577, z: -0.577 },
                    color: (1.0, 1.0, 1.0),
                    amplitude: 1.0,
                    specular_size: 32.0,
                    specular_intensity: 0.5,
                },
            ],
            gradient: ColorGradient::default(),
            ambient_color: (0.25, 0.25, 0.375),
            ambient_intensity: 0.3,
            fog_density: 0.0,
            fog_color: (0.0, 0.0, 0.0),
            bg_color: (0.02, 0.02, 0.05),
            view_dir: Vec3D { x: 0.0, y: 0.0, z: 1.0 },
            ao_strength: 0.5,
        }
    }
}

/// Paint the complete G-buffer into RGBA output.
///
/// Port of the PaintThread.CalcPixelColor2 deferred shading pass.
pub fn paint_gbuffer(
    gbuffer: &[SiLight5],
    rgba_out: &mut [u8],
    width: u32,
    height: u32,
    config: &PaintConfig,
) {
    let total = (width * height) as usize;

    for i in 0..total {
        let pixel = &gbuffer[i];
        let ri = i * 4;

        if ri + 3 >= rgba_out.len() { break; }

        // Check if this pixel hit the surface (z_pos < 65535 means hit)
        if pixel.z_pos >= 65534 {
            // Background pixel
            rgba_out[ri] = utils::float_to_byte(config.bg_color.0);
            rgba_out[ri + 1] = utils::float_to_byte(config.bg_color.1);
            rgba_out[ri + 2] = utils::float_to_byte(config.bg_color.2);
            rgba_out[ri + 3] = 255;
            continue;
        }

        // Decode surface normal from G-buffer (i16 → f64)
        let nx = pixel.sn_x as f64 / 32767.0;
        let ny = pixel.sn_y as f64 / 32767.0;
        let nz = pixel.sn_z as f64 / 32767.0;
        let mut normal = Vec3D { x: nx, y: ny, z: nz };
        math3d::vec3d_normalize(&mut normal);

        // Decode depth (0–1 range)
        let depth = pixel.z_pos as f64 / 65535.0;

        // Decode AO from step count
        let ao_raw = pixel.ambient as f64 / 65535.0;
        let ao = 1.0 - ao_raw * config.ao_strength;

        // Sample the surface color from the gradient
        let grad_t = pixel.color_gradient as f64 / 65535.0;
        let (surf_r, surf_g, surf_b) = config.gradient.sample(grad_t);

        // Start with ambient lighting
        let mut final_r = config.ambient_color.0 * config.ambient_intensity * surf_r;
        let mut final_g = config.ambient_color.1 * config.ambient_intensity * surf_g;
        let mut final_b = config.ambient_color.2 * config.ambient_intensity * surf_b;

        // Accumulate contribution from each light (Phong model)
        for light in &config.lights {
            if light.amplitude < 0.001 { continue; }

            // Diffuse (Lambert)
            let n_dot_l = math3d::vec3d_dot(&normal, &light.direction).max(0.0);
            let diffuse = n_dot_l * light.amplitude;

            // Specular (Blinn-Phong)
            let half_vec = math3d::vec3d_normalized(&Vec3D {
                x: light.direction.x + config.view_dir.x,
                y: light.direction.y + config.view_dir.y,
                z: light.direction.z + config.view_dir.z,
            });
            let n_dot_h = math3d::vec3d_dot(&normal, &half_vec).max(0.0);
            let specular = n_dot_h.powf(light.specular_size) * light.specular_intensity * light.amplitude;

            final_r += (diffuse * surf_r + specular) * light.color.0;
            final_g += (diffuse * surf_g + specular) * light.color.1;
            final_b += (diffuse * surf_b + specular) * light.color.2;
        }

        // Apply ambient occlusion
        final_r *= ao;
        final_g *= ao;
        final_b *= ao;

        // Apply fog
        if config.fog_density > 0.0 {
            let fog_factor = (-depth * config.fog_density * 10.0).exp();
            final_r = utils::lerp(config.fog_color.0, final_r, fog_factor);
            final_g = utils::lerp(config.fog_color.1, final_g, fog_factor);
            final_b = utils::lerp(config.fog_color.2, final_b, fog_factor);
        }

        // Write RGBA output
        rgba_out[ri] = utils::float_to_byte(final_r);
        rgba_out[ri + 1] = utils::float_to_byte(final_g);
        rgba_out[ri + 2] = utils::float_to_byte(final_b);
        rgba_out[ri + 3] = 255;
    }
}

/// Build PaintConfig from a flat f64 parameter array.
/// Layout: [num_lights,
///   for each light: [dir_x, dir_y, dir_z, color_r, color_g, color_b, amplitude, spec_size, spec_intensity],
///   ambient_r, ambient_g, ambient_b, ambient_intensity,
///   fog_density, fog_r, fog_g, fog_b,
///   bg_r, bg_g, bg_b,
///   view_dir_x, view_dir_y, view_dir_z,
///   ao_strength,
///   num_gradient_stops,
///   for each stop: [position, r, g, b]]
pub fn paint_config_from_buffer(data: &[f64]) -> PaintConfig {
    let mut config = PaintConfig::default();
    if data.is_empty() {
        return config;
    }

    let mut idx = 0;

    // Read lights
    let num_lights = data[idx] as usize;
    idx += 1;
    config.lights.clear();
    for _ in 0..num_lights.min(6) {
        if idx + 8 >= data.len() { break; }
        config.lights.push(LightConfig {
            direction: math3d::vec3d_normalized(&Vec3D {
                x: data[idx], y: data[idx + 1], z: data[idx + 2]
            }),
            color: (data[idx + 3], data[idx + 4], data[idx + 5]),
            amplitude: data[idx + 6],
            specular_size: data[idx + 7],
            specular_intensity: data[idx + 8],
        });
        idx += 9;
    }

    // Ambient
    if idx + 3 < data.len() {
        config.ambient_color = (data[idx], data[idx + 1], data[idx + 2]);
        config.ambient_intensity = data[idx + 3];
        idx += 4;
    }

    // Fog
    if idx + 3 < data.len() {
        config.fog_density = data[idx];
        config.fog_color = (data[idx + 1], data[idx + 2], data[idx + 3]);
        idx += 4;
    }

    // Background
    if idx + 2 < data.len() {
        config.bg_color = (data[idx], data[idx + 1], data[idx + 2]);
        idx += 3;
    }

    // View direction
    if idx + 2 < data.len() {
        config.view_dir = math3d::vec3d_normalized(&Vec3D {
            x: data[idx], y: data[idx + 1], z: data[idx + 2]
        });
        idx += 3;
    }

    // AO strength
    if idx < data.len() {
        config.ao_strength = data[idx];
        idx += 1;
    }

    // Gradient stops
    if idx < data.len() {
        let num_stops = data[idx] as usize;
        idx += 1;
        let mut stops = Vec::new();
        for _ in 0..num_stops {
            if idx + 3 >= data.len() { break; }
            stops.push((data[idx], data[idx + 1], data[idx + 2], data[idx + 3]));
            idx += 4;
        }
        if !stops.is_empty() {
            config.gradient = ColorGradient::from_stops(&stops);
        }
    }

    config
}
