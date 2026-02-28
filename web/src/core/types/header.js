/**
 * MandHeader — JavaScript representation of TMandHeader10.
 *
 * Port of the ~840-byte packed record from TypeDefinitions.pas.
 * Used for UI binding and serialization; the WASM engine has
 * its own Rust-side copy for computation.
 */

/**
 * Create a default header with sensible initial values.
 * @returns {object} A MandHeader object.
 */
export function createDefaultHeader() {
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
