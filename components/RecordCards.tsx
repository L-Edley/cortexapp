import { OutputFormat, Task, Habit, StudySession, Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { 
  CheckCircle2, 
  Circle, 
  AlertTriangle, 
  ArrowRight, 
  Droplets, 
  BookOpen, 
  TrendingUp, 
  TrendingDown,
  Info,
  Clock,
  Calendar
} from 'lucide-react';

export function FinanceCard({ data }: { data: OutputFormat }) {
  if (!data.transacoes) return null;
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-emerald-500" />
        <h2 className="text-xs font-mono text-emerald-500 uppercase tracking-[0.2em] font-black">Financial_Entry</h2>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {data.transacoes.map((t, i) => (
          <div key={i} className="glass p-6 border-l-2 border-l-emerald-500/50 group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
              {t.tipo === 'receita' ? <TrendingUp size={80} /> : <TrendingDown size={80} />}
            </div>
            
            <div className="flex justify-between items-start mb-4">
              <div className={cn(
                "text-3xl font-black tracking-tighter",
                t.tipo === 'receita' ? "text-emerald-500" : "text-rose-500"
              )}>
                {t.tipo === 'receita' ? '+' : '-'}{t.valor.toLocaleString('pt-BR', { style: 'currency', currency: t.moeda || 'BRL' })}
              </div>
              <div className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-900 px-2 py-1 tracking-widest border border-zinc-800">
                {t.status}
              </div>
            </div>
            
            <div className="text-lg font-bold uppercase tracking-tight text-zinc-100 mb-4">{t.descricao}</div>
            
            <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-800/50">
              <span className="text-[9px] bg-zinc-900 px-2 py-1 text-zinc-400 font-mono uppercase border border-zinc-800">{t.categoria}</span>
              {t.is_essential && <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-1 font-mono uppercase border border-blue-500/20">Essencial</span>}
              {t.reserva_imposto > 0 && <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-2 py-1 font-mono uppercase border border-yellow-500/20">Imposto: {t.reserva_imposto}</span>}
            </div>
          </div>
        ))}
      </div>
      {data.assistant_message && (
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <Info size={12} /> {data.assistant_message}
        </div>
      )}
    </div>
  );
}

export function IdeaCard({ data }: { data: OutputFormat }) {
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-yellow-500" />
        <h2 className="text-xs font-mono text-yellow-500 uppercase tracking-[0.2em] font-black">Idea_Quarantine</h2>
      </div>
      <div className="glass-card p-8 border-l-2 border-l-yellow-500 relative overflow-hidden">
        <div className="absolute -top-1 -right-1 bg-yellow-500 text-black px-4 py-1 text-[10px] font-black uppercase tracking-widest -rotate-2">BLOQUEADA</div>
        
        <h3 className="text-2xl font-black uppercase leading-tight text-white mb-4">{data.ideia}</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-900/50 p-3 border border-zinc-800">
            <div className="text-[9px] text-zinc-500 uppercase mb-1">Risco Dispersão</div>
            <div className={cn("text-xs font-bold uppercase", data.risco_dispersao === 'alto' ? 'text-rose-500' : 'text-zinc-300')}>{data.risco_dispersao}</div>
          </div>
          <div className="bg-zinc-900/50 p-3 border border-zinc-800">
            <div className="text-[9px] text-zinc-500 uppercase mb-1">Potencial ROI</div>
            <div className="text-xs font-bold uppercase text-zinc-300">{data.potencial_roi}</div>
          </div>
        </div>

        {data.motivo_quarentena && (
          <div className="p-4 bg-zinc-950 border border-zinc-900 text-xs text-zinc-500 italic uppercase leading-relaxed mb-6">
            &ldquo;{data.motivo_quarentena}&rdquo;
          </div>
        )}

        {(data.proxima_acao || data.projeto_ativo_recomendado) && (
          <div className="space-y-3">
            {data.proxima_acao && (
              <div className="flex items-center gap-3 text-orange-500 font-bold uppercase text-sm">
                <ArrowRight size={16} /> Microação: {data.proxima_acao}
              </div>
            )}
            {data.projeto_ativo_recomendado && (
              <div className="flex items-center gap-3 text-zinc-400 font-bold uppercase text-xs">
                <AlertTriangle size={14} className="text-zinc-600" /> Focar em: {data.projeto_ativo_recomendado}
              </div>
            )}
          </div>
        )}
      </div>
      {data.assistant_message && (
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <Info size={12} /> {data.assistant_message}
        </div>
      )}
    </div>
  );
}

export function TaskCard({ data }: { data: OutputFormat }) {
  if (!data.tasks) return null;
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-blue-500" />
        <h2 className="text-xs font-mono text-blue-500 uppercase tracking-[0.2em] font-black">Tasks_Identified</h2>
      </div>
      <div className="space-y-3">
        {data.tasks.map((task, i) => (
          <div key={i} className="glass p-5 border-l-2 border-l-blue-500/50 flex items-center gap-4 group">
            <Circle className="text-zinc-700 group-hover:text-blue-500 transition-colors" size={20} />
            <div className="flex-1">
              <div className="text-sm font-bold uppercase text-zinc-200">{task.titulo}</div>
              <div className="flex gap-3 mt-2">
                <span className="text-[9px] text-zinc-500 uppercase font-mono">Energia: {task.energia_necessaria}</span>
                <span className="text-[9px] text-zinc-500 uppercase font-mono">Prioridade: {task.prioridade}</span>
              </div>
            </div>
            {task.primeiro_passo && (
              <div className="hidden md:block text-[9px] bg-blue-500/10 text-blue-400 px-2 py-1 uppercase font-bold border border-blue-500/20">
                Start: {task.primeiro_passo}
              </div>
            )}
          </div>
        ))}
      </div>
      {data.assistant_message && (
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <Info size={12} /> {data.assistant_message}
        </div>
      )}
    </div>
  );
}

