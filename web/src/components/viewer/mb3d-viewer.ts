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
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    canvas {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      cursor: crosshair;
    }
    .info {
      position: absolute;
      bottom: 4px;
      left: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .progress {
      position: absolute;
      top: 0;
      left: 0;
      height: 2px;
      background: var(--mb3d-accent, #4a9eff);
      transition: width 0.1s ease;
    }
  </style>
  <canvas></canvas>
  <div class="progress" id="progress"></div>
  <div class="info" id="info"></div>
`;

export class MB3DViewer extends HTMLElement {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private infoEl!: HTMLElement;
  private progressEl!: HTMLElement;

  static get observedAttributes() {
    return ['width', 'height'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.infoEl = this.shadowRoot!.querySelector('#info')!;
    this.progressEl = this.shadowRoot!.querySelector('#progress')!;
  }

  connectedCallback() {
    this.resizeCanvas();

    new ResizeObserver(() => this.resizeCanvas()).observe(this);

    // Wheel zoom
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.dispatchEvent(new CustomEvent('mb3d-zoom', {
        bubbles: true, composed: true,
        detail: { factor, x: e.offsetX, y: e.offsetY }
      }));
    });

    // Mouse drag for pan / rotation
    let dragging = false;
    let lastX = 0, lastY = 0;
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.dispatchEvent(new CustomEvent('mb3d-pan', {
        bubbles: true, composed: true,
        detail: { dx, dy }
      }));
    });
    this.canvas.addEventListener('pointerup', () => { dragging = false; });
  }

  attributeChangedCallback(_name: string, _old: string, _val: string) {
    this.resizeCanvas();
  }

  /** Display a rendered image from RGBA pixel data. */
  displayImage(imageData: ImageData) {
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    this.ctx.putImageData(imageData, 0, 0);
    this.dispatchEvent(new CustomEvent('frame-rendered'));
  }

  /** Display from a raw RGBA Uint8ClampedArray. */
  displayRGBA(data: Uint8ClampedArray, width: number, height: number) {
    // Copy to a regular ArrayBuffer-backed array for ImageData compatibility
    const copy = new Uint8ClampedArray(new ArrayBuffer(data.length));
    copy.set(data);
    const img = new ImageData(copy, width, height);
    this.displayImage(img);
  }

  /** Update progress bar (0–1). */
  setProgress(fraction: number) {
    this.progressEl.style.width = `${fraction * 100}%`;
  }

  /** Update info overlay text. */
  setInfo(text: string) {
    this.infoEl.textContent = text;
  }

  /** Get the canvas for direct WebGL or 2D operations. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private resizeCanvas() {
    const w = parseInt(this.getAttribute('width') || '800');
    const h = parseInt(this.getAttribute('height') || '600');
    this.canvas.width = w;
    this.canvas.height = h;
  }
}
