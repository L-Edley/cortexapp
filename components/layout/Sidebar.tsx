"use client";

import { ActiveView } from "@/components/AppShell";
import { 
  LayoutDashboard, 
  Zap, 
  ListTodo, 
  Lightbulb, 
  Wallet, 
  CalendarSync, 
  Settings 
} from "lucide-react";

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  // AQUI ESTÁ A LISTA "items" QUE ESTAVA FALTANDO!
  const items: { id: ActiveView; label: string; icon: any }[] = [
    { id: "aion", label: "Aion", icon: Zap },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "tasks", label: "Tarefas", icon: ListTodo },
    { id: "ideas", label: "Ideias", icon: Lightbulb },
    { id: "finances", label: "Finanças", icon: Wallet },
    { id: "review", label: "Revisão", icon: CalendarSync },
    { id: "settings", label: "Configurações", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-zinc-800 bg-zinc-950/50 py-4">
      <div className="mb-8 font-bold text-xl px-6 text-zinc-100">Cortex</div>
      
      <div className="flex flex-col gap-1 flex-1 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-left text-sm font-medium ${
                isActive 
                  ? "bg-zinc-800 text-zinc-100 shadow-sm" 
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-orange-500" : ""}`} />
              {item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}