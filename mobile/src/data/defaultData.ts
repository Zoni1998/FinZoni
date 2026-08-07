import type { FinanceData, MonthData } from '../types';

export const createDefaultMonth = (): MonthData => ({
  gastosFixos: [],
  gastosVariaveis: [],
  outrasReceitas: [],
  diarias: {
    modo: 'automatico',
    diasPrevistos: {},
    diasTrabalhados: {},
    manual: {},
  },
  notas: '',
});

export const createDefaultData = (): FinanceData => ({
  year: new Date().getFullYear(),
  perfil: { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 },
  clinicas: [
    { id: 'advance', nome: 'Advance', diariaPadrao: 170, cor: '#448AFF' },
    { id: 'bm', nome: 'BM Odontologia', diariaPadrao: 150, cor: '#B388FF' },
    { id: 'odontoking', nome: 'Odontoking', diariaPadrao: 140, cor: '#FFD740' },
  ],
  categoriasFixas: [],
  categoriasVariaveis: [
    { id: 'alimentacao', nome: 'AlimentaÃ§Ã£o', orcamento: 500 },
    { id: 'lazer', nome: 'Lazer', orcamento: 300 },
    { id: 'transporte', nome: 'Transporte', orcamento: 200 },
  ],
  cartoes: [],
  comprasCartao: [],
  nvidiaApiKey: '',
  nvidiaModel: 'meta/llama-3.1-8b-instruct',
  reserva: { movimentacoes: [], obs: '' },
  metas: [],
  meses: {},
});

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const migrateFinanceData = (input: unknown): FinanceData => {
  const defaults = createDefaultData();
  const raw = objectOrEmpty(input);
  const data = { ...defaults, ...raw } as FinanceData;

  data.perfil = { ...defaults.perfil, ...objectOrEmpty(raw.perfil) } as FinanceData['perfil'];
  data.clinicas = Array.isArray(raw.clinicas) ? (raw.clinicas as FinanceData['clinicas']) : defaults.clinicas;
  data.categoriasFixas = Array.isArray(raw.categoriasFixas)
    ? (raw.categoriasFixas as FinanceData['categoriasFixas'])
    : defaults.categoriasFixas;
  data.categoriasVariaveis = Array.isArray(raw.categoriasVariaveis)
    ? (raw.categoriasVariaveis as FinanceData['categoriasVariaveis'])
    : defaults.categoriasVariaveis;
  data.cartoes = (Array.isArray(raw.cartoes) ? raw.cartoes : []).map((item) => {
    const card = objectOrEmpty(item) as unknown as FinanceData['cartoes'][number];
    return {
      ...card,
      limite: card.limite ?? card.limiteTotal ?? card.creditLimit ?? null,
      fechamento: card.fechamento ?? card.diaFechamento ?? card.closingDay ?? null,
      vencimento: card.vencimento ?? card.diaVencimento ?? card.dueDay ?? null,
    };
  });
  data.comprasCartao = Array.isArray(raw.comprasCartao)
    ? (raw.comprasCartao as FinanceData['comprasCartao'])
    : [];
  data.metas = Array.isArray(raw.metas) ? (raw.metas as FinanceData['metas']) : [];
  data.reserva = {
    movimentacoes: Array.isArray(objectOrEmpty(raw.reserva).movimentacoes)
      ? (objectOrEmpty(raw.reserva).movimentacoes as FinanceData['reserva']['movimentacoes'])
      : [],
    obs: String(objectOrEmpty(raw.reserva).obs ?? ''),
  };
  data.meses = objectOrEmpty(raw.meses) as FinanceData['meses'];

  for (let month = 1; month <= 12; month += 1) {
    const current = objectOrEmpty(data.meses[String(month)]);
    const diary = objectOrEmpty(current.diarias);
    data.meses[String(month)] = {
      gastosFixos: Array.isArray(current.gastosFixos) ? current.gastosFixos : [],
      gastosVariaveis: Array.isArray(current.gastosVariaveis) ? current.gastosVariaveis : [],
      outrasReceitas: Array.isArray(current.outrasReceitas) ? current.outrasReceitas : [],
      diarias: {
        modo: diary.modo === 'manual' ? 'manual' : 'automatico',
        diasPrevistos: objectOrEmpty(diary.diasPrevistos) as Record<string, number>,
        diasTrabalhados: objectOrEmpty(diary.diasTrabalhados) as MonthData['diarias']['diasTrabalhados'],
        manual: objectOrEmpty(diary.manual) as MonthData['diarias']['manual'],
      },
      notas: String(current.notas ?? ''),
    };
  }

  return data;
};

