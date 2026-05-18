'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DbRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function FinancialDashboard() {
  const [records, setRecords] = useState<DbRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('cortex_entries').select('*').eq('tipo_registro', 'financial_entry');
      if (data) {
        setRecords(data as DbRecord[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-6 text-sm font-bold uppercase text-zinc-500">Calculando...</div>;

  let totalReceitas = 0;
  let totalDespesas = 0;
  let impostoProjetado = 0;

  records.forEach(r => {
    if (r.parsed_output.transacoes) {
      r.parsed_output.transacoes.forEach(t => {
         if (t.tipo === 'receita') {
           totalReceitas += t.valor;
           if (t.reserva_imposto > 0) impostoProjetado += t.reserva_imposto;
         } else {
           totalDespesas += t.valor;
         }
      });
    }
  });

  const saldo = totalReceitas - totalDespesas - impostoProjetado;

  return (
    <div className="max-w-6xl mx-auto w-full p-4 md:p-6 space-y-8">
      <h2 className="text-2xl font-black uppercase text-zinc-100 mb-6">Dashboard Direcional</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col">
           <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Entradas Brutas</span>
           <span className="text-3xl font-black text-emerald-500 tracking-tighter">
             {totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
           </span>
         </div>
         <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col">
           <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Saídas Registradas</span>
           <span className="text-3xl font-black text-rose-500 tracking-tighter">
             {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
           </span>
         </div>
         <div className="bg-zinc-900 border border-zinc-800 border-b-4 border-b-yellow-500 p-6 flex flex-col">
           <span className="text-[10px] font-mono text-yellow-500 uppercase tracking-widest mb-2 font-bold">Imposto Resguardado</span>
           <span className="text-3xl font-black text-yellow-500 tracking-tighter">
             {impostoProjetado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
           </span>
         </div>
         <div className="bg-orange-500 text-zinc-950 p-6 flex flex-col">
           <span className="text-[10px] font-mono uppercase tracking-widest mb-2 font-bold opacity-80">Caixa Líquido</span>
           <span className="text-3xl font-black tracking-tighter">
             {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
           </span>
         </div>
      </div>
      
      {/* Some visual graph could be added here, using basic divs for now */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 relative">
         <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-6">Fluxo Recente</h3>
         <div className="space-y-3">
           {records.slice(0, 5).map(r => (
             r.parsed_output.transacoes?.map((t, i) => (
                <div key={r.id + i} className="flex justify-between items-center border-b border-zinc-800 pb-3">
                  <div>
                    <div className="font-bold uppercase tracking-tight text-zinc-200">{t.descricao}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className={cn("font-mono font-bold", t.tipo === 'receita' ? 'text-emerald-500' : 'text-rose-500')}>
                     {t.tipo === 'receita' ? '+' : '-'}{t.valor.toLocaleString('pt-BR', { style: 'currency', currency: t.moeda || 'BRL' })}
                  </div>
                </div>
             ))
           ))}
         </div>
      </div>
    </div>
  );
}
