/// Formula system — port of formulas.pas
///
/// Implements fractal distance estimator functions with a trait-based dispatch system.
/// Each formula computes the fractal iteration and returns a distance estimate.
///
/// The hybrid system allows combining up to 6 formulas in alternating,
/// interpolated, or 4D modes — matching the original Mandelbulb3D approach.

pub mod builtin;
pub mod hybrid;

use crate::engine::types::Vec3D;

/// Result of a single fractal iteration sequence.
#[derive(Clone, Debug)]
pub struct FormulaResult {
    /// Distance estimate to the fractal surface
    pub de: f64,
    /// Smooth iteration count for coloring
    pub smooth_it: f64,
    /// Orbit trap minimum distance (for alternative coloring)
    pub orbit_trap: f64,
    /// Whether the point is inside the fractal
    pub inside: bool,
    /// Raw iteration count at escape
    pub iterations: u32,
}

impl Default for FormulaResult {
    fn default() -> Self {
        Self {
            de: f64::MAX,
            smooth_it: 0.0,
            orbit_trap: f64::MAX,
            inside: false,
            iterations: 0,
        }
    }
}

/// Iteration state passed to each formula — port of TIteration3Dext.
#[derive(Clone, Debug)]
pub struct IterationState {
    /// Current position (mutated during iteration)
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
    /// Julia constant / initial position
    pub c1: f64,
    pub c2: f64,
    pub c3: f64,
    /// Analytic derivative magnitude
    pub dr: f64,
    /// Squared radius at escape
    pub r_sqr: f64,
    /// Smooth iteration accumulator
    pub smooth: f64,
    /// Orbit trap tracking
    pub orbit_trap: f64,
    /// Current iteration number
    pub iteration: u32,
}

impl IterationState {
    /// Create a new state for position (x, y, z) with Julia constant (cx, cy, cz).
    pub fn new(pos: &Vec3D, julia_c: Option<&Vec3D>) -> Self {
        let c = julia_c.unwrap_or(pos);
        Self {
            x: pos.x, y: pos.y, z: pos.z, w: 0.0,
            c1: c.x, c2: c.y, c3: c.z,
            dr: 1.0,
            r_sqr: 0.0,
            smooth: 0.0,
            orbit_trap: f64::MAX,
            iteration: 0,
        }
    }
}

/// Formula trait — each fractal formula implements this.
pub trait Formula: Send + Sync {
    /// Human-readable name.
    fn name(&self) -> &str;

    /// Compute the distance estimate at position (x, y, z).
    /// `max_iter` is the maximum iteration count.
    /// `bailout` is the escape radius squared.
    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult;

    /// Perform a single iteration step (for hybrid systems).
    /// Returns true if the point has escaped (r_sqr > bailout).
    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool;
}

/// Formula identifier matching the TypeScript/UI formula names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormulaId {
    None,
    MandelbulbPower2,
    MandelbulbPower8,
    AmazingBox,
    AmazingSurf,
    QuaternionJulia,
    Tricorn,
    Bulbox,
    FoldingIntPow,
    RealPower,
    AexionC,
}

impl FormulaId {
    /// Parse from a string name (matching UI dropdown values).
    pub fn from_name(name: &str) -> Self {
        match name {
            "Mandelbulb Power 2" => FormulaId::MandelbulbPower2,
            "Mandelbulb Power 8" => FormulaId::MandelbulbPower8,
            "Amazing Box" => FormulaId::AmazingBox,
            "Amazing Surf" => FormulaId::AmazingSurf,
            "Quaternion Julia" => FormulaId::QuaternionJulia,
            "Tricorn" => FormulaId::Tricorn,
            "Bulbox" => FormulaId::Bulbox,
            "Folding IntPow" => FormulaId::FoldingIntPow,
            "Real Power" => FormulaId::RealPower,
            "Aexion C" => FormulaId::AexionC,
            _ => FormulaId::None,
        }
    }

    /// Create a boxed formula instance.
    pub fn create(&self) -> Box<dyn Formula> {
        match self {
            FormulaId::None => Box::new(builtin::EmptyFormula),
            FormulaId::MandelbulbPower2 => Box::new(builtin::MandelbulbPower2),
            FormulaId::MandelbulbPower8 => Box::new(builtin::MandelbulbPower8),
            FormulaId::AmazingBox => Box::new(builtin::AmazingBox::default()),
            FormulaId::AmazingSurf => Box::new(builtin::AmazingSurf::default()),
            FormulaId::QuaternionJulia => Box::new(builtin::QuaternionJulia),
            FormulaId::Tricorn => Box::new(builtin::Tricorn),
            FormulaId::Bulbox => Box::new(builtin::Bulbox),
            FormulaId::FoldingIntPow => Box::new(builtin::FoldingIntPow::default()),
            FormulaId::RealPower => Box::new(builtin::RealPower::new(8.0)),
            FormulaId::AexionC => Box::new(builtin::AexionC),
        }
    }
}
