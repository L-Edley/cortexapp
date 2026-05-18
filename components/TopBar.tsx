"use client";

import { useState, useEffect } from "react";

export default function TopBar() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      setNow(new Date());
      animationFrameId = requestAnimationFrame(updateTime);
    };
    animationFrameId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="logo">⬡ CORTEX</span>
        <span className="version">v2.0</span>
      </div>

      <div className="top-bar-center">
        <span className="datetime">
          {now.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase()}
          {' '}
          {now.toLocaleDateString('pt-BR')}
          {' — '}
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      <div className="top-bar-right">
        <span className="status-chip online">● AION ONLINE</span>
        <span className="status-chip">⬡ VAULT SYNC</span>
        <span className="status-chip">🎤 VOZ ATIVA</span>
      </div>
    </header>
  );
}
