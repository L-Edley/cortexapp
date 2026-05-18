'use client';

import { useState, useEffect } from 'react';
import CortexApp from '@/components/CortexApp';
import Databank from '@/components/Databank';
import CommandCenter from '@/components/CommandCenter';
import DashboardView from '@/components/dashboard/DashboardView';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import {
  LayoutDashboard,
  Zap,
  Database,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'terminal', icon: Zap, label: 'Captura Inteligente' },
  { id: 'databank', icon: Database, label: 'Registro Mestre' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const hasData = localStorage.getItem('cortex_has_data');
    if (hasData) {
      setShowWelcome(false);
    }
  }, []);

  const handleFirstRegister = () => {
    setShowWelcome(false);
    localStorage.setItem('cortex_has_data', 'true');
    setActiveTab('terminal');
  };

  const handleTabChange = (id: string) => {
    setShowWelcome(false);
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
            key={showWelcome ? 'welcome' : activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {showWelcome ? (
              <DashboardView onNavigate={handleTabChange} />
            ) : (
              <>
                {activeTab === 'dashboard' && <CommandCenter />}
                {activeTab === 'terminal' && <CortexApp />}
                {activeTab === 'databank' && <Databank />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileNav items={navItems} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
