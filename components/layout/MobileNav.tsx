'use client';

import { cn } from '@/lib/utils';
import type { NavItem } from './Sidebar';

interface MobileNavProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export default function MobileNav({ items, activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#080808] border-t border-zinc-900 flex items-center justify-around px-4 z-40">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={cn(
            "p-3 transition-all",
            activeTab === item.id ? "text-orange-500" : "text-zinc-600"
          )}
        >
          <item.icon size={24} />
        </button>
      ))}
    </nav>
  );
}
