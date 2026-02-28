/**
 * Worker pool manager — port of ThreadUtils.pas threading model.
 *
 * Manages a pool of Web Workers, each loading the WASM compute engine.
 * Workers communicate via SharedArrayBuffer for zero-copy data sharing
 * and Atomics for synchronization.
 */

export interface RenderJob {
  width: number;
  height: number;
  /** Float64Array of render parameters (camera, DE settings, etc.) */
  renderParams: Float64Array;
  /** Uint32Array of formula IDs and hybrid mode */
  formulaIds: Uint32Array;
  /** Float64Array of paint/lighting parameters */
  paintParams: Float64Array;
  onProgress?: (fraction: number) => void;
  onComplete?: (rgbaData: Uint8ClampedArray) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private workerCount: number;
  private cancelFlag: SharedArrayBuffer | null = null;
  private _initialized = false;

  constructor(workerCount?: number) {
    // Default to hardware concurrency, capped at 16
    this.workerCount = workerCount || Math.min(navigator.hardwareConcurrency || 4, 16);
  }

  get initialized() { return this._initialized; }

  /** Initialize workers by loading the WASM module in each. */
  async init(): Promise<void> {
    if (this._initialized) return;

    const workerUrl = new URL('../../workers/calc-worker.ts', import.meta.url);
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(workerUrl, { type: 'module', name: `mb3d-calc-${i}` });
      this.workers.push(worker);
    }

    // Wait for all workers to report ready (WASM loaded)
    await Promise.all(this.workers.map(w =>
      new Promise<void>((resolve, reject) => {
        w.onmessage = (e) => {
          if (e.data.type === 'ready') resolve();
          if (e.data.type === 'error') reject(new Error(e.data.message));
        };
        w.postMessage({ type: 'init' });
      })
    ));

    this._initialized = true;
  }

  /** Execute a render job across all workers. */
  async render(job: RenderJob): Promise<Uint8ClampedArray> {
    const { width, height, renderParams, formulaIds, paintParams } = job;

    // G-buffer: SiLight5 = 18 bytes per pixel
    const gbufferSize = width * height * 18;
    const sharedGBuffer = new SharedArrayBuffer(gbufferSize);

    // RGBA output: 4 bytes per pixel
    const rgbaSize = width * height * 4;
    const sharedRGBA = new SharedArrayBuffer(rgbaSize);

    // Cancel flag: single i32
    this.cancelFlag = new SharedArrayBuffer(4);
    const cancelView = new Int32Array(this.cancelFlag);
    Atomics.store(cancelView, 0, 0);

    // Progress: one i32 per worker (rows completed)
    const progressBuf = new SharedArrayBuffer(this.workerCount * 4);
    const progressView = new Int32Array(progressBuf);

    // Dispatch ray marching to all workers
    const renderPromises = this.workers.map((worker, i) =>
      new Promise<void>((resolve, reject) => {
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
          workerCount: this.workerCount,
          cancelFlag: this.cancelFlag,
          progressBuf,
        });
      })
    );

    // Poll progress
    if (job.onProgress) {
      const totalRows = height;
      const pollProgress = () => {
        if (!this.cancelFlag) return;
        let completed = 0;
        for (let i = 0; i < this.workerCount; i++) {
          completed += Atomics.load(progressView, i);
        }
        job.onProgress!(Math.min(completed / totalRows, 1.0));
        if (completed < totalRows) {
          requestAnimationFrame(pollProgress);
        }
      };
      requestAnimationFrame(pollProgress);
    }

    // Wait for all workers to finish ray marching
    await Promise.all(renderPromises);

    // Paint pass: ask worker 0 to shade the G-buffer
    await new Promise<void>((resolve, reject) => {
      this.workers[0].onmessage = (e) => {
        if (e.data.type === 'painted') resolve();
        if (e.data.type === 'error') reject(new Error(e.data.message));
      };
      this.workers[0].postMessage({
        type: 'paint',
        gbuffer: sharedGBuffer,
        rgba: sharedRGBA,
        width,
        height,
        paintParams: paintParams.buffer,
      });
    });

    const rgba = new Uint8ClampedArray(sharedRGBA);
    job.onComplete?.(rgba);
    return rgba;
  }

  /** Quick single-threaded render (no SharedArrayBuffer needed). */
  async renderQuick(
    renderParams: Float64Array,
    formulaIds: Uint32Array,
    paintParams: Float64Array,
    width: number,
    height: number,
  ): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => {
      this.workers[0].onmessage = (e) => {
        if (e.data.type === 'quick-done') {
          resolve(new Uint8ClampedArray(e.data.rgba));
        }
        if (e.data.type === 'error') reject(new Error(e.data.message));
      };
      this.workers[0].postMessage({
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
    if (this.cancelFlag) {
      Atomics.store(new Int32Array(this.cancelFlag), 0, 1);
    }
  }

  /** Terminate all workers. */
  destroy() {
    this.cancel();
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this._initialized = false;
  }
}

