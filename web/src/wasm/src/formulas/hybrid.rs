/// Hybrid formula system — port of doHybridPas / doHybridPasDE from formulas.pas.
///
/// Combines up to 6 formula slots in different modes:
/// - Alternating: cycles through formulas, each running its iteration count
/// - Interpolated: blends between formula results
/// - 4D: extends to 4-dimensional hybrid iteration

use crate::engine::types::Vec3D;
use super::{Formula, FormulaId, FormulaResult, IterationState};

/// Hybrid mode matching the UI radio buttons.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum HybridMode {
    Alternating,
    Interpolated,
    FourD,
}

impl HybridMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "interpolated" => HybridMode::Interpolated,
            "4d" => HybridMode::FourD,
            _ => HybridMode::Alternating,
        }
    }
}

/// A single slot in the hybrid formula configuration.
pub struct HybridSlot {
    /// Formula for this slot
    pub formula: Box<dyn Formula>,
    /// Number of iterations to run this formula per cycle
    pub iterations: u32,
    /// Whether this slot is active
    pub active: bool,
}

/// Hybrid formula combiner — runs multiple formulas in sequence.
pub struct HybridFormula {
    pub slots: Vec<HybridSlot>,
    pub mode: HybridMode,
    pub total_iterations: u32,
    pub bailout: f64,
}

impl HybridFormula {
    /// Create from a list of (FormulaId, iteration_count) pairs.
    pub fn new(
        slot_configs: &[(FormulaId, u32)],
        mode: HybridMode,
        total_iterations: u32,
        bailout: f64,
    ) -> Self {
        let slots: Vec<HybridSlot> = slot_configs
            .iter()
            .map(|(id, iters)| HybridSlot {
                formula: id.create(),
                iterations: *iters,
                active: *id != FormulaId::None && *iters > 0,
            })
            .collect();

        Self { slots, mode, total_iterations, bailout }
    }

    /// Get the active slot count.
    fn active_count(&self) -> usize {
        self.slots.iter().filter(|s| s.active).count()
    }

    /// Compute DE using the hybrid system.
    pub fn compute_de(&self, pos: &Vec3D, julia_c: Option<&Vec3D>) -> FormulaResult {
        let active: Vec<usize> = self.slots.iter()
            .enumerate()
            .filter(|(_, s)| s.active)
            .map(|(i, _)| i)
            .collect();

        if active.is_empty() {
            return FormulaResult::default();
        }

        // Single formula — delegate directly
        if active.len() == 1 {
            let slot = &self.slots[active[0]];
            return slot.formula.compute_de(pos, self.total_iterations, self.bailout, julia_c);
        }

        // Multi-formula hybrid
        match self.mode {
            HybridMode::Alternating => self.compute_alternating(pos, julia_c, &active),
            HybridMode::Interpolated => self.compute_interpolated(pos, julia_c, &active),
            HybridMode::FourD => self.compute_4d(pos, julia_c, &active),
        }
    }

    /// Alternating mode: cycle through formulas, each running its slot's iteration count.
    /// Port of doHybridPasDE from formulas.pas.
    fn compute_alternating(&self, pos: &Vec3D, julia_c: Option<&Vec3D>, active: &[usize]) -> FormulaResult {
        let mut state = IterationState::new(pos, julia_c);
        let mut total_iters = 0u32;
        let mut slot_idx = 0usize;

        'outer: loop {
            let si = active[slot_idx % active.len()];
            let slot = &self.slots[si];
            let slot_iters = slot.iterations.max(1);

            for _ in 0..slot_iters {
                if total_iters >= self.total_iterations {
                    break 'outer;
                }

                if slot.formula.iterate_once(&mut state, self.bailout) {
                    // Escaped
                    let r = state.r_sqr.sqrt();
                    let de = if state.dr.abs() > 1e-30 {
                        0.5 * r * r.ln() / state.dr
                    } else {
                        r * 0.5
                    };
                    return FormulaResult {
                        de: de.max(0.0),
                        smooth_it: total_iters as f64,
                        orbit_trap: state.orbit_trap,
                        inside: false,
                        iterations: total_iters,
                    };
                }

                total_iters += 1;
            }

            slot_idx += 1;
        }

        // Didn't escape — inside
        FormulaResult {
            de: 0.0,
            smooth_it: self.total_iterations as f64,
            orbit_trap: state.orbit_trap,
            inside: true,
            iterations: self.total_iterations,
        }
    }

    /// Interpolated mode: blend iteration results from two formulas.
    fn compute_interpolated(&self, pos: &Vec3D, julia_c: Option<&Vec3D>, active: &[usize]) -> FormulaResult {
        if active.len() < 2 {
            return self.compute_alternating(pos, julia_c, active);
        }

        // Run both formulas independently and blend the DEs
        let r1 = self.slots[active[0]].formula.compute_de(
            pos, self.total_iterations, self.bailout, julia_c
        );
        let r2 = self.slots[active[1]].formula.compute_de(
            pos, self.total_iterations, self.bailout, julia_c
        );

        let blend = 0.5;
        FormulaResult {
            de: r1.de * (1.0 - blend) + r2.de * blend,
            smooth_it: r1.smooth_it * (1.0 - blend) + r2.smooth_it * blend,
            orbit_trap: r1.orbit_trap.min(r2.orbit_trap),
            inside: r1.inside && r2.inside,
            iterations: r1.iterations.max(r2.iterations),
        }
    }

    /// 4D hybrid mode: extend iteration to 4D space.
    fn compute_4d(&self, pos: &Vec3D, julia_c: Option<&Vec3D>, active: &[usize]) -> FormulaResult {
        // For now, delegate to alternating; 4D extension requires formula-specific 4D support
        self.compute_alternating(pos, julia_c, active)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hybrid_single_formula() {
        let hybrid = HybridFormula::new(
            &[(FormulaId::MandelbulbPower8, 1)],
            HybridMode::Alternating,
            20,
            16.0,
        );
        let pos = Vec3D { x: 2.0, y: 0.0, z: 0.0 };
        let result = hybrid.compute_de(&pos, None);
        assert!(result.de > 0.0);
        assert!(!result.inside);
    }

    #[test]
    fn test_hybrid_two_formulas() {
        let hybrid = HybridFormula::new(
            &[
                (FormulaId::MandelbulbPower8, 1),
                (FormulaId::MandelbulbPower2, 1),
            ],
            HybridMode::Alternating,
            20,
            16.0,
        );
        let pos = Vec3D { x: 0.0, y: 0.0, z: 0.0 };
        let result = hybrid.compute_de(&pos, None);
        assert!(result.inside);
    }
}
