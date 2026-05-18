'use client';

import { useRouter } from 'next/navigation';
import DashboardView from '@/components/DashboardView';

export default function DashboardClient() {
  const router = useRouter();

  const handleNavigate = (tab: string) => {
    if (tab === 'terminal') router.push('/');
    else if (tab === 'databank') router.push('/');
    else router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden font-sans selection:bg-orange-500/30">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full pointer-events-none fixed" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[100px] rounded-full pointer-events-none fixed" />
      <main className="relative">
        <DashboardView onNavigate={handleNavigate} />
      </main>
    </div>
  );
}
