/**
 * <mb3d-light-editor> — 6-light configuration panel.
 *
 * Port of LightAdjust.dfm/pas.
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; padding: 8px; font-size: 12px; }
    h3 { margin: 0 0 8px 0; font-size: 12px; color: var(--mb3d-accent, #4a9eff); }
    .light { margin: 4px 0; padding: 4px; border: 1px solid var(--mb3d-border, #404040); border-radius: 3px; }
    .light-header { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    .light-body { display: none; padding: 4px 0; }
    .light.open .light-body { display: block; }
    label { display: flex; align-items: center; gap: 4px; margin: 2px 0; }
    label span { min-width: 60px; color: var(--mb3d-text-dim, #888); }
    input[type="range"] { flex: 1; }
    input[type="color"] { width: 24px; height: 24px; border: none; padding: 0; cursor: pointer; }
    .light-num { font-weight: 700; color: var(--mb3d-accent, #4a9eff); }
  </style>
  <h3>Lighting</h3>
  <div id="lights"></div>
`;

export class MB3DLightEditor extends HTMLElement {
  private lights = Array.from({ length: 6 }, (_, i) => ({
    enabled: i === 0,
    color: '#ffffff',
    amplitude: i === 0 ? 1.0 : 0.0,
    posTheta: 0.5,
    posPhi: 0.3,
    specular: 0.5,
  }));

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.renderLights();
  }

  private renderLights() {
    const container = this.shadowRoot!.querySelector('#lights')!;
    container.innerHTML = this.lights.map((light, i) => `
      <div class="light${i === 0 ? ' open' : ''}" data-idx="${i}">
        <div class="light-header">
          <span class="light-num">${i + 1}</span>
          <input type="color" value="${light.color}" data-field="color">
          <span>${light.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <div class="light-body">
          <label><span>Amplitude</span><input type="range" min="0" max="2" step="0.01" value="${light.amplitude}" data-field="amplitude"></label>
          <label><span>Theta</span><input type="range" min="-3.14" max="3.14" step="0.01" value="${light.posTheta}" data-field="posTheta"></label>
          <label><span>Phi</span><input type="range" min="-1.57" max="1.57" step="0.01" value="${light.posPhi}" data-field="posPhi"></label>
          <label><span>Specular</span><input type="range" min="0" max="2" step="0.01" value="${light.specular}" data-field="specular"></label>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.light-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement!.classList.toggle('open');
      });
    });

    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => this.emitChange());
    });
  }

  private emitChange() {
    this.dispatchEvent(new CustomEvent('mb3d-light-change', {
      bubbles: true, composed: true,
      detail: { lights: [...this.lights] },
    }));
  }
}
