export type Id = string | number;

export interface Profile {
  nome: string;
  foto?: string;
  nivel?: number;
  xp?: number;
}

export interface Clinic {
  id: string;
  nome: string;
  diariaPadrao: number;
  cor?: string;
}

export interface FixedExpense {
  id?: Id;
  descricao: string;
  valor: number;
  vencimento?: number | string;
  compartilhado?: boolean;
  pago?: boolean;
}

export interface VariableExpense {
  id: Id;
  descricao: string;
  valor: number;
  data?: string;
  categoriaId?: string;
}

export interface Income {
  id: Id;
  descricao: string;
  valor: number;
  data?: string;
}

export interface WorkEntry {
  clinicaId: string;
  valor: number;
  comissao?: number;
}

export interface MonthData {
  gastosFixos: FixedExpense[];
  gastosVariaveis: VariableExpense[];
  outrasReceitas: Income[];
  diarias: {
    modo: 'automatico' | 'manual';
    diasPrevistos: Record<string, number>;
    diasTrabalhados: Record<string, WorkEntry[]>;
    manual: Record<string, { valorReal?: number; diasReais?: number }>;
  };
  notas?: string;
}

export interface CreditCard {
  id: Id;
  nome: string;
  limite?: number | null;
  fechamento?: number | null;
  vencimento?: number | null;
  cor?: string;
  limiteTotal?: number;
  creditLimit?: number;
  diaFechamento?: number;
  closingDay?: number;
  diaVencimento?: number;
  dueDay?: number;
}

export interface CardPurchase {
  id: Id;
  cartaoId: Id;
  descricao: string;
  data: string;
  valorTotal: number;
  parcelas: number;
  valorParcela: number;
  mesInicio: string;
}

export interface Goal {
  id: Id;
  nome: string;
  valorAlvo?: number;
  meta?: number;
  valorAtual?: number;
  atual?: number;
  cor?: string;
  historico?: Array<{ data?: string; valor: number }>;
}

export interface FinanceData {
  year: number;
  perfil: Profile;
  clinicas: Clinic[];
  categoriasFixas: Array<{ id: string; nome: string; compartilhado?: boolean }>;
  categoriasVariaveis: Array<{ id: string; nome: string; orcamento?: number }>;
  cartoes: CreditCard[];
  comprasCartao: CardPurchase[];
  nvidiaApiKey?: string;
  nvidiaModel?: string;
  reserva: {
    movimentacoes: Array<{ id?: Id; tipo: 'deposito' | 'saque'; valor: number; data?: string }>;
    obs?: string;
  };
  metas: Goal[];
  meses: Record<string, MonthData>;
}

export type TabKey = 'home' | 'wallet' | 'goals' | 'settings';
export type QuickActionType = 'expense' | 'income' | 'work' | 'card';

