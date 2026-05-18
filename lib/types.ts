export interface Transaction {
  valor: number;
  moeda?: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  status: 'pago' | 'pendente' | 'agendado';
  reserva_imposto: number;
  data_referencia: string | null;
  confianca: number;
  precisa_revisao: boolean;
  is_essential?: boolean;
}

export interface Task {
  titulo: string;
  prioridade: 'baixa' | 'media' | 'alta';
  energia_necessaria: 'baixa' | 'media' | 'alta';
  prazo?: string;
  projeto?: string;
  primeiro_passo?: string;
}

export interface Habit {
  nome: string;
  categoria: 'saude' | 'estudo' | 'financeiro' | 'organizacao' | 'outro';
  meta_diaria?: string;
}

export interface StudySession {
  materia: string;
  tema: string;
  tempo_estimado_minutos: number;
  data_revisao?: string;
}

export interface OutputFormat {
  tipo_registro: 
    | 'financial_entry' 
    | 'idea_entry' 
    | 'focus_entry' 
    | 'task_entry' 
    | 'habit_entry' 
    | 'study_entry'
    | 'health_entry'
    | 'goal_entry'
    | 'reminder_entry'
    | 'project_entry'
    | 'daily_plan_entry'
    | 'reflection_entry'
    | 'error';
  
  // financial
  transacoes?: Transaction[];
  alertas_revisao?: string[];
  
  // idea
  ideia?: string;
  complexidade?: 'baixa' | 'media' | 'alta';
  potencial_roi?: string;
  risco_dispersao?: 'baixo' | 'medio' | 'alto';
  status?: string;
  motivo_quarentena?: string;
  proxima_acao?: string;
  projeto_ativo_recomendado?: string;
  
  // focus & tasks
  top_3_diario?: string[];
  bloco_de_foco?: string;
  primeiro_passo?: string;
  risco_de_dispersao?: string;
  tasks?: Task[];

  // habits
  habitos?: Habit[];
  agua_ml?: number;

  // studies
  estudos?: StudySession[];

  // common
  assistant_message?: string;

  // fallback/error
  error?: string;
}

export interface DbRecord {
  id: string;
  tipo_registro: string;
  raw_input: string;
  parsed_output: OutputFormat;
  created_at: string;
}
