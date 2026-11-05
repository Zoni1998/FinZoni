import { validUuid, mapAccount, mapTransaction, cursorFromNext } from './_open-finance-mapper.mjs';

export const maxDuration = 60;

// Public Supabase settings mirror the existing FinZoni frontend; secret keys never do.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbzypqaimerrptxhovzq.supabase.co';
const SUPABASE_PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hQ2QoIaF4eL9JlX_49NzHQ_hobaAnLi';
const PLUGGY_URL = 'https://api.pluggy.ai';

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function getJson(url, options = {}, failureCode = 'UPSTREAM_FAILED') {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) }); }
  catch { throw new ApiError(502, failureCode); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(502, failureCode);
  return data;
}

async function authenticate(req) {
  const owner = process.env.OPEN_FINANCE_OWNER_USER_ID;
  if (!validUuid(owner)) throw new ApiError(503, 'OPEN_FINANCE_OWNER_NOT_CONFIGURED');
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) throw new ApiError(401, 'LOGIN_REQUIRED');
  let response;
  try {
    response = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: 'Bearer ' + match[1] },
      signal: AbortSignal.timeout(10000)
    });
  } catch { throw new ApiError(502, 'AUTH_UNAVAILABLE'); }
  if (!response.ok) throw new ApiError(401, 'LOGIN_REQUIRED');
  const user = await response.json().catch(() => null);
  if (!validUuid(user?.id)) throw new ApiError(401, 'LOGIN_REQUIRED');
  if (user.id.toLowerCase() !== owner.toLowerCase()) throw new ApiError(403, 'PERSONAL_USE_ONLY');
  return { userId: user.id, token: match[1] };
}

async function db(auth, table, method = 'GET', query = '', payload = undefined, upsert = false) {
  const headers = {
    apikey: SUPABASE_PUBLIC_KEY,
    Authorization: 'Bearer ' + auth.token,
    Accept: 'application/json',
    ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(upsert ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : { Prefer: 'return=minimal' })
  };
  let response;
  try {
    response = await fetch(SUPABASE_URL + '/rest/v1/' + table + query, {
      method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(12000)
    });
  } catch { throw new ApiError(502, 'STORAGE_UNAVAILABLE'); }
  if (!response.ok) throw new ApiError(502, 'OPEN_FINANCE_DATABASE_NOT_READY');
  if (method === 'GET') return response.json().catch(() => []);
  return true;
}

function ownQuery(auth, extra = '') {
  return '?user_id=eq.' + encodeURIComponent(auth.userId) + extra;
}

async function readItems(auth) {
  return db(auth, 'open_finance_items', 'GET', ownQuery(auth, '&select=item_id,label,status,consent_expires_at,last_synced_at,created_at&order=created_at.asc'));
}

async function readOverview(auth) {
  const [items, accounts, transactions] = await Promise.all([
    readItems(auth),
    db(auth, 'open_finance_accounts', 'GET', ownQuery(auth, '&select=item_id,account_id,name,kind,subtype,balance,currency_code,updated_at&order=name.asc')),
    db(auth, 'open_finance_transactions', 'GET', ownQuery(auth, '&select=transaction_id,account_id,occurred_on,description,amount,category,transaction_type,status&order=occurred_on.desc&limit=150'))
  ]);
  return { items, accounts, transactions };
}

function requirePluggy() {
  if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) throw new ApiError(503, 'PLUGGY_CREDENTIALS_NOT_CONFIGURED');
}

async function pluggyApiKey() {
  requirePluggy();
  const result = await getJson(PLUGGY_URL + '/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET })
  }, 'PLUGGY_AUTH_FAILED');
  if (!result?.apiKey) throw new ApiError(502, 'PLUGGY_AUTH_FAILED');
  return result.apiKey;
}

async function pluggyGet(path, apiKey) {
  return getJson(PLUGGY_URL + path, { headers: { 'X-API-KEY': apiKey } }, 'PLUGGY_REQUEST_FAILED');
}

async function getItem(itemId, apiKey) {
  const item = await pluggyGet('/items/' + itemId, apiKey);
  if (item?.consentExpiresAt && Date.parse(item.consentExpiresAt) <= Date.now()) {
    throw new ApiError(409, 'PLUGGY_CONSENT_EXPIRED');
  }
  return item;
}

