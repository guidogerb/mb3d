/**
 * Application state management — central store connecting components to the render engine.
 *
 * Uses EventTarget for reactive state updates. Components listen for state changes
 * and the render engine is triggered when parameters change.
 */

import { MandHeader, createDefaultHeader } from '../types/header.js';
import { WorkerPool } from './worker_pool.js';
import { buildRenderParams, buildFormulaIds, buildPaintParams } from '../types/params.js';

export type AppStatus = 'idle' | 'rendering' | 'navigating' | 'error';

/**
 * Central application state.
 */
export class AppState extends EventTarget {
  /** The current fractal parameters */
  header: MandHeader;

  /** Current application status */
  status: AppStatus = 'idle';

  /** Worker pool for multi-threaded rendering */
  pool: WorkerPool;

  /** Whether the pool has been initialized */
  private poolReady = false;

  /** Last rendered RGBA data */
  lastRGBA: Uint8ClampedArray | null = null;

  constructor() {
    super();
    this.header = createDefaultHeader();
    this.pool = new WorkerPool();
  }

  /** Initialize the worker pool (call once at startup). */
  async initPool(): Promise<void> {
    if (this.poolReady) return;
    try {
      this.setStatus('rendering');
      await this.pool.init();
      this.poolReady = true;
      this.setStatus('idle');
    } catch (err) {
      console.error('Failed to initialize worker pool:', err);
      this.setStatus('error');
      throw err;
    }
  }

  /** Update status and dispatch event. */
  setStatus(status: AppStatus) {
    this.status = status;
    this.dispatchEvent(new CustomEvent('status-change', { detail: { status } }));
  }

  /** Update header parameters and dispatch event. */
  updateHeader(partial: Partial<MandHeader>) {
    Object.assign(this.header, partial);
    this.dispatchEvent(new CustomEvent('header-change', { detail: { header: this.header } }));
  }

  /** Start a full multi-threaded render. */
  async render(onProgress?: (fraction: number) => void): Promise<Uint8ClampedArray> {
    if (!this.poolReady) {
      await this.initPool();
    }

    this.setStatus('rendering');

    const startTime = performance.now();

    try {
      const renderParams = buildRenderParams(this.header);
      const formulaIds = buildFormulaIds(this.header);
      const paintParams = buildPaintParams(this.header);

      const rgba = await this.pool.render({
        width: this.header.width,
        height: this.header.height,
        renderParams,
        formulaIds,
        paintParams,
        onProgress: (frac) => {
          onProgress?.(frac);
          this.dispatchEvent(new CustomEvent('render-progress', { detail: { fraction: frac } }));
        },
        onComplete: (data) => {
          this.lastRGBA = data;
        },
      });

      const elapsed = performance.now() - startTime;
      this.setStatus('idle');
      this.dispatchEvent(new CustomEvent('render-complete', {
        detail: { rgba, elapsed, width: this.header.width, height: this.header.height }
      }));

      return rgba;
    } catch (err) {
      this.setStatus('error');
      this.dispatchEvent(new CustomEvent('render-error', { detail: { error: err } }));
      throw err;
    }
  }

  /** Cancel current render. */
  cancelRender() {
    this.pool.cancel();
    this.setStatus('idle');
  }

  /** Clean up resources. */
  destroy() {
    this.pool.destroy();
  }
}
