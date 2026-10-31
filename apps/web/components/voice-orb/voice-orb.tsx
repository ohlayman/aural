'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ORB_FRAGMENT, ORB_VERTEX } from './shader';
import type { OrbState } from './state';

export interface VoiceOrbProps {
  state: OrbState;
  amp?: number;
  hue?: number;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  label: string;
  /** Real spectrum source while speaking; null renders a faint static ring. */
  analyser?: AnalyserNode | null;
}

const DPR_CAP = 1.75;
const BASE_AMP = 0.14;
const RING_SEGMENTS = 72;

const STATE_GAIN: Record<OrbState, number> = {
  idle: 1,
  thinking: 1.25,
  listening: 1.8,
  speaking: 2,
};

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function VoiceOrb({
  state,
  amp = BASE_AMP,
  hue,
  onPointerDown,
  onPointerUp,
  label,
  analyser = null,
}: VoiceOrbProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<OrbState>(state);
  const ampRef = useRef(amp);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    stateRef.current = state;
    ampRef.current = amp;
  }, [state, amp]);

  // Outer ring: 72 segments driven by the real analyser spectrum. Without an
  // analyser it falls back to a faint, deterministic ring (never fake data).
  useEffect(() => {
    const canvas = ringRef.current;
    if (!canvas) return;
    const clock = canvas.getContext('2d');
    if (!clock) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frameId = 0;
    let running = false;
    let spectrum: Uint8Array<ArrayBuffer> | null = null;

    function resize(): { width: number; height: number } {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const rect = canvas!.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
      }
      return { width, height };
    }

    function draw() {
      const { width, height } = resize();
      clock!.clearRect(0, 0, width, height);

      let data: Uint8Array<ArrayBuffer> | null = null;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        if (!spectrum || spectrum.length !== bins) {
          spectrum = new Uint8Array(new ArrayBuffer(bins));
        }
        try {
          analyser.getByteFrequencyData(spectrum);
          data = spectrum;
        } catch {
          data = null;
        }
      }

      const size = Math.min(width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = size * 0.455;
      const lineWidth = Math.max(1.5, size * 0.0045);
      const segmentAngle = (Math.PI * 2) / RING_SEGMENTS;

      clock!.lineCap = 'round';
      clock!.lineWidth = lineWidth;

      for (let i = 0; i < RING_SEGMENTS; i += 1) {
        let value = 0;
        if (data) {
          // Fold the usable low/mid spectrum into 72 bars.
          const start = Math.floor((i / RING_SEGMENTS) * data.length * 0.75);
          const end = Math.max(
            start + 1,
            Math.floor(((i + 1) / RING_SEGMENTS) * data.length * 0.75),
          );
          let sum = 0;
          let count = 0;
          for (let bin = start; bin < end && bin < data.length; bin += 1) {
            sum += data[bin];
            count += 1;
          }
          value = count > 0 ? sum / count / 255 : 0;
        }

        const half = data
          ? size * (0.006 + value * 0.03)
          : size * 0.004;
        const angle = i * segmentAngle - Math.PI / 2;
        const alpha = data ? 0.16 + value * 0.66 : 0.14;
        clock!.strokeStyle = `rgba(150, 132, 255, ${alpha.toFixed(3)})`;
        clock!.beginPath();
        clock!.moveTo(
          cx + Math.cos(angle) * (radius - half),
          cy + Math.sin(angle) * (radius - half),
        );
        clock!.lineTo(
          cx + Math.cos(angle) * (radius + half),
          cy + Math.sin(angle) * (radius + half),
        );
        clock!.stroke();
      }
    }

    function frame() {
      if (!running) return;
      if (document.hidden) {
        stop();
        return;
      }
      draw();
      frameId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      frameId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frameId);
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else if (reduced) {
        draw();
      } else {
        start();
      }
    }

    draw();
    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [analyser]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      setWebglFailed(true);
      return;
    }
    const context = gl;

    const vertex = compileShader(context, context.VERTEX_SHADER, ORB_VERTEX);
    const fragment = compileShader(context, context.FRAGMENT_SHADER, ORB_FRAGMENT);
    if (!vertex || !fragment) {
      if (vertex) context.deleteShader(vertex);
      if (fragment) context.deleteShader(fragment);
      setWebglFailed(true);
      return;
    }

    const program = context.createProgram();
    if (!program) {
      context.deleteShader(vertex);
      context.deleteShader(fragment);
      setWebglFailed(true);
      return;
    }
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      context.deleteProgram(program);
      context.deleteShader(vertex);
      context.deleteShader(fragment);
      setWebglFailed(true);
      return;
    }
    context.useProgram(program);

    const buffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      context.STATIC_DRAW,
    );
    const position = context.getAttribLocation(program, 'p');
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

    const uniforms = {
      R: context.getUniformLocation(program, 'R'),
      T: context.getUniformLocation(program, 'T'),
      AMP: context.getUniformLocation(program, 'AMP'),
      M: context.getUniformLocation(program, 'M'),
      MODE: context.getUniformLocation(program, 'MODE'),
    };

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const mouse = { x: 0, y: 0 };
    let frameId = 0;
    let running = false;
    let elapsed = 0;
    let last = 0;

    function resize(): { width: number; height: number } {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const rect = stage!.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
        context.viewport(0, 0, width, height);
      }
      return { width, height };
    }

    function draw() {
      const gain = STATE_GAIN[stateRef.current];
      const breathing = reduced ? 1 : 1 + Math.sin(elapsed * 1.1) * 0.28;
      context.uniform2f(uniforms.R, canvas!.width, canvas!.height);
      context.uniform1f(uniforms.T, elapsed);
      context.uniform1f(uniforms.AMP, ampRef.current * gain * breathing);
      context.uniform2f(uniforms.M, mouse.x, mouse.y);
      context.uniform1f(uniforms.MODE, stateRef.current === 'thinking' ? 1 : 0);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    }

    function frame(now: number) {
      if (!running) return;
      if (document.hidden) {
        stop();
        return;
      }
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += delta;
      draw();
      frameId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      frameId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frameId);
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
        return;
      }
      if (reduced) {
        draw();
      } else {
        start();
      }
    }

    function handleMouseMove(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = -(event.clientY / window.innerHeight - 0.5) * 2;
    }

    resize();
    draw();
    start();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    observer.observe(stage);
    document.addEventListener('visibilitychange', handleVisibility);
    if (!reduced) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('mousemove', handleMouseMove);
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
      context.deleteShader(vertex);
      context.deleteShader(fragment);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) onPointerDown?.();
  }

  function handleKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onPointerUp?.();
  }

  return (
    <div
      ref={stageRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      data-state={state}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className="relative aspect-square w-[min(640px,76vw,54vh)] touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-base)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={hue ? { filter: `hue-rotate(${hue}deg)` } : undefined}
      >
        <div className="aural-orb-halo absolute inset-[14%] rounded-full" />
        {webglFailed ? (
          <div
            className="absolute inset-[10%] rounded-full"
            style={{
              background:
                'radial-gradient(circle at 42% 38%, rgba(207,195,255,0.9), rgba(124,92,255,0.78) 34%, rgba(61,123,255,0.36) 58%, transparent 74%)',
              filter: 'blur(6px)',
            }}
          />
        ) : null}
        <canvas
          ref={canvasRef}
          id="gl"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div aria-hidden="true" className="aural-orb-ticks absolute -inset-[7%] rounded-full opacity-50" />
      <canvas
        ref={ringRef}
        aria-hidden="true"
        data-testid="orb-ring"
        className="pointer-events-none absolute -inset-[10%] h-[120%] w-[120%]"
      />
    </div>
  );
}
