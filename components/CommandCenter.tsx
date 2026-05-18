'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DbRecord, Task, Habit, Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Target, 
  Droplets, 
  Flame, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Lightbulb,
  BookOpen,
  Calendar
} from 'lucide-react';

export default function CommandCenter() {
  const [records, setRecords] = useState<DbRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('cortex_entries')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (data) {
          setRecords(data as DbRecord[]);
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-orange-500 animate-pulse font-mono uppercase tracking-[0.2em] text-sm">
          Sincronizando Córtex...
        </div>
      </div>
    );
  }

  // Process data for the dashboard
  const top3: string[] = [];
  const activeTasks: Task[] = [];
  const recentIdeas: any[] = [];
  const habits: Habit[] = [];
  let waterMl = 0;
  let totalReceitas = 0;
  let totalDespesas = 0;

  records.forEach(r => {
    const out = r.parsed_output;
    if (out.top_3_diario) top3.push(...out.top_3_diario);
    if (out.tasks) activeTasks.push(...out.tasks);
    if (out.ideia) recentIdeas.push(out);
    if (out.habitos) habits.push(...out.habitos);
    if (out.agua_ml) waterMl += out.agua_ml;
    if (out.transacoes) {
      out.transacoes.forEach(t => {
        if (t.tipo === 'receita') totalReceitas += t.valor;
        else totalDespesas += t.valor;
      });
    }
  });

  // Mock some data if empty for the "WOW" effect on first load
  const displayTop3 = top3.length > 0 ? top3.slice(0, 3) : [
    "Finalizar protótipo do Córtex",
    "Estudar Documentação Gemini 2.0",
    "Pagar faturas de serviço Cloud"
  ];

  const displayWater = waterMl > 0 ? waterMl : 1200;
  const waterPercentage = Math.min((displayWater / 2500) * 100, 100);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 pb-20">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]"
          >
            Centro de <span className="text-orange-500">Comando</span>
          </motion.h1>
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Bio-Sincronização Ativa • {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex gap-4">
          <div className="glass px-6 py-3 border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">XP Operacional</div>
            <div className="text-xl font-bold font-mono">2,450 <span className="text-orange-500 text-xs">LVL 12</span></div>
          </div>
          <div className="glass px-6 py-3 border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Streak</div>
            <div className="text-xl font-bold font-mono">14 <span className="text-orange-500 text-xs">DIAS</span></div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* TOP 3 DIÁRIO - Priority #1 for ADHD */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-8 glass-card p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Zap size={120} />
          </div>
          
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Target size={20} />
            </div>
            <h2 className="text-xl font-bold uppercase tracking-tight">Plano de Ataque (Top 3)</h2>
          </div>

          <div className="space-y-4">
            {displayTop3.map((task, i) => (
              <motion.div 
                key={i}
                whileHover={{ x: 10 }}
                className="group flex items-center gap-6 p-4 bg-zinc-900/50 border border-zinc-800/50 hover:border-orange-500/50 transition-all cursor-pointer"
              >
                <span className="text-3xl font-black text-zinc-800 group-hover:text-orange-500 transition-colors">0{i+1}</span>
                <span className="text-lg font-bold uppercase tracking-tight text-zinc-300 group-hover:text-zinc-100">{task}</span>
                <CheckCircle2 className="ml-auto text-zinc-800 group-hover:text-emerald-500 transition-colors" size={24} />
              </motion.div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase">
              <Clock size={14} />
              Próxima sessão: 14:00 - Foco Profundo
            </div>
            <button className="text-[10px] font-bold uppercase tracking-widest text-orange-500 hover:text-orange-400">Ver todas as tarefas →</button>
          </div>
        </motion.section>

        {/* METRICS SIDEBAR */}
        <div className="md:col-span-4 space-y-6">
          {/* WATER TRACKER */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-6 border-l-4 border-l-blue-500"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Hidratação</div>
                <div className="text-2xl font-black uppercase">{displayWater}ml <span className="text-xs text-zinc-600">/ 2500</span></div>
              </div>
              <Droplets className="text-blue-500" size={20} />
            </div>
            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${waterPercentage}%` }}
                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              />
            </div>
          </motion.div>

          {/* FINANCE MINI-CARD */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 border-l-4 border-l-emerald-500"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Caixa Operacional</div>
                <div className="text-2xl font-black uppercase text-emerald-500">
                  {(totalReceitas - totalDespesas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
              <TrendingUp className="text-emerald-500" size={20} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 uppercase">
              <span>Saídas: {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              <span className="text-zinc-700">Meta: 85%</span>
            </div>
          </motion.div>

          {/* QUICK STATS */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="glass p-4 border border-zinc-800">
               <Flame className="text-orange-500 mb-2" size={16} />
               <div className="text-xl font-bold">1,240</div>
               <div className="text-[10px] text-zinc-500 uppercase">Kcal Ativas</div>
            </div>
            <div className="glass p-4 border border-zinc-800">
               <Clock className="text-purple-500 mb-2" size={16} />
               <div className="text-xl font-bold">4.2h</div>
               <div className="text-[10px] text-zinc-500 uppercase">Deep Work</div>
            </div>
          </motion.div>
        </div>

        {/* SECOND ROW */}
        
        {/* QUARENTENA DE IDEIAS */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="md:col-span-4 glass-card p-6 border-t border-t-yellow-500/30"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Lightbulb size={18} className="text-yellow-500" />
              <h3 className="text-sm font-bold uppercase tracking-tight">Ideias em Quarentena</h3>
            </div>
            <span className="text-[10px] font-mono bg-yellow-500/10 text-yellow-500 px-2 py-0.5 border border-yellow-500/20">
              {recentIdeas.length > 0 ? recentIdeas.length : 3} BLOQUEADAS
            </span>
          </div>
          
          <div className="space-y-3">
            {(recentIdeas.length > 0 ? recentIdeas : [
              { ideia: "App de receitas veganas com IA", complexidade: "alta" },
              { ideia: "E-commerce de teclados mecânicos", complexidade: "media" },
              { ideia: "Canal de YouTube sobre produtividade", complexidade: "baixa" }
            ]).slice(0, 3).map((idea, i) => (
              <div key={i} className="p-3 bg-zinc-900/30 border border-zinc-800/50 flex flex-col gap-1">
                <span className="text-sm font-bold uppercase text-zinc-300">{idea.ideia}</span>
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-mono text-zinc-600 uppercase">Complexidade: {idea.complexidade}</span>
                   <AlertCircle size={10} className="text-zinc-700" />
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 border border-zinc-800 transition-colors">
            Liberar Fluxo Criativo →
          </button>
        </motion.section>

        {/* ESTUDOS & FOCO */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="md:col-span-4 glass-card p-6 border-t border-t-purple-500/30"
        >
          <div className="flex items-center gap-2 mb-6">
            <BookOpen size={18} className="text-purple-500" />
            <h3 className="text-sm font-bold uppercase tracking-tight">Modo Estudo</h3>
          </div>
          
          <div className="space-y-4">
             <div className="flex gap-4">
                <div className="w-12 h-12 glass flex items-center justify-center shrink-0 border-purple-500/20">
                   <span className="text-lg font-black text-purple-500">JS</span>
                </div>
                <div>
                   <div className="text-sm font-bold uppercase">React Server Components</div>
                   <div className="text-[10px] text-zinc-500 uppercase mt-1">40 min restantes • 2 revisões</div>
                </div>
             </div>
             <div className="flex gap-4 opacity-50">
                <div className="w-12 h-12 glass flex items-center justify-center shrink-0">
                   <span className="text-lg font-black text-zinc-500">AI</span>
                </div>
                <div>
                   <div className="text-sm font-bold uppercase">Prompt Engineering</div>
                   <div className="text-[10px] text-zinc-500 uppercase mt-1">Aguardando • Amanhã</div>
                </div>
             </div>
          </div>
          
          <button className="w-full mt-6 py-3 bg-purple-500/10 text-purple-500 border border-purple-500/20 text-[10px] font-bold uppercase tracking-widest hover:bg-purple-500/20 transition-all">
            Iniciar Sessão Pomodoro
          </button>
        </motion.section>

        {/* CALENDÁRIO / PRÓXIMOS */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="md:col-span-4 glass-card p-6 border-t border-t-orange-500/30"
        >
          <div className="flex items-center gap-2 mb-6">
            <Calendar size={18} className="text-orange-500" />
            <h3 className="text-sm font-bold uppercase tracking-tight">Agenda Operacional</h3>
          </div>
          
          <div className="space-y-4 font-mono">
             <div className="flex gap-4 text-xs">
                <span className="text-orange-500 font-bold">14:00</span>
                <span className="text-zinc-400 uppercase">Reunião de Alinhamento</span>
             </div>
             <div className="flex gap-4 text-xs">
                <span className="text-orange-500 font-bold">16:30</span>
                <span className="text-zinc-400 uppercase">Treino: Musculação A</span>
             </div>
             <div className="flex gap-4 text-xs">
                <span className="text-orange-500 font-bold">19:00</span>
                <span className="text-zinc-400 uppercase">Revisão de Metas</span>
             </div>
          </div>
          
          <div className="mt-8 p-4 bg-zinc-950 border border-zinc-800">
             <div className="text-[10px] text-zinc-600 uppercase mb-2">Meta da Semana</div>
             <div className="text-xs font-bold uppercase text-zinc-300">Lançar versão Beta do Córtex para 10 usuários</div>
             <div className="mt-3 w-full h-1 bg-zinc-900 rounded-full">
                <div className="w-[65%] h-full bg-orange-500" />
             </div>
          </div>
        </motion.section>

      </div>
    </div>
  );
}
