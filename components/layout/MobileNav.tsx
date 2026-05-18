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

interface MobileNavProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

export default function MobileNav({ activeView, onViewChange }: MobileNavProps) {
  // Usando os mesmos ícones que colocamos na Sidebar
  const items: { id: ActiveView; label: string; icon: any }[] = [
    { id: "aion", label: "Aion", icon: Zap },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "tasks", label: "Tarefas", icon: ListTodo },
    { id: "ideas", label: "Ideias", icon: Lightbulb },
    { id: "finances", label: "Finanças", icon: Wallet },
    { id: "review", label: "Revisão", icon: CalendarSync },
    { id: "settings", label: "Config", icon: Settings },
  ];

  return (
    <nav className="flex items-center justify-start sm:justify-between px-2 py-2 bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-lg overflow-x-auto no-scrollbar gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-col items-center justify-center min-w-[60px] p-2 gap-1 rounded-xl transition-colors ${
              isActive 
                ? "text-orange-500 bg-orange-500/10" 
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}