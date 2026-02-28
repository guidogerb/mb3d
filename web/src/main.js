/**
 * main.js — Application entry point.
 *
 * Registers all custom elements, creates global AppState,
 * and wires DOM events → state actions.
 */

import { AppState } from './core/engine/state.js';
import { createDefaultHeader } from './core/types/header.js';
import { MB3DApp } from './components/app/mb3d-app.js';
import { MB3DViewer } from './components/viewer/mb3d-viewer.js';
import { MB3DNavigator } from './components/navigator/mb3d-navigator.js';
import { MB3DControls } from './components/controls/mb3d-controls.js';
import { MB3DFormulaPanel } from './components/formulas/mb3d-formula-panel.js';
import { MB3DLightEditor } from './components/lighting/mb3d-light-editor.js';
import { MB3DColorPicker } from './components/color/mb3d-color-picker.js';

/* ------------------------------------------------------------------ */
/*  Register Custom Elements                                          */
/* ------------------------------------------------------------------ */

customElements.define('mb3d-app', MB3DApp);
customElements.define('mb3d-viewer', MB3DViewer);
customElements.define('mb3d-navigator', MB3DNavigator);
customElements.define('mb3d-controls', MB3DControls);
customElements.define('mb3d-formula-panel', MB3DFormulaPanel);
customElements.define('mb3d-light-editor', MB3DLightEditor);
customElements.define('mb3d-color-picker', MB3DColorPicker);

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.querySelector('mb3d-app');
  const viewer = app.shadowRoot.querySelector('mb3d-viewer');
  const navigator_ = app.shadowRoot.querySelector('mb3d-navigator');
  const controls = app.shadowRoot.querySelector('mb3d-controls');
  const formulaPanel = app.shadowRoot.querySelector('mb3d-formula-panel');
  const lightEditor = app.shadowRoot.querySelector('mb3d-light-editor');
  const colorPicker = app.shadowRoot.querySelector('mb3d-color-picker');

  const state = new AppState();

  /* ---- State → UI ---- */

  state.addEventListener('status', (e) => {
    app.setStatus(e.detail.text);
  });

  state.addEventListener('progress', (e) => {
    if (viewer) viewer.setProgress(e.detail.pct);
  });

  state.addEventListener('scanlines-done', (e) => {
    if (viewer) viewer.displayRGBA(e.detail.rgba, e.detail.width, e.detail.height);
  });

  state.addEventListener('quick-done', (e) => {
    if (viewer) viewer.displayRGBA(e.detail.rgba, e.detail.width, e.detail.height);
  });

  /* ---- Toolbar events ---- */

  app.addEventListener('mb3d-render', () => {
    state.render();
  });

  app.addEventListener('mb3d-navigate', () => {
    if (navigator_) navigator_.activate();
  });

  app.addEventListener('mb3d-open', () => {
    openFile(state, controls, formulaPanel, lightEditor, colorPicker);
  });

  app.addEventListener('mb3d-save', () => {
    saveFile(state);
  });

  /* ---- Parameter events ---- */

  if (controls) {
    controls.addEventListener('mb3d-param-change', (e) => {
      state.updateHeader(e.detail);
    });
  }

  if (formulaPanel) {
    formulaPanel.addEventListener('mb3d-formula-change', (e) => {
      const { slots, hybridMode } = e.detail;
      const patch = { hybridMode };
      slots.forEach((s, i) => {
        patch[`formula${i + 1}`] = s.formula;
        patch[`formula${i + 1}Iterations`] = s.iterations;
      });
      state.updateHeader(patch);
    });
  }

  if (lightEditor) {
    lightEditor.addEventListener('mb3d-light-change', (e) => {
      state.updateHeader({ lights: e.detail.lights });
    });
  }

  if (colorPicker) {
    colorPicker.addEventListener('mb3d-color-change', (e) => {
      state.updateHeader({ gradientStops: e.detail.stops });
    });
  }

  /* ---- Viewer interaction ---- */

  if (viewer) {
    viewer.addEventListener('mb3d-zoom', (e) => {
      const h = state.header;
      h.dZoom *= e.detail.delta > 0 ? 0.9 : 1.1;
      state.updateHeader({ dZoom: h.dZoom });
    });

    viewer.addEventListener('mb3d-pan', (e) => {
      const h = state.header;
      h.dXmid += e.detail.dx * 0.002;
      h.dYmid += e.detail.dy * 0.002;
      state.updateHeader({ dXmid: h.dXmid, dYmid: h.dYmid });
    });
  }

  /* ---- Navigator interaction ---- */

  if (navigator_) {
    navigator_.addEventListener('mb3d-navi-move', (e) => {
      const h = state.header;
      h.dXmid += e.detail.dx;
      h.dYmid += e.detail.dy;
      h.dZmid += e.detail.dz;
      state.updateHeader({ dXmid: h.dXmid, dYmid: h.dYmid, dZmid: h.dZmid });
    });

    navigator_.addEventListener('mb3d-navi-look', (e) => {
      state.updateHeader({ dPhi: e.detail.phi, dTheta: e.detail.theta });
    });

    navigator_.addEventListener('mb3d-navi-exit', () => {
      navigator_.deactivate();
    });

    state.addEventListener('quick-done', (e) => {
      navigator_.displayPreview(e.detail.rgba, e.detail.width, e.detail.height);
    });
  }

  /* ---- Initialise ---- */

  try {
    await state.initPool();
    app.setStatus('Ready');
  } catch (err) {
    app.setStatus(`Init failed: ${err.message}`);
    console.error(err);
  }

  // Push default header into controls
  const hdr = createDefaultHeader();
  if (controls) controls.setParams(hdr);
});

/* ------------------------------------------------------------------ */
/*  File I/O helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Open a M3P / M3I file.
 * @param {AppState} state
 * @param {MB3DControls|null} controls
 * @param {MB3DFormulaPanel|null} formulaPanel
 * @param {MB3DLightEditor|null} lightEditor
 * @param {MB3DColorPicker|null} colorPicker
 */
function openFile(state, controls, formulaPanel, lightEditor, colorPicker) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.m3p,.m3i,.json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const header = JSON.parse(text);
      state.updateHeader(header);
      if (controls) controls.setParams(header);
      if (formulaPanel && header.formulas) {
        formulaPanel.setConfig(header.formulas, header.hybridMode || 'alternating');
      }
      if (lightEditor && header.lights) {
        lightEditor.setLights(header.lights);
      }
      if (colorPicker && header.gradientStops) {
        colorPicker.setStops(header.gradientStops);
      }
    } catch (err) {
      console.error('Failed to open file', err);
    }
  });
  input.click();
}

/**
 * Save current header as JSON.
 * @param {AppState} state
 */
function saveFile(state) {
  const blob = new Blob([JSON.stringify(state.header, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mandelbulb3d.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
