import test from 'node:test';
import assert from 'node:assert/strict';
import { validUuid, mapAccount, mapTransaction, cursorFromNext } from '../api/_open-finance-mapper.mjs';

const userId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';
const transactionId = '44444444-4444-4444-8444-444444444444';

test('validates provider item IDs', () => {
  assert.equal(validUuid('malicious-input'), false);
  assert.equal(validUuid(itemId), true);
});

test('account mapping excludes confidential bank identifiers', () => {
  const result = mapAccount({
    id: accountId, type: 'BANK', name: 'Conta', balance: 450.15,
    taxNumber: 'hidden', number: 'hidden', owner: 'hidden'
  }, userId, itemId);
  assert.equal(result.balance, 450.15);
  assert.equal(result.kind, 'BANK');
  assert.equal('taxNumber' in result, false);
  assert.equal('number' in result, false);
});

test('stable transaction ID supports idempotent upserts', () => {
  const tx = { id: transactionId, amount: -10.5, date: '2026-11-04T00:00:00Z', description: 'Café' };
  const first = mapTransaction(tx, userId, accountId);
  const second = mapTransaction(tx, userId, accountId);
  assert.equal(first.transaction_id, second.transaction_id);
  assert.equal(first.amount, -10.5);
  assert.equal(first.occurred_on, '2026-11-04');
  assert.equal(mapTransaction({ ...tx, amount: 'bad' }, userId, accountId), null);
});

test('cursor validation prevents cross-account pagination', () => {
  assert.equal(cursorFromNext(null, accountId), null);
  assert.equal(cursorFromNext('?accountId=' + accountId + '&after=abc%2Fdef', accountId), 'abc/def');
  assert.throws(() => cursorFromNext('?accountId=' + itemId + '&after=abc', accountId), /INVALID_CURSOR/);
  assert.throws(() => cursorFromNext('https://evil.test', accountId), /INVALID_CURSOR/);
});
