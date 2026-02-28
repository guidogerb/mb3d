/**
 * <mb3d-color-picker> — Gradient palette / colour-stop editor.
 *
 * Port of ColorPick.dfm/pas.  Manages a list of gradient colour stops
 * used by the paint stage (lighting/gradient.rs).
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; padding: 8px; font-size: 12px; }
    h3 { margin: 0 0 8px 0; font-size: 12px; color: var(--mb3d-accent, #4a9eff); }
    .preview { width: 100%; height: 24px; border-radius: 3px; margin-bottom: 8px; }
    .stop {
      display: grid; grid-template-columns: 50px 60px 1fr; gap: 4px;
      align-items: center; padding: 2px 0;
    }
    input[type="color"] { width: 44px; height: 20px; border: none; padding: 0; cursor: pointer; }
    input[type="number"] { width: 54px; background: #1a1a1a; border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px; color: var(--mb3d-text, #e0e0e0); padding: 2px; font-size: 11px; }
    button {
      background: var(--mb3d-accent, #4a9eff); border: none; color: #fff;
      border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 11px;
    }
    .actions { margin-top: 6px; display: flex; gap: 4px; }
  </style>
  <h3>Colour Gradient</h3>
  <canvas class="preview" width="256" height="24"></canvas>
  <div id="stops"></div>
  <div class="actions">
    <button id="addBtn" title="Add colour stop">+ Add Stop</button>
  </div>
`;

export class MB3DColorPicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    /** @type {Array<{color: string, position: number}>} */
    this._stops = [
      { color: '#000033', position: 0.0 },
      { color: '#0066cc', position: 0.25 },
      { color: '#ffffff', position: 0.5 },
      { color: '#ff8800', position: 0.75 },
      { color: '#330000', position: 1.0 },
    ];
  }

  connectedCallback() {
    this._renderStops();
    this._renderGradient();
    this.shadowRoot.querySelector('#addBtn').addEventListener('click', () => {
      this._stops.push({ color: '#888888', position: 0.5 });
      this._stops.sort((a, b) => a.position - b.position);
      this._renderStops();
      this._renderGradient();
      this._emitChange();
    });
  }

  /** @private */
  _renderGradient() {
    const canvas = this.shadowRoot.querySelector('canvas.preview');
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    this._stops.forEach((s) => grad.addColorStop(s.position, s.color));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** @private */
  _renderStops() {
    const container = this.shadowRoot.querySelector('#stops');
    container.innerHTML = '';
    this._stops.forEach((stop, i) => {
      const div = document.createElement('div');
      div.className = 'stop';
      div.innerHTML = `
        <input type="color" data-idx="${i}" value="${stop.color}">
        <input type="number" data-idx="${i}" min="0" max="1" step="0.01" value="${stop.position}">
        <button data-del="${i}" title="Remove stop">&times;</button>
      `;
      container.appendChild(div);
    });

    container.querySelectorAll('input[type="color"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        this._stops[parseInt(e.target.dataset.idx)].color = e.target.value;
        this._renderGradient();
        this._emitChange();
      });
    });

    container.querySelectorAll('input[type="number"]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        this._stops[parseInt(e.target.dataset.idx)].position = parseFloat(
          e.target.value
        );
        this._stops.sort((a, b) => a.position - b.position);
        this._renderStops();
        this._renderGradient();
        this._emitChange();
      });
    });

    container.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.del);
        if (this._stops.length > 2) {
          this._stops.splice(idx, 1);
          this._renderStops();
          this._renderGradient();
          this._emitChange();
        }
      });
    });
  }

  /** @private */
  _emitChange() {
    this.dispatchEvent(
      new CustomEvent('mb3d-color-change', {
        bubbles: true,
        composed: true,
        detail: { stops: this._stops.map((s) => ({ ...s })) },
      })
    );
  }

  /**
   * Set gradient from loaded header.
   * @param {Array<{color: string, position: number}>} stops
   */
  setStops(stops) {
    this._stops = stops.map((s) => ({ ...s }));
    this._renderStops();
    this._renderGradient();
  }
}
