/**
 * <mb3d-light-editor> — Per-light colour, direction, and intensity editor.
 *
 * Port of LightAdjust.dfm/pas.  Exposes controls for six positional lights
 * matching the MandHeader light array layout.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; padding: 8px; font-size: 12px; }
    h3 { margin: 0 0 8px 0; font-size: 12px; color: var(--mb3d-accent, #4a9eff); }
    .light {
      display: grid; grid-template-columns: 24px 50px 1fr 60px; gap: 4px;
      align-items: center; padding: 4px; margin: 2px 0;
      border: 1px solid var(--mb3d-border, #404040); border-radius: 3px;
    }
    .light-num { font-weight: 700; color: var(--mb3d-accent, #4a9eff); text-align: center; }
    input[type="color"] { width: 44px; height: 22px; border: none; padding: 0; cursor: pointer; }
    input[type="range"] { width: 100%; }
    input[type="number"] { width: 54px; background: #1a1a1a; border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px; color: var(--mb3d-text, #e0e0e0); padding: 2px; font-size: 11px; }
  </style>
  <h3>Lights</h3>
  <div id="lights"></div>
`;

export class MB3DLightEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    /** @type {Array<{color: string, intensity: number}>} */
    this._lights = [];
    for (let i = 0; i < 6; i++) {
      this._lights.push({ color: '#ffffff', intensity: i === 0 ? 1.0 : 0.0 });
    }
  }

  connectedCallback() {
    this._renderLights();
  }

  /** @private */
  _renderLights() {
    const container = this.shadowRoot.querySelector('#lights');
    container.innerHTML = '';
    this._lights.forEach((light, i) => {
      const div = document.createElement('div');
      div.className = 'light';
      div.innerHTML = `
        <span class="light-num">${i + 1}</span>
        <input type="color" data-idx="${i}" value="${light.color}" title="Light ${i + 1} colour">
        <input type="range" data-idx="${i}" min="0" max="2" step="0.05"
               value="${light.intensity}" title="Intensity">
        <input type="number" data-idx="${i}" min="0" max="2" step="0.05"
               value="${light.intensity}" title="Intensity">
      `;
      container.appendChild(div);
    });

    container.querySelectorAll('input[type="color"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        this._lights[parseInt(e.target.dataset.idx)].color = e.target.value;
        this._emitChange();
      });
    });

    container.querySelectorAll('input[type="range"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const val = parseFloat(e.target.value);
        this._lights[idx].intensity = val;
        const numInput = container.querySelector(
          `input[type="number"][data-idx="${idx}"]`
        );
        if (numInput) numInput.value = val;
        this._emitChange();
      });
    });

    container.querySelectorAll('input[type="number"]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const val = parseFloat(e.target.value);
        this._lights[idx].intensity = val;
        const rangeInput = container.querySelector(
          `input[type="range"][data-idx="${idx}"]`
        );
        if (rangeInput) rangeInput.value = val;
        this._emitChange();
      });
    });
  }

  /** @private */
  _emitChange() {
    this.dispatchEvent(
      new CustomEvent('mb3d-light-change', {
        bubbles: true,
        composed: true,
        detail: { lights: this._lights.map((l) => ({ ...l })) },
      })
    );
  }

  /**
   * Set light configuration from a loaded header.
   * @param {Array<{color: string, intensity: number}>} lights
   */
  setLights(lights) {
    this._lights = lights.map((l) => ({ ...l }));
    this._renderLights();
  }
}
