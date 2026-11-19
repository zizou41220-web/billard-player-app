import React, { useEffect, useRef } from 'react';
import { useNeonFx } from '../utils/neonFx';
import { useTheme } from '../utils/theme';

type Particle = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
type Orb = { x: number; y: number; r: number; vx: number; vy: number; color: string };

/**
 * Fond animé néon (orbes lumineux + constellation de particules) affiché derrière toute l'application.
 * Désactivé en thème clair, si l'utilisateur coupe l'ambiance, ou si prefers-reduced-motion.
 */
export const NeonBackdrop: React.FC = () => {
  const [enabled] = useNeonFx();
  const [theme] = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const active = enabled && theme === 'dark' && !reduceMotion;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (active) document.body.classList.add('fx-neon');
    else document.body.classList.remove('fx-neon');
    return () => document.body.classList.remove('fx-neon');
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.max(24, Math.min(56, Math.round((width * height) / 38000)));
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1 + Math.random() * 1.8,
      hue: Math.random() < 0.7 ? 160 : 45 // émeraude ou or
    }));

    const orbs: Orb[] = [
      { x: width * 0.15, y: height * 0.2, r: Math.max(width, height) * 0.38, vx: 0.18, vy: 0.12, color: '16, 185, 129' },
      { x: width * 0.85, y: height * 0.75, r: Math.max(width, height) * 0.34, vx: -0.15, vy: -0.1, color: '56, 189, 248' },
      { x: width * 0.55, y: height * 0.45, r: Math.max(width, height) * 0.22, vx: 0.1, vy: -0.14, color: '251, 191, 36' }
    ];

    const LINK_DIST = 130;

    const frame = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      // Orbes lumineux
      for (const o of orbs) {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < -o.r * 0.3 || o.x > width + o.r * 0.3) o.vx *= -1;
        if (o.y < -o.r * 0.3 || o.y > height + o.r * 0.3) o.vy *= -1;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `rgba(${o.color}, 0.16)`);
        g.addColorStop(1, `rgba(${o.color}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      // Particules + liens
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(52, 211, 153, ${(1 - d / LINK_DIST) * 0.22})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 62%, 0.8)`;
        ctx.shadowColor = `hsla(${p.hue}, 90%, 62%, 0.9)`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none'
      }}
    />
  );
};

export const NeonToggleButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [enabled, toggle] = useNeonFx();
  return (
    <button
      className="btn btn-outline"
      onClick={toggle}
      title={enabled ? "Couper l'ambiance néon (fond animé)" : "Activer l'ambiance néon (fond animé, verre dépoli)"}
      style={compact ? {
        background: enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${enabled ? '#34D399' : 'rgba(255,255,255,0.25)'}`,
        color: enabled ? '#34D399' : '#CCFBF1',
        borderRadius: '8px',
        padding: '2px 7px',
        fontSize: '0.72rem',
        fontWeight: 800,
        cursor: 'pointer'
      } : {
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        fontWeight: 800,
        padding: '0.55rem 0.95rem',
        fontSize: '0.84rem',
        color: enabled ? '#34D399' : 'var(--text-muted)',
        borderColor: enabled ? 'rgba(52, 211, 153, 0.5)' : 'rgba(255,255,255,0.2)',
        background: enabled ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255,255,255,0.04)'
      }}
    >
      ✨ {compact ? 'Néon' : (enabled ? 'Ambiance Néon ON' : 'Ambiance Néon OFF')}
    </button>
  );
};

export default NeonBackdrop;
