/// 3D Math library — port of Math3D.pas
///
/// Vector, matrix, and quaternion operations with f64 precision.
/// WASM SIMD optimizations will be added incrementally.

use crate::engine::types::{Matrix3, Vec3D};

// ─── Vector operations ───────────────────────────────────────

#[inline(always)]
pub fn vec3d_add(a: &Vec3D, b: &Vec3D) -> Vec3D {
    Vec3D {
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z,
    }
}

#[inline(always)]
pub fn vec3d_sub(a: &Vec3D, b: &Vec3D) -> Vec3D {
    Vec3D {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    }
}

#[inline(always)]
pub fn vec3d_scale(v: &Vec3D, s: f64) -> Vec3D {
    Vec3D {
        x: v.x * s,
        y: v.y * s,
        z: v.z * s,
    }
}

#[inline(always)]
pub fn vec3d_dot(a: &Vec3D, b: &Vec3D) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z
}

#[inline(always)]
pub fn vec3d_cross(a: &Vec3D, b: &Vec3D) -> Vec3D {
    Vec3D {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    }
}

#[inline(always)]
pub fn vec3d_length(v: &Vec3D) -> f64 {
    (v.x * v.x + v.y * v.y + v.z * v.z).sqrt()
}

#[inline(always)]
pub fn vec3d_length_sqr(v: &Vec3D) -> f64 {
    v.x * v.x + v.y * v.y + v.z * v.z
}

#[inline(always)]
pub fn vec3d_normalize(v: &mut Vec3D) {
    let len = vec3d_length(v);
    if len > 1e-30 {
        let inv = 1.0 / len;
        v.x *= inv;
        v.y *= inv;
        v.z *= inv;
    }
}

#[inline(always)]
pub fn vec3d_normalized(v: &Vec3D) -> Vec3D {
    let mut result = *v;
    vec3d_normalize(&mut result);
    result
}

// ─── Matrix operations ───────────────────────────────────────

/// Multiply matrix × vector: result = M * v
#[inline]
pub fn mat3_mul_vec(m: &Matrix3, v: &Vec3D) -> Vec3D {
    Vec3D {
        x: m.m[0][0] * v.x + m.m[0][1] * v.y + m.m[0][2] * v.z,
        y: m.m[1][0] * v.x + m.m[1][1] * v.y + m.m[1][2] * v.z,
        z: m.m[2][0] * v.x + m.m[2][1] * v.y + m.m[2][2] * v.z,
    }
}

/// Multiply two 3×3 matrices: result = A * B
pub fn mat3_mul(a: &Matrix3, b: &Matrix3) -> Matrix3 {
    let mut result = Matrix3::default();
    for i in 0..3 {
        for j in 0..3 {
            result.m[i][j] = a.m[i][0] * b.m[0][j]
                           + a.m[i][1] * b.m[1][j]
                           + a.m[i][2] * b.m[2][j];
        }
    }
    result
}

/// Transpose a 3×3 matrix
pub fn mat3_transpose(m: &Matrix3) -> Matrix3 {
    Matrix3 {
        m: [
            [m.m[0][0], m.m[1][0], m.m[2][0]],
            [m.m[0][1], m.m[1][1], m.m[2][1]],
            [m.m[0][2], m.m[1][2], m.m[2][2]],
        ],
    }
}

/// Build identity matrix
pub fn mat3_identity() -> Matrix3 {
    Matrix3 {
        m: [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ],
    }
}

