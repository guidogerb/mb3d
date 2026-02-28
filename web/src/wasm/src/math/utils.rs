/// Math utility functions — port of DivUtils.pas and Math3D.pas helpers.
///
/// Provides clamping, interpolation, vector helpers, and color mapping
/// utilities used throughout the rendering pipeline.

use crate::engine::types::Vec3D;

/// Clamp a value to [min, max] range.
#[inline(always)]
pub fn clamp(v: f64, min: f64, max: f64) -> f64 {
    if v < min { min } else if v > max { max } else { v }
}

/// Clamp f32 to [min, max].
#[inline(always)]
pub fn clampf(v: f32, min: f32, max: f32) -> f32 {
    if v < min { min } else if v > max { max } else { v }
}

/// Clamp i32 to [min, max].
#[inline(always)]
pub fn clampi(v: i32, min: i32, max: i32) -> i32 {
    if v < min { min } else if v > max { max } else { v }
}

/// Clamp and convert to 15-bit range [0, 32767] — port of MinMaxClip15bit.
/// Used for encoding normals and gradients in the G-buffer.
#[inline(always)]
pub fn min_max_clip_15bit(v: f64) -> i16 {
    let vi = (v * 32767.0) as i32;
    if vi < -32767 { -32767 } else if vi > 32767 { 32767 } else { vi as i16 }
}

/// Clamp and convert to 16-bit unsigned range [0, 65535].
#[inline(always)]
pub fn min_max_clip_16bit(v: f64) -> u16 {
    let vi = (v * 65535.0) as i32;
    if vi < 0 { 0 } else if vi > 65535 { 65535 } else { vi as u16 }
}

/// Copy vector: dest = src — port of mCopyVec.
#[inline(always)]
pub fn copy_vec(dest: &mut Vec3D, src: &Vec3D) {
    *dest = *src;
}

/// dest = src + direction * weight — port of mCopyAddVecWeight.
#[inline(always)]
pub fn copy_add_vec_weight(dest: &mut Vec3D, src: &Vec3D, dir: &Vec3D, weight: f64) {
    dest.x = src.x + dir.x * weight;
    dest.y = src.y + dir.y * weight;
    dest.z = src.z + dir.z * weight;
}

/// dest += direction * weight — port of mAddVecWeight.
#[inline(always)]
pub fn add_vec_weight(dest: &mut Vec3D, dir: &Vec3D, weight: f64) {
    dest.x += dir.x * weight;
    dest.y += dir.y * weight;
    dest.z += dir.z * weight;
}

/// Linear interpolation between a and b.
#[inline(always)]
pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Linear interpolation for f32.
#[inline(always)]
pub fn lerpf(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Smooth step (Hermite interpolation).
#[inline(always)]
pub fn smoothstep(edge0: f64, edge1: f64, x: f64) -> f64 {
    let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Fast approximate sin for f64 (used in non-critical paths).
#[inline(always)]
pub fn sin_cos_d(angle_deg: f64) -> (f64, f64) {
    let rad = angle_deg * std::f64::consts::PI / 180.0;
    (rad.sin(), rad.cos())
}

/// Convert spherical coordinates to Cartesian unit vector.
/// theta = polar angle from Z axis, phi = azimuthal angle from X axis.
#[inline]
pub fn spherical_to_cartesian(theta: f64, phi: f64) -> Vec3D {
    let st = theta.sin();
    Vec3D {
        x: st * phi.cos(),
        y: st * phi.sin(),
        z: theta.cos(),
    }
}

/// Dot product of two Vec3D and normalize the result scalar to [-1, 1].
/// Port of DotOfVectorsNormalize.
#[inline]
pub fn dot_normalized(a: &Vec3D, b: &Vec3D) -> f64 {
    let d = a.x * b.x + a.y * b.y + a.z * b.z;
    let la = (a.x * a.x + a.y * a.y + a.z * a.z).sqrt();
    let lb = (b.x * b.x + b.y * b.y + b.z * b.z).sqrt();
    if la * lb < 1e-30 { 0.0 } else { clamp(d / (la * lb), -1.0, 1.0) }
}

/// Pack a float to a byte [0, 255].
#[inline(always)]
pub fn float_to_byte(v: f64) -> u8 {
    let vi = (v * 255.0) as i32;
    if vi < 0 { 0 } else if vi > 255 { 255 } else { vi as u8 }
}

/// Unpack a byte [0, 255] to a float [0, 1].
#[inline(always)]
pub fn byte_to_float(v: u8) -> f64 {
    v as f64 / 255.0
}

/// Parse a CSS hex color string "#RRGGBB" to (r, g, b) as f64 in [0, 1].
pub fn parse_hex_color(hex: &str) -> (f64, f64, f64) {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 { return (0.0, 0.0, 0.0); }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clamp() {
        assert_eq!(clamp(1.5, 0.0, 1.0), 1.0);
        assert_eq!(clamp(-0.5, 0.0, 1.0), 0.0);
        assert_eq!(clamp(0.5, 0.0, 1.0), 0.5);
    }

    #[test]
    fn test_min_max_clip_15bit() {
        assert_eq!(min_max_clip_15bit(1.0), 32767);
        assert_eq!(min_max_clip_15bit(-1.0), -32767);
        assert_eq!(min_max_clip_15bit(0.0), 0);
    }

    #[test]
    fn test_lerp() {
        assert!((lerp(0.0, 10.0, 0.5) - 5.0).abs() < 1e-10);
        assert!((lerp(0.0, 10.0, 0.0) - 0.0).abs() < 1e-10);
        assert!((lerp(0.0, 10.0, 1.0) - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_hex_color() {
        let (r, g, b) = parse_hex_color("#ff8040");
        assert!((r - 1.0).abs() < 0.01);
        assert!((g - 0.502).abs() < 0.01);
        assert!((b - 0.251).abs() < 0.01);
    }
}
