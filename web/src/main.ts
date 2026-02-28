/**
 * Mandelbulb3D Web — Entry Point
 *
 * Registers all Web Components, creates the central AppState,
 * and wires component events to the render engine.
 */

import { MB3DApp } from './components/app/mb3d-app.js';
import { MB3DViewer } from './components/viewer/mb3d-viewer.js';
import { MB3DNavigator } from './components/navigator/mb3d-navigator.js';
import { MB3DControls } from './components/controls/mb3d-controls.js';
import { MB3DFormulaPanel } from './components/formulas/mb3d-formula-panel.js';
import { MB3DLightEditor } from './components/lighting/mb3d-light-editor.js';
import { MB3DColorPicker } from './components/color/mb3d-color-picker.js';
import { AppState } from './core/engine/state.js';
import { buildRenderParams, buildFormulaIds, buildPaintParams } from './core/types/params.js';

// Register custom elements
customElements.define('mb3d-app', MB3DApp);
customElements.define('mb3d-viewer', MB3DViewer);
customElements.define('mb3d-navigator', MB3DNavigator);
customElements.define('mb3d-controls', MB3DControls);
customElements.define('mb3d-formula-panel', MB3DFormulaPanel);
customElements.define('mb3d-light-editor', MB3DLightEditor);
customElements.define('mb3d-color-picker', MB3DColorPicker);

// ── Bootstrap ────────────────────────────────────────────

const state = new AppState();