export function HabitCard({ data }: { data: OutputFormat }) {
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-purple-500" />
        <h2 className="text-xs font-mono text-purple-500 uppercase tracking-[0.2em] font-black">Habit_Sync</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.habitos?.map((h, i) => (
          <div key={i} className="glass p-4 border-l-2 border-l-purple-500/50 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold uppercase text-zinc-200">{h.nome}</div>
              <div className="text-[9px] text-zinc-500 uppercase font-mono mt-1">{h.categoria}</div>
            </div>
            <div className="w-8 h-8 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-500">
              <CheckCircle2 size={16} />
            </div>
          </div>
        ))}
        {data.agua_ml && (
          <div className="glass p-4 border-l-2 border-l-blue-500 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold uppercase text-zinc-200">Hidratação</div>
              <div className="text-[9px] text-zinc-500 uppercase font-mono mt-1">Meta diária: 2500ml</div>
            </div>
            <div className="flex items-center gap-2 text-blue-500 font-black">
              <Droplets size={16} /> {data.agua_ml}ml
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FocusCard({ data }: { data: OutputFormat }) {
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-orange-500" />
        <h2 className="text-xs font-mono text-orange-500 uppercase tracking-[0.2em] font-black">Focus_Mode_Engaged</h2>
      </div>
      <div className="glass-card p-8 border-l-2 border-l-orange-500">
        <div className="space-y-6 mb-8">
          {data.top_3_diario?.map((task, i) => (
            <div key={i} className="flex items-center gap-6 group">
              <span className="text-5xl font-black text-zinc-800 group-hover:text-orange-500 transition-colors">0{i + 1}</span>
              <span className="text-xl font-bold uppercase tracking-tight text-white">{task}</span>
            </div>
          ))}
        </div>
        
        {data.bloco_de_foco && (
          <div className="p-4 bg-orange-500 text-black font-black uppercase tracking-tighter text-lg flex items-center justify-between">
            <span>Sessão: {data.bloco_de_foco}</span>
            <ArrowRight size={20} />
          </div>
        )}
        
        {data.primeiro_passo && (
          <div className="mt-6 flex items-center gap-3 text-xs font-mono text-zinc-500 uppercase">
            <span className="w-2 h-2 bg-orange-500 animate-pulse" />
            Primeiro passo imediato: <span className="text-zinc-200 font-bold">{data.primeiro_passo}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StudyCard({ data }: { data: OutputFormat }) {
  if (!data.estudos) return null;
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-purple-500" />
        <h2 className="text-xs font-mono text-purple-500 uppercase tracking-[0.2em] font-black">Study_Module</h2>
      </div>
      <div className="space-y-4">
        {data.estudos.map((study, i) => (
          <div key={i} className="glass p-6 border-l-2 border-l-purple-500/50 group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
              <BookOpen size={60} />
            </div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[10px] font-mono text-purple-400 uppercase tracking-widest mb-1">{study.materia}</div>
                <div className="text-lg font-bold uppercase tracking-tight text-white">{study.tema}</div>
              </div>
              <div className="text-[10px] font-bold text-zinc-500 bg-zinc-900 px-2 py-1 uppercase tracking-widest border border-zinc-800 flex items-center gap-2">
                <Clock size={12} /> {study.tempo_estimado_minutos} MIN
              </div>
            </div>
            {study.data_revisao && (
               <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase">
                 <Calendar size={12} /> Revisão agendada: {study.data_revisao}
               </div>
            )}
          </div>
        ))}
      </div>
      {data.assistant_message && (
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <Info size={12} /> {data.assistant_message}
        </div>
      )}
    </div>
  );
}

export function ErrorCard({ data }: { data: OutputFormat }) {
  return (
    <div className="flex flex-col mb-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-6 bg-rose-500" />
        <h2 className="text-xs font-mono text-rose-500 uppercase tracking-[0.2em] font-black">System_Bypass_Error</h2>
      </div>
      <div className="glass border border-rose-500/30 p-6 text-rose-400 text-sm font-mono uppercase tracking-tight leading-relaxed">
        {data.error || 'Falha crítica no processamento cognitivo. Tente reformular a entrada.'}
      </div>
    </div>
  );
}
