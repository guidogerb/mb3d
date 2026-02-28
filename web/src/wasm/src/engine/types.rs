/// Core types ported from TypeDefinitions.pas
/// All types use #[repr(C)] for stable ABI across WASM ↔ JS boundary.

/// Per-pixel G-buffer entry — port of TsiLight5 (18 bytes packed).
///
/// Stores surface normal, depth, shadow/AO, and coloring data
/// for deferred shading.
#[repr(C, packed)]
#[derive(Clone, Copy, Default)]
pub struct SiLight5 {
    /// Surface normal X component (fixed-point i16)
    pub sn_x: i16,
    /// Surface normal Y component (fixed-point i16)
    pub sn_y: i16,
    /// Surface normal Z component (fixed-point i16)
    pub sn_z: i16,
    /// Z-depth (quantized u16)
    pub z_pos: u16,
    /// Hard shadow bitfield
    pub shadow: u16,
    /// Ambient occlusion value
    pub ambient: u16,
    /// Smooth iteration gradient for coloring
    pub color_gradient: u16,
    /// Orbit trap color index
    pub orbit_trap: u16,
    /// Roughness / extra flags
    pub roughness: u16,
}

/// 3D vector with f64 precision — port of TVec3D.
#[repr(C, align(16))]
#[derive(Clone, Copy, Default, Debug)]
pub struct Vec3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// 3×3 rotation matrix — port of TMatrix3.
#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub struct Matrix3 {
    pub m: [[f64; 3]; 3],
}

/// Light source definition — port of TLight8 (32 bytes).
#[repr(C, packed)]
#[derive(Clone, Copy, Default)]
pub struct Light8 {
    /// Position encoded as Double7B (7-byte packed double) × 3
    pub pos: [u8; 21],
    /// Light color (RGB bytes)
    pub color: [u8; 3],
    /// Amplitude (u16)
    pub amplitude: u16,
    /// Function type
    pub func_type: u8,
    /// Lightmap number
    pub lightmap: u8,
    /// Specular size
    pub spec_size: u8,
    /// Reserved
    pub reserved: [u8; 3],
}

/// Lighting parameters — port of TLightingParas9 (~408 bytes packed).
#[repr(C, packed)]
#[derive(Clone, Copy)]
pub struct LightingParas9 {
    /// 6 light sources
    pub lights: [Light8; 6],
    /// 10 surface color stops (RGBA × 10 = 40 bytes)
    pub surface_colors: [u8; 40],
    /// 4 interior color stops
    pub interior_colors: [u8; 16],
    /// Fog parameters
    pub fog_density: f64,
    pub fog_color: [u8; 3],
    /// Background image name (64 bytes)
    pub bg_image: [u8; 64],
    /// Remaining lighting params (ambient, diffuse multipliers, etc.)
    pub ambient_intensity: f64,
    pub ambient_color: [u8; 3],
    /// Padding to match Delphi layout
    pub _pad: [u8; 99],
}

impl Default for LightingParas9 {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

/// Master scene parameter record — port of TMandHeader10 (~840 bytes packed).
///
/// This is the primary serialization format for .m3p files.
#[repr(C, packed)]
#[derive(Clone, Copy)]
pub struct MandHeader10 {
    /// Image dimensions
    pub width: i32,
    pub height: i32,
    /// Maximum iterations
    pub iterations: i32,
    /// 3D position (center of view)
    pub dx_mid: f64,
    pub dy_mid: f64,
    pub dz_mid: f64,
    /// Zoom level
    pub zoom: f64,
    /// Rotation matrix (3×3 as 9 doubles = 72 bytes)
    pub rotation: [f64; 9],
    /// Field of view
    pub fov: f64,
    /// Distance estimator stop threshold
    pub de_stop: f64,
    /// Julia mode flag
    pub julia: i32,
    /// Julia constants
    pub julia_x: f64,
    pub julia_y: f64,
    pub julia_z: f64,
    /// Lighting parameters
    pub lighting: LightingParas9,
    /// Remaining header fields (cutting planes, DOF, MC settings, etc.)
    /// Placeholder — will be fully mapped as fields are needed
    pub _remaining: [u8; 256],
}

impl Default for MandHeader10 {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

/// Calculation thread parameters — port of TMCTparameter (~700+ bytes packed).
///
/// Everything a single render thread needs to march rays.
#[repr(C)]
#[derive(Clone)]
pub struct MCTParameter {
    /// DE stop threshold
    pub de_stop: f64,
    /// Step width divisor
    pub z_step_div: f64,
    /// Ray step multiplier  
    pub step_width: f64,
    /// Max ray length
    pub max_ray_length: f64,
    /// FOV factor
    pub fov: f64,
    /// Camera position
    pub camera: Vec3D,
    /// View direction vectors (gradient components)
    pub vgradx: Vec3D,
    pub vgrady: Vec3D,
    pub vgradz: Vec3D,
    /// Image dimensions
    pub width: u32,
    pub height: u32,
    /// Thread identification
    pub thread_id: u32,
    /// Number of iterations
    pub max_iter: u32,
    /// Formula type flags
    pub formula_type: u32,
    /// Cutting plane parameters
    pub cut_option: u32,
    pub cut_plane_normal: Vec3D,
    pub cut_plane_d: f64,
}

impl MCTParameter {
    /// Deserialize from a byte slice (matching the C-packed layout).
    pub fn from_bytes(_data: &[u8]) -> Self {
        // TODO: Proper deserialization from SharedArrayBuffer data
        MCTParameter {
            de_stop: 0.001,
            z_step_div: 1.0,
            step_width: 1.0,
            max_ray_length: 100.0,
            fov: 0.5,
            camera: Vec3D::default(),
            vgradx: Vec3D { x: 1.0, y: 0.0, z: 0.0 },
            vgrady: Vec3D { x: 0.0, y: 1.0, z: 0.0 },
            vgradz: Vec3D { x: 0.0, y: 0.0, z: 1.0 },
            width: 800,
            height: 600,
            thread_id: 0,
            max_iter: 10,
            formula_type: 0,
            cut_option: 0,
            cut_plane_normal: Vec3D::default(),
            cut_plane_d: 0.0,
        }
    }
}

/// Extended iteration state — port of TIteration3Dext.
///
/// Holds the evolving 3D/4D vector during fractal iteration,
/// derivative tracking, and smoothing data.
#[repr(C)]
#[derive(Clone, Debug)]
pub struct Iteration3Dext {
    /// Current position
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
    /// Julia constants
    pub c1: f64,
    pub c2: f64,
    pub c3: f64,
    /// Derivative for DE (analytic)
    pub deriv1: f64,
    pub deriv2: f64,
    pub deriv3: f64,
    /// Squared radius
    pub r_sqr: f64,
    /// Smooth iteration data
    pub smooth: f64,
    /// Current iteration count
    pub iteration: u32,
    /// Max iterations
    pub max_it: u32,
    /// Orbit trap values
    pub otrap_de: f64,
    /// Formula-specific variable buffer (up to 64 f64s)
    pub var_buffer: [f64; 64],
}

impl Default for Iteration3Dext {
    fn default() -> Self {
        Iteration3Dext {
            x: 0.0, y: 0.0, z: 0.0, w: 0.0,
            c1: 0.0, c2: 0.0, c3: 0.0,
            deriv1: 1.0, deriv2: 0.0, deriv3: 0.0,
            r_sqr: 0.0, smooth: 0.0,
            iteration: 0, max_it: 10,
            otrap_de: 0.0,
            var_buffer: [0.0; 64],
        }
    }
}
