/**
 * Application state management — central store connecting components
 * to the render engine.
 *
 * Uses EventTarget for reactive state updates. Components listen for
 * state changes and the render engine is triggered when parameters change.
 */

import { createDefaultHeader } from '../types/header.js';
import { WorkerPool } from './worker_pool.js';
import {
  buildRenderParams,
  buildFormulaIds,
  buildPaintParams,
} from '../types/params.js';

/**
 * Central application state.
 * @extends EventTarget
 */
export class AppState extends EventTarget {
  constructor() {
    super();
    /** @type {object} The current fractal parameters */
    this.header = createDefaultHeader();
    /** @type {string} Current app status: idle | rendering | navigating | error */
    this.status = 'idle';
    /** @type {WorkerPool} */
    this.pool = new WorkerPool();
    /** @type {boolean} */
    this._poolReady = false;
    /** @type {Uint8ClampedArray|null} */
    this.lastRGBA = null;
  }

  /**
   * Initialize the worker pool (call once at startup).
   * @returns {Promise<void>}
   */
  async initPool() {
    if (this._poolReady) return;
    try {
      this.setStatus('rendering');
      await this.pool.init();
      this._poolReady = true;
      this.setStatus('idle');
    } catch (err) {
      console.error('Failed to initialize worker pool:', err);
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Update status and dispatch event.
   * @param {string} status
   */
  setStatus(status) {
    this.status = status;
    this.dispatchEvent(
      new CustomEvent('status-change', { detail: { status } })
    );
  }

  /**
   * Update header parameters and dispatch event.
   * @param {object} partial
   */
  updateHeader(partial) {
    Object.assign(this.header, partial);
    this.dispatchEvent(
      new CustomEvent('header-change', { detail: { header: this.header } })
    );
  }

  /**
   * Start a full multi-threaded render.
   * @param {function} [onProgress]
   * @returns {Promise<Uint8ClampedArray>}
   */
  async render(onProgress) {
    if (!this._poolReady) {
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
          if (onProgress) onProgress(frac);
          this.dispatchEvent(
            new CustomEvent('render-progress', { detail: { fraction: frac } })
          );
        },
        onComplete: (data) => {
          this.lastRGBA = data;
        },
      });

      const elapsed = performance.now() - startTime;
      this.setStatus('idle');
      this.dispatchEvent(
        new CustomEvent('render-complete', {
          detail: {
            rgba,
            elapsed,
            width: this.header.width,
            height: this.header.height,
          },
        })
      );

      return rgba;
    } catch (err) {
      this.setStatus('error');
      this.dispatchEvent(
        new CustomEvent('render-error', { detail: { error: err } })
      );
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
