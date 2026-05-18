"use client";

import React from "react";

interface HUDCircleProps {
  tasks: number;
  habits: number;
  finance: number;
}

export default function HUDCircle({ tasks, habits, finance }: HUDCircleProps) {
  const rings = [
    { r: 90, value: tasks,   color: '#00D4FF', label: 'TASKS'   },
    { r: 70, value: habits,  color: '#00FF88', label: 'HABITS'  },
    { r: 50, value: finance, color: '#FF6B35', label: 'FINANCE' },
  ];

  return (
    <svg viewBox="0 0 200 200" width="280" height="280" className="hud-circle">
      {/* Grid lines radiais decorativas */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
        <line
          key={deg}
          x1="100" y1="100"
          x2={100 + 95 * Math.cos(deg * Math.PI / 180)}
          y2={100 + 95 * Math.sin(deg * Math.PI / 180)}
          stroke="rgba(0,212,255,0.08)" strokeWidth="0.5"
        />
      ))}

      {rings.map(({ r, value, color, label }) => {
        const circumference = 2 * Math.PI * r;
        const dash = (value / 100) * circumference;
        return (
          <g key={r}>
            {/* Trilha de fundo */}
            <circle cx="100" cy="100" r={r} fill="none"
              stroke="rgba(0,212,255,0.08)" strokeWidth="4" />
            {/* Arco de progresso */}
            <circle cx="100" cy="100" r={r} fill="none"
              stroke={color} strokeWidth="4"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={circumference * 0.25}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${color})` }}
            />
            {/* Label */}
            <text x="100" y={100 - r - 8} textAnchor="middle"
              fill={color} fontSize="7" fontFamily="Orbitron" letterSpacing="2">
              {label}
            </text>
          </g>
        );
      })}

      {/* Score central */}
      <text x="100" y="96" textAnchor="middle"
        fill="#00D4FF" fontSize="28" fontFamily="Orbitron" fontWeight="700">
        {Math.round((tasks + habits + finance) / 3)}%
      </text>
      <text x="100" y="112" textAnchor="middle"
        fill="rgba(0,212,255,0.5)" fontSize="8" fontFamily="Orbitron" letterSpacing="3">
        CORTEX SCORE
      </text>

      {/* Pulso central animado */}
      <circle cx="100" cy="100" r="8" fill="#00D4FF" opacity="0.8">
        <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="100" cy="100" r="5" fill="#00D4FF"/>
    </svg>
  );
}
