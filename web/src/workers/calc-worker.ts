/**
 * Calc Worker — runs the WASM compute engine for one thread.
 *
 * Receives render commands from the WorkerPool and executes
 * scanline rendering + painting via the Rust/WASM module.
 */

import initWasm, { render_scanlines, paint_gbuffer, render_quick } from '../wasm/pkg/mb3d_wasm.js';

let wasmReady = false;

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  switch (type) {
    case 'init': {
      try {
        await initWasm();
        wasmReady = true;
        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;
    }

    case 'render': {
      if (!wasmReady) {
        self.postMessage({ type: 'error', message: 'WASM not initialized' });
        return;
      }

      const {
        gbuffer,       // SharedArrayBuffer
        rgba: _rgba,   // SharedArrayBuffer (used in paint phase)
        renderParams,  // Float64Array (transferable)
        formulaIds,    // Uint32Array (transferable)
        paintParams: _paintParams,   // Float64Array (used in paint phase)
        width: _width,
        height: _height,
        workerId,
        workerCount,
        cancelFlag,    // SharedArrayBuffer(4)
        progressBuf,   // SharedArrayBuffer(workerCount * 4)
      } = e.data;

      const cancelView = new Int32Array(cancelFlag);
      const progressView = new Int32Array(progressBuf);
      const gbufferView = new Uint8Array(gbuffer);

      try {
        // Check cancellation before starting
        if (Atomics.load(cancelView, 0) !== 0) {
          self.postMessage({ type: 'done', workerId, rowsCompleted: 0 });
          return;
        }

        // Phase 1: Ray march — render assigned scanlines into G-buffer
        const rowsCompleted = render_scanlines(
          new Float64Array(renderParams),
          new Uint32Array(formulaIds),
          gbufferView,
          workerId,
          workerCount,
        );

        // Update progress
        Atomics.store(progressView, workerId, rowsCompleted);

        // Phase 2: Paint — only worker 0 does the full paint pass
        // (all workers contribute to g-buffer, but painting is done once)
        if (workerId === 0) {
          // Wait for all workers to finish their scanlines
          // The pool will handle synchronization — worker 0's paint
          // will run after Promise.all resolves in the pool manager
        }

        self.postMessage({ type: 'done', workerId, rowsCompleted });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err), workerId });
      }
      break;
    }

    case 'paint': {
      if (!wasmReady) {
        self.postMessage({ type: 'error', message: 'WASM not initialized' });
        return;
      }

      const { gbuffer, rgba, width, height, paintParams } = e.data;
      const gbufferView = new Uint8Array(gbuffer);
      const rgbaView = new Uint8Array(rgba);

      try {
        paint_gbuffer(
          gbufferView,
          rgbaView,
          width,
          height,
          new Float64Array(paintParams),
        );
        self.postMessage({ type: 'painted' });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;
    }

    case 'render-quick': {
      if (!wasmReady) {
        self.postMessage({ type: 'error', message: 'WASM not initialized' });
        return;
      }

      const { renderParams, formulaIds, paintParams, width, height } = e.data;
      const rgbaSize = width * height * 4;
      const rgbaOut = new Uint8Array(rgbaSize);

      try {
        render_quick(
          new Float64Array(renderParams),
          new Uint32Array(formulaIds),
          new Float64Array(paintParams),
          rgbaOut,
        );
        self.postMessage(
          { type: 'quick-done', rgba: rgbaOut.buffer, width, height },
          [rgbaOut.buffer] as any, // Transfer ownership
        );
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;
    }
  }
};
