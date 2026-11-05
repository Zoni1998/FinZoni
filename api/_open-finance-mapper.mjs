// Pure mapping helpers: never persist CPF, bank account numbers, or full provider payloads.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mapAccount(account, userId, itemId) {
  if (!validUuid(account?.id) || !validUuid(itemId)) return null;
  return {
    user_id: userId,
    item_id: itemId,
    account_id: account.id,
    name: String(account.name || account.marketingName || 'Conta').slice(0, 160),
    kind: account.type === 'CREDIT' ? 'CREDIT' : 'BANK',
    subtype: String(account.subtype || '').slice(0, 60),
    balance: finiteNumber(account.balance),
    currency_code: String(account.currencyCode || 'BRL').slice(0, 6),
    updated_at: new Date().toISOString()
  };
}

export function mapTransaction(transaction, userId, accountId) {
  if (!validUuid(transaction?.id) || !validUuid(accountId)) return null;
  const date = String(transaction.date || '').slice(0, 10);
  const amount = finiteNumber(transaction.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || amount === null) return null;
  return {
    user_id: userId,
    account_id: accountId,
    transaction_id: transaction.id,
    occurred_on: date,
    description: String(transaction.description || transaction.descriptionRaw || 'Movimentação').slice(0, 400),
    amount,
    category: String(transaction.category || '').slice(0, 120),
    transaction_type: String(transaction.type || '').slice(0, 30),
    status: String(transaction.status || '').slice(0, 30),
    updated_at: new Date().toISOString()
  };
}

export function cursorFromNext(next, accountId) {
  if (!next) return null;
  if (typeof next !== 'string' || !next.startsWith('?')) throw new Error('INVALID_CURSOR');
  const params = new URLSearchParams(next.slice(1));
  if (params.get('accountId') !== accountId || !params.get('after')) throw new Error('INVALID_CURSOR');
  return params.get('after');
}
