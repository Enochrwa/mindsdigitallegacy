import { useEffect, useRef } from "react";

/**
 * A field of imigongo-inspired diamonds: nested, stepped, high-contrast, the way Rwandan
 * imigongo wall art is built from repeating geometry. It is decoration only (aria-hidden).
 *
 * Two behaviours make it more than wallpaper:
 *  - `progress` (0..1) lights cells in a fixed scattered order, so a form can visibly "assemble"
 *    the pattern as someone completes it.
 *  - with `interactive`, cells near the pointer glow.
 * It draws once when idle and redraws only on pointer or progress changes, and it is static when
 * the person prefers reduced motion.
 */

const COLORS = {
  base: "#0f1d47",
  dim: "#16296a",
  dimmer: "#1b3279",
  gold: "#f4b63c",
  red: "#c6452d",
  paper: "#f7f4ee",
};

/** Small deterministic hash so each cell has a stable position in the lighting order. */
function rank(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

export function Pattern({
  progress = 0,
  interactive = false,
  cell = 48,
  className = "",
}: {
  progress?: number;
  interactive?: boolean;
  cell?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const progressRef = useRef(progress);
  const frame = useRef(0);

  useEffect(() => {
    progressRef.current = progress;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function draw() {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(0, 0, width, height);

    const half = cell / 2;
    const cols = Math.ceil(width / cell) + 2;
    const rows = Math.ceil(height / half) + 2;
    const lit = progressRef.current;
    const p = pointer.current;

    for (let j = -1; j < rows; j += 1) {
      for (let i = -1; i < cols; i += 1) {
        const cx = i * cell + (j % 2 === 0 ? 0 : half);
        const cy = j * half;
        let glow = lit > rank(i, j) ? 1 : 0;
        if (p) {
          const d = Math.hypot(cx - p.x, cy - p.y);
          glow = Math.max(glow, Math.max(0, 1 - d / (cell * 3.2)));
        }
        const r = half * 0.98;
        ctx.fillStyle = glow > 0.55 ? COLORS.red : COLORS.dim;
        diamond(ctx, cx, cy, r);
        ctx.fillStyle = glow > 0.25 ? COLORS.paper : COLORS.base;
        diamond(ctx, cx, cy, r * 0.7);
        ctx.fillStyle = glow > 0.05 ? COLORS.gold : COLORS.dimmer;
        diamond(ctx, cx, cy, r * 0.44);
        ctx.fillStyle = glow > 0.4 ? COLORS.red : COLORS.base;
        diamond(ctx, cx, cy, r * 0.18);
      }
    }
  }

  function schedule() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  }

  useEffect(() => {
    draw();
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parent = canvas.parentElement;
    const move = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.current = { x: e.clientX - box.left, y: e.clientY - box.top };
      schedule();
    };
    const leave = () => {
      pointer.current = null;
      schedule();
    };
    if (interactive && !reduced && parent) {
      parent.addEventListener("pointermove", move);
      parent.addEventListener("pointerleave", leave);
    }
    return () => {
      observer.disconnect();
      parent?.removeEventListener("pointermove", move);
      parent?.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, cell]);

  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />;
}
