'use client';

import { LayoutDashboard, Zap, Database, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

export interface NavItem {
  id: string;
  icon: typeof LayoutDashboard;
  label: string;
}

interface SidebarProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export default function Sidebar({ items, activeTab, onTabChange }: SidebarProps) {
  return (
    <nav className="hidden md:flex w-20 flex-col items-center py-8 border-r border-zinc-900 bg-[#080808] z-30 shrink-0">
      <div className="mb-12 relative group cursor-pointer">
        <div className="w-12 h-12 bg-orange-500 flex items-center justify-center font-black text-2xl text-black transform group-hover:rotate-90 transition-transform duration-500">
          C
        </div>
        <div className="absolute inset-0 bg-orange-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
      </div>

      <div className="flex flex-col gap-8 flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "relative p-4 transition-all duration-300 group",
              activeTab === item.id ? "text-orange-500" : "text-zinc-600 hover:text-zinc-300"
            )}
            title={item.label}
          >
            <item.icon size={24} strokeWidth={activeTab === item.id ? 2.5 : 2} />
            {activeTab === item.id && (
              <motion.div
                layoutId="nav-active"
                className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
              />
            )}
            <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 border border-zinc-800 text-[10px] uppercase tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {item.label}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-6 text-zinc-700">
        <button className="p-4 hover:text-zinc-400 transition-colors">
          <Settings size={20} />
        </button>
        <button className="p-4 hover:text-rose-500 transition-colors">
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}
