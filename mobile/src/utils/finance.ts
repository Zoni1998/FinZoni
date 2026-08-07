import type { CreditCard, FinanceData, MonthData } from '../types';

export const monthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

export const getMonth = (data: FinanceData, month: number): MonthData | undefined => data.meses[String(month)];

export const totalWork = (data: FinanceData, month: number): number => {
  const current = getMonth(data, month);
  if (!current) return 0;
  if (current.diarias.modo === 'manual') {
    return Object.values(current.diarias.manual).reduce((sum, entry) => sum + Number(entry.valorReal || 0), 0);
  }
  return Object.values(current.diarias.diasTrabalhados).reduce(
    (sum, entries) => sum + entries.reduce((daily, entry) => daily + Number(entry.valor || 0) + Number(entry.comissao || 0), 0),
    0,
  );
};

export const totalIncome = (data: FinanceData, month: number): number => {
  const salary = month > 1 ? totalWork(data, month - 1) : 0;
  const extras = getMonth(data, month)?.outrasReceitas.reduce((sum, item) => sum + Number(item.valor || 0), 0) ?? 0;
  return salary + extras;
};

export const expenseSummary = (data: FinanceData, month: number) => {
  const current = getMonth(data, month);
  if (!current) return { paid: 0, pending: 0, total: 0 };
  const variable = current.gastosVariaveis.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  let paid = variable;
  let pending = 0;
  current.gastosFixos.forEach((item) => {
    const amount = Number(item.valor || 0) / (item.compartilhado ? 2 : 1);
    if (item.pago) paid += amount;
    else pending += amount;
  });
  return { paid, pending, total: paid + pending };
};

export const cardInvoice = (data: FinanceData, cardId: CreditCard['id'], targetMonth: string): number => {
  const [targetYear, targetMonthNumber] = targetMonth.split('-').map(Number);
  return data.comprasCartao.reduce((total, purchase) => {
    if (String(purchase.cartaoId) !== String(cardId)) return total;
    const [startYear, startMonth] = (purchase.mesInicio || purchase.data.slice(0, 7)).split('-').map(Number);
    if (![targetYear, targetMonthNumber, startYear, startMonth].every(Number.isFinite)) return total;
    const difference = (targetYear! - startYear!) * 12 + (targetMonthNumber! - startMonth!);
    const installments = Math.max(1, Number(purchase.parcelas) || 1);
    return difference >= 0 && difference < installments
      ? total + (Number(purchase.valorParcela) || Number(purchase.valorTotal) / installments)
      : total;
  }, 0);
};

export const cardOpenAmount = (data: FinanceData, cardId: CreditCard['id'], targetMonth: string): number => {
  const [targetYear, targetMonthNumber] = targetMonth.split('-').map(Number);
  return data.comprasCartao.reduce((total, purchase) => {
    if (String(purchase.cartaoId) !== String(cardId)) return total;
    const [startYear, startMonth] = (purchase.mesInicio || purchase.data.slice(0, 7)).split('-').map(Number);
    if (![targetYear, targetMonthNumber, startYear, startMonth].every(Number.isFinite)) return total;
    const difference = (targetYear! - startYear!) * 12 + (targetMonthNumber! - startMonth!);
    const installments = Math.max(1, Number(purchase.parcelas) || 1);
    const remaining = difference < 0 ? installments : difference >= installments ? 0 : installments - difference;
    const installmentValue = Number(purchase.valorParcela) || Number(purchase.valorTotal) / installments;
    return total + remaining * installmentValue;
  }, 0);
};

export const reserveBalance = (data: FinanceData): number =>
  data.reserva.movimentacoes.reduce(
    (sum, movement) => sum + (movement.tipo === 'deposito' ? Number(movement.valor || 0) : -Number(movement.valor || 0)),
    0,
  );

export const buildZoniContext = (data: FinanceData, month: number): string => {
  const income = totalIncome(data, month);
  const expenses = expenseSummary(data, month);
  const production = totalWork(data, month);
  const goals = data.metas.map((goal) => ({
    nome: goal.nome,
    atual: Number(goal.valorAtual ?? goal.atual ?? 0),
    meta: Number(goal.valorAlvo ?? goal.meta ?? 0),
  }));
  return JSON.stringify({
    mes: month,
    ano: data.year,
    receitas: income,
    despesasPagas: expenses.paid,
    despesasPendentes: expenses.pending,
    saldoPrevisto: income - expenses.total,
    producaoDoMes: production,
    reserva: reserveBalance(data),
    metas: goals,
    cartoes: data.cartoes.map((card) => ({ nome: card.nome, limite: card.limite, vencimento: card.vencimento })),
  });
};

export const makeId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
