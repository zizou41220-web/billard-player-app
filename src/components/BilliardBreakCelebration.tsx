import React, { useEffect, useRef } from 'react';

interface BilliardBreakCelebrationProps {
  active: boolean;
}

type BallType = 'cue' | 'red' | 'yellow' | 'eight';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  type: BallType;
  trail: Array<{ x: number; y: number }>;
}

interface Shockwave {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

const RACK_LAYOUT: BallType[][] = [
  ['red'],
  ['yellow', 'red'],
  ['red', 'eight', 'yellow'],
  ['yellow', 'red', 'yellow', 'red'],
  ['red', 'yellow', 'red', 'yellow', 'yellow']
];

const BALL_PALETTE: Record<BallType, { main: string; dark: string; highlight: string }> = {
  cue: { main: '#f8fafc', dark: '#94a3b8', highlight: '#ffffff' },
  red: { main: '#ef4444', dark: '#991b1b', highlight: '#fca5a5' },
  yellow: { main: '#facc15', dark: '#a16207', highlight: '#fef08a' },
  eight: { main: '#1e293b', dark: '#020617', highlight: '#64748b' }
};

export const BilliardBreakCelebration: React.FC<BilliardBreakCelebrationProps> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const r = Math.max(12, Math.min(22, Math.min(width, height) * 0.028));
    const dx = r * Math.sqrt(3) + 0.6;
    const dy = r * 2 + 0.6;

    const apexX = width * 0.58;
    const apexY = height * 0.5;

    const balls: Ball[] = [];

    // 15 Blackball balls in triangle formation
    RACK_LAYOUT.forEach((row, colIdx) => {
      const rowHeight = (row.length - 1) * dy;
      const startY = apexY - rowHeight / 2;
      const x = apexX + colIdx * dx;
      row.forEach((type, rowIdx) => {
        balls.push({
          x,
          y: startY + rowIdx * dy,
          vx: 0,
          vy: 0,
          r,
          type,
          trail: []
        });
      });
    });

    // Cue ball (Blanche) launching from the left toward the apex
    const cueStartX = Math.max(r * 2, width * 0.14);
    const breakSpeed = Math.max(20, (apexX - cueStartX) / 14);
    const cueBall: Ball = {
      x: cueStartX,
      y: apexY + (Math.random() - 0.5) * (r * 0.35),
      vx: breakSpeed,
      vy: (Math.random() - 0.5) * 1.2,
      r,
      type: 'cue',
      trail: []
    };
    balls.push(cueBall);

    const shockwaves: Shockwave[] = [];
    let hasImpacted = false;
    let frame = 0;
    let animId: number;

    const SUBSTEPS = 4;
    const FRICTION = Math.pow(0.988, 1 / SUBSTEPS);
    const RESTITUTION = 0.92;
    const WALL_RESTITUTION = 0.82;

    const stepPhysics = () => {
      for (let s = 0; s < SUBSTEPS; s++) {
        // Move & collide with viewport edges (virtual cushions)
        for (const b of balls) {
          b.x += b.vx / SUBSTEPS;
          b.y += b.vy / SUBSTEPS;
          b.vx *= FRICTION;
          b.vy *= FRICTION;

          if (b.x - b.r < 0) {
            b.x = b.r;
            b.vx = Math.abs(b.vx) * WALL_RESTITUTION;
          } else if (b.x + b.r > width) {
            b.x = width - b.r;
            b.vx = -Math.abs(b.vx) * WALL_RESTITUTION;
          }

          if (b.y - b.r < 0) {
            b.y = b.r;
            b.vy = Math.abs(b.vy) * WALL_RESTITUTION;
          } else if (b.y + b.r > height) {
            b.y = height - b.r;
            b.vy = -Math.abs(b.vy) * WALL_RESTITUTION;
          }
        }

        // Elastic ball-to-ball collisions
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            const distDx = b.x - a.x;
            const distDy = b.y - a.y;
            const minDist = a.r + b.r;
            const distSq = distDx * distDx + distDy * distDy;

            if (distSq < minDist * minDist && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const nx = distDx / dist;
              const ny = distDy / dist;

              // Separate overlapping balls
              const overlap = (minDist - dist) * 0.5;
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              b.x += nx * overlap;
              b.y += ny * overlap;

              // Relative velocity along normal
              const dvx = a.vx - b.vx;
              const dvy = a.vy - b.vy;
              const relVel = dvx * nx + dvy * ny;

              if (relVel > 0) {
                const impulse = relVel * RESTITUTION;
                a.vx -= impulse * nx;
                a.vy -= impulse * ny;
                b.vx += impulse * nx;
                b.vy += impulse * ny;

                if (!hasImpacted && (a.type === 'cue' || b.type === 'cue')) {
                  hasImpacted = true;
                  shockwaves.push({
                    x: (a.x + b.x) / 2,
                    y: (a.y + b.y) / 2,
                    r: r * 1.2,
                    alpha: 0.9
                  });
                }
              }
            }
          }
        }
      }
    };

    const drawBall = (b: Ball, globalAlpha: number) => {
      const palette = BALL_PALETTE[b.type];

      // Speed trail for fast-moving cue ball before/during break
      if (b.type === 'cue' && b.trail.length > 1) {
        for (let i = 0; i < b.trail.length; i++) {
          const pt = b.trail[i];
          const tAlpha = ((i + 1) / b.trail.length) * 0.28 * globalAlpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, b.r * (0.4 + 0.5 * ((i + 1) / b.trail.length)), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(248, 250, 252, ${tAlpha})`;
          ctx.fill();
        }
      }

      ctx.save();
      ctx.globalAlpha = globalAlpha;

      // Drop shadow
      ctx.beginPath();
      ctx.arc(b.x + 3, b.y + 5, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fill();

      // 3D sphere gradient
      const grad = ctx.createRadialGradient(
        b.x - b.r * 0.32,
        b.y - b.r * 0.32,
        b.r * 0.1,
        b.x,
        b.y,
        b.r
      );
      grad.addColorStop(0, palette.highlight);
      grad.addColorStop(0.38, palette.main);
      grad.addColorStop(1, palette.dark);

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular shine dot
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fill();

      // Number 8 badge on Blackball
      if (b.type === 'eight') {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.round(b.r * 0.62)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8', b.x, b.y + 0.5);
      }

      ctx.restore();
    };

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // Fade in quickly, fade out smoothly near the end (frames 165 -> 235)
      let globalAlpha = 1;
      if (frame < 8) {
        globalAlpha = frame / 8;
      } else if (frame > 165) {
        globalAlpha = Math.max(0, 1 - (frame - 165) / 70);
      }

      // Record trail for cue ball while moving fast
      const cueSpeed = Math.hypot(cueBall.vx, cueBall.vy);
      if (cueSpeed > 4) {
        cueBall.trail.push({ x: cueBall.x, y: cueBall.y });
        if (cueBall.trail.length > 8) cueBall.trail.shift();
      } else if (cueBall.trail.length > 0) {
        cueBall.trail.shift();
      }

      stepPhysics();

      // Draw impact shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += 7;
        sw.alpha *= 0.9;
        if (sw.alpha <= 0.02) {
          shockwaves.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52, 211, 153, ${sw.alpha * globalAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // Draw all 16 balls
      for (const b of balls) {
        drawBall(b, globalAlpha);
      }

      if (frame < 235 && globalAlpha > 0) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
};

export default BilliardBreakCelebration;
