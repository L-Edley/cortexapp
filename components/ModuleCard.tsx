"use client";

import React from "react";

interface ModuleCardProps {
  title: string;
  status?: boolean;
  children: React.ReactNode;
}

export default function ModuleCard({ title, status = true, children }: ModuleCardProps) {
  return (
    <div className="module-card">
      <div className="card-header">
        <div className="card-header-left">
          <span className="status-dot" style={{ background: status ? 'var(--green-ok)' : 'var(--yellow-warn)' }} />
          <span>{title}</span>
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
