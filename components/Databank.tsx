'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DbRecord } from '@/lib/types';
import { Download, Trash2, Edit2, Check, X, RefreshCw, Search, Filter } from 'lucide-react';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Databank() {
  const [records, setRecords] = useState<DbRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cortex_entries')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data && !error) {
        setRecords(data as DbRecord[]);
      }
    } catch (err) {
      console.error('Error loading databank:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteRecord = async (id: string) => {
    if (!confirm('Excluir este registro permanentemente?')) return;
    await supabase.from('cortex_entries').delete().eq('id', id);
    setRecords(records.filter(r => r.id !== id));
  };

  const startEdit = (r: DbRecord) => {
    setEditingId(r.id);
    setEditJson(JSON.stringify(r.parsed_output, null, 2));
  };

  const saveEdit = async (id: string) => {
    try {
      const parsed = JSON.parse(editJson);
      await supabase.from('cortex_entries').update({ parsed_output: parsed }).eq('id', id);
      setRecords(records.map(r => r.id === id ? { ...r, parsed_output: parsed } : r));
      setEditingId(null);
    } catch(e) {
      alert("Erro de sintaxe no JSON. Verifique a formatação.");
    }
  };

  const exportCSV = () => {
    const rows: any[] = [];
    records.forEach(r => {
      rows.push({
        id: r.id,
        data: new Date(r.created_at).toISOString(),
        tipo: r.tipo_registro,
        input: r.raw_input,
        output_json: JSON.stringify(r.parsed_output)
      });
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cortex_master_log_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = records.filter(r => 
    r.raw_input.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.tipo_registro.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'financial_entry': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'idea_entry': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'task_entry': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'focus_entry': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'habit_entry': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'error': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full p-6 md:p-10 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Registro <span className="text-orange-500">Mestre</span></h2>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-2">Banco de dados bruto e histórico operacional</p>
        </div>
        
        <div className="flex gap-3">
          <button onClick={loadData} className="glass p-3 hover:text-orange-500 transition-colors border border-zinc-800">
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <button onClick={exportCSV} className="glass flex items-center gap-3 px-6 py-3 hover:text-orange-500 font-bold uppercase text-[10px] tracking-widest border border-zinc-800 transition-colors">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="glass p-4 border border-zinc-800 flex flex-col md:flex-row gap-4 items-center">
         <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
            <input 
              type="text"
              placeholder="PESQUISAR NOS REGISTROS..."
              className="w-full bg-[#0d0d0d] border border-zinc-800 py-3 pl-12 pr-4 text-xs font-bold uppercase tracking-tight focus:outline-none focus:border-orange-500 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <button className="glass px-6 py-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500">
           <Filter size={14} /> Filtros Avançados
         </button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="text-zinc-600 animate-pulse font-mono text-sm uppercase tracking-[0.3em]">Acessando Databank...</div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-20 text-center glass border border-dashed border-zinc-800">
          <div className="text-zinc-700 font-black text-xl uppercase tracking-widest">Nenhum Registro Sincronizado</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {filteredRecords.map((r, idx) => (
              <motion.div 
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card border border-zinc-800/50 hover:border-zinc-700 transition-all overflow-hidden"
              >
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-800">
                  {/* Info Section */}
                  <div className="w-full md:w-1/3 p-6 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                       <span className={cn(
                         "text-[9px] font-black uppercase px-2 py-1 border tracking-[0.1em]",
                         getBadgeColor(r.tipo_registro)
                       )}>
                         {r.tipo_registro}
                       </span>
                       <span className="text-[9px] font-mono text-zinc-600 uppercase">
                         {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString()}
                       </span>
                    </div>
                    
                    <div className="text-sm font-bold text-zinc-300 uppercase italic leading-relaxed">
                      &ldquo;{r.raw_input}&rdquo;
                    </div>
                  </div>

                  {/* JSON/Edit Section */}
                  <div className="w-full md:w-2/3 bg-black/40 relative group">
                    {editingId === r.id ? (
                      <div className="p-4 flex flex-col gap-4">
                        <textarea 
                          className="w-full bg-[#050505] font-mono text-xs text-orange-500/80 p-4 border border-zinc-800 focus:border-orange-500 outline-none h-60 resize-none shadow-inner"
                          value={editJson}
                          onChange={(e) => setEditJson(e.target.value)}
                        />
                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="px-4 py-2 border border-zinc-800 hover:bg-zinc-900 transition-colors text-[10px] font-bold uppercase tracking-widest"
                          >
                            Cancelar
                          </button>
                          <button 
                            onClick={() => saveEdit(r.id)} 
                            className="px-6 py-2 bg-orange-500 text-black font-black uppercase text-[10px] tracking-widest hover:bg-orange-400 transition-colors shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                          >
                            Salvar Alterações
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="p-6 max-h-60 overflow-y-auto font-mono text-[11px] text-zinc-500 scrollbar-thin">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(r.parsed_output, null, 2)}
                          </pre>
                        </div>
                        
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-[-10px] group-hover:translate-y-0">
                           <button 
                            onClick={() => startEdit(r)} 
                            className="p-2 bg-zinc-900 border border-zinc-800 hover:text-orange-500 transition-colors"
                            title="Editar JSON"
                           >
                             <Edit2 size={14} />
                           </button>
                           <button 
                            onClick={() => deleteRecord(r.id)} 
                            className="p-2 bg-zinc-900 border border-zinc-800 hover:text-rose-500 transition-colors"
                            title="Deletar"
                           >
                             <Trash2 size={14} />
                           </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
