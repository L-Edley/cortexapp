"use client";

import CommandCenter from '@/components/CommandCenter';
import HUDCircle from '@/components/HUDCircle';
import ModuleCard from '@/components/ModuleCard';
import FeedPanel from '@/components/FeedPanel';

export default function Home() {
  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-44px)] overflow-hidden p-4 gap-4 cortex-app text-[var(--text-primary)]">
      
      {/* ZONA ESQUERDA — Módulos */}
      <div className="w-full md:w-[280px] flex flex-col gap-4 flex-shrink-0">
        <ModuleCard title="HÁBITOS">
          <div className="text-xs font-[var(--font-mono)] text-[var(--text-secondary)] space-y-2">
            <div className="flex justify-between">
              <span>Meditação</span>
              <span className="text-[var(--cyan-bright)]">5 dias</span>
            </div>
            <div className="flex justify-between">
              <span>Leitura</span>
              <span className="text-[var(--cyan-bright)]">12 dias</span>
            </div>
            <div className="flex justify-between">
              <span>Treino</span>
              <span className="text-[var(--orange-hot)]">0 dias</span>
            </div>
          </div>
        </ModuleCard>

        <ModuleCard title="FINANÇAS">
          <div className="text-xs font-[var(--font-mono)] space-y-2">
            <div className="text-[var(--text-secondary)]">SALDO ATUAL</div>
            <div className="text-lg text-[var(--green-ok)]">R$ 12.450,00</div>
            <div className="mt-2 h-1 bg-zinc-800 rounded overflow-hidden">
              <div className="h-full bg-[var(--cyan-bright)] w-[65%]" />
            </div>
            <div className="text-[10px] text-[var(--text-muted)] text-right">65% DO ORÇAMENTO</div>
          </div>
        </ModuleCard>

        <ModuleCard title="TAREFAS">
          <div className="text-xs font-[var(--font-mono)] text-[var(--text-secondary)] space-y-2">
            <div className="flex gap-2 items-start">
              <span className="text-[var(--red-alert)]">[URG]</span>
              <span>Revisar contrato refactoring</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-[var(--yellow-warn)]">[MED]</span>
              <span>Comprar presentes de natal</span>
            </div>
            <div className="flex gap-2 items-start opacity-50">
              <span className="text-[var(--cyan-bright)]">[OK]</span>
              <span className="line-through">Agendar dentista</span>
            </div>
          </div>
        </ModuleCard>
      </div>

      {/* ZONA CENTRAL — Command Center + HUD */}
      <div className="flex-1 flex flex-col items-center justify-between gap-6 min-w-0 h-full">
        <div className="flex-1 flex items-center justify-center w-full mt-4">
          <HUDCircle tasks={85} habits={60} finance={75} />
        </div>
        
        <div className="w-full max-w-3xl mb-4">
          <CommandCenter />
        </div>
      </div>

      {/* ZONA DIREITA — Feed de Atividade */}
      <div className="w-full md:w-[320px] flex-shrink-0 h-full hidden md:block">
        <FeedPanel />
      </div>

      {/* ZONA INFERIOR (Status Bar) can be added to layout if needed, but it's okay here or in layout. */}
    </div>
  );
}
