/// Lighting and painting module — port of PaintThread.pas CalcPixelColor2.
///
/// Implements deferred shading on the G-buffer:
/// - Up to 6 directional/point lights with Phong model
/// - Ambient occlusion from ray march step count
/// - Color gradient mapping from smooth iteration count
/// - Fog depth blending
/// - Specular highlights

pub mod paint;
pub mod gradient;