// Wait for the DOM to be ready, then wire events
requestAnimationFrame(() => {
  const app = document.querySelector('mb3d-app') as MB3DApp | null;
  if (!app) { console.error('mb3d-app not found'); return; }

  // Get child components (slotted inside <mb3d-app>)
  const viewer = document.querySelector('mb3d-viewer') as MB3DViewer | null;
  const navigator_ = document.querySelector('mb3d-navigator') as MB3DNavigator | null;
  // Components are referenced via event delegation, no need for direct references
  // Controls, FormulaPanel, LightEditor, ColorPicker emit bubbling events

  // ── Status display ────────────────────────────────────
  state.addEventListener('status-change', ((e: CustomEvent) => {
    const { status } = e.detail;
    const labels: Record<string, string> = {
      idle: 'Ready',
      rendering: 'Rendering…',
      navigating: 'Navigating…',
      error: 'Error',
    };
    app.setStatus(labels[status] || status);
  }) as EventListener);

  state.addEventListener('render-progress', ((e: CustomEvent) => {
    const frac = e.detail.fraction as number;
    viewer?.setProgress(frac);
    app.setStatus(`Rendering… ${Math.round(frac * 100)}%`);
  }) as EventListener);

  state.addEventListener('render-complete', ((e: CustomEvent) => {
    const { rgba, elapsed, width, height } = e.detail;
    viewer?.displayRGBA(rgba, width, height);
    viewer?.setProgress(0);
    viewer?.setInfo(`${width}×${height} — ${(elapsed / 1000).toFixed(2)}s`);
    app.setStatus(`Done — ${(elapsed / 1000).toFixed(2)}s`);
  }) as EventListener);

  // ── Render button ─────────────────────────────────────
  document.addEventListener('mb3d-render', () => {
    state.render().catch(err => {
      console.error('Render failed:', err);
      app.setStatus(`Error: ${err.message || err}`);
    });
  });

  // ── Navigate button ───────────────────────────────────
  document.addEventListener('mb3d-navigate', () => {
    if (navigator_) {
      navigator_.activate();
    }
  });

  // ── Save PNG button ───────────────────────────────────
  document.addEventListener('mb3d-save', () => {
    const canvas = viewer?.getCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'mandelbulb3d.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ── Open .m3p button (placeholder) ────────────────────
  document.addEventListener('mb3d-open', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.m3p,.m3b';
    input.onchange = () => {
      if (input.files?.[0]) {
        app.setStatus(`Loaded ${input.files[0].name} (parsing not yet implemented)`);
      }
    };
    input.click();
  });

  // ── Parameter changes from Controls panel ─────────────
  document.addEventListener('mb3d-param-change', ((e: CustomEvent) => {
    const p = e.detail;
    state.updateHeader({
      width: p.width,
      height: p.height,
      posX: p.posX,
      posY: p.posY,
      posZ: p.posZ,
      zoom: p.zoom,
      iterations: p.iterations,
      deStop: p.deStop,
      stepWidth: p.stepWidth,
      fov: p.fov,
    });
  }) as EventListener);

  // ── Formula changes ───────────────────────────────────
  document.addEventListener('mb3d-formula-change', ((e: CustomEvent) => {
    const { slots, hybridMode } = e.detail;
    state.updateHeader({
      formulaSlots: slots.map((s: any) => ({
        name: s.formula || '',
        iterations: s.iterations || 1,
        options: [],
      })),
      hybridMode: hybridMode || 'alternating',
    });
  }) as EventListener);

  // ── Light changes ─────────────────────────────────────
  document.addEventListener('mb3d-light-change', ((e: CustomEvent) => {
    const { lights } = e.detail;
    const currentLighting = { ...state.header.lighting };
    currentLighting.lights = lights.map((l: any) => ({
      theta: l.posTheta ?? 0.5,
      phi: l.posPhi ?? 0.3,
      distance: 100,
      color: l.color || '#ffffff',
      amplitude: l.amplitude ?? 0,
      funcType: 0,
      lightmap: 0,
      specularSize: l.specular ?? 0.5,
    }));
    state.updateHeader({ lighting: currentLighting });
  }) as EventListener);

  // ── Color gradient changes ────────────────────────────
  document.addEventListener('mb3d-color-change', ((e: CustomEvent) => {
    const { stops } = e.detail;
    const currentLighting = { ...state.header.lighting };
    currentLighting.surfaceColors = stops.map((s: any) => ({
      position: s.position,
      color: s.color,
    }));
    state.updateHeader({ lighting: currentLighting });
  }) as EventListener);

  // ── Viewer zoom/pan (adjust camera position) ──────────
  document.addEventListener('mb3d-zoom', ((e: CustomEvent) => {
    const { factor } = e.detail;
    const h = state.header;
    state.updateHeader({ zoom: h.zoom * factor });
  }) as EventListener);

  document.addEventListener('mb3d-pan', ((e: CustomEvent) => {
    const { dx, dy } = e.detail;
    const h = state.header;
    const r = h.rotation;
    // Move along camera's right (X column) and up (Y column)
    const scale = 0.002 / h.zoom;
    state.updateHeader({
      posX: h.posX + r[0] * dx * scale + r[1] * dy * scale,
      posY: h.posY + r[3] * dx * scale + r[4] * dy * scale,
      posZ: h.posZ + r[6] * dx * scale + r[7] * dy * scale,
    });
  }) as EventListener);

  // ── Navigator movement ────────────────────────────────
  document.addEventListener('navi-move', ((e: CustomEvent) => {
    const { forward, right, up } = e.detail;
    const h = state.header;
    const r = h.rotation;
    // Move along camera axes
    state.updateHeader({
      posX: h.posX + r[2] * forward + r[0] * right + r[1] * up,
      posY: h.posY + r[5] * forward + r[3] * right + r[4] * up,
      posZ: h.posZ + r[8] * forward + r[6] * right + r[7] * up,
    });
    // Quick preview render during navigation
    renderQuickPreview();
  }) as EventListener);

  document.addEventListener('navi-look', ((e: CustomEvent) => {
    const { dx, dy } = e.detail;
    const h = state.header;
    const r = [...h.rotation];
    // Apply rotation around Y (yaw) and X (pitch)
    const yaw = -dx * 0.003;
    const pitch = -dy * 0.003;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Yaw rotation (around world up)
    const yawMat = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    // Pitch rotation (around camera right)
    const pitchMat = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
    // Multiply: new_rot = yawMat * pitchMat * current_rot
    const mulMat3 = (a: number[], b: number[]) => [
      a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
      a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
      a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
    ];
    const combined = mulMat3(yawMat, mulMat3(pitchMat, r));
    state.updateHeader({ rotation: combined });
  }) as EventListener);

  document.addEventListener('navi-exit', () => {
    // Do a full-quality render when exiting navigation
    state.render().catch(console.error);
  });

  // ── Quick preview for navigation ──────────────────────
  let previewPending = false;
  async function renderQuickPreview() {
    if (previewPending || !state.pool.initialized) return;
    previewPending = true;

    try {
      // Render at reduced resolution for speed
      const scale = 0.25;
      const w = Math.round(state.header.width * scale);
      const h = Math.round(state.header.height * scale);
      const previewHeader = { ...state.header, width: w, height: h };
      const renderParams = buildRenderParams(previewHeader);
      const formulaIds = buildFormulaIds(previewHeader);
      const paintParams = buildPaintParams(previewHeader);
      const rgba = await state.pool.renderQuick(renderParams, formulaIds, paintParams, w, h);
      navigator_?.displayPreview(rgba, w, h);
    } catch {
      // Ignore preview errors
    } finally {
      previewPending = false;
    }
  }

  // ── Auto-render on startup ────────────────────────────
  app.setStatus('Initializing WASM…');
  state.initPool().then(() => {
    app.setStatus('Ready — Click Render');
  }).catch(err => {
    app.setStatus(`WASM init failed: ${err.message || err}`);
    console.error(err);
  });
});
