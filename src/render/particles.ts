// 성공·타격 시 터지는 별/색종이 파티클 + 충격파 링.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: 'star' | 'square' | 'circle';
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  color: string;
}

export const PALETTE_SUCCESS = ['#39ff14', '#ffd400', '#00e5ff', '#ff4fd8', '#ffffff'];
export const PALETTE_HIT = ['#ffd400', '#ff8a00', '#ff3d00', '#ffffff'];

export class Particles {
  private ps: Particle[] = [];
  private rings: Ring[] = [];

  /** @param scale 몸 크기 기준 길이(px, 어깨너비) */
  burst(x: number, y: number, scale: number, palette: string[], count = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = scale * (2.5 + Math.random() * 5.5);
      const life = 0.9 + Math.random() * 0.8;
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - scale * 2.5,
        life,
        maxLife: life,
        size: scale * (0.06 + Math.random() * 0.1),
        color: palette[(Math.random() * palette.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        shape: (['star', 'square', 'circle'] as const)[(Math.random() * 3) | 0],
      });
    }
    this.rings.push({ x, y, r: scale * 0.2, vr: scale * 7, life: 0.6, color: palette[0] });
    this.rings.push({ x, y, r: scale * 0.1, vr: scale * 4.5, life: 0.75, color: palette[1] ?? palette[0] });
  }

  get active(): boolean {
    return this.ps.length > 0 || this.rings.length > 0;
  }

  update(dt: number, gravity: number) {
    for (const p of this.ps) {
      p.vy += gravity * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    this.ps = this.ps.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.r += r.vr * dt;
      r.life -= dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, r.life / 0.75);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(4, r.r * 0.06);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.ps) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife) * 1.4);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'star') starPath(ctx, p.size);
      else if (p.shape === 'square') {
        ctx.beginPath();
        ctx.rect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function starPath(ctx: CanvasRenderingContext2D, size: number) {
  const R = size * 0.8;
  const r = R * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
}
