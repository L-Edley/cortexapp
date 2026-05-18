'use client';

import { motion } from 'motion/react';
import {
  Cpu,
  Zap,
  TrendingUp,
  Target,
  Lightbulb,
  BookOpen,
  ArrowRight,
  Database,
  Sparkles,
} from 'lucide-react';

const modules = [
  {
    icon: Zap,
    label: 'Captura Inteligente',
    desc: 'Despeje pensamentos, tarefas ou finanças. O Cortex estrutura o caos.',
    color: 'text-orange-500',
    border: 'border-orange-500/20',
    bg: 'bg-orange-500/5',
    tab: 'terminal',
  },
  {
    icon: Database,
    label: 'Registro Mestre',
    desc: 'Histórico completo de todas as entradas processadas pelo sistema.',
    color: 'text-blue-500',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    tab: 'databank',
  },
  {
    icon: TrendingUp,
    label: 'Financeiro',
    desc: 'Acompanhe receitas, despesas e projeções em tempo real.',
    color: 'text-emerald-500',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    tab: 'dashboard',
  },
  {
    icon: Target,
    label: 'Metas & Hábitos',
    desc: 'Monitore sua evolução diária e maintaha o foco no que importa.',
    color: 'text-purple-500',
    border: 'border-purple-500/20',
    bg: 'bg-purple-500/5',
    tab: 'dashboard',
  },
];

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
}

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-12 pb-24">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Cpu className="text-orange-500" size={20} />
              </div>
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">
                Sistema Operacional
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
              Cortex
              <span className="block text-orange-500 mt-2">Operacional</span>
            </h1>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Pronto para operar &mdash; {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="glass px-6 py-4 border border-zinc-800">
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Status</div>
              <div className="text-sm font-bold text-emerald-500 uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Online
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Empty State - Welcome */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card p-10 md:p-14 border border-zinc-800/50 relative overflow-hidden text-center md:text-left"
      >
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
          <Sparkles size={200} />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">
            Novo Espaço de Trabalho
          </div>
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-[0.95] mb-4">
            Bem-vindo ao seu
            <span className="text-orange-500"> Centro de Comando</span>
          </h2>
          <p className="text-zinc-400 font-mono text-xs uppercase tracking-wider leading-relaxed max-w-xl">
            Este é o painel central do Cortex. Aqui você terá visão completa das suas
            operações, métricas financeiras, hábitos e plano de ataque diário.
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <button
              onClick={() => onNavigate?.('terminal')}
              className="group flex items-center gap-3 px-6 py-4 bg-orange-500 text-black font-black uppercase text-xs tracking-widest hover:bg-orange-400 transition-all shadow-[0_0_30px_rgba(249,115,22,0.15)]"
            >
              <Zap size={16} />
              Primeiro Registro
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="flex items-center gap-3 px-6 py-4 border border-zinc-800 text-zinc-400 font-bold uppercase text-xs tracking-widest hover:border-zinc-600 hover:text-zinc-200 transition-all">
              <BookOpen size={16} />
              Explorar Tutorial
            </button>
          </div>
        </div>
      </motion.section>

      {/* Module Cards */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em]">
            Módulos Disponíveis
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-zinc-800 to-transparent" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((mod, i) => (
            <motion.button
              key={mod.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08 }}
              onClick={() => onNavigate?.(mod.tab)}
              className={`group glass-card p-6 border ${mod.border} ${mod.bg} text-left hover:scale-[1.02] transition-all duration-300`}
            >
              <div className={`w-12 h-12 ${mod.bg} border ${mod.border} flex items-center justify-center mb-4`}>
                <mod.icon className={mod.color} size={24} />
              </div>
              <h3 className={`text-lg font-black uppercase tracking-tight mb-2 ${mod.color}`}>
                {mod.label}
              </h3>
              <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide leading-relaxed">
                {mod.desc}
              </p>
              <div className="flex items-center gap-2 mt-4 text-[10px] font-bold uppercase text-zinc-600 group-hover:text-zinc-400 transition-colors">
                Acessar <ArrowRight size={12} />
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      {/* Empty Metrics Preview */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="glass border border-dashed border-zinc-800 p-6 text-center">
          <div className="text-3xl font-black text-zinc-800 mb-2">---</div>
          <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
            Receitas do Mês
          </div>
        </div>
        <div className="glass border border-dashed border-zinc-800 p-6 text-center">
          <div className="text-3xl font-black text-zinc-800 mb-2">---</div>
          <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
            Tarefas Completas
          </div>
        </div>
        <div className="glass border border-dashed border-zinc-800 p-6 text-center">
          <div className="text-3xl font-black text-zinc-800 mb-2">---</div>
          <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
            Dias de Streak
          </div>
        </div>
      </motion.section>
    </div>
  );
}
