// components/AppShell.tsx
"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import DashboardView from "@/components/DashboardView";
import CommandCenter from "@/components/CommandCenter";
import TasksView from "@/components/TasksView";
import IdeasView from "@/components/IdeasView";
import FinancesView from "@/components/FinancesView";
import DailyReview from "@/components/DailyReview";
import SettingsView from "@/components/SettingsView";
import { hasSeededAionKnowledge, seedAionKnowledgeBase } from "@/lib/aionKnowledgeSeed";

export type ActiveView = 
  | "dashboard" 
  | "aion" 
  | "tasks" 
  | "ideas" 
  | "finances" 
  | "review" 
  | "settings";

export default function AppShell() {
  // Começamos com o CommandCenter (Aion) como tela inicial
  const [activeView, setActiveView] = useState<ActiveView>("aion");

  useEffect(() => {
    // Inicialização segura em background do treinamento inicial do Aion
    if (!hasSeededAionKnowledge()) {
      seedAionKnowledgeBase().catch((err) => {
        console.warn("[AION] Falha silenciosa no seed em background:", err);
      });
    }
  }, []);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar para Desktop */}
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Área principal de renderização */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeView === "dashboard" && <DashboardView onNavigate={setActiveView} />}
          {activeView === "aion" && <CommandCenter />}
          {activeView === "tasks" && <TasksView />}
          {activeView === "ideas" && <IdeasView />}
          {activeView === "finances" && <FinancesView />}
          {activeView === "review" && <DailyReview />}
          {activeView === "settings" && <SettingsView />}
        </main>

        {/* Navegação Mobile */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-50 bg-background border-t">
          <MobileNav activeView={activeView} onViewChange={setActiveView} />
        </div>
      </div>
    </div>
  );
}