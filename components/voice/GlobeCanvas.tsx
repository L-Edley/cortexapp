"use client";

import React, { useEffect, useRef } from "react";

export type GlobeState = "idle" | "listening" | "processing" | "responding" | "speaking" | "error";

export interface GlobeCanvasProps {
  state: GlobeState;
  intensity?: number;
  size?: "sm" | "md" | "lg";
  reducedMotion?: boolean;
}

export default function GlobeCanvas({
  state,
  intensity = 1.0,
  size = "md",
  reducedMotion = false,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GlobeState>(state);
  const reducedMotionRef = useRef<boolean>(reducedMotion);

  // Keep refs up-to-date to avoid restarting the animation loop
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Dimension helpers
  const pixelSize = size === "sm" ? 112 : size === "md" ? 160 : 208;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI screens
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = pixelSize * dpr;
    canvas.height = pixelSize * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;
    let angle = 0;
    let pulseAngle = 0;
    let waveOffset = 0;

    // Define particles for the holographic floating dust effect
    const particleCount = size === "sm" ? 12 : size === "md" ? 20 : 30;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * pixelSize,
      y: Math.random() * pixelSize,
      size: Math.random() * 1.5 + 0.5,
      speedY: -(Math.random() * 0.4 + 0.1),
      alpha: Math.random() * 0.5 + 0.1,
      angle: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      // If page is hidden, pause or reduce render frequency to save resources
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        animationId = requestAnimationFrame(render);
        return;
      }

      const currentState = stateRef.current;
      const isReduced = reducedMotionRef.current;

      // Clear with very subtle glow trace
      ctx.clearRect(0, 0, pixelSize, pixelSize);

      const cx = pixelSize / 2;
      const cy = pixelSize / 2;
      const baseRadius = pixelSize * 0.35;

      // Increment rotation angles based on state
      let rotSpeed = 0.005;
      let pulseSpeed = 0.03;

      if (currentState === "listening") {
        rotSpeed = 0.012;
        pulseSpeed = 0.08;
      } else if (currentState === "processing") {
        rotSpeed = 0.025;
        pulseSpeed = 0.01;
      } else if (currentState === "responding" || currentState === "speaking") {
        rotSpeed = 0.008;
        pulseSpeed = 0.06;
      } else if (currentState === "error") {
        rotSpeed = 0.003;
        pulseSpeed = 0.05;
      }

      if (isReduced) {
        rotSpeed *= 0.2;
        pulseSpeed *= 0.2;
      }

      angle += rotSpeed;
      pulseAngle += pulseSpeed;
      waveOffset += 0.08;

      // Get color palette based on active state
      let primaryColor = "rgba(6, 182, 212, "; // cyan
      let secondaryColor = "rgba(14, 116, 144, "; // dark cyan
      let shadowColor = "rgba(34, 211, 238, 0.3)";

      if (currentState === "listening") {
        primaryColor = "rgba(34, 211, 238, ";
        secondaryColor = "rgba(6, 182, 212, ";
        shadowColor = "rgba(34, 211, 238, 0.45)";
      } else if (currentState === "processing") {
        primaryColor = "rgba(245, 158, 11, "; // amber
        secondaryColor = "rgba(217, 119, 6, ";
        shadowColor = "rgba(245, 158, 11, 0.4)";
      } else if (currentState === "responding" || currentState === "speaking") {
        primaryColor = "rgba(16, 185, 129, "; // emerald
        secondaryColor = "rgba(4, 120, 87, ";
        shadowColor = "rgba(16, 185, 129, 0.4)";
      } else if (currentState === "error") {
        primaryColor = "rgba(239, 68, 68, "; // red
        secondaryColor = "rgba(185, 28, 28, ";
        shadowColor = "rgba(239, 68, 68, 0.55)";
      }

      // Draw outer glowing aura
      const auraPulse = (Math.sin(pulseAngle) * 0.08 + 0.92) * intensity;
      ctx.shadowBlur = isReduced ? 5 : 20;
      ctx.shadowColor = shadowColor;

      // Radial Core Gradient
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius * auraPulse);
      coreGrad.addColorStop(0, primaryColor + "0.25)");
      coreGrad.addColorStop(0.5, secondaryColor + "0.1)");
      coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * auraPulse, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadows for lines/arcs to keep it crisp
      ctx.shadowBlur = 0;

      // 1. Draw Holographic Crossing Grid Lines
      ctx.strokeStyle = primaryColor + "0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const lineAngle = angle + (i * Math.PI) / 4;
        const dx = Math.cos(lineAngle) * baseRadius;
        const dy = Math.sin(lineAngle) * baseRadius;
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
      }
      ctx.stroke();

      // 2. Draw Concentric Grid Rings
      ctx.strokeStyle = primaryColor + "0.15)";
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.4, 0, Math.PI * 2);
      ctx.arc(cx, cy, baseRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Draw Outer Orbiting Arcs
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = primaryColor + "0.45)";
      
      // Arc A
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.9, angle, angle + Math.PI * 0.6);
      ctx.stroke();

      // Arc B (Rotates counter-wise)
      ctx.strokeStyle = secondaryColor + "0.3)";
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.05, -angle * 1.5, -angle * 1.5 + Math.PI * 0.45);
      ctx.stroke();

      // 4. Draw Soundwaves (Concetric wave expansion) when speaking/listening
      if ((currentState === "speaking" || currentState === "listening") && !isReduced) {
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = primaryColor + "0.25)";
        for (let w = 1; w <= 3; w++) {
          const waveRadius = baseRadius * 0.5 + ((waveOffset * 12 * w) % (baseRadius * 0.6));
          const opacity = Math.max(0, 1 - waveRadius / (baseRadius * 1.1));
          ctx.strokeStyle = primaryColor + `${opacity * 0.35})`;
          ctx.beginPath();
          ctx.arc(cx, cy, waveRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // 5. Draw digital dust particles
      if (!isReduced) {
        ctx.fillStyle = primaryColor + "0.4)";
        particles.forEach((p) => {
          // Animate position
          p.y += p.speedY;
          p.angle += 0.02;
          
          // Re-spawn at bottom if off screen
          if (p.y < 0) {
            p.y = pixelSize;
            p.x = Math.random() * pixelSize;
          }

          // Calculate offset with sine drift
          const xDrift = Math.sin(p.angle) * 0.15;
          ctx.beginPath();
          ctx.arc(p.x + xDrift * 10, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 6. Draw central core solid element
      ctx.fillStyle = primaryColor + "0.65)";
      ctx.beginPath();
      const coreSize = currentState === "processing" ? 5 + Math.sin(pulseAngle * 2) * 1.5 : 4;
      ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
      ctx.fill();

      // Scanline Effect Overlay (Holographic terminal scanlines)
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      for (let y = 2; y < pixelSize; y += 4) {
        ctx.fillRect(0, y, pixelSize, 1);
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [pixelSize, intensity]);

  return (
    <div
      className="relative flex items-center justify-center select-none pointer-events-none"
      style={{ width: pixelSize, height: pixelSize }}
      data-testid="globe-canvas-wrapper"
      data-state={state}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
