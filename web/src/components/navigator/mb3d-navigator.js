/**
 * <mb3d-navigator> — Real-time 3D fly-through navigator.
 *
 * Port of Navigator.dfm/pas. Provides FPS-style navigation with
 * pointer lock, keyboard WASD movement, and mouse look.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10; }
    canvas { width: 100%; height: 100%; cursor: none; }
    .hud {
      position: absolute; top: 8px; left: 8px; font-size: 11px;
      color: rgba(255,255,255,0.8); pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .controls-hint {
      position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
      font-size: 12px; color: rgba(255,255,255,0.5); pointer-events: none;
    }
    :host(:not([active])) { display: none; }
  </style>
  <canvas></canvas>
  <div class="hud" id="hud">
    <div>FPS: <span id="fps">0</span></div>
    <div>Step: <span id="step">0.01</span></div>
  </div>
  <div class="controls-hint">WASD to move · Mouse to look · Scroll to adjust speed · ESC to exit</div>
`;

export class MB3DNavigator extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {HTMLCanvasElement} */
    this._canvas = this.shadowRoot.querySelector('canvas');
    /** @type {CanvasRenderingContext2D} */
    this._ctx = this._canvas.getContext('2d');
    /** @type {HTMLSpanElement} */
    this._fpsEl = this.shadowRoot.querySelector('#fps');
    /** @type {boolean} */
    this._active = false;
    /** @type {Set<string>} */
    this._keys = new Set();
    /** @type {number} */
    this._moveSpeed = 0.01;
    /** @type {number} */
    this._animFrameId = 0;
    /** @type {number} */
    this._lastFrameTime = 0;

    this._tick = this._tick.bind(this);
  }

  connectedCallback() {
    this._canvas.addEventListener('click', () => {
      if (this._active) this._canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this._canvas && this._active) {
        this.deactivate();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this._active) return;
      this._keys.add(e.code);
      if (e.code === 'Escape') this.deactivate();
    });

    document.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
    });

    this._canvas.addEventListener('mousemove', (e) => {
      if (!this._active) return;
      this.dispatchEvent(
        new CustomEvent('navi-look', {
          bubbles: true,
          composed: true,
          detail: { dx: e.movementX, dy: e.movementY },
        })
      );
    });

    this._canvas.addEventListener('wheel', (e) => {
      if (!this._active) return;
      e.preventDefault();
      this._moveSpeed *= e.deltaY > 0 ? 0.8 : 1.25;
      this._moveSpeed = Math.max(0.0001, Math.min(10, this._moveSpeed));
      this.shadowRoot.querySelector('#step').textContent =
        this._moveSpeed.toFixed(4);
    });
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'active') {
      val !== null ? this.activate() : this.deactivate();
    }
  }

  activate() {
    this._active = true;
    this.setAttribute('active', '');
    this._canvas.requestPointerLock();
    this._lastFrameTime = performance.now();
    this._tick();
  }

  deactivate() {
    this._active = false;
    this.removeAttribute('active');
    if (document.pointerLockElement === this._canvas) {
      document.exitPointerLock();
    }
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    this.dispatchEvent(
      new CustomEvent('navi-exit', { bubbles: true, composed: true })
    );
  }

  /** @private */
  _tick() {
    if (!this._active) return;
    const now = performance.now();
    const dt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    this._fpsEl.textContent = dt > 0 ? Math.round(1 / dt).toString() : '0';

    let forward = 0;
    let right = 0;
    let up = 0;
    if (this._keys.has('KeyW')) forward += 1;
    if (this._keys.has('KeyS')) forward -= 1;
    if (this._keys.has('KeyA')) right -= 1;
    if (this._keys.has('KeyD')) right += 1;
    if (this._keys.has('Space')) up += 1;
    if (this._keys.has('ShiftLeft')) up -= 1;

    if (forward !== 0 || right !== 0 || up !== 0) {
      this.dispatchEvent(
        new CustomEvent('navi-move', {
          bubbles: true,
          composed: true,
          detail: {
            forward: forward * this._moveSpeed,
            right: right * this._moveSpeed,
            up: up * this._moveSpeed,
            dt,
          },
        })
      );
    }

    this._animFrameId = requestAnimationFrame(this._tick);
  }

  /**
   * Display a preview frame from RGBA data.
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} height
   */
  displayPreview(data, width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    const copy = new Uint8ClampedArray(new ArrayBuffer(data.length));
    copy.set(data);
    const img = new ImageData(copy, width, height);
    this._ctx.putImageData(img, 0, 0);
  }
}
