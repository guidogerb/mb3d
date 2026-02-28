/**
 * <mb3d-color-picker> — Gradient palette editor.
 *
 * Port of ColorPick.dfm/pas.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; padding: 8px; font-size: 12px; }
    h3 { margin: 0 0 8px 0; font-size: 12px; color: var(--mb3d-accent, #4a9eff); }
    .gradient-bar {
      height: 24px;
      border-radius: 3px;
      border: 1px solid var(--mb3d-border, #404040);
      cursor: pointer;
      margin-bottom: 8px;
    }
    .stops { display: flex; gap: 4px; flex-wrap: wrap; }
    .stop {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px;
    }
    input[type="color"] { width: 20px; height: 20px; border: none; padding: 0; }
    input[type="number"] { width: 48px; background: #1a1a1a; border: 1px solid var(--mb3d-border, #404040);
      border-radius: 2px; color: var(--mb3d-text, #e0e0e0); padding: 1px 3px; font-size: 10px; }
  </style>
  <h3>Color Palette</h3>
  <canvas class="gradient-bar" id="gradient" width="280" height="24"></canvas>
  <div class="stops" id="stops"></div>
`;

export class MB3DColorPicker extends HTMLElement {
  private stops = [
    { position: 0.0, color: '#000044' },
    { position: 0.25, color: '#0066ff' },
    { position: 0.5, color: '#ffffff' },
    { position: 0.75, color: '#ff6600' },
    { position: 1.0, color: '#000000' },
  ];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.renderGradient();
    this.renderStops();
  }

  private renderGradient() {
    const canvas = this.shadowRoot!.querySelector('#gradient') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (const stop of this.stops) {
      grad.addColorStop(stop.position, stop.color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private renderStops() {
    const container = this.shadowRoot!.querySelector('#stops')!;
    container.innerHTML = this.stops.map((s, i) => `
      <div class="stop">
        <input type="color" value="${s.color}" data-idx="${i}">
        <input type="number" value="${s.position}" min="0" max="1" step="0.01" data-idx="${i}">
      </div>
    `).join('');

    container.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        this.renderGradient();
        this.dispatchEvent(new CustomEvent('mb3d-color-change', {
          bubbles: true, composed: true,
          detail: { stops: [...this.stops] },
        }));
      });
    });
  }
}
