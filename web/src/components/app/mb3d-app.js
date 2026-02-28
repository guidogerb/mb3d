/**
 * <mb3d-app> — Root application shell.
 *
 * Composes all child components into a responsive layout
 * matching the original Mandelbulb3D main window.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: grid;
      grid-template-columns: 1fr 320px;
      grid-template-rows: auto 1fr auto;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--mb3d-text, #e0e0e0);
      background: var(--mb3d-bg, #1e1e1e);
      --mb3d-surface: #2d2d2d;
      --mb3d-border: #404040;
      --mb3d-accent: #4a9eff;
      --mb3d-text: #e0e0e0;
      --mb3d-text-dim: #888;
    }
    header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: var(--mb3d-surface);
      border-bottom: 1px solid var(--mb3d-border);
    }
    header h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
      color: var(--mb3d-accent);
    }
    .toolbar { display: flex; gap: 4px; }
    .toolbar button {
      padding: 4px 12px;
      border: 1px solid var(--mb3d-border);
      border-radius: 3px;
      background: var(--mb3d-surface);
      color: var(--mb3d-text);
      cursor: pointer;
      font-size: 12px;
    }
    .toolbar button:hover { background: var(--mb3d-accent); color: #fff; }
    .viewport { position: relative; overflow: hidden; background: #000; }
    .sidebar {
      overflow-y: auto;
      border-left: 1px solid var(--mb3d-border);
      background: var(--mb3d-surface);
    }
    footer {
      grid-column: 1 / -1;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--mb3d-text-dim);
      background: var(--mb3d-surface);
      border-top: 1px solid var(--mb3d-border);
    }
  </style>
  <header>
    <h1>Mandelbulb3D Web</h1>
    <div class="toolbar">
      <button id="btn-render">Render</button>
      <button id="btn-navigate">Navigate</button>
      <button id="btn-open">Open .m3p</button>
      <button id="btn-save">Save PNG</button>
    </div>
  </header>
  <div class="viewport">
    <slot name="viewer"></slot>
    <slot name="navigator"></slot>
  </div>
  <div class="sidebar">
    <slot name="controls"></slot>
    <slot name="formulas"></slot>
    <slot name="lighting"></slot>
    <slot name="color"></slot>
  </div>
  <footer>
    <span id="status">Ready</span>
  </footer>
`;

export class MB3DApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {HTMLSpanElement} */
    this._statusEl = null;
  }

  connectedCallback() {
    this._statusEl = this.shadowRoot.querySelector('#status');

    this.shadowRoot.querySelector('#btn-render').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mb3d-render', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('#btn-navigate').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mb3d-navigate', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('#btn-open').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mb3d-open', { bubbles: true, composed: true }));
    });
    this.shadowRoot.querySelector('#btn-save').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mb3d-save', { bubbles: true, composed: true }));
    });
  }

  /**
   * Set the status bar text.
   * @param {string} text
   */
  setStatus(text) {
    if (this._statusEl) this._statusEl.textContent = text;
  }
}
