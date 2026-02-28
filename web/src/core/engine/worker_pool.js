/**
 * Worker pool manager — port of ThreadUtils.pas threading model.
 *
 * Manages a pool of Web Workers, each loading the WASM compute engine.
 * Workers communicate via SharedArrayBuffer for zero-copy data sharing
 * and Atomics for synchronization.
 */

export class WorkerPool {
  constructor(workerCount) {
    /** @type {Worker[]} */
    this._workers = [];
    /** @type {number} */
    this._workerCount =
      workerCount || Math.min(navigator.hardwareConcurrency || 4, 16);
    /** @type {SharedArrayBuffer|null} */
    this._cancelFlag = null;
    /** @type {boolean} */
    this._initialized = false;
  }

  get initialized() {
    return this._initialized;
  }

  /**
   * Initialize workers by loading the WASM module in each.
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;

    const workerUrl = new URL('../../workers/calc-worker.js', import.meta.url);
    for (let i = 0; i < this._workerCount; i++) {
      const worker = new Worker(workerUrl, {
        type: 'module',
        name: `mb3d-calc-${i}`,
      });
      this._workers.push(worker);
    }

    await Promise.all(
      this._workers.map(
        (w) =>
          new Promise((resolve, reject) => {
            w.onmessage = (e) => {
              if (e.data.type === 'ready') resolve();
              if (e.data.type === 'error') reject(new Error(e.data.message));
            };
            w.postMessage({ type: 'init' });
          })
      )
    );

    this._initialized = true;
  }

  /**
   * Execute a render job across all workers.
   * @param {object} job
   * @param {number} job.width
   * @param {number} job.height
   * @param {Float64Array} job.renderParams
   * @param {Uint32Array} job.formulaIds
   * @param {Float64Array} job.paintParams
   * @param {function} [job.onProgress]
   * @param {function} [job.onComplete]
   * @returns {Promise<Uint8ClampedArray>}
   */
  async render(job) {
    const { width, height, renderParams, formulaIds, paintParams } = job;

    const gbufferSize = width * height * 18;
    const sharedGBuffer = new SharedArrayBuffer(gbufferSize);

    const rgbaSize = width * height * 4;
    const sharedRGBA = new SharedArrayBuffer(rgbaSize);

    this._cancelFlag = new SharedArrayBuffer(4);
    const cancelView = new Int32Array(this._cancelFlag);
    Atomics.store(cancelView, 0, 0);

    const progressBuf = new SharedArrayBuffer(this._workerCount * 4);
    const progressView = new Int32Array(progressBuf);

    const renderPromises = this._workers.map(
      (worker, i) =>
        new Promise((resolve, reject) => {
          worker.onmessage = (e) => {
            if (e.data.type === 'done') resolve();
            if (e.data.type === 'error') reject(new Error(e.data.message));
          };
          worker.postMessage({
            type: 'render',
            gbuffer: sharedGBuffer,
            rgba: sharedRGBA,
            renderParams: renderParams.buffer,
            formulaIds: formulaIds.buffer,
            paintParams: paintParams.buffer,
            width,
            height,
            workerId: i,
            workerCount: this._workerCount,
            cancelFlag: this._cancelFlag,
            progressBuf,
          });
        })
    );

    if (job.onProgress) {
      const totalRows = height;
      const pollProgress = () => {
        if (!this._cancelFlag) return;
        let completed = 0;
        for (let i = 0; i < this._workerCount; i++) {
          completed += Atomics.load(progressView, i);
        }
        job.onProgress(Math.min(completed / totalRows, 1.0));
        if (completed < totalRows) {
          requestAnimationFrame(pollProgress);
        }
      };
      requestAnimationFrame(pollProgress);
    }

    await Promise.all(renderPromises);

    await new Promise((resolve, reject) => {
      this._workers[0].onmessage = (e) => {
        if (e.data.type === 'painted') resolve();
        if (e.data.type === 'error') reject(new Error(e.data.message));
      };
      this._workers[0].postMessage({
        type: 'paint',
        gbuffer: sharedGBuffer,
        rgba: sharedRGBA,
        width,
        height,
        paintParams: paintParams.buffer,
      });
    });

    const rgba = new Uint8ClampedArray(sharedRGBA);
    if (job.onComplete) job.onComplete(rgba);
    return rgba;
  }

  /**
   * Quick single-threaded render (no SharedArrayBuffer needed).
   * @param {Float64Array} renderParams
   * @param {Uint32Array} formulaIds
   * @param {Float64Array} paintParams
   * @param {number} width
   * @param {number} height
   * @returns {Promise<Uint8ClampedArray>}
   */
  async renderQuick(renderParams, formulaIds, paintParams, width, height) {
    return new Promise((resolve, reject) => {
      this._workers[0].onmessage = (e) => {
        if (e.data.type === 'quick-done') {
          resolve(new Uint8ClampedArray(e.data.rgba));
        }
        if (e.data.type === 'error') reject(new Error(e.data.message));
      };
      this._workers[0].postMessage({
        type: 'render-quick',
        renderParams: renderParams.buffer,
        formulaIds: formulaIds.buffer,
        paintParams: paintParams.buffer,
        width,
        height,
      });
    });
  }

  /** Cancel the current render job. */
  cancel() {
    if (this._cancelFlag) {
      Atomics.store(new Int32Array(this._cancelFlag), 0, 1);
    }
  }

  /** Terminate all workers. */
  destroy() {
    this.cancel();
    for (const w of this._workers) w.terminate();
    this._workers = [];
    this._initialized = false;
  }
}
