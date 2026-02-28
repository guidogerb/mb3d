/**
 * <mb3d-controls> — Parameter editing panel.
 *
 * Port of the main form's parameter tab pages from Mand.dfm.
 * Provides controls for image size, zoom, position, rotation,
 * iteration count, DE settings, and render quality.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      padding: 8px;
      font-size: 12px;
    }
    fieldset {
      border: 1px solid var(--mb3d-border, #404040);
      border-radius: 3px;
      margin: 0 0 8px 0;
      padding: 8px;
    }
    legend {
      font-weight: 600;
      font-size: 11px;
      color: var(--mb3d-accent, #4a9eff);
    }
    label {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 4px 0;
    }
    label span {
      min-width: 80px;
      color: var(--mb3d-text-dim, #888);
    }
    input[type="number"], input[type="text"] {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px;
      color: var(--mb3d-text, #e0e0e0);
      padding: 2px 4px;
      font-size: 11px;
      font-family: monospace;
    }
    input[type="range"] {
      flex: 1;
    }
    .row {
      display: flex;
      gap: 4px;
    }
  </style>

  <fieldset>
    <legend>Image</legend>
    <div class="row">
      <label><span>Width</span><input type="number" id="width" value="800" min="64" max="8192" step="16"></label>
      <label><span>Height</span><input type="number" id="height" value="600" min="64" max="8192" step="16"></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Position</legend>
    <label><span>X</span><input type="number" id="pos-x" value="0" step="0.01"></label>
    <label><span>Y</span><input type="number" id="pos-y" value="0" step="0.01"></label>
    <label><span>Z</span><input type="number" id="pos-z" value="0" step="0.01"></label>
    <label><span>Zoom</span><input type="number" id="zoom" value="1" step="0.1" min="0.001"></label>
  </fieldset>

  <fieldset>
    <legend>Quality</legend>
    <label><span>Iterations</span><input type="number" id="iterations" value="12" min="1" max="10000"></label>
    <label><span>DE stop</span><input type="number" id="de-stop" value="0.001" step="0.0001" min="0.00001"></label>
    <label><span>Step width</span><input type="range" id="step-width" min="0.1" max="3" step="0.01" value="1"></label>
    <label><span>FOV</span><input type="range" id="fov" min="0" max="3" step="0.01" value="0.5"></label>
  </fieldset>

  <fieldset>
    <legend>Render</legend>
    <label><span>Threads</span><input type="number" id="threads" value="0" min="0" max="64">
      <small>(0 = auto)</small>
    </label>
  </fieldset>
`;

export class MB3DControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    // Emit change events for any input modification
    this.shadowRoot!.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        this.dispatchEvent(new CustomEvent('mb3d-param-change', {
          bubbles: true, composed: true,
          detail: this.getParams(),
        }));
      });
    });
  }

  /** Collect all parameters from the controls. */
  getParams() {
    const q = (id: string) => (this.shadowRoot!.querySelector(`#${id}`) as HTMLInputElement).value;
    return {
      width: parseInt(q('width')),
      height: parseInt(q('height')),
      posX: parseFloat(q('pos-x')),
      posY: parseFloat(q('pos-y')),
      posZ: parseFloat(q('pos-z')),
      zoom: parseFloat(q('zoom')),
      iterations: parseInt(q('iterations')),
      deStop: parseFloat(q('de-stop')),
      stepWidth: parseFloat(q('step-width')),
      fov: parseFloat(q('fov')),
      threads: parseInt(q('threads')),
    };
  }

  /** Set parameter values from a loaded header. */
  setParams(params: Record<string, number>) {
    for (const [key, value] of Object.entries(params)) {
      const el = this.shadowRoot!.querySelector(`#${key}`) as HTMLInputElement | null;
      if (el) el.value = String(value);
    }
  }
}
