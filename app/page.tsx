'use client';

import { useState } from 'react';
import CommandCenter from '@/components/CommandCenter';
import TasksView from '@/components/TasksView';
import IdeasView from '@/components/IdeasView';
import FinancesView from '@/components/FinancesView';
import DailyReview from '@/components/DailyReview';
import SettingsView from '@/components/SettingsView';
import DashboardView from '@/components/dashboard/DashboardView';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import { LayoutDashboard, Zap, ListTodo, Lightbulb, Wallet, FileText, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'terminal', icon: Zap, label: 'Command Center' },
  { id: 'tarefas', icon: ListTodo, label: 'Tarefas' },
  { id: 'ideias', icon: Lightbulb, label: 'Ideias' },
  { id: 'financas', icon: Wallet, label: 'Finanças' },
  { id: 'revisao', icon: FileText, label: 'Revisão Diária' },
  { id: 'config', icon: Settings, label: 'Configurações' },
];

const views: Record<string, React.ReactNode> = {
  dashboard: null,
  terminal: <CommandCenter />,
  tarefas: <TasksView />,
  ideias: <IdeasView />,
  financas: <FinancesView />,
  revisao: <DailyReview />,
  config: <SettingsView />,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleTabChange = (id: string) => {
    setActiveTab(id);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans selection:bg-orange-500/30">
      <Sidebar items={navItems} activeTab={activeTab} onTabChange={handleTabChange} />
      <main className="flex-1 overflow-y-auto w-full h-full relative scroll-smooth bg-gradient-to-br from-[#050505] to-[#0a0a0a]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[100px] rounded-full -z-10 pointer-events-none" />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {activeTab === 'dashboard' ? (
              <DashboardView onNavigate={handleTabChange} />
            ) : (
              views[activeTab]
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <MobileNav items={navItems} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
