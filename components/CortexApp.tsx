'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Cpu, Mic, Info, ArrowRight } from 'lucide-react';
import type { OutputFormat } from '@/lib/types';
import { FinanceCard, IdeaCard, FocusCard, ErrorCard, TaskCard, HabitCard, StudyCard } from './RecordCards';
import { motion, AnimatePresence } from 'motion/react';

interface FeedItem {
  id: string;
  type: 'user' | 'system';
  content: string;
  data?: OutputFormat;
}

export default function CortexApp() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    setFeed(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      content: userMessage
    }]);

    setLoading(true);

    try {
      const response = await fetch('/api/cortex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: userMessage }),
      });
      
      const result = await response.json();
      
      const assistantItem: FeedItem = {
        id: (Date.now() + 1).toString(),
        type: 'system',
        content: '',
        data: result
      };

      setFeed(prev => [...prev, assistantItem]);
    } catch (error) {
       console.error("Error submitting prompt", error);
       setFeed(prev => [...prev, {
         id: (Date.now() + 1).toString(),
         type: 'system',
         content: '',
         data: {
            tipo_registro: 'error',
            error: 'Falha crítica na comunicação com o Motor Córtex.'
         }
       }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    { label: "FINANÇAS", text: "Gastei R$ 50 no almoço hoje.", color: "text-emerald-500" },
    { label: "IDEIA", text: "Tive uma ideia de um app para treinos com IA.", color: "text-yellow-500" },
    { label: "FOCO", text: "Estou me sentindo perdido hoje, preciso organizar meu dia.", color: "text-orange-500" },
    { label: "HABITO", text: "Acabei de beber 500ml de água e fiz meu treino.", color: "text-blue-500" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white font-sans overflow-hidden">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-zinc-900 glass z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Cpu className={cn("text-orange-500", loading && "animate-pulse")} size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.3em]">Córtex <span className="text-orange-500">Inteligente</span></h1>
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mt-0.5">Motor: Gemini 2.0 Operacional</div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="hidden md:flex flex-col items-end">
              <div className="text-[9px] font-mono text-zinc-600 uppercase">Status do Sistema</div>
              <div className="text-xs font-bold text-emerald-500 uppercase tracking-tight flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Sincronizado
              </div>
           </div>
        </div>
      </header>

      {/* Main Feed */}
      <main className="flex-1 overflow-y-auto px-6 md:px-20 py-12 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-16 pb-40">
          {feed.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center text-center py-20"
            >
              <div className="w-24 h-24 bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-10 relative">
                 <div className="absolute inset-0 bg-orange-500/10 blur-2xl" />
                 <Cpu className="text-zinc-700" size={40} />
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Aguardando Input Operacional</h2>
              <p className="text-zinc-500 font-mono text-xs max-w-md uppercase tracking-[0.2em] leading-relaxed mb-12">
                Despeje seus pensamentos, finanças ou tarefas. O Córtex organizará o caos automaticamente.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {suggestions.map((s, i) => (
                  <button 
                    key={i}
                    onClick={() => { setInput(s.text); }}
                    className="glass p-6 text-left border border-zinc-800 hover:border-zinc-600 transition-all group relative overflow-hidden"
                  >
                    <div className={cn("text-[10px] font-black uppercase tracking-widest mb-2", s.color)}>{s.label}</div>
                    <div className="text-sm font-bold text-zinc-400 group-hover:text-zinc-100 transition-colors uppercase italic">&ldquo;{s.text}&rdquo;</div>
                    <ArrowRight className="absolute right-6 bottom-6 text-zinc-800 group-hover:text-zinc-500 transition-colors" size={16} />
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <AnimatePresence>
              {feed.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  {item.type === 'user' ? (
                    <div className="flex gap-6 items-start">
                      <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center font-black text-xs text-zinc-500">U</div>
                      <div className="flex-1">
                        <div className="text-[10px] font-mono text-zinc-600 uppercase mb-2 tracking-widest">Input_Usuário</div>
                        <div className="text-xl font-bold uppercase tracking-tight text-zinc-300">
                          {item.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-14">
                      {item.data && (
                        <div className="space-y-4">
                          {item.data.tipo_registro === 'financial_entry' && <FinanceCard data={item.data} />}
                          {item.data.tipo_registro === 'idea_entry' && <IdeaCard data={item.data} />}
                          {item.data.tipo_registro === 'focus_entry' && <FocusCard data={item.data} />}
                          {item.data.tipo_registro === 'task_entry' && <TaskCard data={item.data} />}
                          {item.data.tipo_registro === 'habit_entry' && <HabitCard data={item.data} />}
                          {item.data.tipo_registro === 'study_entry' && <StudyCard data={item.data} />}
                          {item.data.tipo_registro === 'error' && <ErrorCard data={item.data} />}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={feedEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="glass border-t border-zinc-900 p-8 z-30 relative">
        <div className="max-w-4xl mx-auto relative">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute inset-0 bg-orange-500/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
            
            <div className="relative bg-[#0d0d0d] border-2 border-zinc-800 focus-within:border-orange-500/50 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="DIGITE QUALQUER COISA PARA O CÓRTEX PROCESSAR..."
                className="w-full bg-transparent py-6 pl-8 pr-20 text-lg font-bold tracking-tight focus:outline-none resize-none max-h-40 min-h-[80px] text-zinc-100 placeholder:text-zinc-700 uppercase"
                rows={1}
                disabled={loading}
              />
              
              <div className="absolute right-4 bottom-4 flex items-center gap-2">
                <button 
                  type="button" 
                  className="p-3 text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Captura de Voz"
                >
                  <Mic size={20} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="p-4 bg-orange-500 text-black hover:bg-orange-400 disabled:bg-zinc-900 disabled:text-zinc-700 transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </form>
          
          <div className="flex justify-between items-center mt-6">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-zinc-600 tracking-widest">
              <Info size={10} /> Shift + Enter para nova linha
            </div>
            <div className="flex items-center gap-4">
               <div className="text-[9px] font-mono uppercase text-zinc-700 tracking-[0.2em]">Córtex v1.0.4</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
