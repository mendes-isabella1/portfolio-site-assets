/*
  hero-mesh — malha interativa para o fundo do hero
  Isabella Mendes · mendesisabella.com

  Uma malha de desenho técnico que se comporta como tecido: fica precisa
  em repouso e se deforma quando o cursor passa.

  Uso:  <hero-mesh></hero-mesh>
  Atributos opcionais:
    spacing="34"            distância entre as linhas, em px
    color="255,255,255"     cor das linhas, em RGB
    variant="mesh"          "mesh" (linhas) ou "dots" (só pontos)
*/
class HeroMesh extends HTMLElement {
  static get observedAttributes() { return ['spacing', 'color', 'variant']; }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>:host{display:block;position:relative;width:100%;height:100%;min-height:120px;pointer-events:none}' +
      'canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><canvas aria-hidden="true"></canvas>';
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, last: 0 };
    this.running = false;
    this.visible = true;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._frame = this._frame.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
  }

  connectedCallback() {
    this._ro = new ResizeObserver(() => this._build());
    this._ro.observe(this);
    this._io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible) this._start();
    });
    this._io.observe(this);
    // Escuta na janela para funcionar mesmo com textos e botões por cima.
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('pointerdown', this._onMove, { passive: true });
    document.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('blur', this._onLeave);
    this._build();
  }

  disconnectedCallback() {
    this._ro && this._ro.disconnect();
    this._io && this._io.disconnect();
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerdown', this._onMove);
    document.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('blur', this._onLeave);
    this.running = false;
  }

  attributeChangedCallback() { if (this.isConnected) this._build(); }

  _onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const p = this.pointer;
    if (p.active) {
      p.vx = p.vx * 0.5 + (x - p.x) * 0.5;
      p.vy = p.vy * 0.5 + (y - p.y) * 0.5;
    }
    p.x = x; p.y = y; p.active = true; p.last = performance.now();
    this._start();
  }

  _onLeave() { this.pointer.active = false; }

  _build() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const base = parseFloat(this.getAttribute('spacing')) || 34;
    // Em telas estreitas a malha fica um pouco mais aberta para não pesar.
    const s = w < 640 ? Math.max(base, 30) : base;
    this.cols = Math.ceil(w / s) + 3;
    this.rows = Math.ceil(h / s) + 3;
    const n = this.cols * this.rows;
    this.hx = new Float32Array(n); this.hy = new Float32Array(n);
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    const ox = (w - (this.cols - 1) * s) / 2;
    const oy = (h - (this.rows - 1) * s) / 2;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i;
        this.hx[k] = this.x[k] = ox + i * s;
        this.hy[k] = this.y[k] = oy + j * s;
      }
    }
    this.radius = Math.max(120, Math.min(260, w * 0.16));
    this.rgb = (this.getAttribute('color') || '255,255,255').trim();
    this.variant = this.getAttribute('variant') === 'dots' ? 'dots' : 'mesh';

    // Mais suave à esquerda, onde fica o texto; mais presente à direita.
    const g = this.ctx.createLinearGradient(0, 0, w, 0);
    if (w < 760) {
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,0.3)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
    }
    this.fade = g;

    if (this.reduced) this._draw(0); else this._start();
  }

  _start() {
    if (this.running || this.reduced || !this.visible || !this.x) return;
    this.running = true;
    requestAnimationFrame(this._frame);
  }

  _frame(t) {
    if (!this.running) return;
    if (!this.visible || !this.isConnected) { this.running = false; return; }
    this._step(t / 1000);
    this._draw(t / 1000);
    requestAnimationFrame(this._frame);
  }

  _step(t) {
    const p = this.pointer;
    const now = performance.now();
    let px = p.x, py = p.y, pvx = p.vx, pvy = p.vy, strength = 1;

    // Sem cursor por alguns segundos (ou no celular): um ponto passeia
    // devagar pela malha para ela não ficar parada.
    const idle = !p.active || now - p.last > 3500;
    if (idle) {
      px = this.w * (0.62 + 0.26 * Math.sin(t * 0.21));
      py = this.h * (0.5 + 0.32 * Math.sin(t * 0.33 + 1.3));
      pvx = Math.cos(t * 0.21) * 1.6;
      pvy = Math.cos(t * 0.33 + 1.3) * 1.6;
      strength = 0.55;
    }
    p.vx *= 0.9; p.vy *= 0.9;

    const R = this.radius, R2 = R * R;
    const n = this.x.length;
    for (let k = 0; k < n; k++) {
      // respiração leve da malha em repouso
      const bx = this.hx[k] + Math.sin(t * 0.5 + this.hy[k] * 0.011) * 2.2;
      const by = this.hy[k] + Math.cos(t * 0.42 + this.hx[k] * 0.009) * 2.2;
      let ax = (bx - this.x[k]) * 0.045;
      let ay = (by - this.y[k]) * 0.045;

      const dx = this.x[k] - px, dy = this.y[k] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / R); const f2 = f * f * strength;
        ax += (dx / d) * f2 * 2.4 + pvx * f2 * 0.16;   // empurra e arrasta
        ay += (dy / d) * f2 * 2.4 + pvy * f2 * 0.16;
      }
      this.vx[k] = (this.vx[k] + ax) * 0.86;
      this.vy[k] = (this.vy[k] + ay) * 0.86;
      this.x[k] += this.vx[k];
      this.y[k] += this.vy[k];
    }
  }

  _draw() {
    const c = this.ctx, w = this.w, h = this.h;
    const cols = this.cols, rows = this.rows, x = this.x, y = this.y;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);

    if (this.variant === 'mesh') {
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(' + this.rgb + ',0.16)';
      c.beginPath();
      for (let j = 0; j < rows; j++) {
        c.moveTo(x[j * cols], y[j * cols]);
        for (let i = 1; i < cols; i++) c.lineTo(x[j * cols + i], y[j * cols + i]);
      }
      for (let i = 0; i < cols; i++) {
        c.moveTo(x[i], y[i]);
        for (let j = 1; j < rows; j++) c.lineTo(x[j * cols + i], y[j * cols + i]);
      }
      c.stroke();
    }

    // Pontos: acendem conforme o quanto saíram do lugar.
    const baseA = this.variant === 'dots' ? 0.3 : 0.0;
    for (let b = 0; b < 4; b++) {
      const lo = b * 5, hi = b === 3 ? 1e9 : (b + 1) * 5;
      const a = b === 0 ? baseA : Math.min(1, 0.28 + b * 0.24);
      if (a <= 0) continue;
      const size = this.variant === 'dots' ? 1.6 + b * 0.5 : 1.2 + b * 0.6;
      c.fillStyle = 'rgba(' + this.rgb + ',' + a + ')';
      c.beginPath();
      for (let k = 0; k < x.length; k++) {
        const ddx = x[k] - this.hx[k], ddy = y[k] - this.hy[k];
        const m = Math.abs(ddx) + Math.abs(ddy);
        if (m >= lo && m < hi) { c.moveTo(x[k] + size, y[k]); c.arc(x[k], y[k], size, 0, 6.2832); }
      }
      c.fill();
    }

    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = this.fade;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }
}

if (!customElements.get('hero-mesh')) customElements.define('hero-mesh', HeroMesh);
