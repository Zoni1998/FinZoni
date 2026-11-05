/* FinZoni Meu Pluggy: client never receives provider credentials. */
(() => {
  const state = { busy: false };
  const node = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const money = (value, currency = 'BRL') => {
    const n = Number(value);
    if (value === null || value === undefined || !Number.isFinite(n)) return '—';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n); }
    catch { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(n); }
  };
  const date = value => {
    if (!value) return '—';
    const raw = String(value);
    const d = new Date(raw.length === 10 ? raw + 'T12:00:00' : raw);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  };
  const ERRORS = {
    LOGIN_REQUIRED: 'Faça login novamente no FinZoni.',
    OPEN_FINANCE_OWNER_NOT_CONFIGURED: 'Falta configurar o ID do proprietário na Vercel.',
    PLUGGY_CREDENTIALS_NOT_CONFIGURED: 'Faltam as credenciais da Pluggy na Vercel.',
    OPEN_FINANCE_DATABASE_NOT_READY: 'Falta executar a migração SQL no Supabase.',
    PLUGGY_AUTH_FAILED: 'As credenciais da Pluggy não foram aceitas.',
    PLUGGY_REQUEST_FAILED: 'A Pluggy não respondeu como esperado. Confira o Item ID e o consentimento.',
    PLUGGY_CONSENT_EXPIRED: 'Autorização vencida. Refaça a conexão MeuPluggy no Dashboard e atualize o Item ID.',
    PERSONAL_USE_ONLY: 'Acesso exclusivo à conta proprietária deste FinZoni.',
    PERSONAL_CONNECTION_LIMIT: 'O plano pessoal permite no máximo cinco conexões.',
    INVALID_ITEM_ID: 'O Item ID precisa ser um UUID copiado do Dashboard da Pluggy.',
    ITEM_NOT_REGISTERED: 'Essa conexão não está cadastrada.',
    TOO_MANY_ACCOUNTS: 'Muitas contas encontradas. Consulte a documentação técnica.',
    OPEN_FINANCE_INTERNAL_ERROR: 'Erro interno. Tente novamente.'
  };

  function setStatus(message, isError = false) {
    const target = node('of-status');
    if (target) {
      target.textContent = message;
      target.setAttribute('role', isError ? 'alert' : 'status');
      target.style.color = isError ? 'var(--red, #e57373)' : 'var(--text-secondary, #9ca3af)';
    }
  }

  async function request(method = 'GET', payload) {
    // sbClient is a global lexical binding declared by app.js (not window.sbClient).
    if (typeof sbClient === 'undefined' || !sbClient) throw new Error('LOGIN_REQUIRED');
    const { data, error } = await sbClient.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('LOGIN_REQUIRED');
    const response = await fetch('/api/open-finance', {
      method,
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      ...(method === 'POST' ? { body: JSON.stringify(payload) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'OPEN_FINANCE_INTERNAL_ERROR');
    return result;
  }

  function render(data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    node('of-count').textContent = items.length + ' de 5 conexões';
    node('of-items').innerHTML = items.length ? items.map(item => {
      const id = escape(item.item_id);
      return '<div class="of-line"><div class="of-line-main"><strong>' + escape(item.label) + '</strong>' +
        '<small>Item •••' + id.slice(-8) + ' | ' + escape(item.status || 'aguardando') +
        ' | Última sincronização: ' + date(item.last_synced_at) + '</small>' +
        (item.consent_expires_at ? '<small>Autorização até: ' + date(item.consent_expires_at) + '</small>' : '') +
        '</div><div class="of-actions"><button class="btn btn-primary btn-sm" data-of-action="sync" data-of-id="' + id +
        '">Sincronizar</button><button class="btn btn-ghost btn-sm" data-of-action="remove" data-of-id="' + id +
        '">Remover</button></div></div>';
    }).join('') : '<p class="of-empty">Nenhuma conexão. Cadastre um Item ID do seu Meu Pluggy.</p>';

    const bankAccounts = accounts.filter(a => a.kind === 'BANK');
    const creditAccounts = accounts.filter(a => a.kind === 'CREDIT');
    const renderAccount = acc => '<div class="of-account"><span>' +
      escape(acc.name) + '<small>' + escape(acc.kind === 'CREDIT' ? 'Cartão • fatura aberta' : 'Conta bancária') +
      '</small></span><strong>' + money(acc.balance, acc.currency_code || 'BRL') + '</strong></div>';
    node('of-accounts').innerHTML = bankAccounts.concat(creditAccounts).map(renderAccount).join('') ||
      '<p class="of-empty">Os saldos aparecerão depois da primeira sincronização.</p>';
    const names = new Map(accounts.map(a => [a.account_id, a.name]));
    node('of-transactions').innerHTML = transactions.length ? transactions.map(tx =>
      '<tr><td>' + date(tx.occurred_on) + '</td><td>' + escape(tx.description) +
      '<small>' + escape(names.get(tx.account_id) || 'Conta') + '</small></td><td>' +
      escape(tx.category || 'Sem categoria') + '</td><td class="of-money">' +
      money(tx.amount) + '</td></tr>'
    ).join('') : '<tr><td colspan="4" class="of-empty">Nenhuma movimentação sincronizada.</td></tr>';
    node('of-total').textContent = money(bankAccounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0));
    node('of-updated').textContent = 'Dados copiados apenas quando você clicar em Sincronizar.';
  }

  async function busyTask(message, fn) {
    if (state.busy) return;
    state.busy = true;
    node('tab-openfinance')?.classList.add('of-busy');
    setStatus(message);
    try { return await fn(); }
    catch (error) {
      setStatus(ERRORS[error.message] || 'Não foi possível concluir: ' + error.message, true);
      return null;
    } finally {
      state.busy = false;
      node('tab-openfinance')?.classList.remove('of-busy');
    }
  }

  async function load() {
    return busyTask('Carregando contas...', async () => {
      render(await request());
      setStatus('Dados carregados.');
    });
  }

  async function add() {
    return busyTask('Validando Item ID na Pluggy...', async () => {
      const itemId = node('of-item-id').value.trim();
      const label = node('of-item-label').value.trim();
      await request('POST', { action: 'add', itemId, label });
      node('of-item-id').value = '';
      render(await request());
      setStatus('Conexão cadastrada. Clique em Sincronizar para importar transações.');
    });
  }

  async function sync(itemId) {
    return busyTask('Sincronizando com a Pluggy...', async () => {
      const result = await request('POST', { action: 'sync', itemId });
      render(await request());
      setStatus('Importação concluída: ' + result.accounts + ' contas, ' + result.transactionsProcessed +
        ' transações processadas.' + (result.partial ? ' Parte do histórico longo não foi carregada.' : ''));
    });
  }

  async function remove(itemId) {
    if (!window.confirm('Excluir esta conexão e seu histórico LOCAL? A autorização no banco não será revogada.')) return;
    return busyTask('Removendo conexão local...', async () => {
      await request('POST', { action: 'remove', itemId });
      render(await request());
      setStatus('Conexão e histórico local removidos.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    node('nav-openfinance')?.addEventListener('click', load);
    node('of-add')?.addEventListener('click', add);
    node('of-reload')?.addEventListener('click', load);
    node('of-items')?.addEventListener('click', event => {
      const button = event.target.closest('button[data-of-action]');
      if (!button || state.busy) return;
      const id = button.dataset.ofId;
      if (button.dataset.ofAction === 'sync') sync(id);
      if (button.dataset.ofAction === 'remove') remove(id);
    });
  });

  window.finzoniOpenFinance = { load, add, sync, remove };
})();
