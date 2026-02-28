/**
 * <mb3d-viewer> — Canvas-based fractal image display.
 *
 * Displays the rendered fractal image and supports:
 * - Zoom via mouse wheel
 * - Pan via mouse drag
 * - Resolution control via attributes
 * - Progressive render display
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; position: relative; width: 100%; height: 100%; }
    canvas { width: 100%; height: 100%; image-rendering: pixelated; cursor: crosshair; }
    .info {
      position: absolute; bottom: 4px; left: 4px; font-size: 11px;
      color: rgba(255,255,255,0.7); pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .progress {
      position: absolute; top: 0; left: 0; height: 2px;
      background: var(--mb3d-accent, #4a9eff); transition: width 0.1s ease;
    }
  </style>
  <canvas></canvas>
  <div class="progress" id="progress"></div>
  <div class="info" id="info"></div>
`;

export class MB3DViewer extends HTMLElement {
  static get observedAttributes() {
    return ['width', 'height'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {HTMLCanvasElement} */
    this._canvas = this.shadowRoot.querySelector('canvas');
    /** @type {CanvasRenderingContext2D} */
    this._ctx = this._canvas.getContext('2d');
    /** @type {HTMLElement} */
    this._infoEl = this.shadowRoot.querySelector('#info');
    /** @type {HTMLElement} */
    this._progressEl = this.shadowRoot.querySelector('#progress');
  }

  connectedCallback() {
    this._resizeCanvas();
    new ResizeObserver(() => this._resizeCanvas()).observe(this);

    this._canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.dispatchEvent(
        new CustomEvent('mb3d-zoom', {
          bubbles: true,
          composed: true,
          detail: { factor, x: e.offsetX, y: e.offsetY },
        })
      );
    });

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this._canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this._canvas.setPointerCapture(e.pointerId);
    });
    this._canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.dispatchEvent(
        new CustomEvent('mb3d-pan', {
          bubbles: true,
          composed: true,
          detail: { dx, dy },
        })
      );
    });
    this._canvas.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  attributeChangedCallback() {
    this._resizeCanvas();
  }

  /**
   * Display a rendered image from RGBA pixel data.
   * @param {ImageData} imageData
   */
  displayImage(imageData) {
    this._canvas.width = imageData.width;
    this._canvas.height = imageData.height;
    this._ctx.putImageData(imageData, 0, 0);
    this.dispatchEvent(new CustomEvent('frame-rendered'));
  }

  /**
   * Display from a raw RGBA Uint8ClampedArray.
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} height
   */
  displayRGBA(data, width, height) {
    const copy = new Uint8ClampedArray(new ArrayBuffer(data.length));
    copy.set(data);
    const img = new ImageData(copy, width, height);
    this.displayImage(img);
  }

  /**
   * Update progress bar (0–1).
   * @param {number} fraction
   */
  setProgress(fraction) {
    this._progressEl.style.width = `${fraction * 100}%`;
  }

  /**
   * Update info overlay text.
   * @param {string} text
   */
  setInfo(text) {
    this._infoEl.textContent = text;
  }

  /**
   * Get the canvas for direct operations.
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this._canvas;
  }

  /** @private */
  _resizeCanvas() {
    const w = parseInt(this.getAttribute('width') || '800');
    const h = parseInt(this.getAttribute('height') || '600');
    this._canvas.width = w;
    this._canvas.height = h;
  }
}
