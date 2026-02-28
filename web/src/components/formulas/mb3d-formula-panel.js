/**
 * <mb3d-formula-panel> — Formula selection & 6-slot hybrid configuration.
 *
 * Port of formula/FormulaGUI.dfm/pas. Provides:
 * - 6 formula slots for hybrid combining
 * - Per-slot iteration count and formula selection
 * - Hybrid mode selector (alternating, interpolated, 4D)
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; padding: 8px; font-size: 12px; }
    .slot {
      display: grid; grid-template-columns: 24px 1fr 60px; gap: 4px;
      align-items: center; padding: 4px; margin: 2px 0;
      border: 1px solid var(--mb3d-border, #404040); border-radius: 3px;
    }
    .slot.active { border-color: var(--mb3d-accent, #4a9eff); }
    .slot-num { font-weight: 700; color: var(--mb3d-accent, #4a9eff); text-align: center; }
    select, input[type="number"] {
      background: #1a1a1a; border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px; color: var(--mb3d-text, #e0e0e0); padding: 2px 4px; font-size: 11px;
    }
    .hybrid-mode { margin-top: 8px; }
    .hybrid-mode label { display: block; margin: 2px 0; }
    h3 { margin: 0 0 8px 0; font-size: 12px; color: var(--mb3d-accent, #4a9eff); }
  </style>
  <h3>Formulas (Hybrid)</h3>
  <div id="slots"></div>
  <div class="hybrid-mode">
    <label><input type="radio" name="hybrid" value="alternating" checked> Alternating</label>
    <label><input type="radio" name="hybrid" value="interpolated"> Interpolated</label>
    <label><input type="radio" name="hybrid" value="4d"> 4D Hybrid</label>
  </div>
`;

const BUILTIN_FORMULAS = [
  '(none)',
  'Mandelbulb Power 2',
  'Mandelbulb Power 8',
  'Amazing Box',
  'Amazing Surf',
  'Quaternion Julia',
  'Tricorn',
  'Bulbox',
  'Folding IntPow',
  'Real Power',
  'Aexion C',
];

export class MB3DFormulaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    /** @type {Array<{formula: string, iterations: number}>} */
    this._slots = [];
    for (let i = 0; i < 6; i++) {
      this._slots.push({
        formula: i === 0 ? 'Mandelbulb Power 8' : '(none)',
        iterations: i === 0 ? 1 : 0,
      });
    }
  }

  connectedCallback() {
    this._renderSlots();
    this.shadowRoot.querySelectorAll('input[name="hybrid"]').forEach((radio) => {
      radio.addEventListener('change', () => this._emitChange());
    });
  }

  /** @private */
  _renderSlots() {
    const container = this.shadowRoot.querySelector('#slots');
    container.innerHTML = '';
    this._slots.forEach((slot, i) => {
      const div = document.createElement('div');
      div.className = `slot${slot.formula !== '(none)' ? ' active' : ''}`;
      div.innerHTML = `
        <span class="slot-num">${i + 1}</span>
        <select data-slot="${i}">
          ${BUILTIN_FORMULAS.map(
            (f) =>
              `<option value="${f}"${f === slot.formula ? ' selected' : ''}>${f}</option>`
          ).join('')}
        </select>
        <input type="number" data-slot="${i}" value="${slot.iterations}" min="0" max="100" title="Iterations">
      `;
      container.appendChild(div);
    });

    container.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.slot);
        this._slots[idx].formula = e.target.value;
        this._renderSlots();
        this._emitChange();
      });
    });

    container.querySelectorAll('input[type="number"]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.slot);
        this._slots[idx].iterations = parseInt(e.target.value);
        this._emitChange();
      });
    });
  }

  /** @private */
  _emitChange() {
    const checkedRadio = this.shadowRoot.querySelector(
      'input[name="hybrid"]:checked'
    );
    const hybridMode = checkedRadio ? checkedRadio.value : 'alternating';
    this.dispatchEvent(
      new CustomEvent('mb3d-formula-change', {
        bubbles: true,
        composed: true,
        detail: { slots: [...this._slots], hybridMode },
      })
    );
  }

  /**
   * Set formula configuration from a loaded header.
   * @param {Array<{formula: string, iterations: number}>} slots
   * @param {string} hybridMode
   */
  setConfig(slots, hybridMode) {
    this._slots = slots;
    this._renderSlots();
    const radio = this.shadowRoot.querySelector(
      `input[value="${hybridMode}"]`
    );
    if (radio) radio.checked = true;
  }
}
