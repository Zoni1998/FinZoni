const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = require('../zoni-context.js');
const base = path.resolve(__dirname, '..');
function fixture() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} }, focus() {}, remove() {}, addEventListener() {} });
    return elements.get(id);
  };
  const sandbox = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, AbortController, fetch, Intl, Date, crypto: require('node:crypto').webcrypto, localStorage: { getItem: () => null }, document: { getElementById: element, addEventListener() {}, querySelector: () => null }, navigator: {}, confirm: () => true, window: { FinZoniContext: context } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\n globalThis.AppClass = App; globalThis.DMClass = DataManager;', sandbox);
  const app = new sandbox.AppClass();
  app.dm.ensureAllMonths();
  app.dm.data.year = 2026;
  app.currentMonth = 8;
  app.renderAll = () => {};
  app.renderChatHistory = () => {};
  app.dm.saveNow = async () => true;
  app.dm.data.clinicas = [{ id: 'c', nome: 'Clínica', diariaPadrao: 100 }];
  return { app, element, sandbox };
}
test('repeated month binding advances and retreats exactly one month', () => {
  const { app, element } = fixture();
  app.bindMonthSelector(); app.bindMonthSelector();
  element('nextMonth').onclick(); assert.equal(app.currentMonth, 9);
  element('prevMonth').onclick(); assert.equal(app.currentMonth, 8);
  app.currentMonth = 12; element('nextMonth').onclick(); assert.equal(app.currentMonth, 12);
  app.currentMonth = 1; element('prevMonth').onclick(); assert.equal(app.currentMonth, 1);
});
test('repeated dashboard initialization binds every event group once', () => {
  const { app } = fixture();
  const counts = {};
  for (const name of ['bindNavigation', 'bindMonthSelector', 'bindModals', 'bindExportImport', 'bindNotes', 'initTheme']) app[name] = () => { counts[name] = (counts[name] || 0) + 1; };
  for (const name of ['populateYearSelector', 'updateProfileUI', 'updatePrivacyIcon']) app[name] = () => {};
  app.init(); app.init();
  assert.ok(Object.values(counts).every(count => count === 1));
});
test('all months, paging, search and exact totals without exposing secrets', () => {
  const { app } = fixture();
  app.dm.data.nvidiaApiKey = 'SECRET';
  app.dm.data.meses[8].gastosVariaveis = Array.from({ length: 55 }, (_, id) => ({ id, descricao: 'Café', valor: 0.1, apiKey: 'SECRET' }));
  app.dm.data.meses[9].gastosVariaveis = [{ descricao: 'Café', valor: 0.2 }];
  const page = context.query(app, { area: 'despesas_variaveis', busca: 'cafe', limite: 50 });
  assert.equal(page.totalRegistros, 56); assert.equal(page.registros.length, 50); assert.equal(page.proximoOffset, 50);
  assert.equal(page.totaisConsultaCompleta.valor, 5.7);
  assert.equal(context.query(app, { area: 'despesas_variaveis', offset: 50 }).registros.length, 6);
  assert.ok(!JSON.stringify(page).includes('SECRET'));
  assert.equal(context.query(app, { ano: 2025 }).anosDisponiveis[0], 2026);
  assert.ok(context.query(app, { mes: 13 }).erro);
});
test('salary, shared bills, commission, card installments and all modules', () => {
  const { app } = fixture();
  app.dm.data.meses[7].diarias.diasTrabalhados['1'] = [{ clinicaId: 'c', valor: 100, comissao: 20 }];
  app.dm.data.meses[8].gastosFixos = [{ descricao: 'Luz', valor: 80, compartilhado: true, pago: false }];
  app.dm.data.cartoes = [{ id: 'card', nome: 'Cartão', vencimento: 10 }];
  app.dm.data.comprasCartao = [{ id: 'buy', cartaoId: 'card', descricao: 'Compra', mesInicio: '2026-07', data: '2026-07-01', parcelas: 3, valorTotal: 90, valorParcela: 30 }];
  app.dm.data.metas = [{ nome: 'Casa', historico: [{ data: '2026-08-01', valor: 5 }] }];
  app.dm.data.reserva.movimentacoes = [{ tipo: 'deposito', data: '2026-08-01', valor: 10 }];
  app.dm.data.meses[8].notas = 'Teste';
  const summary = context.query(app, { area: 'resumo', mes: 8 }).registros[0];
  assert.equal(summary.receitas, 120); assert.equal(summary.despesas, 40); assert.equal(summary.saldo, 80); assert.equal(summary.faturaCartoes, 30);
  assert.equal(context.query(app, { area: 'faturas', mes: 8 }).registros[0].compras[0].parcelaAtual, 2);
  assert.equal(context.query(app, { area: 'faturas', mes: 10 }).registros[0].total, 0);
  for (const area of context.tool.function.parameters.properties.area.enum) assert.ok(context.query(app, { area }).registros);
});
test('prompt refreshes before each message and after confirmed mutation', async () => {
  const { app, element } = fixture();
  const prompts = [];
  let call = 0;
  app.callNvidia = async messages => {
    prompts.push(messages[0].content);
    return call++ === 0 ? { tool_calls: [{ id: 't', function: { name: 'adicionar_despesa', arguments: JSON.stringify({ descricao: 'Almoço', valor: 10, data: '2026-08-01' }) } }] } : { content: 'Concluído' };
  };
  element('iaChatInput').value = 'Registre almoço'; await app.enviarMensagemIA();
  assert.equal(app.dm.data.meses[8].gastosVariaveis.length, 1);
  assert.notEqual(prompts[0], prompts[1]);
  app.dm.data.meses[8].gastosVariaveis.push({ valor: 20 });
  element('iaChatInput').value = 'E agora?'; await app.enviarMensagemIA();
  assert.notEqual(prompts[1], prompts[2]); assert.equal(app.zoniBusy, false);
});
test('partial success survives later failure and unresolved tool calls are repaired', async () => {
  const { app, element } = fixture();
  let calls = 0;
  app.callNvidia = async () => {
    if (calls++) throw new Error('NVIDIA_TIMEOUT');
    return { tool_calls: [
      { id: 'good', function: { name: 'adicionar_despesa', arguments: '{"descricao":"Café","valor":5,"data":"2026-08-01"}' } },
      { id: 'bad', function: { name: 'adicionar_receita', arguments: '{' } }
    ] };
  };
  element('iaChatInput').value = 'Registrar'; await app.enviarMensagemIA();
  assert.equal(app.dm.data.meses[8].gastosVariaveis.length, 1);
  assert.match(app.conversationHistory.at(-1).content, /alterações confirmadas foram salvas/);
  assert.equal(app.conversationHistory.filter(m => m.role === 'tool').length, 2);
  assert.equal(app.zoniBusy, false); assert.equal(element('iaChatInput').disabled, false);
});
test('failed save is reported and never automatically repeats the mutation', async () => {
  const { app, element } = fixture();
  app.dm.saveNow = async () => false;
  app.callNvidia = async () => ({ tool_calls: [{ id: 'one', function: { name: 'adicionar_despesa', arguments: '{"descricao":"Café","valor":5,"data":"2026-08-01"}' } }] });
  element('iaChatInput').value = 'Registrar'; await app.enviarMensagemIA();
  assert.equal(app.dm.data.meses[8].gastosVariaveis.length, 1);
  assert.match(app.conversationHistory.at(-1).content, /gravação na nuvem/);
  assert.equal(app.zoniBusy, false);
});
test('repeated inference tool requests cannot duplicate a launch in one turn', async () => {
  const { app, element } = fixture();
  let calls = 0;
  app.callNvidia = async () => calls++ < 2 ? { tool_calls: [{ id: `call-${calls}`, function: { name: 'adicionar_despesa', arguments: '{"descricao":"Café","valor":5,"data":"2026-08-01"}' } }] } : { content: 'Pronto' };
  element('iaChatInput').value = 'Registrar'; await app.enviarMensagemIA();
  assert.equal(app.dm.data.meses[8].gastosVariaveis.length, 1);
  assert.ok(app.conversationHistory.some(m => m.role === 'tool' && /não foi repetida/.test(m.content)));
});
test('tool execution crash leaves a valid history and saves earlier mutations', async () => {
  const { app, element } = fixture();
  let saves = 0;
  app.dm.saveNow = async () => { saves++; return true; };
  app.calcResumoDespesas = () => { throw new Error('broken'); };
  app.getSystemPrompt = async () => 'Contexto';
  app.callNvidia = async () => ({ tool_calls: [
    { id: 'first', function: { name: 'adicionar_despesa', arguments: '{"descricao":"Café","valor":5,"data":"2026-08-01"}' } },
    { id: 'second', function: { name: 'resumo_financeiro', arguments: '{}' } },
    { id: 'third', function: { name: 'listar_cartoes', arguments: '{}' } }
  ] });
  element('iaChatInput').value = 'Registrar e consultar'; await app.enviarMensagemIA();
  assert.equal(saves, 1); assert.equal(app.conversationHistory.filter(m => m.role === 'tool').length, 3);
  assert.equal(app.zoniBusy, false);
});
test('client preserves HTTP status without exposing non-JSON error pages', async () => {
  const { sandbox } = fixture();
  sandbox.fetch = async () => new Response('<html>private diagnostics</html>', { status: 503 });
  const result = await sandbox.window.nvidiaProxy({});
  assert.match(result.error.message, /HTTP 503/); assert.ok(!result.error.message.includes('private'));
});
test('background insights never flood the service on repeated renders', async () => {
  const { app, sandbox } = fixture();
  app.dm.data.nvidiaApiKey = 'key';
  app.getSystemPrompt = async () => 'Contexto';
  app.renderInsightFallback = () => {};
  let calls = 0;
  sandbox.window.nvidiaProxy = async () => { calls++; return { error: new Error('NVIDIA_TIMEOUT') }; };
  await Promise.all([app.checkAndFetchInsight(), app.checkAndFetchInsight(), app.checkAndFetchInsight()]);
  await app.checkAndFetchInsight();
  assert.equal(calls, 1); assert.equal(app.insightBusy, false);
});
test('invalid dates, values, cards and years cannot modify data', () => {
  const { app } = fixture();
  for (const args of [{ valor: -1, data: '2026-08-01' }, { valor: 5, data: '2026-02-30' }, { valor: 5, data: '2025-08-01' }]) assert.ok(app.validateIATool('adicionar_despesa', { descricao: 'Teste', ...args }));
  assert.ok(app.validateIATool('adicionar_compra_cartao', { cartaoId: 'missing', descricao: 'Teste', data: '2026-08-01', valorTotal: 10, parcelas: 1 }));
});
test('migration preserves original years and dates', () => {
  const { app } = fixture();
  app.dm.data.year = 2024;
  app.dm.data.meses[8].gastosVariaveis = [{ data: '2024-08-01', valor: 5 }];
  app.dm.validateAndMigrate();
  assert.equal(app.dm.data.year, 2024); assert.equal(app.dm.data.meses[8].gastosVariaveis[0].data, '2024-08-01');
});
test('proxy retries transient inference only and forwards tool configuration', async () => {
  const { requestNvidia } = await import('../api/_nvidia-client.js');
  const bodies = [];
  const result = await requestNvidia('chat', { messages: [{ role: 'user', content: 'Olá' }], tools: [context.tool] }, 'key', { sleep: async () => {}, fetchImpl: async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length === 1 ? new Response('{"error":"busy"}', { status: 429 }) : new Response('{"choices":[{"message":{"content":"Olá"}}]}', { status: 200 });
  } });
  assert.equal(result.status, 200); assert.equal(bodies.length, 2); assert.equal(bodies[0].tools.length, 1); assert.equal(bodies[0].stream, false);
});
test('proxy does not retry invalid keys or unsupported models', async () => {
  const { requestNvidia } = await import('../api/_nvidia-client.js');
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    const result = await requestNvidia('chat', { messages: [] }, 'key', { sleep: async () => {}, fetchImpl: async () => { calls++; return new Response('{"error":"invalid"}', { status }); } });
    assert.equal(calls, 1); assert.equal(result.status, status);
  }
});
test('proxy handles non-JSON and keeps timeout active during body consumption', async () => {
  const { requestNvidia } = await import('../api/_nvidia-client.js');
  const result = await requestNvidia('chat', { messages: [] }, 'key', { sleep: async () => {}, fetchImpl: async () => new Response('<html>bad gateway</html>', { status: 200 }) });
  assert.equal(result.status, 502);
  const stalled = await requestNvidia('chat', { messages: [] }, 'key', { budgetMs: 15, fetchImpl: async (url, { signal }) => ({ text: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }) });
  assert.equal(stalled.status, 504);
});
test('both server runtimes use the same inference client', () => {
  assert.equal(fs.readFileSync(path.join(base, 'api/_nvidia-client.js'), 'utf8').trim(), fs.readFileSync(path.join(base, 'supabase/functions/_shared/nvidia-client.js'), 'utf8').trim());
});
