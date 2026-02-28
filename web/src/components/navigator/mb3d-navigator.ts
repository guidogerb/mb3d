/**
 * <mb3d-navigator> — Real-time 3D fly-through navigator.
 *
 * Port of Navigator.dfm/pas. Provides FPS-style navigation with
 * pointer lock, keyboard WASD movement, and mouse look.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 10;
    }
    canvas {
      width: 100%;
      height: 100%;
      cursor: none;
    }
    .hud {
      position: absolute;
      top: 8px; left: 8px;
      font-size: 11px;
      color: rgba(255,255,255,0.8);
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .controls-hint {
      position: absolute;
      bottom: 8px; left: 50%;
      transform: translateX(-50%);
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      pointer-events: none;
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
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private fpsEl!: HTMLSpanElement;
  private _active = false;
  private keys = new Set<string>();
  private moveSpeed = 0.01;
  private animFrameId = 0;
  private lastFrameTime = 0;

  static get observedAttributes() { return ['active']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.fpsEl = this.shadowRoot!.querySelector('#fps')!;
  }

  connectedCallback() {
    this.canvas.addEventListener('click', () => {
      if (this._active) this.canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this._active) {
        this.deactivate();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this._active) return;
      this.keys.add(e.code);
      if (e.code === 'Escape') this.deactivate();
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this._active) return;
      this.dispatchEvent(new CustomEvent('navi-look', {
        bubbles: true, composed: true,
        detail: { dx: e.movementX, dy: e.movementY }
      }));
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!this._active) return;
      e.preventDefault();
      this.moveSpeed *= e.deltaY > 0 ? 0.8 : 1.25;
      this.moveSpeed = Math.max(0.0001, Math.min(10, this.moveSpeed));
      (this.shadowRoot!.querySelector('#step') as HTMLSpanElement).textContent =
        this.moveSpeed.toFixed(4);
    });
  }

  attributeChangedCallback(name: string, _old: string, val: string) {
    if (name === 'active') {
      val !== null ? this.activate() : this.deactivate();
    }
  }

  activate() {
    this._active = true;
    this.setAttribute('active', '');
    this.canvas.requestPointerLock();
    this.lastFrameTime = performance.now();
    this.tick();
  }

  deactivate() {
    this._active = false;
    this.removeAttribute('active');
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.dispatchEvent(new CustomEvent('navi-exit', { bubbles: true, composed: true }));
  }

  private tick = () => {
    if (!this._active) return;
    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // FPS display
    this.fpsEl.textContent = dt > 0 ? Math.round(1 / dt).toString() : '0';

    // Movement
    let forward = 0, right = 0, up = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyA')) right -= 1;
    if (this.keys.has('KeyD')) right += 1;
    if (this.keys.has('Space')) up += 1;
    if (this.keys.has('ShiftLeft')) up -= 1;

    if (forward !== 0 || right !== 0 || up !== 0) {
      this.dispatchEvent(new CustomEvent('navi-move', {
        bubbles: true, composed: true,
        detail: {
          forward: forward * this.moveSpeed,
          right: right * this.moveSpeed,
          up: up * this.moveSpeed,
          dt,
        }
      }));
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  /** Display a preview frame from RGBA data. */
  displayPreview(data: Uint8ClampedArray, width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    const copy = new Uint8ClampedArray(new ArrayBuffer(data.length));
    copy.set(data);
    const img = new ImageData(copy, width, height);
    this.ctx.putImageData(img, 0, 0);
  }
}
