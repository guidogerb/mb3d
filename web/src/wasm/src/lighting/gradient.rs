/// Color gradient system — port of ColorMapper.pas.
///
/// Maps smooth iteration values to colors via a configurable gradient
/// with multiple color stops. This is a key part of the fractal coloring
/// pipeline, determining the visual appearance of the surface.

use crate::math::utils;

/// A single color stop in the gradient.
#[derive(Clone, Copy, Debug)]
pub struct ColorStop {
    /// Position in [0, 1] range
    pub position: f64,
    /// RGB color as f64 in [0, 1] range
    pub r: f64,
    pub g: f64,
    pub b: f64,
}

/// Color gradient with interpolation between stops.
#[derive(Clone, Debug)]
pub struct ColorGradient {
    pub stops: Vec<ColorStop>,
}

impl Default for ColorGradient {
    fn default() -> Self {
        // Default gradient matching the MB3D "Blue-Orange" palette
        Self {
            stops: vec![
                ColorStop { position: 0.0, r: 0.0, g: 0.0, b: 0.27 },    // #000044
                ColorStop { position: 0.25, r: 0.0, g: 0.4, b: 1.0 },    // #0066ff
                ColorStop { position: 0.5, r: 1.0, g: 1.0, b: 1.0 },     // #ffffff
                ColorStop { position: 0.75, r: 1.0, g: 0.4, b: 0.0 },    // #ff6600
                ColorStop { position: 1.0, r: 0.0, g: 0.0, b: 0.0 },     // #000000
            ],
        }
    }
}

impl ColorGradient {
    /// Create a gradient from an array of (position, r, g, b) tuples.
    pub fn from_stops(stops: &[(f64, f64, f64, f64)]) -> Self {
        let stops = stops.iter()
            .map(|(pos, r, g, b)| ColorStop { position: *pos, r: *r, g: *g, b: *b })
            .collect();
        Self { stops }
    }

    /// Create from a flat f64 array: [pos, r, g, b, pos, r, g, b, ...]
    pub fn from_flat(data: &[f64]) -> Self {
        let mut stops = Vec::new();
        let mut i = 0;
        while i + 3 < data.len() {
            stops.push(ColorStop {
                position: data[i],
                r: data[i + 1],
                g: data[i + 2],
                b: data[i + 3],
            });
            i += 4;
        }
        if stops.is_empty() {
            return Self::default();
        }
        Self { stops }
    }

    /// Sample the gradient at position t (normalized to [0,1]).
    /// Uses linear interpolation between stops.
    pub fn sample(&self, t: f64) -> (f64, f64, f64) {
        let t = utils::clamp(t, 0.0, 1.0);

        if self.stops.is_empty() {
            return (0.0, 0.0, 0.0);
        }

        if self.stops.len() == 1 {
            let s = &self.stops[0];
            return (s.r, s.g, s.b);
        }

        // Find the two surrounding stops
        if t <= self.stops[0].position {
            let s = &self.stops[0];
            return (s.r, s.g, s.b);
        }

        let last = self.stops.len() - 1;
        if t >= self.stops[last].position {
            let s = &self.stops[last];
            return (s.r, s.g, s.b);
        }

        for i in 0..last {
            let s0 = &self.stops[i];
            let s1 = &self.stops[i + 1];
            if t >= s0.position && t <= s1.position {
                let range = s1.position - s0.position;
                let frac = if range > 1e-10 { (t - s0.position) / range } else { 0.0 };
                return (
                    utils::lerp(s0.r, s1.r, frac),
                    utils::lerp(s0.g, s1.g, frac),
                    utils::lerp(s0.b, s1.b, frac),
                );
            }
        }

        let s = &self.stops[last];
        (s.r, s.g, s.b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gradient_endpoints() {
        let g = ColorGradient::default();
        let (r, _, b) = g.sample(0.0);
        assert!((r - 0.0).abs() < 0.01);
        assert!((b - 0.27).abs() < 0.01);

        let (r, _, _) = g.sample(1.0);
        assert!((r - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_gradient_midpoint() {
        let g = ColorGradient::default();
        let (r, g_val, b) = g.sample(0.5);
        assert!((r - 1.0).abs() < 0.01);
        assert!((g_val - 1.0).abs() < 0.01);
        assert!((b - 1.0).abs() < 0.01);
    }
}
