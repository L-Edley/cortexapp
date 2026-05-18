"use client";

import { useState, useEffect } from "react";
import type { CortexRecord } from "@/lib/types";

export default function FeedPanel() {
  const [records, setRecords] = useState<CortexRecord[]>([]);

  useEffect(() => {
    const fetchRecords = async () => {
      // Basic fetch from localStorage for MVP display
      const hasData = localStorage.getItem("cortex_has_data");
      if (hasData) {
        // Just mock some recent interactions or fetch from localDB
        // Assuming records are saved to an IDB via storageProvider, we'll try to fetch from cortex_interactions
        const stored = localStorage.getItem("cortex_interactions");
        if (stored) {
          try {
            const interactions = JSON.parse(stored);
            setRecords(interactions.map((i: any) => ({
              id: i.id,
              title: i.response.title,
              type: i.response.type,
              createdAt: i.timestamp,
              amount: i.response.amount
            })));
          } catch { }
        }
      }
    };
    
    fetchRecords();
    
    // Auto refresh every 5s
    const interval = setInterval(fetchRecords, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="feed-panel flex flex-col h-full bg-[var(--bg-glass)] border border-[var(--cyan-dim)] rounded-[4px] backdrop-blur-[16px] overflow-hidden relative">
       {/* Canto decorativo estilo blueprint */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-[var(--cyan-bright)] opacity-60 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-[var(--cyan-bright)] opacity-60 pointer-events-none" />

      <div className="card-header">
        <div className="card-header-left">
          <span className="status-dot" />
          <span>ACTIVITY FEED</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {records.length === 0 ? (
          <div className="text-[var(--text-muted)] text-xs font-[var(--font-mono)]">NO RECENT ACTIVITY...</div>
        ) : (
          records.slice(0, 15).map(r => (
            <div key={r.id} className="text-xs font-[var(--font-mono)] pb-2 border-b border-[var(--cyan-dim)] opacity-80 hover:opacity-100 transition-opacity">
              <div className="text-[var(--cyan-bright)] mb-1">
                [{new Date(r.createdAt || '').toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}] {r.type.toUpperCase()}
              </div>
              <div className="text-[var(--text-primary)]">
                {r.title}
                {r.amount ? ` - R$ ${r.amount}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
