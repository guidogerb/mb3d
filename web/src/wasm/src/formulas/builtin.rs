/// Built-in fractal formulas — port of formulas.pas pure Pascal implementations.
///
/// Each formula implements the Formula trait providing both
/// full DE computation and single-step iteration for hybrid mode.

use crate::engine::types::Vec3D;
use super::{Formula, FormulaResult, IterationState};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty Formula (slot not in use)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct EmptyFormula;

impl Formula for EmptyFormula {
    fn name(&self) -> &str { "(none)" }

    fn compute_de(&self, _pos: &Vec3D, _max_iter: u32, _bailout: f64, _julia_c: Option<&Vec3D>) -> FormulaResult {
        FormulaResult { de: f64::MAX, ..Default::default() }
    }

    fn iterate_once(&self, _state: &mut IterationState, _bailout: f64) -> bool {
        true // Always escaped — effectively no iteration
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mandelbulb Power 2 — port of HybridIteration2 / HybridFloat
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct MandelbulbPower2;

impl Formula for MandelbulbPower2 {
    fn name(&self) -> &str { "Mandelbulb Power 2" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                // Escaped — compute DE
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                let smooth = (i as f64) + 1.0 - (state.r_sqr.ln().ln() / std::f64::consts::LN_2);
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: smooth,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        let r_sqr = x * x + y * y + z * z;
        state.r_sqr = r_sqr;

        if r_sqr > bailout {
            return true;
        }

        let r = r_sqr.sqrt();

        // Track orbit trap
        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        // Power 2 Mandelbulb: spherical coordinates method
        let theta = (z / r).acos();
        let phi = y.atan2(x);
        let power = 2.0;

        state.dr = r.powf(power - 1.0) * power * state.dr + 1.0;

        let zr = r.powf(power);
        let new_theta = theta * power;
        let new_phi = phi * power;

        state.x = zr * new_theta.sin() * new_phi.cos() + state.c1;
        state.y = zr * new_theta.sin() * new_phi.sin() + state.c2;
        state.z = zr * new_theta.cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mandelbulb Power 8 — the classic Mandelbulb, port of HybridIteration8
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct MandelbulbPower8;

impl Formula for MandelbulbPower8 {
    fn name(&self) -> &str { "Mandelbulb Power 8" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                let smooth = (i as f64) + 1.0 - (state.r_sqr.ln().ln() / (8.0f64.ln()));
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: smooth,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        let r_sqr = x * x + y * y + z * z;
        state.r_sqr = r_sqr;

        if r_sqr > bailout {
            return true;
        }

        let r = r_sqr.sqrt();
        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        // Optimized power-8 using trig identities
        let theta = (z / r).acos();
        let phi = y.atan2(x);

        // dr = r^7 * 8 * dr + 1
        let r7 = r_sqr * r_sqr * r_sqr * r; // r^7
        state.dr = r7 * 8.0 * state.dr + 1.0;

        let r8 = r7 * r; // r^8
        let theta8 = theta * 8.0;
        let phi8 = phi * 8.0;
        let st = theta8.sin();

        state.x = r8 * st * phi8.cos() + state.c1;
        state.y = r8 * st * phi8.sin() + state.c2;
        state.z = r8 * theta8.cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Amazing Box — port of AmazingBox / Mandelbox
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct AmazingBox {
    pub scale: f64,
    pub fold_limit: f64,
    pub min_radius_sq: f64,
    pub fixed_radius_sq: f64,
}

impl Default for AmazingBox {
    fn default() -> Self {
        Self {
            scale: 2.0,
            fold_limit: 1.0,
            min_radius_sq: 0.25,
            fixed_radius_sq: 1.0,
        }
    }
}

impl Formula for AmazingBox {
    fn name(&self) -> &str { "Amazing Box" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        state.dr = 1.0;
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = r / state.dr.abs();
                return FormulaResult {
                    de,
                    smooth_it: i as f64 + (bailout.ln() - state.r_sqr.ln()) / (2.0 * self.scale.abs().ln()),
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        let r = state.r_sqr.sqrt();
        FormulaResult { de: r / state.dr.abs(), smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        // Box fold
        let fl = self.fold_limit;
        if state.x > fl { state.x = 2.0 * fl - state.x; }
        else if state.x < -fl { state.x = -2.0 * fl - state.x; }
        if state.y > fl { state.y = 2.0 * fl - state.y; }
        else if state.y < -fl { state.y = -2.0 * fl - state.y; }
        if state.z > fl { state.z = 2.0 * fl - state.z; }
        else if state.z < -fl { state.z = -2.0 * fl - state.z; }

        // Sphere fold
        let r_sqr = state.x * state.x + state.y * state.y + state.z * state.z;
        let factor = if r_sqr < self.min_radius_sq {
            self.fixed_radius_sq / self.min_radius_sq
        } else if r_sqr < self.fixed_radius_sq {
            self.fixed_radius_sq / r_sqr
        } else {
            1.0
        };

        state.x = state.x * factor * self.scale + state.c1;
        state.y = state.y * factor * self.scale + state.c2;
        state.z = state.z * factor * self.scale + state.c3;
        state.dr = state.dr * factor.abs() * self.scale.abs() + 1.0;

        state.r_sqr = state.x * state.x + state.y * state.y + state.z * state.z;

        let otrap = state.x.abs().min(state.y.abs()).min(state.z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        state.r_sqr > bailout
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Amazing Surf — Mandelbulb3D's "Amazing Surf" formula (box fold + sphere fold variation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct AmazingSurf {
    pub scale: f64,
    pub fold_x: f64,
    pub fold_y: f64,
}

impl Default for AmazingSurf {
    fn default() -> Self {
        Self { scale: 1.5, fold_x: 1.0, fold_y: 1.0 }
    }
}

impl Formula for AmazingSurf {
    fn name(&self) -> &str { "Amazing Surf" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = r / state.dr.abs();
                return FormulaResult {
                    de,
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        let r = state.r_sqr.sqrt();
        FormulaResult { de: r / state.dr.abs(), smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        // Abs fold on XY
        state.x = state.x.abs() - self.fold_x;
        state.y = state.y.abs() - self.fold_y;

        // Sphere fold variant
        let r_sqr = state.x * state.x + state.y * state.y + state.z * state.z;
        let factor = if r_sqr < 0.25 {
            4.0
        } else if r_sqr < 1.0 {
            1.0 / r_sqr
        } else {
            1.0
        };

        state.x = state.x * factor * self.scale + state.c1;
        state.y = state.y * factor * self.scale + state.c2;
        state.z = state.z * factor * self.scale + state.c3;
        state.dr = state.dr * factor.abs() * self.scale.abs() + 1.0;

        state.r_sqr = state.x * state.x + state.y * state.y + state.z * state.z;

        let otrap = state.x.abs().min(state.y.abs()).min(state.z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        state.r_sqr > bailout
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Quaternion Julia — port of HybridQuat from formulas.pas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct QuaternionJulia;

impl Formula for QuaternionJulia {
    fn name(&self) -> &str { "Quaternion Julia" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        state.w = 0.0;
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        let w = state.w;

        state.r_sqr = x * x + y * y + z * z + w * w;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        state.dr = 2.0 * r * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        // Quaternion squaring: q^2 = (a^2 - |v|^2, 2*a*v)
        // where q = (a, v) = (x, y, z, w) mapped to quaternion
        state.x = x * x - y * y - z * z - w * w + state.c1;
        state.y = 2.0 * x * y + state.c2;
        state.z = 2.0 * x * z + state.c3;
        state.w = 2.0 * x * w;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tricorn — port of HybridItTricorn from formulas.pas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct Tricorn;

impl Formula for Tricorn {
    fn name(&self) -> &str { "Tricorn" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        state.r_sqr = x * x + y * y + z * z;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        state.dr = r * 2.0 * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        // Tricorn uses conjugate (negate y) before squaring in spherical coords
        let theta = (z / r).acos();
        let phi = (-y).atan2(x); // conjugate — negate y

        let r2 = state.r_sqr;
        let theta2 = theta * 2.0;
        let phi2 = phi * 2.0;
        let st = theta2.sin();

        state.x = r2 * st * phi2.cos() + state.c1;
        state.y = r2 * st * phi2.sin() + state.c2;
        state.z = r2 * theta2.cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bulbox — hybrid of Mandelbulb and box fold
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct Bulbox;

impl Formula for Bulbox {
    fn name(&self) -> &str { "Bulbox" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        // Box fold first
        let fl = 1.0;
        if state.x > fl { state.x = 2.0 * fl - state.x; }
        else if state.x < -fl { state.x = -2.0 * fl - state.x; }
        if state.y > fl { state.y = 2.0 * fl - state.y; }
        else if state.y < -fl { state.y = -2.0 * fl - state.y; }
        if state.z > fl { state.z = 2.0 * fl - state.z; }
        else if state.z < -fl { state.z = -2.0 * fl - state.z; }

        // Then Mandelbulb power 2
        let x = state.x;
        let y = state.y;
        let z = state.z;
        state.r_sqr = x * x + y * y + z * z;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        state.dr = 2.0 * r * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        let theta = (z / r).acos();
        let phi = y.atan2(x);

        let zr = state.r_sqr; // r^2
        let st = (theta * 2.0).sin();
        state.x = zr * st * (phi * 2.0).cos() + state.c1;
        state.y = zr * st * (phi * 2.0).sin() + state.c2;
        state.z = zr * (theta * 2.0).cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Folding IntPow — box fold + integer power (configurable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct FoldingIntPow {
    pub power: u32,
    pub fold_limit: f64,
}

impl Default for FoldingIntPow {
    fn default() -> Self {
        Self { power: 2, fold_limit: 1.0 }
    }
}

impl Formula for FoldingIntPow {
    fn name(&self) -> &str { "Folding IntPow" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        // Box fold
        let fl = self.fold_limit;
        if state.x > fl { state.x = 2.0 * fl - state.x; }
        else if state.x < -fl { state.x = -2.0 * fl - state.x; }
        if state.y > fl { state.y = 2.0 * fl - state.y; }
        else if state.y < -fl { state.y = -2.0 * fl - state.y; }
        if state.z > fl { state.z = 2.0 * fl - state.z; }
        else if state.z < -fl { state.z = -2.0 * fl - state.z; }

        let x = state.x;
        let y = state.y;
        let z = state.z;
        state.r_sqr = x * x + y * y + z * z;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        let p = self.power as f64;
        state.dr = r.powf(p - 1.0) * p * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        let theta = (z / r).acos();
        let phi = y.atan2(x);
        let rp = r.powf(p);
        let tp = theta * p;
        let pp = phi * p;
        let st = tp.sin();

        state.x = rp * st * pp.cos() + state.c1;
        state.y = rp * st * pp.sin() + state.c2;
        state.z = rp * tp.cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Real Power — Mandelbulb with arbitrary real-valued power
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct RealPower {
    pub power: f64,
}

impl RealPower {
    pub fn new(power: f64) -> Self {
        Self { power }
    }
}

impl Formula for RealPower {
    fn name(&self) -> &str { "Real Power" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                let smooth = (i as f64) + 1.0 - (state.r_sqr.ln().ln() / self.power.ln());
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: smooth,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        state.r_sqr = x * x + y * y + z * z;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        let p = self.power;

        state.dr = r.powf(p - 1.0) * p * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        let theta = (z / r).acos();
        let phi = y.atan2(x);
        let rp = r.powf(p);
        let tp = theta * p;
        let pp = phi * p;
        let st = tp.sin();

        state.x = rp * st * pp.cos() + state.c1;
        state.y = rp * st * pp.sin() + state.c2;
        state.z = rp * tp.cos() + state.c3;

        false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Aexion C — AexionOctCL variant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub struct AexionC;

impl Formula for AexionC {
    fn name(&self) -> &str { "Aexion C" }

    fn compute_de(&self, pos: &Vec3D, max_iter: u32, bailout: f64, julia_c: Option<&Vec3D>) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        state.w = 0.0;
        for i in 0..max_iter {
            state.iteration = i;
            if self.iterate_once(&mut state, bailout) {
                let r = state.r_sqr.sqrt();
                let de = 0.5 * r * r.ln() / state.dr;
                return FormulaResult {
                    de: de.max(0.0),
                    smooth_it: i as f64,
                    orbit_trap: state.orbit_trap,
                    inside: false,
                    iterations: i,
                };
            }
        }
        FormulaResult { de: 0.0, smooth_it: max_iter as f64, inside: true, iterations: max_iter, ..Default::default() }
    }

    fn iterate_once(&self, state: &mut IterationState, bailout: f64) -> bool {
        let x = state.x;
        let y = state.y;
        let z = state.z;
        let w = state.w;

        state.r_sqr = x * x + y * y + z * z + w * w;
        if state.r_sqr > bailout { return true; }

        let r = state.r_sqr.sqrt();
        state.dr = 2.0 * r * state.dr + 1.0;

        let otrap = x.abs().min(y.abs()).min(z.abs());
        if otrap < state.orbit_trap { state.orbit_trap = otrap; }

        // 4D octahedral / bicomplex squaring
        let xx = x * x - y * y - z * z + w * w;
        let yy = 2.0 * (x * y - z * w);
        let zz = 2.0 * (x * z - y * w);
        let ww = 2.0 * (x * w + y * z);

        state.x = xx + state.c1;
        state.y = yy + state.c2;
        state.z = zz + state.c3;
        state.w = ww;

        false
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mandelbulb8_origin_inside() {
        let pos = Vec3D { x: 0.0, y: 0.0, z: 0.0 };
        let result = MandelbulbPower8.compute_de(&pos, 20, 16.0, None);
        assert!(result.inside);
    }

    #[test]
    fn test_mandelbulb8_far_point_outside() {
        let pos = Vec3D { x: 5.0, y: 0.0, z: 0.0 };
        let result = MandelbulbPower8.compute_de(&pos, 20, 16.0, None);
        assert!(!result.inside);
        assert!(result.de > 0.0);
    }

    #[test]
    fn test_mandelbulb8_near_surface() {
        let pos = Vec3D { x: 1.2, y: 0.0, z: 0.0 };
        let result = MandelbulbPower8.compute_de(&pos, 50, 16.0, None);
        // Should be near the surface — small DE
        assert!(result.de < 1.0);
        assert!(!result.inside);
    }

    #[test]
    fn test_amazingbox_origin() {
        let pos = Vec3D { x: 0.0, y: 0.0, z: 0.0 };
        let ab = AmazingBox::default();
        let result = ab.compute_de(&pos, 20, 100.0, None);
        // Origin should be inside the Mandelbox
        assert!(result.inside || result.de < 0.1);
    }

    #[test]
    fn test_quaternion_julia() {
        let pos = Vec3D { x: 0.5, y: 0.5, z: 0.5 };
        let result = QuaternionJulia.compute_de(&pos, 20, 16.0, None);
        assert!(result.de >= 0.0);
    }

    #[test]
    fn test_formula_dispatch() {
        use super::super::FormulaId;
        let formula = FormulaId::from_name("Mandelbulb Power 8");
        assert_eq!(formula, FormulaId::MandelbulbPower8);

        let f = formula.create();
        let pos = Vec3D { x: 2.0, y: 0.0, z: 0.0 };
        let result = f.compute_de(&pos, 20, 16.0, None);
        assert!(result.de > 0.0);
    }
}