async function registerItem(auth, body) {
  if (!validUuid(body.itemId)) throw new ApiError(400, 'INVALID_ITEM_ID');
  const label = String(body.label || 'Banco conectado').trim().slice(0, 80);
  if (!label) throw new ApiError(400, 'INVALID_LABEL');
  const items = await readItems(auth);
  if (items.some(item => item.item_id === body.itemId)) return { added: false };
  if (items.length >= 5) throw new ApiError(409, 'PERSONAL_CONNECTION_LIMIT');
  const key = await pluggyApiKey();
  const item = await getItem(body.itemId, key);
  if (item?.id !== body.itemId) throw new ApiError(400, 'INVALID_ITEM_ID');
  await db(auth, 'open_finance_items', 'POST', '?on_conflict=user_id,item_id', [{
    user_id: auth.userId, item_id: body.itemId, label,
    status: item.status || null, consent_expires_at: item.consentExpiresAt || null
  }], true);
  return { added: true };
}

async function removeItem(auth, itemId) {
  if (!validUuid(itemId)) throw new ApiError(400, 'INVALID_ITEM_ID');
  await db(auth, 'open_finance_items', 'DELETE', ownQuery(auth, '&item_id=eq.' + encodeURIComponent(itemId)));
  // Foreign keys cascade deletion of the locally copied accounts and transactions.
  return { removed: true };
}

async function syncItem(auth, itemId) {
  if (!validUuid(itemId)) throw new ApiError(400, 'INVALID_ITEM_ID');
  const items = await readItems(auth);
  if (!items.some(item => item.item_id === itemId)) throw new ApiError(404, 'ITEM_NOT_REGISTERED');
  const key = await pluggyApiKey();
  const item = await getItem(itemId, key);
  const accountsResponse = await pluggyGet('/accounts?itemId=' + itemId, key);
  const rawAccounts = Array.isArray(accountsResponse?.results) ? accountsResponse.results : [];
  if (accountsResponse?.totalPages > 1 || rawAccounts.length > 20) throw new ApiError(409, 'TOO_MANY_ACCOUNTS');
  const accounts = rawAccounts.map(a => mapAccount(a, auth.userId, itemId)).filter(Boolean);
  if (accounts.length) await db(auth, 'open_finance_accounts', 'POST', '?on_conflict=user_id,account_id', accounts, true);
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  let imported = 0, partial = false;
  for (const account of accounts) {
    let after = null;
    for (let page = 0; page < 2; page++) {
      const params = new URLSearchParams({ accountId: account.account_id, dateFrom: since });
      if (after) params.set('after', after);
      const batch = await pluggyGet('/v2/transactions?' + params.toString(), key);
      if (!Array.isArray(batch?.results)) throw new ApiError(502, 'PLUGGY_INVALID_TRANSACTIONS');
      const transactions = batch.results.map(t => mapTransaction(t, auth.userId, account.account_id)).filter(Boolean);
      for (let i = 0; i < transactions.length; i += 100) {
        await db(auth, 'open_finance_transactions', 'POST', '?on_conflict=user_id,transaction_id',
          transactions.slice(i, i + 100), true);
      }
      imported += transactions.length;
      after = cursorFromNext(batch.next, account.account_id);
      if (!after) break;
      if (page === 1) partial = true;
    }
  }
  await db(auth, 'open_finance_items', 'PATCH',
    ownQuery(auth, '&item_id=eq.' + encodeURIComponent(itemId)),
    { status: item.status || null, consent_expires_at: item.consentExpiresAt || null, last_synced_at: new Date().toISOString() });
  return { accounts: accounts.length, transactionsProcessed: imported, partial };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Allow', 'GET, POST');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const auth = await authenticate(req);
    if (req.method === 'GET') return res.status(200).json(await readOverview(auth));
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    let result;
    switch (body.action) {
      case 'add': result = await registerItem(auth, body); break;
      case 'sync': result = await syncItem(auth, body.itemId); break;
      case 'remove': result = await removeItem(auth, body.itemId); break;
      default: throw new ApiError(400, 'INVALID_ACTION');
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error instanceof ApiError ? error.status : 500)
      .json({ error: error instanceof ApiError ? error.code : 'OPEN_FINANCE_INTERNAL_ERROR' });
  }
}
