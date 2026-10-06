import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, listTransactions, applyCommand, authorize, handleRequest } from '../api/_zoni-core.mjs';
const fixture = () => ({ year: 2026, meses: { 9: { diarias: { modo: 'automatico', diasTrabalhados: { 1: [{ valor: 170, comissao: 30 }] } } }, 10: { gastosFixos: [{ id: 'luz', descricao: 'Luz', valor: 100, compartilhado: true, pago: false }], gastosVariaveis: [{ id: 'cafe', descricao: 'Café', valor: 5, data: '2026-10-06' }], outrasReceitas: [{ id: 'extra', valor: 20 }], diarias: { modo: 'manual', manual: { advance: { valorReal: 300 } } } } }, categoriasVariaveis: [{ id: 'alimentacao', nome: 'Alimentação' }], reserva: { saldoInicial: 1000, movimentacoes: [{ tipo: 'deposito', valor: 100 }, { tipo: 'saque', valor: 50 }] }, nvidiaApiKey: 'PRIVATE' });
const cmd = { operacao: 'registrar', tipo: 'despesa', descricao: 'Almoço', valor: 47.9, data: '2026-10-06', categoriaId: 'alimentacao', requestId: 'request-0001' };
test('monthly summary follows prior-month salary and shared/pending expense rules', () => {
  assert.deepEqual(summary(fixture(), 2026, 10), { ano: 2026, mes: 10, receitas: 220, producao: 300, despesas: 55, pago: 5, pendente: 50, saldoAposDespesas: 165, reserva: 1050, observacao: 'Saldo do planejamento, não saldo bancário. Cartões não são somados novamente às despesas.' });
  assert.throws(() => summary(fixture(), 2025, 10), /ANO_INDISPONIVEL/);
});
test('transaction outputs allowlist fields and paginate', () => {
 const d = fixture(); d.meses[10].gastosVariaveis[0].apiKey = 'PRIVATE';
 const result = listTransactions(d, { ano: 2026, mes: 10, tipo: 'despesa', limite: 1 });
 assert.equal(result.total, 2); assert.equal(result.proximoOffset, 1); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('same request does not duplicate and changed request conflicts', () => {
 const d = fixture(); const first = applyCommand(d, cmd); const second = applyCommand(d, cmd);
 assert.equal(first.registro.id, second.registro.id); assert.equal(d.meses[10].gastosVariaveis.length, 2);
 assert.throws(() => applyCommand(d, { ...cmd, valor: 48 }), /REQUEST_ID_CONFLICT/);
});
test('invalid dates, unknown categories and values cannot change the document', () => {
 for (const patch of [{ data: '2026-02-30' }, { valor: -1 }, { valor: 1.001 }, { valor: '10' }, { categoriaId: 'missing' }, { data: '2025-10-06' }, { user_id: 'someone' }]) {
 const d = fixture(); const before = JSON.stringify(d); assert.throws(() => applyCommand(d, { ...cmd, ...patch })); assert.equal(JSON.stringify(d), before);
 }
});
test('marking paid requires the exact fixed-expense ID and is repeat-safe', () => {
 const d = fixture(); const paid = { operacao: 'marcar_paga', ano: 2026, mes: 10, id: 'luz', requestId: 'paid-0001' };
 applyCommand(d, paid); applyCommand(d, paid); assert.equal(summary(d, 2026, 10).pendente, 0);
 assert.throws(() => applyCommand(d, { ...paid, id: 'missing', requestId: 'paid-0002' }), /CONTA_NAO_ENCONTRADA/);
});
test('missing config or wrong credentials are rejected before data access', () => {
 assert.throws(() => authorize('Bearer invalid', {}), /INTEGRACAO_NAO_CONFIGURADA/);
 const env = { ZONI_API_KEY: 'a'.repeat(48), ZONI_USER_ID: 'b9cf5b72-4d4f-458d-8364-fb4e90e1cfb1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' };
 assert.throws(() => authorize('Bearer wrong', env), /NAO_AUTORIZADO/); assert.equal(authorize('Bearer '+env.ZONI_API_KEY, env), env.ZONI_USER_ID);
});
test('write conflict returns 409 and does not retry; credentials never reach response', async () => {
 const env = { ZONI_API_KEY: 'a'.repeat(48), ZONI_USER_ID: 'b9cf5b72-4d4f-458d-8364-fb4e90e1cfb1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', ZONI_WRITE_ENABLED: 'true' };
 let calls = 0; const fetcher = async (url, options) => { calls++; if(options.method === 'POST') { assert.match(url, /rpc\/save_finances_if_unchanged/); assert.equal(JSON.parse(options.body).p_user_id, env.ZONI_USER_ID); return new Response('false'); } return new Response(JSON.stringify([{ data: JSON.stringify(fixture()) }])); };
 const result = await handleRequest({ method: 'POST', headers: { authorization: 'Bearer '+env.ZONI_API_KEY }, body: cmd }, env, fetcher);
 assert.equal(result.status, 409); assert.equal(calls, 2); assert.ok(!JSON.stringify(result).includes('server-secret'));
});
test('writes stay disabled until activation and no backend call is made', async () => {
 const env = { ZONI_API_KEY: 'a'.repeat(48), ZONI_USER_ID: 'b9cf5b72-4d4f-458d-8364-fb4e90e1cfb1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' };
 const result = await handleRequest({ method: 'POST', headers: { authorization: 'Bearer '+env.ZONI_API_KEY }, body: cmd }, env, () => { throw Error('must not fetch'); }); assert.equal(result.status, 403);
});
test('large finance documents are compared in request body, never in a URL', async () => {
 const d = fixture(); d.meses[10].notas = 'x'.repeat(100000);
 const raw = JSON.stringify(d);
 const env = { ZONI_API_KEY: 'a'.repeat(48), ZONI_USER_ID: 'b9cf5b72-4d4f-458d-8364-fb4e90e1cfb1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', ZONI_WRITE_ENABLED: 'true' };
 const fetcher = async (url, options) => {
   assert.ok(url.length < 300);
   if(options.method === 'GET') return new Response(JSON.stringify([{ data: raw }]));
   const body = JSON.parse(options.body); assert.equal(body.p_expected, raw); assert.equal(body.p_user_id, env.ZONI_USER_ID); return new Response('true');
 };
 const result = await handleRequest({ method: 'POST', headers: { authorization: 'Bearer '+env.ZONI_API_KEY }, body: cmd }, env, fetcher);
 assert.equal(result.status, 200);
});
test('successful RPC returns a receipt and repeated persisted request avoids another write', async () => {
 const d = fixture();
 const env = { ZONI_API_KEY: 'a'.repeat(48), ZONI_USER_ID: 'b9cf5b72-4d4f-458d-8364-fb4e90e1cfb1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', ZONI_WRITE_ENABLED: 'true' };
 let raw = JSON.stringify(d), writes = 0;
 const fetcher = async (url, options) => { if(options.method === 'GET') { assert.match(url, new RegExp(env.ZONI_USER_ID)); return new Response(JSON.stringify([{ data: raw }])); } writes++; const body = JSON.parse(options.body); assert.equal(body.p_expected, raw); raw = body.p_payload; return new Response('true'); };
 const req = { method: 'POST', headers: { authorization: 'Bearer '+env.ZONI_API_KEY }, body: cmd };
 assert.equal((await handleRequest(req, env, fetcher)).status, 200);
 const repeated = await handleRequest(req, env, fetcher); assert.equal(repeated.body.duplicado, true); assert.equal(writes, 1);
});
