import { createHash, timingSafeEqual } from 'node:crypto';
const DEFAULT_URL = 'https://jbzypqaimerrptxhovzq.supabase.co';
const fail = (code, status = 400) => { const error = new Error(code); error.status = status; throw error; };
const money = n => Math.round(Number(n || 0) * 100) / 100;
const sum = (rows, fn = row => row.valor) => money((rows || []).reduce((total, row) => total + Number(fn(row) || 0), 0));
function monthData(data, ano, mes) {
  if (Number(ano) !== Number(data.year)) fail('ANO_INDISPONIVEL', 422);
  if (!Number.isInteger(Number(mes)) || Number(mes) < 1 || Number(mes) > 12) fail('MES_INVALIDO');
  if (!data.meses?.[mes]) fail('MES_SEM_REGISTRO', 404);
  return data.meses[mes];
}
function production(month) {
  if (month?.diarias?.modo === 'manual') return sum(Object.values(month.diarias.manual || {}), row => row.valorReal);
  return sum(Object.values(month?.diarias?.diasTrabalhados || {}).flat(), row => Number(row.valor || 0) + Number(row.comissao || 0));
}
export function summary(data, ano, mes) {
  const month = monthData(data, ano, mes);
  const receipts = money((Number(mes) === 1 ? 0 : production(data.meses?.[Number(mes) - 1])) + sum(month.outrasReceitas));
  const part = row => row.compartilhado ? Number(row.valor) / 2 : row.valor;
  const paid = money(sum(month.gastosVariaveis) + sum((month.gastosFixos || []).filter(row => row.pago), part));
  const pending = sum((month.gastosFixos || []).filter(row => !row.pago), part);
  const reserve = money(Number(data.reserva?.saldoInicial || 0) + sum(data.reserva?.movimentacoes, row => row.tipo === 'deposito' ? row.valor : -Number(row.valor)));
  return { ano: Number(ano), mes: Number(mes), receitas: receipts, producao: production(month), despesas: money(paid + pending), pago: paid, pendente: pending, saldoAposDespesas: money(receipts - paid - pending), reserva: reserve, observacao: 'Saldo do planejamento, não saldo bancário. Cartões não são somados novamente às despesas.' };
}
export function listTransactions(data, query) {
  const month = monthData(data, query.ano, query.mes);
  if (query.tipo && !['receita', 'despesa'].includes(query.tipo)) fail('TIPO_INVALIDO');
  const rows = [];
  const add = (items, tipo, fixa) => { for (const row of items || []) rows.push({ id: row.id, tipo, fixa, descricao: row.descricao, valor: money(row.valor), data: row.data, categoriaId: row.categoriaId, ...(fixa ? { pago: !!row.pago, compartilhado: !!row.compartilhado, minhaParte: money(row.compartilhado ? row.valor / 2 : row.valor), vencimento: row.vencimento } : {}) }); };
  if (query.tipo !== 'despesa') add(month.outrasReceitas, 'receita', false);
  if (query.tipo !== 'receita') { add(month.gastosFixos, 'despesa', true); add(month.gastosVariaveis, 'despesa', false); }
  const offset = Number(query.offset || 0), limit = Number(query.limite || 20);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) fail('PAGINACAO_INVALIDA');
  return { ano: Number(query.ano), mes: Number(query.mes), total: rows.length, registros: rows.slice(offset, offset + limit), proximoOffset: offset + limit < rows.length ? offset + limit : null, observacao: 'Receitas listadas são entradas extras; o salário da produção anterior está no resumo.' };
}
function validateKeys(command, allowed) { if (Object.keys(command).some(key => !allowed.includes(key))) fail('CAMPO_NAO_PERMITIDO'); }
export function applyCommand(data, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('PEDIDO_INVALIDO');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(command.requestId || '')) fail('REQUEST_ID_INVALIDO');
  let month, list, entry;
  if (command.operacao === 'registrar') {
    validateKeys(command, ['operacao', 'tipo', 'descricao', 'valor', 'data', 'categoriaId', 'requestId']);
    if (!['despesa', 'receita'].includes(command.tipo)) fail('TIPO_INVALIDO');
    if (typeof command.valor !== 'number' || !Number.isFinite(command.valor) || command.valor <= 0 || command.valor > 1e8 || Math.abs(command.valor * 100 - Math.round(command.valor * 100)) > 1e-6) fail('VALOR_INVALIDO');
    if (typeof command.descricao !== 'string' || !command.descricao.trim() || command.descricao.length > 200) fail('DESCRICAO_INVALIDA');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(command.data || '')) fail('DATA_INVALIDA');
    const date = new Date(command.data + 'T12:00:00Z');
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== command.data) fail('DATA_INVALIDA');
    const [year, m] = command.data.split('-').map(Number);
    month = monthData(data, year, m);
    if (command.categoriaId && (command.tipo !== 'despesa' || !(data.categoriasVariaveis || []).some(c => c.id === command.categoriaId))) fail('CATEGORIA_INVALIDA');
    list = month[command.tipo === 'despesa' ? 'gastosVariaveis' : 'outrasReceitas'] || [];
    entry = { id: 'zoni_' + command.requestId, descricao: command.descricao.trim(), valor: command.valor, data: command.data, ...(command.categoriaId ? { categoriaId: command.categoriaId } : {}) };
  } else if (command.operacao === 'marcar_paga') {
    validateKeys(command, ['operacao', 'ano', 'mes', 'id', 'requestId']);
    month = monthData(data, command.ano, command.mes);
    entry = (month.gastosFixos || []).find(row => row.id != null && String(row.id) === String(command.id));
    if (!entry) fail('CONTA_NAO_ENCONTRADA', 404);
  } else fail('OPERACAO_INVALIDA');
  const fingerprint = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
  const receipt = (data.zoniRequests || []).find(row => row.requestId === command.requestId);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) fail('REQUEST_ID_CONFLICT', 409);
    return { duplicado: true, registro: receipt.registro };
  }
  // Transaction IDs retain deduplication even if the bounded receipt history expires.
  const old = list?.find(row => row.id === entry.id);
  if (old) {
    if (JSON.stringify({ descricao: old.descricao, valor: old.valor, data: old.data, categoriaId: old.categoriaId }) !== JSON.stringify({ descricao: entry.descricao, valor: entry.valor, data: entry.data, categoriaId: entry.categoriaId })) fail('REQUEST_ID_CONFLICT', 409);
    return { duplicado: true, registro: entry };
  }
  if (command.operacao === 'registrar') {
    list.push(entry); month[command.tipo === 'despesa' ? 'gastosVariaveis' : 'outrasReceitas'] = list;
  } else entry.pago = true;
  const registro = command.operacao === 'registrar' ? { ...entry } : { id: entry.id, descricao: entry.descricao, pago: true };
  data.zoniRequests = [...(data.zoniRequests || []).slice(-199), { requestId: command.requestId, fingerprint, registro }];
  return { duplicado: false, registro };
}
export function authorize(header, env) {
  if (!env.ZONI_API_KEY || env.ZONI_API_KEY.length < 32 || !/^[a-f0-9-]{36}$/i.test(env.ZONI_USER_ID || '') || !env.SUPABASE_SERVICE_ROLE_KEY) fail('INTEGRACAO_NAO_CONFIGURADA', 503);
  const expected = createHash('sha256').update(env.ZONI_API_KEY).digest();
  const actual = createHash('sha256').update(String(header || '').replace(/^Bearer /, '')).digest();
  if (!String(header || '').startsWith('Bearer ') || !timingSafeEqual(expected, actual)) fail('NAO_AUTORIZADO', 401);
  return env.ZONI_USER_ID;
}
export async function handleRequest(req, env = process.env, fetcher = fetch) {
  try {
    if (!['GET', 'POST'].includes(req.method)) fail('METODO_NAO_PERMITIDO', 405);
    const uid = authorize(req.headers?.authorization, env);
    if (req.method === 'POST' && env.ZONI_WRITE_ENABLED !== 'true') fail('GRAVACAO_DESATIVADA', 403);
    const url = env.SUPABASE_URL || DEFAULT_URL;
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) fail('CONFIGURACAO_INVALIDA', 503);
    const params = new URLSearchParams({ user_id: 'eq.' + uid, select: 'data' });
    const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
    const response = await fetcher(url + '/rest/v1/finances?' + params, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail('FALHA_AO_CONSULTAR', 502);
    const rows = await response.json();
    if (rows.length !== 1) fail('CONTA_SEM_DADOS', 404);
    const raw = rows[0].data;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !Number.isInteger(Number(data.year)) || !data.meses) fail('DADOS_INCOMPATIVEIS', 422);
    if (req.method === 'GET') {
      const q = req.query || {};
      let body;
      if (q.operacao === 'categorias') body = { categorias: (data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome })) };
      else if (q.operacao === 'transacoes') body = listTransactions(data, q);
      else if (!q.operacao || q.operacao === 'resumo') body = summary(data, q.ano, q.mes);
      else fail('OPERACAO_INVALIDA');
      return { status: 200, body };
    }
    // Current clients store finances.data as a JSON string; fail closed for other schemas.
    if (typeof raw !== 'string') fail('ESQUEMA_REQUER_REVISAO', 409);
    const command = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(command || {}).length > 2048) fail('PEDIDO_MUITO_GRANDE', 413);
    const result = applyCommand(data, command);
    if (result.duplicado) return { status: 200, body: result };
    const saved = await fetcher(url + '/rest/v1/rpc/save_finances_if_unchanged', { method: 'POST', headers, body: JSON.stringify({ p_user_id: uid, p_expected: raw, p_payload: JSON.stringify(data) }), signal: AbortSignal.timeout(10000) });
    if (!saved.ok) fail('FALHA_AO_SALVAR', 502);
    const updated = await saved.json();
    if (updated !== true) fail('CONFLITO_DE_SINCRONIZACAO', 409);
    return { status: 200, body: result };
  } catch (error) {
    return { status: error.status || 502, body: { erro: error.status ? error.message : 'FALHA_NA_INTEGRACAO', orientacao: 'Não repetir uma gravação com outro requestId após timeout. Consultar primeiro; reutilizar o mesmo requestId se necessário.' } };
  }
}
