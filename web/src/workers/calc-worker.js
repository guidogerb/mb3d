/**
 * calc-worker.js — Web Worker that owns one WASM instance.
 *
 * Messages accepted:
 *  - { type: 'init', wasmUrl }              → instantiate WASM module
 *  - { type: 'render', ... }                → call render_scanlines()
 *  - { type: 'paint',  ... }                → call paint_gbuffer()
 *  - { type: 'render-quick', ... }          → call render_quick()
 */

/* global self, SharedArrayBuffer, Atomics, Float64Array, Uint32Array, Uint8Array */

let wasmModule = null;

/**
 * Initialise the WASM module from the given URL.
 * @param {string} wasmUrl
 */
async function initWasm(wasmUrl) {
  const mod = await import(wasmUrl);
  await mod.default();
  wasmModule = mod;
  self.postMessage({ type: 'ready' });
}

/**
 * Run a render_scanlines job.
 * @param {object} data
 */
function handleRender(data) {
  if (!wasmModule) {
    self.postMessage({ type: 'error', error: 'WASM not initialised' });
    return;
  }
  try {
    const params = new Float64Array(data.params);
    const formulaIds = new Uint32Array(data.formulaIds);
    const gbuf = wasmModule.render_scanlines(
      params,
      formulaIds,
      data.width,
      data.height,
      data.yStart,
      data.yEnd
    );
    self.postMessage(
      { type: 'render-done', gbuf, yStart: data.yStart, yEnd: data.yEnd },
      [gbuf.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

/**
 * Run a paint_gbuffer job — convert g-buffer to RGBA pixels.
 * @param {object} data
 */
function handlePaint(data) {
  if (!wasmModule) {
    self.postMessage({ type: 'error', error: 'WASM not initialised' });
    return;
  }
  try {
    const gbuf = new Float64Array(data.gbuf);
    const paintParams = new Float64Array(data.paintParams);
    const rgba = wasmModule.paint_gbuffer(
      gbuf,
      paintParams,
      data.width,
      data.height
    );
    self.postMessage(
      { type: 'paint-done', rgba, yStart: data.yStart, yEnd: data.yEnd },
      [rgba.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

/**
 * Run a low-resolution quick preview render.
 * @param {object} data
 */
function handleRenderQuick(data) {
  if (!wasmModule) {
    self.postMessage({ type: 'error', error: 'WASM not initialised' });
    return;
  }
  try {
    const params = new Float64Array(data.params);
    const formulaIds = new Uint32Array(data.formulaIds);
    const rgba = wasmModule.render_quick(
      params,
      formulaIds,
      data.width,
      data.height,
      data.step
    );
    self.postMessage({ type: 'quick-done', rgba }, [rgba.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

self.addEventListener('message', async (e) => {
  const { type } = e.data;
  switch (type) {
    case 'init':
      await initWasm(e.data.wasmUrl);
      break;
    case 'render':
      handleRender(e.data);
      break;
    case 'paint':
      handlePaint(e.data);
      break;
    case 'render-quick':
      handleRenderQuick(e.data);
      break;
    default:
      self.postMessage({ type: 'error', error: `Unknown message type: ${type}` });
  }
});