/// Build rotation matrix from Euler angles (in radians).
/// Matching Math3D.pas RotateMatrixXYZ convention.
pub fn mat3_from_euler(rx: f64, ry: f64, rz: f64) -> Matrix3 {
    let (sx, cx) = rx.sin_cos();
    let (sy, cy) = ry.sin_cos();
    let (sz, cz) = rz.sin_cos();

    Matrix3 {
        m: [
            [cy * cz, -cy * sz, sy],
            [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
            [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
        ],
    }
}

// ─── Quaternion operations ───────────────────────────────────

/// Quaternion as [w, x, y, z]
#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub struct Quaternion {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quaternion {
    pub fn identity() -> Self {
        Quaternion { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }
    }

    #[inline]
    pub fn length(&self) -> f64 {
        (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    #[inline]
    pub fn normalize(&mut self) {
        let len = self.length();
        if len > 1e-30 {
            let inv = 1.0 / len;
            self.w *= inv;
            self.x *= inv;
            self.y *= inv;
            self.z *= inv;
        }
    }

    /// Quaternion multiplication
    pub fn mul(&self, other: &Quaternion) -> Quaternion {
        Quaternion {
            w: self.w * other.w - self.x * other.x - self.y * other.y - self.z * other.z,
            x: self.w * other.x + self.x * other.w + self.y * other.z - self.z * other.y,
            y: self.w * other.y - self.x * other.z + self.y * other.w + self.z * other.x,
            z: self.w * other.z + self.x * other.y - self.y * other.x + self.z * other.w,
        }
    }

    /// Spherical linear interpolation (SLERP) — port from Interpolation.pas
    pub fn slerp(&self, other: &Quaternion, t: f64) -> Quaternion {
        let mut dot = self.w * other.w + self.x * other.x + self.y * other.y + self.z * other.z;

        // If dot is negative, negate one quaternion to take the shorter path
        let mut other = *other;
        if dot < 0.0 {
            other.w = -other.w;
            other.x = -other.x;
            other.y = -other.y;
            other.z = -other.z;
            dot = -dot;
        }

        // Clamp dot to valid range for acos
        let dot = dot.min(1.0);

        let theta = dot.acos();
        if theta.abs() < 1e-10 {
            return *self; // Quaternions are nearly identical
        }

        let sin_theta = theta.sin();
        let s0 = ((1.0 - t) * theta).sin() / sin_theta;
        let s1 = (t * theta).sin() / sin_theta;

        Quaternion {
            w: s0 * self.w + s1 * other.w,
            x: s0 * self.x + s1 * other.x,
            y: s0 * self.y + s1 * other.y,
            z: s0 * self.z + s1 * other.z,
        }
    }

    /// Convert quaternion to 3×3 rotation matrix
    pub fn to_matrix3(&self) -> Matrix3 {
        let xx = self.x * self.x;
        let yy = self.y * self.y;
        let zz = self.z * self.z;
        let xy = self.x * self.y;
        let xz = self.x * self.z;
        let yz = self.y * self.z;
        let wx = self.w * self.x;
        let wy = self.w * self.y;
        let wz = self.w * self.z;

        Matrix3 {
            m: [
                [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)],
                [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)],
                [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)],
            ],
        }
    }

    /// Build quaternion from 3×3 rotation matrix
    pub fn from_matrix3(m: &Matrix3) -> Quaternion {
        let trace = m.m[0][0] + m.m[1][1] + m.m[2][2];
        let mut q = Quaternion::default();

        if trace > 0.0 {
            let s = (trace + 1.0).sqrt() * 2.0;
            q.w = 0.25 * s;
            q.x = (m.m[2][1] - m.m[1][2]) / s;
            q.y = (m.m[0][2] - m.m[2][0]) / s;
            q.z = (m.m[1][0] - m.m[0][1]) / s;
        } else if m.m[0][0] > m.m[1][1] && m.m[0][0] > m.m[2][2] {
            let s = (1.0 + m.m[0][0] - m.m[1][1] - m.m[2][2]).sqrt() * 2.0;
            q.w = (m.m[2][1] - m.m[1][2]) / s;
            q.x = 0.25 * s;
            q.y = (m.m[0][1] + m.m[1][0]) / s;
            q.z = (m.m[0][2] + m.m[2][0]) / s;
        } else if m.m[1][1] > m.m[2][2] {
            let s = (1.0 + m.m[1][1] - m.m[0][0] - m.m[2][2]).sqrt() * 2.0;
            q.w = (m.m[0][2] - m.m[2][0]) / s;
            q.x = (m.m[0][1] + m.m[1][0]) / s;
            q.y = 0.25 * s;
            q.z = (m.m[1][2] + m.m[2][1]) / s;
        } else {
            let s = (1.0 + m.m[2][2] - m.m[0][0] - m.m[1][1]).sqrt() * 2.0;
            q.w = (m.m[1][0] - m.m[0][1]) / s;
            q.x = (m.m[0][2] + m.m[2][0]) / s;
            q.y = (m.m[1][2] + m.m[2][1]) / s;
            q.z = 0.25 * s;
        }

        q.normalize();
        q
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec3d_normalize() {
        let mut v = Vec3D { x: 3.0, y: 0.0, z: 4.0 };
        vec3d_normalize(&mut v);
        assert!((v.x - 0.6).abs() < 1e-10);
        assert!((v.y - 0.0).abs() < 1e-10);
        assert!((v.z - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_vec3d_cross() {
        let a = Vec3D { x: 1.0, y: 0.0, z: 0.0 };
        let b = Vec3D { x: 0.0, y: 1.0, z: 0.0 };
        let c = vec3d_cross(&a, &b);
        assert!((c.x - 0.0).abs() < 1e-10);
        assert!((c.y - 0.0).abs() < 1e-10);
        assert!((c.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_mat3_identity() {
        let i = mat3_identity();
        let v = Vec3D { x: 1.0, y: 2.0, z: 3.0 };
        let r = mat3_mul_vec(&i, &v);
        assert!((r.x - 1.0).abs() < 1e-10);
        assert!((r.y - 2.0).abs() < 1e-10);
        assert!((r.z - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_quaternion_identity() {
        let q = Quaternion::identity();
        let m = q.to_matrix3();
        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((m.m[i][j] - expected).abs() < 1e-10);
            }
        }
    }

    #[test]
    fn test_quaternion_slerp_endpoints() {
        let a = Quaternion::identity();
        let b = Quaternion { w: 0.707107, x: 0.707107, y: 0.0, z: 0.0 };

        let r0 = a.slerp(&b, 0.0);
        assert!((r0.w - a.w).abs() < 1e-5);

        let r1 = a.slerp(&b, 1.0);
        assert!((r1.w - b.w).abs() < 1e-5);
        assert!((r1.x - b.x).abs() < 1e-5);
    }

    #[test]
    fn test_mat3_rotation_roundtrip() {
        let m = mat3_from_euler(0.3, 0.5, 0.7);
        let q = Quaternion::from_matrix3(&m);
        let m2 = q.to_matrix3();
        for i in 0..3 {
            for j in 0..3 {
                assert!((m.m[i][j] - m2.m[i][j]).abs() < 1e-9,
                    "Mismatch at [{i}][{j}]: {} vs {}", m.m[i][j], m2.m[i][j]);
            }
        }
    }
}
