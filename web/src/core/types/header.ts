/**
 * MandHeader — TypeScript representation of TMandHeader10.
 *
 * Port of the ~840-byte packed record from TypeDefinitions.pas.
 * Used for UI binding and serialization; the WASM engine has
 * its own Rust-side copy for computation.
 */

export interface Light {
  /** Position in spherical coordinates */
  theta: number;
  phi: number;
  distance: number;
  /** Color as CSS hex string */
  color: string;
  /** Amplitude 0–2 */
  amplitude: number;
  /** Function type index */
  funcType: number;
  /** Lightmap index (0 = none) */
  lightmap: number;
  /** Specular size */
  specularSize: number;
}

export interface LightingParams {
  lights: Light[];
  /** 10 surface color stops */
  surfaceColors: { position: number; color: string }[];
  /** 4 interior colors */
  interiorColors: string[];
  fogDensity: number;
  fogColor: string;
  ambientIntensity: number;
  ambientColor: string;
  backgroundImage: string;
}

export interface MandHeader {
  /** Image dimensions */
  width: number;
  height: number;

  /** Maximum fractal iterations */
  iterations: number;

  /** 3D position (center of view) */
  posX: number;
  posY: number;
  posZ: number;

  /** Zoom level */
  zoom: number;

  /** Rotation as 3×3 matrix (row-major, 9 doubles) */
  rotation: number[];

  /** Field of view */
  fov: number;

  /** Distance estimator stop threshold */
  deStop: number;

  /** Step width divisor */
  stepWidth: number;

  /** Julia mode */
  julia: boolean;
  juliaX: number;
  juliaY: number;
  juliaZ: number;

  /** Formula configuration */
  formulaSlots: {
    name: string;
    iterations: number;
    options: number[];
  }[];
  hybridMode: 'alternating' | 'interpolated' | '4d';

  /** Lighting */
  lighting: LightingParams;

  /** DOF parameters */
  dofEnabled: boolean;
  dofAperture: number;
  dofFocalLength: number;

  /** Monte Carlo settings */
  mcEnabled: boolean;
  mcMaxRays: number;

  /** Cutting planes */
  cutEnabled: boolean;
  cutPlaneNormal: [number, number, number];
  cutPlaneDistance: number;

  /** Stereo mode */
  stereoMode: number;
  stereoDistance: number;

  /** Reflection/refraction */
  reflectionCount: number;
  refractionIndex: number;
}

/** Create a default header with sensible initial values. */
export function createDefaultHeader(): MandHeader {
  return {
    width: 800,
    height: 600,
    iterations: 12,
    posX: 0.0,
    posY: 0.0,
    posZ: 0.0,
    zoom: 1.0,
    rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], // Identity
    fov: 0.5,
    deStop: 0.001,
    stepWidth: 1.0,
    julia: false,
    juliaX: 0,
    juliaY: 0,
    juliaZ: 0,
    formulaSlots: [
      { name: 'Mandelbulb Power 8', iterations: 1, options: [] },
      { name: '', iterations: 0, options: [] },
      { name: '', iterations: 0, options: [] },
      { name: '', iterations: 0, options: [] },
      { name: '', iterations: 0, options: [] },
      { name: '', iterations: 0, options: [] },
    ],
    hybridMode: 'alternating',
    lighting: {
      lights: Array.from({ length: 6 }, (_, i) => ({
        theta: 0.5,
        phi: 0.3,
        distance: 100,
        color: i === 0 ? '#ffffff' : '#000000',
        amplitude: i === 0 ? 1.0 : 0.0,
        funcType: 0,
        lightmap: 0,
        specularSize: 0.5,
      })),
      surfaceColors: [
        { position: 0.0, color: '#000044' },
        { position: 0.25, color: '#0066ff' },
        { position: 0.5, color: '#ffffff' },
        { position: 0.75, color: '#ff6600' },
        { position: 1.0, color: '#000000' },
      ],
      interiorColors: ['#000000', '#333333', '#666666', '#999999'],
      fogDensity: 0,
      fogColor: '#000000',
      ambientIntensity: 0.3,
      ambientColor: '#404060',
      backgroundImage: '',
    },
    dofEnabled: false,
    dofAperture: 0.01,
    dofFocalLength: 1.0,
    mcEnabled: false,
    mcMaxRays: 1000,
    cutEnabled: false,
    cutPlaneNormal: [0, 1, 0],
    cutPlaneDistance: 0,
    stereoMode: 0,
    stereoDistance: 0.01,
    reflectionCount: 0,
    refractionIndex: 1.5,
  };
}
