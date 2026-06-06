/* ========================================
   DASHBOARD FINANCEIRO - APPLICATION LOGIC
   ======================================== */

// ── CONSTANTS ──
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const STORAGE_KEY = 'findash_data_v1';
const YEAR = 2026;

// ── DEFAULT DATA ──
function getDefaultData() {
  return {
    year: YEAR,
    clinicas: [
      { id: 'advance', nome: 'Advance', diariaPadrao: 170, cor: '#448aff' },
      { id: 'bm', nome: 'BM Odontologia', diariaPadrao: 150, cor: '#b388ff' },
      { id: 'odontoking', nome: 'Odontoking', diariaPadrao: 140, cor: '#ffd740' }
    ],
    categoriasFixas: [
      { id: 'tv', nome: 'TV', compartilhado: false },
      { id: 'passagem', nome: 'Passagem', compartilhado: false },
      { id: 'psicologo', nome: 'Psicólogo', compartilhado: false },
      { id: 'cartao', nome: 'Cartão de Crédito', compartilhado: false },
      { id: 'inss', nome: 'INSS', compartilhado: false },
      { id: 'luz', nome: 'Luz', compartilhado: true },
      { id: 'internet', nome: 'Internet Casa', compartilhado: true },
      { id: 'claro', nome: 'Claro', compartilhado: false },
      { id: 'condominio', nome: 'Condomínio', compartilhado: true },
      { id: 'celular', nome: 'Celular (Parcelas)', compartilhado: false }
    ],
    reserva: {
      movimentacoes: [],
      obs: ''
    },
    metas: [],
    meses: {}
  };
}

function getDefaultMonth() {
  return {
    gastosFixos: [],
    gastosVariaveis: [],
    outrasReceitas: [],
    diarias: {
      modo: 'automatico',
      diasPrevistos: {},
      diasTrabalhados: {},
      manual: {}
    },
    notas: ''
  };
}

// ── SUPABASE CONFIG ──
const SUPABASE_URL = 'https://jbzypqaimerrptxhovzq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hQ2QoIaF4eL9JlX_49NzHQ_hobaAnLi';
let sbClient = null;

if (window.supabase) {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── DATA MANAGER ──
class DataManager {
  constructor() {
    this.data = getDefaultData();
    this.userId = null;
  }

  async load() {
    if (!this.userId || !sbClient) return false;
    try {
      const { data, error } = await sbClient
        .from('finances')
        .select('data')
        .eq('user_id', this.userId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is row not found
        console.error('Error loading data:', error);
        return false;
      }
      
      if (data && data.data) {
        this.data = data.data;
        // Ensure sub-objects
        if (!this.data.metas) this.data.metas = [];
        if (!this.data.reserva) this.data.reserva = { movimentacoes: [], obs: '' };
        if (!this.data.categoriasFixas) this.data.categoriasFixas = getDefaultData().categoriasFixas;
      } else {
        // Auto-Migration from localStorage
        const localRaw = localStorage.getItem('findash_data_v1');
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw);
            if (!parsed.metas) parsed.metas = [];
            if (!parsed.reserva) parsed.reserva = { movimentacoes: [], obs: '' };
            if (!parsed.categoriasFixas) parsed.categoriasFixas = getDefaultData().categoriasFixas;
            this.data = parsed;
            showToast('Dados do seu PC importados para a Nuvem com sucesso!', 'success');
            // Save to Supabase immediately
            this.save();
          } catch (err) {
            this.data = getDefaultData();
          }
        } else {
          this.data = getDefaultData();
        }
      }
      this.ensureAllMonths();
      return true;
    } catch (e) {
      console.error('Error in load:', e);
      return false;
    }
  }

  async save() {
    if (!this.userId || !sbClient) return;
    try {
      const { error } = await sbClient
        .from('finances')
        .upsert({ user_id: this.userId, data: this.data }, { onConflict: 'user_id' });
      
      if (error) {
        console.error('Error saving data:', error);
        showToast('Erro ao salvar na nuvem!', 'error');
      }
    } catch (e) {
      console.error('Error in save:', e);
      showToast('Erro ao salvar na nuvem!', 'error');
    }
  }

  ensureAllMonths() {
    for (let m = 1; m <= 12; m++) {
      if (!this.data.meses[m]) {
        this.data.meses[m] = getDefaultMonth();
      }
      // Ensure sub-objects
      const mes = this.data.meses[m];
      if (!mes.diarias) mes.diarias = { modo: 'automatico', diasPrevistos: {}, diasTrabalhados: {}, manual: {} };
      if (!mes.diarias.diasPrevistos) mes.diarias.diasPrevistos = {};
      if (!mes.diarias.diasTrabalhados) mes.diarias.diasTrabalhados = {};
      if (!mes.diarias.manual) mes.diarias.manual = {};
      if (!mes.gastosFixos) mes.gastosFixos = [];
      if (!mes.gastosVariaveis) mes.gastosVariaveis = [];
      if (!mes.outrasReceitas) mes.outrasReceitas = [];
      if (!mes.notas) mes.notas = '';
    }
  }

  getMonth(m) {
    return this.data.meses[m];
  }

  exportData() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `findash_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Dados exportados com sucesso!', 'success');
  }

  importData(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      if (imported.year && imported.meses) {
        this.data = imported;
        this.ensureAllMonths();
        this.save();
        showToast('Dados importados com sucesso!', 'success');
        return true;
      }
      showToast('Arquivo inválido!', 'error');
      return false;
    } catch (e) {
      showToast('Erro ao importar: ' + e.message, 'error');
      return false;
    }
  }

  clearAll() {
    this.data = getDefaultData();
    this.ensureAllMonths();
    this.save();
    showToast('Todos os dados foram apagados!', 'info');
  }
}

// ── UTILITY FUNCTIONS ──
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatMonth(monthIndex) {
  return `${MONTHS[monthIndex - 1]} ${YEAR}`;
}

function formatDate(isoDateStr) {
  if (!isoDateStr) return '-';
  const parts = isoDateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoDateStr;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(month, year) {
  return new Date(year, month - 1, 1).getDay();
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ── MAIN APP ──
class App {
  constructor() {
    this.dm = new DataManager();
    this.currentMonth = new Date().getMonth() + 1; // 1-based
    this.charts = {};
    this.selectedDay = null;
    this.editingMetaId = null;

    this.checkSession();
  }

  showAuthView(viewId) {
    const views = ['login', 'register', 'reset', 'update'];
    views.forEach(v => {
      const el = document.getElementById('auth' + v.charAt(0).toUpperCase() + v.slice(1) + 'View');
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById('auth' + viewId.charAt(0).toUpperCase() + viewId.slice(1) + 'View');
    if (target) target.style.display = 'block';
  }

  async checkSession() {
    if (!sbClient) return;
    
    // Check for password recovery event
    sbClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('authOverlay').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        this.showAuthView('update');
      }
    });

    // Check remember me email
    const savedEmail = localStorage.getItem('findash_remember_email');
    if (savedEmail) {
      const loginEmailEl = document.getElementById('loginEmail');
      if (loginEmailEl) loginEmailEl.value = savedEmail;
      const rememberEl = document.getElementById('rememberMe');
      if (rememberEl) rememberEl.checked = true;
    }

    const { data } = await sbClient.auth.getSession();
    if (data.session) {
      this.dm.userId = data.session.user.id;
      await this.dm.load();
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      this.init();
    } else {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
      this.showAuthView('login');
    }
  }

  async handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    if (!email || !password) return;

    try {
      showToast('Autenticando...', 'info');
      const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          showToast('E-mail ou senha incorretos.', 'error');
        } else {
          showToast('Erro: ' + error.message, 'error');
        }
      } else if (data.session) {
        if (rememberMe) {
          localStorage.setItem('findash_remember_email', email);
        } else {
          localStorage.removeItem('findash_remember_email');
        }
        showToast('Login efetuado com sucesso!', 'success');
        this.dm.userId = data.session.user.id;
        await this.dm.load();
        document.getElementById('authOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        this.init();
      }
    } catch (e) {
      console.error(e);
      showToast('Erro crítico no login', 'error');
    }
  }

  async handleRegister() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    if (!email || !password) return;

    try {
      showToast('Criando conta...', 'info');
      const { data, error } = await sbClient.auth.signUp({ email, password });
      
      if (error) {
        showToast('Erro ao criar conta: ' + error.message, 'error');
      } else {
        if (data.session) {
          showToast('Conta criada com sucesso!', 'success');
          this.dm.userId = data.session.user.id;
          await this.dm.load();
          document.getElementById('authOverlay').style.display = 'none';
          document.getElementById('appContainer').style.display = 'flex';
          this.init();
        } else {
          showToast('Conta criada! Por favor verifique seu email (ou desative a confirmação de E-mail no Supabase para login automático).', 'warning');
          this.showAuthView('login');
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao registrar', 'error');
    }
  }

  async handlePasswordReset() {
    const email = document.getElementById('resetEmail').value;
    if (!email) return;

    try {
      showToast('Enviando link...', 'info');
      const { error } = await sbClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href
      });
      
      if (error) {
        showToast('Erro ao enviar link: ' + error.message, 'error');
      } else {
        showToast('Link de recuperação enviado para seu e-mail!', 'success');
        this.showAuthView('login');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro na recuperação', 'error');
    }
  }

  async handleUpdatePassword() {
    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword) return;

    try {
      showToast('Atualizando senha...', 'info');
      const { error } = await sbClient.auth.updateUser({ password: newPassword });
      
      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error');
      } else {
        showToast('Senha atualizada com sucesso!', 'success');
        // Now logged in and password updated, proceed to dashboard
        document.getElementById('authOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        this.init();
      }
    } catch (e) {
      console.error(e);
      showToast('Erro crítico ao atualizar senha', 'error');
    }
  }

  async handleLogout() {
    await sbClient.auth.signOut();
    this.dm.userId = null;
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    this.showAuthView('login');
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerPassword').value = '';
    showToast('Deslogado com sucesso!', 'info');
  }

  init() {
    this.bindNavigation();
    this.bindMonthSelector();
    this.bindModals();
    this.bindExportImport();
    this.bindNotes();
    this.initTheme();
    this.renderAll();
  }

  // ── THEME ──
  initTheme() {
    const theme = localStorage.getItem('findash_theme') || 'dark';
    this.applyTheme(theme);
  }

  changeTheme(theme) {
    localStorage.setItem('findash_theme', theme);
    this.applyTheme(theme);
  }

  applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.className = 'theme-light';
    } else if (theme === 'amoled') {
      document.documentElement.className = 'theme-amoled';
    } else {
      document.documentElement.className = '';
    }
    const selector = document.getElementById('themeSelector');
    if (selector) selector.value = theme;
  }

  // ── NAVIGATION ──
  bindNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
        this.renderCurrentTab(btn.dataset.tab);
        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobileOverlay').classList.remove('show');
      });
    });

    // Mobile menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('mobileOverlay').classList.toggle('show');
    });
    document.getElementById('mobileOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('mobileOverlay').classList.remove('show');
    });

    // Diárias mode toggle
    document.getElementById('modeAuto').addEventListener('click', () => this.setDiariasMode('automatico'));
    document.getElementById('modeManual').addEventListener('click', () => this.setDiariasMode('manual'));
  }

  setDiariasMode(mode) {
    const mes = this.dm.getMonth(this.currentMonth);
    mes.diarias.modo = mode;
    this.dm.save();
    document.getElementById('modeAuto').classList.toggle('active', mode === 'automatico');
    document.getElementById('modeManual').classList.toggle('active', mode === 'manual');
    document.getElementById('diariasAutoSection').classList.toggle('hidden', mode !== 'automatico');
    document.getElementById('diariasManualSection').classList.toggle('hidden', mode !== 'manual');
    if (mode === 'manual') this.renderManualTable();
  }

  // ── MONTH SELECTOR ──
  bindMonthSelector() {
    document.getElementById('prevMonth').addEventListener('click', () => {
      if (this.currentMonth > 1) { this.currentMonth--; this.renderAll(); }
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      if (this.currentMonth < 12) { this.currentMonth++; this.renderAll(); }
    });
  }

  updateMonthLabel() {
    document.getElementById('currentMonthLabel').textContent = `${MONTHS[this.currentMonth - 1]} ${YEAR}`;
  }

  // ── NOTES ──
  bindNotes() {
    document.getElementById('dashNotas').addEventListener('input', (e) => {
      this.dm.getMonth(this.currentMonth).notas = e.target.value;
      this.dm.save();
    });
    document.getElementById('reservaObs').addEventListener('input', (e) => {
      this.dm.data.reserva.obs = e.target.value;
      this.dm.save();
    });
  }

  // ── EXPORT / IMPORT ──
  bindExportImport() {
    document.getElementById('btnExport').addEventListener('click', () => this.dm.exportData());
    document.getElementById('btnExportConfig').addEventListener('click', () => this.dm.exportData());

    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('btnImportConfig').addEventListener('click', () => document.getElementById('importConfigInput').click());

    const handleImport = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (this.dm.importData(ev.target.result)) {
          this.renderAll();
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    };

    document.getElementById('importFileInput').addEventListener('change', handleImport);
    document.getElementById('importConfigInput').addEventListener('change', handleImport);

    document.getElementById('btnClearData').addEventListener('click', () => {
      if (confirm('Tem certeza que deseja apagar TODOS os dados? Esta ação não pode ser desfeita!')) {
        this.dm.clearAll();
        this.renderAll();
      }
    });
  }

  // ── MODALS ──
  bindModals() {
    // Variable Expense
    document.getElementById('btnAddGastoVar').addEventListener('click', () => {
      document.getElementById('gastoVarDescricao').value = '';
      document.getElementById('gastoVarValor').value = '';
      document.getElementById('gastoVarData').value = `${YEAR}-${String(this.currentMonth).padStart(2,'0')}-01`;
      openModal('modalGastoVar');
    });
    document.getElementById('btnSalvarGastoVar').addEventListener('click', () => this.saveGastoVar());

    // Fixed Expense (add to current month)
    document.getElementById('btnAddGastoFixo').addEventListener('click', () => {
      document.getElementById('gastoFixoDescricao').value = '';
      document.getElementById('gastoFixoValor').value = '';
      document.getElementById('gastoFixoCompartilhado').checked = false;
      openModal('modalGastoFixo');
    });
    document.getElementById('btnSalvarGastoFixo').addEventListener('click', () => this.saveGastoFixo());

    // Other Income
    document.getElementById('btnAddReceita').addEventListener('click', () => {
      document.getElementById('receitaDescricao').value = '';
      document.getElementById('receitaValor').value = '';
      document.getElementById('receitaData').value = `${YEAR}-${String(this.currentMonth).padStart(2,'0')}-01`;
      openModal('modalReceita');
    });
    document.getElementById('btnSalvarReceita').addEventListener('click', () => this.saveReceita());

    // Reserve Movement
    document.getElementById('btnAddReserva').addEventListener('click', () => {
      document.getElementById('reservaTipo').value = 'deposito';
      document.getElementById('reservaValor').value = '';
      document.getElementById('reservaData').value = new Date().toISOString().slice(0,10);
      document.getElementById('reservaMovObs').value = '';
      openModal('modalReserva');
    });
    document.getElementById('btnSalvarReserva').addEventListener('click', () => this.saveReservaMov());

    // Goal
    const openMetaModal = () => {
      document.getElementById('metaNome').value = '';
      document.getElementById('metaValorMeta').value = '';
      document.getElementById('metaValorAtual').value = '0';
      document.getElementById('metaObs').value = '';
      openModal('modalMeta');
    };
    document.getElementById('btnAddMeta').addEventListener('click', openMetaModal);
    document.getElementById('btnAddMetaEmpty').addEventListener('click', openMetaModal);
    document.getElementById('btnSalvarMeta').addEventListener('click', () => this.saveMeta());

    // Update Goal
    document.getElementById('btnConfirmarAtualizarMeta').addEventListener('click', () => this.confirmUpdateMeta());

    // Edit Goal
    document.getElementById('btnSalvarEdicaoMeta').addEventListener('click', () => this.saveEdicaoMeta());

    // Save Work Day
    document.getElementById('btnSalvarDia').addEventListener('click', () => this.saveWorkDay());

    // Clinic
    document.getElementById('btnAddClinica').addEventListener('click', () => {
      document.getElementById('clinicaNome').value = '';
      document.getElementById('clinicaDiaria').value = '';
      document.getElementById('clinicaCor').value = '#448aff';
      openModal('modalClinica');
    });
    document.getElementById('btnSalvarClinica').addEventListener('click', () => this.saveClinica());

    // Fixed Category
    document.getElementById('btnAddCategoriaFixa').addEventListener('click', () => {
      document.getElementById('catFixaNome').value = '';
      document.getElementById('catFixaCompartilhado').checked = false;
      openModal('modalCategoriaFixa');
    });
    document.getElementById('btnSalvarCatFixa').addEventListener('click', () => this.saveCatFixa());
  }

  // ── SAVE FUNCTIONS ──
  saveGastoVar() {
    const desc = document.getElementById('gastoVarDescricao').value.trim();
    const valor = parseFloat(document.getElementById('gastoVarValor').value);
    const data = document.getElementById('gastoVarData').value;
    if (!desc || !valor) { showToast('Preencha todos os campos!', 'error'); return; }
    const mes = this.dm.getMonth(this.currentMonth);
    mes.gastosVariaveis.push({ id: generateId(), descricao: desc, valor, data });
    this.dm.save();
    closeModal('modalGastoVar');
    this.renderAll();
    showToast('Gasto variável adicionado!', 'success');
  }

  saveGastoFixo() {
    const descricao = document.getElementById('gastoFixoDescricao').value.trim();
    const valor = parseFloat(document.getElementById('gastoFixoValor').value) || 0;
    const vencimento = document.getElementById('gastoFixoVencimento').value.trim();
    const compartilhado = document.getElementById('gastoFixoCompartilhado').checked;
    if (!descricao || !valor) { showToast('Preencha todos os campos!', 'error'); return; }
    const mes = this.dm.getMonth(this.currentMonth);
    mes.gastosFixos.push({ id: generateId(), descricao, valor, compartilhado, pago: false, vencimento });
    this.dm.save();
    closeModal('modalGastoFixo');
    this.renderAll();
    showToast('Gasto fixo adicionado!', 'success');
  }

  saveReceita() {
    const desc = document.getElementById('receitaDescricao').value.trim();
    const valor = parseFloat(document.getElementById('receitaValor').value);
    const data = document.getElementById('receitaData').value;
    if (!desc || !valor) { showToast('Preencha todos os campos!', 'error'); return; }
    const mes = this.dm.getMonth(this.currentMonth);
    mes.outrasReceitas.push({ id: generateId(), descricao: desc, valor, data });
    this.dm.save();
    closeModal('modalReceita');
    this.renderAll();
    showToast('Receita adicionada!', 'success');
  }

  saveReservaMov() {
    const tipo = document.getElementById('reservaTipo').value;
    const valor = parseFloat(document.getElementById('reservaValor').value);
    const data = document.getElementById('reservaData').value;
    const obs = document.getElementById('reservaMovObs').value.trim();
    if (!valor) { showToast('Informe o valor!', 'error'); return; }
    this.dm.data.reserva.movimentacoes.push({ id: generateId(), tipo, valor, data, obs });
    this.dm.save();
    closeModal('modalReserva');
    this.renderAll();
    showToast('Movimentação registrada!', 'success');
  }

  saveMeta() {
    const nome = document.getElementById('metaNome').value.trim();
    const valorMeta = parseFloat(document.getElementById('metaValorMeta').value);
    const valorAtual = parseFloat(document.getElementById('metaValorAtual').value) || 0;
    const obs = document.getElementById('metaObs').value.trim();
    if (!nome || !valorMeta) { showToast('Preencha nome e valor da meta!', 'error'); return; }
    this.dm.data.metas.push({ id: generateId(), nome, valorMeta, valorAtual, obs, historico: [] });
    this.dm.save();
    closeModal('modalMeta');
    this.renderAll();
    showToast('Meta criada com sucesso!', 'success');
  }

  confirmUpdateMeta() {
    const addValor = parseFloat(document.getElementById('metaAddValor').value);
    const obs = document.getElementById('metaAddObs').value.trim();
    if (!addValor) { showToast('Informe o valor!', 'error'); return; }
    const meta = this.dm.data.metas.find(m => m.id === this.editingMetaId);
    if (meta) {
      meta.valorAtual += addValor;
      if (!meta.historico) meta.historico = [];
      meta.historico.push({ data: new Date().toISOString().slice(0,10), valor: addValor, obs });
      this.dm.save();
      closeModal('modalAtualizarMeta');
      this.renderAll();
      showToast('Meta atualizada!', 'success');
    }
  }

  saveWorkDay() {
    const mes = this.dm.getMonth(this.currentMonth);
    const day = this.selectedDay;
    const entries = [];

    document.querySelectorAll('#modalClinicasChecks .clinic-check-row').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]');
      const valInput = row.querySelector('.val-diaria');
      const comInput = row.querySelector('.val-comissao');
      if (cb && cb.checked && valInput) {
        entries.push({ 
          clinicaId: cb.dataset.clinicaId, 
          valor: parseFloat(valInput.value) || 0,
          comissao: parseFloat(comInput?.value) || 0
        });
      }
    });

    if (entries.length > 0) {
      mes.diarias.diasTrabalhados[day] = entries;
    } else {
      delete mes.diarias.diasTrabalhados[day];
    }

    this.dm.save();
    closeModal('modalDiaTrabalho');
    this.renderAll();
    showToast('Dia atualizado!', 'success');
  }

  saveClinica() {
    const nome = document.getElementById('clinicaNome').value.trim();
    const diaria = parseFloat(document.getElementById('clinicaDiaria').value);
    const cor = document.getElementById('clinicaCor').value;
    if (!nome || !diaria) { showToast('Preencha todos os campos!', 'error'); return; }
    const id = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    this.dm.data.clinicas.push({ id, nome, diariaPadrao: diaria, cor });
    this.dm.save();
    closeModal('modalClinica');
    this.renderAll();
    showToast('Clínica adicionada!', 'success');
  }

  saveCatFixa() {
    const nome = document.getElementById('catFixaNome').value.trim();
    const compartilhado = document.getElementById('catFixaCompartilhado').checked;
    if (!nome) { showToast('Informe o nome!', 'error'); return; }
    const id = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    this.dm.data.categoriasFixas.push({ id, nome, compartilhado });
    this.dm.save();
    closeModal('modalCategoriaFixa');
    this.renderAll();
    showToast('Categoria adicionada!', 'success');
  }

  // ── CALCULATIONS ──
  calcDiariasAuto(month) {
    const mes = this.dm.getMonth(month);
    const totals = {};
    this.dm.data.clinicas.forEach(c => { totals[c.id] = { dias: 0, valor: 0, comissao: 0, total: 0 }; });
    const worked = mes.diarias.diasTrabalhados || {};
    Object.values(worked).forEach(entries => {
      entries.forEach(e => {
        if (!totals[e.clinicaId]) totals[e.clinicaId] = { dias: 0, valor: 0, comissao: 0, total: 0 };
        totals[e.clinicaId].dias++;
        totals[e.clinicaId].valor += e.valor;
        totals[e.clinicaId].comissao += (e.comissao || 0);
        totals[e.clinicaId].total += (e.valor + (e.comissao || 0));
      });
    });
    return totals;
  }

  calcDiariasManual(month) {
    const mes = this.dm.getMonth(month);
    const manual = mes.diarias.manual || {};
    let total = 0;
    Object.values(manual).forEach(m => { total += (m.valorReal || 0); });
    return total;
  }

  calcTotalDiarias(month) {
    const mes = this.dm.getMonth(month);
    if (mes.diarias.modo === 'manual') {
      return this.calcDiariasManual(month);
    }
    const totals = this.calcDiariasAuto(month);
    return Object.values(totals).reduce((sum, t) => sum + t.total, 0);
  }

  calcTotalDespesas(month) {
    const mes = this.dm.getMonth(month);
    let total = 0;
    // Fixed expenses (my part)
    (mes.gastosFixos || []).forEach(g => {
      total += g.compartilhado ? g.valor / 2 : g.valor;
    });
    // Variable expenses
    (mes.gastosVariaveis || []).forEach(g => {
      total += g.valor;
    });
    return total;
  }

  // Salário do mês = diárias do mês ANTERIOR
  calcSalarioDoMes(month) {
    const prevMonth = month - 1;
    if (prevMonth < 1) return 0; // Janeiro não tem mês anterior no sistema
    return this.calcTotalDiarias(prevMonth);
  }

  // Produção do mês = diárias trabalhadas NESTE mês (será salário do próximo)
  calcProducaoDoMes(month) {
    return this.calcTotalDiarias(month);
  }

  calcTotalReceitas(month) {
    const salario = this.calcSalarioDoMes(month);
    const mes = this.dm.getMonth(month);
    let outras = 0;
    (mes.outrasReceitas || []).forEach(r => { outras += r.valor; });
    return salario + outras;
  }

  calcForecast(month) {
    const mes = this.dm.getMonth(month);
    const previstos = mes.diarias.diasPrevistos || {};
    let total = 0;
    this.dm.data.clinicas.forEach(c => {
      const dias = previstos[c.id] || 0;
      total += dias * c.diariaPadrao;
    });
    return total;
  }

  calcReserva() {
    let saldo = 0;
    let totalSaques = 0;
    let totalDepositos = 0;
    (this.dm.data.reserva.movimentacoes || []).forEach(m => {
      if (m.tipo === 'deposito') {
        saldo += m.valor;
        totalDepositos += m.valor;
      } else {
        saldo -= m.valor;
        totalSaques += m.valor;
      }
    });
    return { saldo, totalSaques, totalDepositos, faltaRepor: Math.max(0, -saldo) };
  }

  updateAppsScriptUrl(value) {
    this.dm.data.appsScriptUrl = value.trim();
    this.dm.save();
    showToast('URL do Apps Script salva!', 'success');
  }

  // ── RENDER ALL ──
  renderAll() {
    this.updateMonthLabel();
    this.renderDashboard();
    this.renderDiarias();
    this.renderDespesas();
    this.renderReceitas();
    this.renderInvestimentos();
    this.renderConfiguracoes();
  }

  renderCurrentTab(tab) {
    switch(tab) {
      case 'dashboard': this.renderDashboard(); break;
      case 'diarias': this.renderDiarias(); break;
      case 'despesas': this.renderDespesas(); break;
      case 'receitas': this.renderReceitas(); break;
      case 'investimentos': this.renderInvestimentos(); break;
      case 'configuracoes': this.renderConfiguracoes(); break;
    }
  }

  // ── DASHBOARD ──
  renderDashboard() {
    const m = this.currentMonth;
    const totalReceitas = this.calcTotalReceitas(m);
    const resumo = this.calcResumoDespesas(m);
    
    // Calcula investimentos do mês atual
    let investidoNoMes = 0;
    const currentMonthStr = String(m).padStart(2, '0');
    const prefix = `${YEAR}-${currentMonthStr}`;
    
    // Metas
    (this.dm.data.metas || []).forEach(meta => {
      (meta.historico || []).forEach(h => {
        if (h.data && h.data.startsWith(prefix)) investidoNoMes += h.valor;
      });
    });
    
    // Reserva
    (this.dm.data.reserva.movimentacoes || []).forEach(mov => {
      if (mov.data && mov.data.startsWith(prefix)) {
        if (mov.tipo === 'deposito') investidoNoMes += mov.valor;
        if (mov.tipo === 'saque') investidoNoMes -= mov.valor;
      }
    });

    const saldo = totalReceitas - resumo.total;
    const salarioDisponivel = totalReceitas - resumo.pago - investidoNoMes;
    const producaoMes = this.calcProducaoDoMes(m);
    const forecast = this.calcForecast(m);

    document.getElementById('dashTotalReceitas').textContent = formatCurrency(totalReceitas);
    document.getElementById('dashDespesasPagas').textContent = formatCurrency(resumo.pago);
    document.getElementById('dashFaltaPagar').textContent = formatCurrency(resumo.pendente);
    document.getElementById('dashSalarioDisponivel').textContent = formatCurrency(salarioDisponivel);
    
    // Check if the old dashSaldo exists
    const dashSaldoEl = document.getElementById('dashSaldo');
    if(dashSaldoEl) {
      dashSaldoEl.textContent = formatCurrency(saldo);
      dashSaldoEl.className = 'card-value ' + (saldo >= 0 ? 'value-positive' : 'value-negative');
    }

    document.getElementById('dashTotalDiarias').textContent = formatCurrency(producaoMes);

    // Saldo Disponivel color
    const salDispEl = document.getElementById('dashSalarioDisponivel');
    salDispEl.className = 'card-value ' + (salarioDisponivel >= 0 ? 'value-positive' : 'value-negative');

    // Forecast
    const pct = forecast > 0 ? Math.min(100, (producaoMes / forecast) * 100) : 0;
    document.getElementById('forecastPercent').textContent = `${pct.toFixed(1)}% alcançado`;
    document.getElementById('forecastProgressBar').style.width = `${pct}%`;

    // Forecast grid
    const fg = document.getElementById('forecastGrid');
    const mes = this.dm.getMonth(m);
    const previstos = mes.diarias.diasPrevistos || {};
    let fgHTML = '';
    this.dm.data.clinicas.forEach(c => {
      const dias = previstos[c.id] || 0;
      const previsto = dias * c.diariaPadrao;
      fgHTML += `
        <div class="forecast-item">
          <div class="forecast-label">${c.nome}</div>
          <div class="forecast-value" style="color:${c.cor}">${formatCurrency(previsto)}</div>
          <div class="fs-sm" style="color:var(--text-muted)">${dias} dias × ${formatCurrency(c.diariaPadrao)}</div>
        </div>`;
    });
    fgHTML += `
      <div class="forecast-item" style="border:1px solid var(--border-light);">
        <div class="forecast-label">Total Previsto</div>
        <div class="forecast-value value-positive">${formatCurrency(forecast)}</div>
        <div class="fs-sm" style="color:var(--text-muted)">Realizado: ${formatCurrency(producaoMes)}</div>
      </div>`;
    fg.innerHTML = fgHTML;

    // Notes
    document.getElementById('dashNotas').value = mes.notas || '';

    // Charts
    this.renderCharts();
  }

  // ── CHARTS ──
  renderCharts() {
    this.renderDespesasChart();
    this.renderReceitasDespesasChart();
    this.renderDiariasChart();
    this.renderSaldoChart();
  }

  renderDespesasChart() {
    const mes = this.dm.getMonth(this.currentMonth);
    const cats = {};

    (mes.gastosFixos || []).forEach(g => {
      const label = g.descricao;
      const val = g.compartilhado ? g.valor / 2 : g.valor;
      cats[label] = (cats[label] || 0) + val;
    });
    (mes.gastosVariaveis || []).forEach(g => {
      cats[g.descricao] = (cats[g.descricao] || 0) + g.valor;
    });

    const labels = Object.keys(cats);
    const values = Object.values(cats);
    const colors = ['#ff5252','#ff8a80','#b388ff','#448aff','#18ffff','#69f0ae','#ffd740','#ffab40','#ff6e40','#a1887f','#90a4ae','#e0e0e0'];

    if (this.charts.despesas) this.charts.despesas.destroy();

    const ctx = document.getElementById('chartDespesas');
    if (labels.length === 0) {
      this.charts.despesas = new Chart(ctx, { type: 'doughnut', data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.05)'] }] }, options: { plugins: { legend: { display: false } } } });
      return;
    }

    this.charts.despesas = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#e8e8f0', font: { family: 'Inter', size: 11 }, padding: 12 } },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` }
          }
        }
      }
    });
  }

  renderReceitasDespesasChart() {
    const receitas = [];
    const despesas = [];
    for (let m = 1; m <= 12; m++) {
      receitas.push(this.calcTotalReceitas(m));
      despesas.push(this.calcTotalDespesas(m));
    }

    if (this.charts.receitasDespesas) this.charts.receitasDespesas.destroy();

    this.charts.receitasDespesas = new Chart(document.getElementById('chartReceitasDespesas'), {
      type: 'bar',
      data: {
        labels: MONTHS.map(m => m.substring(0,3)),
        datasets: [
          { label: 'Receitas', data: receitas, backgroundColor: 'rgba(0, 230, 118, 0.6)', borderRadius: 6 },
          { label: 'Despesas', data: despesas, backgroundColor: 'rgba(255, 82, 82, 0.6)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter', size: 11 }, callback: v => formatCurrency(v) } }
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0', font: { family: 'Inter' } } },
          tooltip: { backgroundColor: '#1a1a2e', titleColor: '#e8e8f0', bodyColor: '#e8e8f0', callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` } }
        }
      }
    });
  }

  renderDiariasChart() {
    const totals = this.calcDiariasAuto(this.currentMonth);
    const clinicas = this.dm.data.clinicas;

    if (this.charts.diarias) this.charts.diarias.destroy();

    this.charts.diarias = new Chart(document.getElementById('chartDiarias'), {
      type: 'bar',
      data: {
        labels: clinicas.map(c => c.nome),
        datasets: [
          { label: 'Dias', data: clinicas.map(c => totals[c.id]?.dias || 0), backgroundColor: clinicas.map(c => c.cor + '99'), borderRadius: 6, yAxisID: 'y' },
          { label: 'Valor (R$)', data: clinicas.map(c => totals[c.id]?.valor || 0), backgroundColor: clinicas.map(c => c.cor), borderRadius: 6, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: { position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter' } }, title: { display: true, text: 'Dias', color: '#888' } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#888', font: { family: 'Inter' }, callback: v => formatCurrency(v) }, title: { display: true, text: 'Valor', color: '#888' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter' } } }
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0', font: { family: 'Inter' } } },
          tooltip: { backgroundColor: '#1a1a2e', titleColor: '#e8e8f0', bodyColor: '#e8e8f0' }
        }
      }
    });
  }

  renderSaldoChart() {
    const saldos = [];
    for (let m = 1; m <= 12; m++) {
      saldos.push(this.calcTotalReceitas(m) - this.calcTotalDespesas(m));
    }

    if (this.charts.saldo) this.charts.saldo.destroy();

    this.charts.saldo = new Chart(document.getElementById('chartSaldo'), {
      type: 'line',
      data: {
        labels: MONTHS.map(m => m.substring(0,3)),
        datasets: [{
          label: 'Saldo',
          data: saldos,
          borderColor: '#448aff',
          backgroundColor: 'rgba(68, 138, 255, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: saldos.map(s => s >= 0 ? '#00e676' : '#ff5252'),
          pointBorderColor: saldos.map(s => s >= 0 ? '#00e676' : '#ff5252'),
          pointRadius: 5,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter' } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { family: 'Inter' }, callback: v => formatCurrency(v) } }
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0', font: { family: 'Inter' } } },
          tooltip: { backgroundColor: '#1a1a2e', titleColor: '#e8e8f0', bodyColor: '#e8e8f0', callbacks: { label: c => `Saldo: ${formatCurrency(c.raw)}` } }
        }
      }
    });
  }

  // ── DIÁRIAS ──
  renderDiarias() {
    const mes = this.dm.getMonth(this.currentMonth);

    // Set mode
    const mode = mes.diarias.modo || 'automatico';
    document.getElementById('modeAuto').classList.toggle('active', mode === 'automatico');
    document.getElementById('modeManual').classList.toggle('active', mode === 'manual');
    document.getElementById('diariasAutoSection').classList.toggle('hidden', mode !== 'automatico');
    document.getElementById('diariasManualSection').classList.toggle('hidden', mode !== 'manual');

    // Forecast days config
    this.renderDiasPrevistosGrid();

    // Legend
    const legend = document.getElementById('clinicLegend');
    legend.innerHTML = this.dm.data.clinicas.map(c =>
      `<div class="legend-item"><div class="legend-dot" style="background:${c.cor}"></div>${c.nome} (${formatCurrency(c.diariaPadrao)})</div>`
    ).join('');

    // Calendar
    this.renderCalendar();

    // Accumulated
    this.renderAccumulated();

    // Manual
    if (mode === 'manual') this.renderManualTable();
  }

  renderDiasPrevistosGrid() {
    const mes = this.dm.getMonth(this.currentMonth);
    const previstos = mes.diarias.diasPrevistos || {};
    const totalsAuto = this.calcDiariasAuto(this.currentMonth);
    const grid = document.getElementById('diasPrevistosGrid');

    let totalPrevisto = 0;
    let totalRealizado = 0;

    let itemsHTML = this.dm.data.clinicas.map(c => {
      const dias = previstos[c.id] || 0;
      const previsto = dias * c.diariaPadrao;
      const realizado = totalsAuto[c.id]?.valor || 0;
      const diasReais = totalsAuto[c.id]?.dias || 0;
      const pct = previsto > 0 ? Math.min(100, (realizado / previsto) * 100) : 0;
      totalPrevisto += previsto;
      totalRealizado += realizado;
      return `
        <div class="forecast-item">
          <div class="forecast-label" style="color:${c.cor}">${c.nome}</div>
          <input type="number" class="form-input text-center" value="${dias}" min="0" max="31"
            style="width:80px;margin:8px auto 0;text-align:center;"
            data-clinica-id="${c.id}" 
            onchange="app.updateDiasPrevistos('${c.id}', this.value)"
            onkeydown="if(event.key==='Enter') this.blur()">
          <div class="fs-sm" style="color:var(--text-muted);margin-top:4px;">dias previstos</div>
          <div style="margin-top:8px;font-size:0.82rem;">
            <div style="color:var(--text-secondary);">Previsto: <strong style="color:${c.cor}">${formatCurrency(previsto)}</strong></div>
            <div style="color:var(--text-secondary);">Realizado: <strong class="value-positive">${formatCurrency(realizado)}</strong> <span style="color:var(--text-muted);">(${diasReais} dias)</span></div>
          </div>
          <div class="progress-bar-container" style="margin-top:6px;">
            <div class="progress-bar" style="height:6px;">
              <div class="progress-fill" style="width:${pct}%;${pct >= 100 ? 'background:linear-gradient(90deg,var(--green),var(--cyan));' : ''}"></div>
            </div>
            <div style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-top:3px;">${pct.toFixed(1)}%</div>
          </div>
        </div>`;
    }).join('');

    // Total card
    const totalPct = totalPrevisto > 0 ? Math.min(100, (totalRealizado / totalPrevisto) * 100) : 0;
    itemsHTML += `
      <div class="forecast-item" style="border:1px solid var(--border-light);background:linear-gradient(135deg,rgba(68,138,255,0.06),rgba(0,230,118,0.06));">
        <div class="forecast-label" style="font-weight:700;color:var(--text-primary);">💰 Salário Previsto</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--green);margin:8px 0;">${formatCurrency(totalPrevisto)}</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);">
          Realizado: <strong class="value-positive">${formatCurrency(totalRealizado)}</strong>
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
          Faltam: ${formatCurrency(Math.max(0, totalPrevisto - totalRealizado))}
        </div>
        <div class="progress-bar-container" style="margin-top:8px;">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${totalPct}%;${totalPct >= 100 ? 'background:linear-gradient(90deg,var(--green),var(--cyan));' : ''}"></div>
          </div>
          <div style="text-align:center;font-size:0.8rem;font-weight:700;color:${totalPct >= 100 ? 'var(--green)' : 'var(--blue)'};margin-top:4px;">${totalPct.toFixed(1)}% do salário alcançado</div>
        </div>
      </div>`;

    grid.innerHTML = itemsHTML;
  }

  updateDiasPrevistos(clinicaId, value) {
    const mes = this.dm.getMonth(this.currentMonth);
    mes.diarias.diasPrevistos[clinicaId] = parseInt(value) || 0;
    this.dm.save();
    this.renderDashboard();
  }

  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const mes = this.dm.getMonth(this.currentMonth);
    const daysInMonth = getDaysInMonth(this.currentMonth, YEAR);
    const firstDay = getFirstDayOfMonth(this.currentMonth, YEAR);
    const worked = mes.diarias.diasTrabalhados || {};

    let html = WEEKDAYS.map(d => `<div class="calendar-header-cell">${d}</div>`).join('');

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayEntries = worked[d] || [];
      const hasWork = dayEntries.length > 0;
      const dots = dayEntries.map(e => {
        const clinic = this.dm.data.clinicas.find(c => c.id === e.clinicaId);
        return `<div class="day-dot" style="background:${clinic?.cor || '#448aff'}"></div>`;
      }).join('');

      html += `
        <div class="calendar-day ${hasWork ? 'has-work' : ''}" onclick="app.openDayModal(${d})">
          <span class="day-number">${d}</span>
          ${dots ? `<div class="day-dots">${dots}</div>` : ''}
        </div>`;
    }

    grid.innerHTML = html;
  }

  openDayModal(day) {
    this.selectedDay = day;
    document.getElementById('modalDiaLabel').textContent = `${day} de ${MONTHS[this.currentMonth - 1]} de ${YEAR}`;

    const mes = this.dm.getMonth(this.currentMonth);
    const dayEntries = mes.diarias.diasTrabalhados?.[day] || [];

    const container = document.getElementById('modalClinicasChecks');
    container.innerHTML = this.dm.data.clinicas.map(c => {
      const entry = dayEntries.find(e => e.clinicaId === c.id);
      const checked = !!entry;
      const valor = entry ? entry.valor : c.diariaPadrao;
      const comissao = entry ? (entry.comissao || 0) : 0;
      return `
        <div class="clinic-check-row mb-2" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);">
          <label class="form-check" style="flex:1;min-width:140px;">
            <input type="checkbox" data-clinica-id="${c.id}" ${checked ? 'checked' : ''}>
            <span style="color:${c.cor};font-weight:600;">${c.nome}</span>
          </label>
          <div style="display:flex;gap:4px;">
            <input type="number" class="form-input val-diaria" value="${valor}" step="0.01" style="width:100px;" placeholder="Diária" title="Valor da Diária">
            <input type="number" class="form-input val-comissao" value="${comissao}" step="0.01" style="width:100px;" placeholder="Comissão" title="Valor da Comissão">
          </div>
        </div>`;
    }).join('');

    openModal('modalDiaTrabalho');
  }

  renderAccumulated() {
    const totals = this.calcDiariasAuto(this.currentMonth);
    const body = document.getElementById('acumuladoAutoBody');
    let html = '';
    let grandDias = 0, grandValor = 0, grandComissao = 0, grandTotal = 0;

    this.dm.data.clinicas.forEach(c => {
      const t = totals[c.id] || { dias: 0, valor: 0, comissao: 0, total: 0 };
      grandDias += t.dias;
      grandValor += t.valor;
      grandComissao += t.comissao;
      grandTotal += t.total;
      html += `
        <tr>
          <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
          <td class="text-right">${t.dias}</td>
          <td class="text-right">${formatCurrency(t.valor)}</td>
          <td class="text-right" style="color:var(--cyan)">${formatCurrency(t.comissao)}</td>
          <td class="text-right value-positive">${formatCurrency(t.total)}</td>
        </tr>`;
    });

    html += `
      <tr class="total-row">
        <td><strong>Total Geral</strong></td>
        <td class="text-right"><strong>${grandDias}</strong></td>
        <td class="text-right"><strong>${formatCurrency(grandValor)}</strong></td>
        <td class="text-right" style="color:var(--cyan)"><strong>${formatCurrency(grandComissao)}</strong></td>
        <td class="text-right value-positive"><strong>${formatCurrency(grandTotal)}</strong></td>
      </tr>`;

    body.innerHTML = html;
  }

  renderManualTable() {
    const mes = this.dm.getMonth(this.currentMonth);
    const manual = mes.diarias.manual || {};
    const body = document.getElementById('manualTableBody');
    let html = '';
    let totalPrev = 0, totalReal = 0;

    this.dm.data.clinicas.forEach(c => {
      const m = manual[c.id] || { diasPrevistos: 0, valorPrevisto: 0, diasReais: 0, valorReal: 0 };
      const diff = (m.valorReal || 0) - (m.valorPrevisto || 0);
      totalPrev += m.valorPrevisto || 0;
      totalReal += m.valorReal || 0;

      html += `
        <tr>
          <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
          <td class="text-right">
            <input type="number" class="editable-value" value="${m.diasPrevistos||0}" min="0"
              onchange="app.updateManual('${c.id}','diasPrevistos',this.value)">
          </td>
          <td class="text-right">
            <input type="number" class="editable-value" value="${m.valorPrevisto||0}" step="0.01"
              onchange="app.updateManual('${c.id}','valorPrevisto',this.value)">
          </td>
          <td class="text-right">
            <input type="number" class="editable-value" value="${m.diasReais||0}" min="0"
              onchange="app.updateManual('${c.id}','diasReais',this.value)">
          </td>
          <td class="text-right">
            <input type="number" class="editable-value" value="${m.valorReal||0}" step="0.01"
              onchange="app.updateManual('${c.id}','valorReal',this.value)">
          </td>
          <td class="text-right ${diff >= 0 ? 'value-positive' : 'value-negative'}">${formatCurrency(diff)}</td>
        </tr>`;
    });

    const totalDiff = totalReal - totalPrev;
    html += `
      <tr class="total-row">
        <td><strong>Total</strong></td>
        <td></td>
        <td class="text-right"><strong>${formatCurrency(totalPrev)}</strong></td>
        <td></td>
        <td class="text-right"><strong>${formatCurrency(totalReal)}</strong></td>
        <td class="text-right ${totalDiff >= 0 ? 'value-positive' : 'value-negative'}"><strong>${formatCurrency(totalDiff)}</strong></td>
      </tr>`;

    body.innerHTML = html;
  }

  updateManual(clinicaId, field, value) {
    const mes = this.dm.getMonth(this.currentMonth);
    if (!mes.diarias.manual[clinicaId]) {
      mes.diarias.manual[clinicaId] = { diasPrevistos: 0, valorPrevisto: 0, diasReais: 0, valorReal: 0 };
    }
    mes.diarias.manual[clinicaId][field] = parseFloat(value) || 0;
    this.dm.save();
    this.renderManualTable();
    this.renderDashboard();
  }

  calcResumoDespesas(month) {
    const mes = this.dm.getMonth(month);
    let pago = 0;
    let pendente = 0;

    // Variaveis assumed always paid instantly
    (mes.gastosVariaveis || []).forEach(g => {
      pago += g.valor;
    });

    (mes.gastosFixos || []).forEach(g => {
      const minhaParte = g.compartilhado ? g.valor / 2 : g.valor;
      if (g.pago) {
        pago += minhaParte;
      } else {
        pendente += minhaParte;
      }
    });

    return { pago, pendente, total: pago + pendente };
  }

  // ── DESPESAS ──
  renderDespesas() {
    const mes = this.dm.getMonth(this.currentMonth);
    const today = new Date().getDate();

    // Ensure fixed expenses from categories exist
    this.ensureFixedExpenses();

    // Sort gastos fixos: Pendentes (vencimento asc) > Pagos
    const sortedFixos = [...(mes.gastosFixos || [])].sort((a, b) => {
      if (a.pago !== b.pago) return a.pago ? 1 : -1;
      const vA = parseInt(a.vencimento) || 999;
      const vB = parseInt(b.vencimento) || 999;
      return vA - vB;
    });

    // Fixed expenses
    const fixBody = document.getElementById('gastosFixosBody');
    let fixHTML = '';
    let totalFixo = 0;

    sortedFixos.forEach(g => {
      const minhaParte = g.compartilhado ? g.valor / 2 : g.valor;
      totalFixo += minhaParte;
      
      let badge = '';
      if (g.pago) {
        badge = `<span class="shared-badge" style="background:var(--green-soft);color:var(--green);">🟢 Pago</span>`;
      } else if (g.vencimento) {
        const v = parseInt(g.vencimento);
        if (v < today) {
          badge = `<span class="shared-badge" style="background:var(--red-soft);color:var(--red);">🔴 Vencido (${v})</span>`;
        } else if (v === today) {
          badge = `<span class="shared-badge" style="background:var(--amber-soft);color:var(--amber);">🟡 Vence Hoje</span>`;
        } else if (v <= today + 5) {
          badge = `<span class="shared-badge" style="background:var(--amber-soft);color:var(--amber);">🟡 Vence dia ${v}</span>`;
        } else {
          badge = `<span class="shared-badge" style="background:rgba(255,255,255,0.05);color:var(--text-secondary);">⚪ Vence dia ${v}</span>`;
        }
      }

      fixHTML += `
        <tr style="opacity: ${g.pago ? '0.6' : '1'}; transition: opacity 0.2s;">
          <td>
            ${g.descricao}
            ${g.compartilhado ? '<span class="shared-badge">50/50</span>' : ''}
          </td>
          <td class="text-right">
            <input type="number" class="editable-value" style="width:50px;text-align:center;" value="${g.vencimento||''}" min="1" max="31" placeholder="-"
              onchange="app.updateGastoFixo('${g.id}','vencimento',this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
            <br/>${badge}
          </td>
          <td class="text-right">
            <input type="text" inputmode="decimal" class="editable-value value-negative" value="${g.valor||0}"
              onchange="app.updateGastoFixo('${g.id}','valor',this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td class="text-center">
            <input type="checkbox" ${g.compartilhado ? 'checked' : ''}
              onchange="app.updateGastoFixo('${g.id}','compartilhado',this.checked)">
          </td>
          <td class="text-right value-negative">${formatCurrency(minhaParte)}</td>
          <td class="text-center">
            <input type="checkbox" ${g.pago ? 'checked' : ''}
              onchange="app.updateGastoFixo('${g.id}','pago',this.checked)">
          </td>
          <td>
            <button class="btn-icon" onclick="app.deleteGastoFixo('${g.id}')" title="Remover">🗑️</button>
          </td>
        </tr>`;
    });

    fixHTML += `
      <tr class="total-row">
        <td colspan="4"><strong>Total Gastos Fixos (Minha Parte)</strong></td>
        <td class="text-right value-negative"><strong>${formatCurrency(totalFixo)}</strong></td>
        <td colspan="2"></td>
      </tr>`;
    fixBody.innerHTML = fixHTML || '<tr><td colspan="7" class="text-center" style="color:var(--text-muted);padding:24px;">Nenhum gasto fixo registrado</td></tr>';

    // Variable expenses
    const varBody = document.getElementById('gastosVarBody');
    let varHTML = '';
    let totalVar = 0;

    (mes.gastosVariaveis || []).forEach(g => {
      totalVar += g.valor;
      varHTML += `
        <tr>
          <td>
            <input type="text" class="editable-value" value="${g.descricao}"
              onchange="app.updateGastoVar('${g.id}', 'descricao', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td class="text-right">
            <input type="text" inputmode="decimal" class="editable-value value-negative" style="text-align:right" value="${g.valor}"
              onchange="app.updateGastoVar('${g.id}', 'valor', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td>
            <input type="date" class="editable-value" value="${g.data || ''}"
              onchange="app.updateGastoVar('${g.id}', 'data', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td><button class="btn-icon" onclick="app.deleteGastoVar('${g.id}')" title="Remover">🗑️</button></td>
        </tr>`;
    });

    if (mes.gastosVariaveis.length > 0) {
      varHTML += `
        <tr class="total-row">
          <td><strong>Total Gastos Variáveis</strong></td>
          <td class="text-right value-negative"><strong>${formatCurrency(totalVar)}</strong></td>
          <td colspan="2"></td>
        </tr>`;
    }
    varBody.innerHTML = varHTML || '<tr><td colspan="4" class="text-center" style="color:var(--text-muted);padding:24px;">Nenhum gasto variável neste mês</td></tr>';

    // Total
    document.getElementById('totalDespesasMes').textContent = formatCurrency(totalFixo + totalVar);
  }

  ensureFixedExpenses() {
    const mes = this.dm.getMonth(this.currentMonth);
    if (mes.gastosFixos.length === 0) {
      this.dm.data.categoriasFixas.forEach(cat => {
        mes.gastosFixos.push({
          id: generateId(),
          descricao: cat.nome,
          valor: 0,
          compartilhado: cat.compartilhado,
          pago: false
        });
      });
      this.dm.save();
    }
  }

  updateGastoFixo(id, field, value) {
    const mes = this.dm.getMonth(this.currentMonth);
    const g = mes.gastosFixos.find(x => x.id === id);
    if (g) {
      if (field === 'valor') {
        const strVal = String(value).replace(',', '.');
        g[field] = parseFloat(strVal) || 0;
      }
      else if (field === 'vencimento') g[field] = value;
      else g[field] = value;
      this.dm.save();
      this.renderDespesas();
      this.renderDashboard();
    }
  }

  deleteGastoFixo(id) {
    const mes = this.dm.getMonth(this.currentMonth);
    mes.gastosFixos = mes.gastosFixos.filter(g => g.id !== id);
    this.dm.save();
    this.renderDespesas();
    this.renderDashboard();
  }

  updateGastoVar(id, field, value) {
    const mes = this.dm.getMonth(this.currentMonth);
    const g = mes.gastosVariaveis.find(x => x.id === id);
    if (g) {
      if (field === 'valor') {
        const strVal = String(value).replace(',', '.');
        g[field] = parseFloat(strVal) || 0;
      } else {
        g[field] = value;
      }
      this.dm.save();
      this.renderDespesas();
      this.renderDashboard();
    }
  }

  deleteGastoVar(id) {
    const mes = this.dm.getMonth(this.currentMonth);
    mes.gastosVariaveis = mes.gastosVariaveis.filter(g => g.id !== id);
    this.dm.save();
    this.renderDespesas();
    this.renderDashboard();
  }

  // ── RECEITAS ──
  renderReceitas() {
    const m = this.currentMonth;
    const mes = this.dm.getMonth(m);
    const prevMonth = m - 1;
    const prevMonthName = prevMonth >= 1 ? MONTHS[prevMonth - 1] : '-';
    const nextMonth = m + 1;
    const nextMonthName = nextMonth <= 12 ? MONTHS[nextMonth - 1] : 'Janeiro (próx. ano)';

    // ── SECTION 1: Salary (diárias from PREVIOUS month) ──
    const dBody = document.getElementById('receitaDiariasBody');
    let dHTML = '';
    let totalSalario = 0;

    document.getElementById('salarioMesTitle').textContent = `💰 Salário do Mês (Diárias de ${prevMonthName})`;

    if (prevMonth >= 1) {
      const prevMes = this.dm.getMonth(prevMonth);
      document.getElementById('salarioMesDesc').textContent =
        `Valor referente às diárias trabalhadas em ${prevMonthName}`;

      if (prevMes.diarias.modo === 'manual') {
        const manual = prevMes.diarias.manual || {};
        this.dm.data.clinicas.forEach(c => {
          const md = manual[c.id] || { diasReais: 0, valorReal: 0 };
          totalSalario += md.valorReal || 0;
          dHTML += `
            <tr>
              <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
              <td class="text-right">${md.diasReais || 0}</td>
              <td class="text-right value-positive">${formatCurrency(md.valorReal || 0)}</td>
            </tr>`;
        });
      } else {
        const prevTotals = this.calcDiariasAuto(prevMonth);
        this.dm.data.clinicas.forEach(c => {
          const t = prevTotals[c.id] || { dias: 0, valor: 0, comissao: 0, total: 0 };
          totalSalario += t.total;
          dHTML += `
            <tr>
              <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
              <td class="text-right">${t.dias}</td>
              <td class="text-right">${formatCurrency(t.valor)}</td>
              <td class="text-right" style="color:var(--cyan)">${formatCurrency(t.comissao)}</td>
              <td class="text-right value-positive">${formatCurrency(t.total)}</td>
            </tr>`;
        });
      }
    } else {
      document.getElementById('salarioMesDesc').textContent =
        'Janeiro não possui mês anterior no sistema — preencha manualmente em "Outras Receitas" se necessário';
    }

    dHTML += `
      <tr class="total-row">
        <td><strong>Total Salário</strong></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="text-right value-positive"><strong>${formatCurrency(totalSalario)}</strong></td>
      </tr>`;
    dBody.innerHTML = dHTML;
    document.getElementById('receitaDiariasTotal').textContent = formatCurrency(totalSalario);

    // ── SECTION 2: Other income (this month) ──
    const oBody = document.getElementById('outrasReceitasBody');
    let oHTML = '';
    let totalOutras = 0;

    (mes.outrasReceitas || []).forEach(r => {
      totalOutras += r.valor;
      oHTML += `
        <tr>
          <td>
            <input type="text" class="editable-value" value="${r.descricao}"
              onchange="app.updateReceita('${r.id}', 'descricao', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td class="text-right">
            <input type="text" inputmode="decimal" class="editable-value value-positive" style="text-align:right" value="${r.valor}"
              onchange="app.updateReceita('${r.id}', 'valor', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td>
            <input type="date" class="editable-value" value="${r.data || ''}"
              onchange="app.updateReceita('${r.id}', 'data', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td><button class="btn-icon" onclick="app.deleteReceita('${r.id}')" title="Remover">🗑️</button></td>
        </tr>`;
    });

    if (mes.outrasReceitas.length > 0) {
      oHTML += `
        <tr class="total-row">
          <td><strong>Total Outras Receitas</strong></td>
          <td class="text-right value-positive"><strong>${formatCurrency(totalOutras)}</strong></td>
          <td colspan="2"></td>
        </tr>`;
    }
    oBody.innerHTML = oHTML || '<tr><td colspan="4" class="text-center" style="color:var(--text-muted);padding:24px;">Nenhuma receita extra neste mês</td></tr>';

    // ── TOTALS ──
    const totalReceitas = totalSalario + totalOutras;
    const resumo = this.calcResumoDespesas(this.currentMonth);
    const saldo = totalReceitas - resumo.total;

    document.getElementById('despesasPagasMes').textContent = formatCurrency(resumo.pago);
    document.getElementById('despesasPendentesMes').textContent = formatCurrency(resumo.pendente);
    document.getElementById('totalDespesasMes').textContent = formatCurrency(resumo.total);
    document.getElementById('totalReceitasMes').textContent = formatCurrency(totalReceitas);
    const saldoEl = document.getElementById('saldoMesReceitas');
    saldoEl.textContent = formatCurrency(saldo);
    saldoEl.className = 'card-value ' + (saldo >= 0 ? 'value-positive' : 'value-negative');

    // ── SECTION 3: Production this month (for next month's salary) ──
    const pBody = document.getElementById('producaoMesBody');
    let pHTML = '';
    let totalProducao = 0;

    document.getElementById('producaoMesTitle').textContent =
      `📋 Produção de ${MONTHS[m - 1]} (será salário de ${nextMonthName})`;
    document.getElementById('producaoMesDesc').textContent =
      `Diárias trabalhadas neste mês — esse valor será sua receita em ${nextMonthName}`;

    if (mes.diarias.modo === 'manual') {
      const manual = mes.diarias.manual || {};
      this.dm.data.clinicas.forEach(c => {
        const md = manual[c.id] || { diasReais: 0, valorReal: 0 };
        totalProducao += md.valorReal || 0;
        pHTML += `
          <tr>
            <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
            <td class="text-right">${md.diasReais || 0}</td>
            <td class="text-right" style="color:var(--amber)">${formatCurrency(md.valorReal || 0)}</td>
          </tr>`;
      });
    } else {
      const curTotals = this.calcDiariasAuto(m);
      this.dm.data.clinicas.forEach(c => {
        const t = curTotals[c.id] || { dias: 0, valor: 0, comissao: 0, total: 0 };
        totalProducao += t.total;
        pHTML += `
          <tr>
            <td><span style="color:${c.cor};font-weight:600;">${c.nome}</span></td>
            <td class="text-right">${t.dias}</td>
            <td class="text-right">${formatCurrency(t.valor)}</td>
            <td class="text-right" style="color:var(--cyan)">${formatCurrency(t.comissao)}</td>
            <td class="text-right" style="color:var(--amber)">${formatCurrency(t.total)}</td>
          </tr>`;
      });
    }

    pHTML += `
      <tr class="total-row">
        <td><strong>Total Produção</strong></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="text-right" style="color:var(--amber)"><strong>${formatCurrency(totalProducao)}</strong></td>
      </tr>`;
    pBody.innerHTML = pHTML;
    document.getElementById('producaoMesTotal').textContent = formatCurrency(totalProducao);
  }

  deleteReceita(id) {
    const mes = this.dm.getMonth(this.currentMonth);
    mes.outrasReceitas = mes.outrasReceitas.filter(r => r.id !== id);
    this.dm.save();
    this.renderReceitas();
    this.renderDashboard();
  }

  updateReceita(id, field, value) {
    const mes = this.dm.getMonth(this.currentMonth);
    const r = mes.outrasReceitas.find(x => x.id === id);
    if (r) {
      if (field === 'valor') {
        const strVal = String(value).replace(',', '.');
        r[field] = parseFloat(strVal) || 0;
      } else {
        r[field] = value;
      }
      this.dm.save();
      this.renderReceitas();
      this.renderDashboard();
    }
  }

  // ── INVESTIMENTOS ──
  renderInvestimentos() {
    const appsScriptInput = document.getElementById('appsScriptUrlInput');
    if (appsScriptInput) appsScriptInput.value = this.dm.data.appsScriptUrl || '';

    
    // Reserve
    const res = this.calcReserva();
    document.getElementById('reservaSaldo').textContent = formatCurrency(res.saldo);
    document.getElementById('reservaSaldo').className = `stat-value ${res.saldo >= 0 ? 'value-positive' : 'value-negative'}`;
    document.getElementById('reservaSaques').textContent = formatCurrency(res.totalSaques);
    document.getElementById('reservaFalta').textContent = formatCurrency(res.faltaRepor);

    // Reserve movements
    const movBody = document.getElementById('reservaMovBody');
    const movs = [...(this.dm.data.reserva.movimentacoes || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    let movHTML = '';
    movs.forEach(m => {
      movHTML += `
        <tr>
          <td>
            <input type="date" class="editable-value" value="${m.data || ''}"
              onchange="app.updateReservaMov('${m.id}', 'data', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td>
            <select class="editable-value ${m.tipo === 'deposito' ? 'value-positive' : 'value-negative'}" style="width:110px;" onchange="app.updateReservaMov('${m.id}', 'tipo', this.value)">
              <option value="deposito" ${m.tipo === 'deposito' ? 'selected' : ''}>⬆ Depósito</option>
              <option value="saque" ${m.tipo === 'saque' ? 'selected' : ''}>⬇ Saque</option>
            </select>
          </td>
          <td class="text-right">
            <input type="text" inputmode="decimal" class="editable-value ${m.tipo === 'deposito' ? 'value-positive' : 'value-negative'}" style="text-align:right" value="${m.valor}"
              onchange="app.updateReservaMov('${m.id}', 'valor', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td>
            <input type="text" class="editable-value fs-sm" style="color:var(--text-secondary);max-width:200px;" value="${m.obs || ''}" placeholder="-"
              onchange="app.updateReservaMov('${m.id}', 'obs', this.value)"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td><button class="btn-icon" onclick="app.deleteReservaMov('${m.id}')" title="Remover">🗑️</button></td>
        </tr>`;
    });
    movBody.innerHTML = movHTML || '<tr><td colspan="5" class="text-center" style="color:var(--text-muted);padding:24px;">Nenhuma movimentação registrada</td></tr>';

    // Reserve notes
    document.getElementById('reservaObs').value = this.dm.data.reserva.obs || '';

    // Goals
    this.renderMetas();
  }

  deleteReservaMov(id) {
    this.dm.data.reserva.movimentacoes = this.dm.data.reserva.movimentacoes.filter(m => m.id !== id);
    this.dm.save();
    this.renderInvestimentos();
  }

  updateReservaMov(id, field, value) {
    const mov = this.dm.data.reserva.movimentacoes.find(x => x.id === id);
    if (mov) {
      if (field === 'valor') {
        const strVal = String(value).replace(',', '.');
        mov[field] = parseFloat(strVal) || 0;
      } else {
        mov[field] = value;
      }
      this.dm.save();
      this.renderInvestimentos();
      this.renderDashboard();
    }
  }

  renderMetas() {
    const container = document.getElementById('metasContainer');
    const metas = this.dm.data.metas || [];
    const emptyState = document.getElementById('emptyMetas');

    if (metas.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = metas.map(meta => {
      const pct = meta.valorMeta > 0 ? Math.min(100, (meta.valorAtual / meta.valorMeta) * 100) : 0;
      const histHTML = (meta.historico || []).slice(-5).map(h =>
        `<div class="fs-sm" style="color:var(--text-muted);padding:4px 0;border-bottom:1px solid var(--border);">
          ${h.data} — ${formatCurrency(h.valor)} ${h.obs ? '— ' + h.obs : ''}
        </div>`
      ).join('');

      // Calculate investido no mês
      const currentMonthStr = String(this.currentMonth).padStart(2, '0');
      const prefix = `${YEAR}-${currentMonthStr}`;
      let investidoMes = 0;
      (meta.historico || []).forEach(h => {
        if (h.data && h.data.startsWith(prefix)) {
          investidoMes += h.valor;
        }
      });

      return `
        <div class="goal-card">
          <div class="goal-header">
            <div class="goal-name">🎯 ${meta.nome}</div>
            <div class="flex gap-1">
              <button class="btn btn-success btn-sm" onclick="app.openUpdateMeta('${meta.id}')">+ Adicionar</button>
              <button class="btn-icon" onclick="app.openModalEditarMeta('${meta.id}')" title="Editar">✏️</button>
              <button class="btn-icon" onclick="app.deleteMeta('${meta.id}')" title="Excluir">🗑️</button>
            </div>
          </div>
          <div class="goal-values">
            <span>Atual: <strong class="value-positive">${formatCurrency(meta.valorAtual)}</strong></span>
            <span>Meta: <strong>${formatCurrency(meta.valorMeta)}</strong></span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="progress-label mt-1">
              <span>${pct.toFixed(1)}% concluído</span>
              <span>Faltam ${formatCurrency(Math.max(0, meta.valorMeta - meta.valorAtual))}</span>
            </div>
          </div>
          <div style="margin-top:8px; font-size:0.85rem; color:var(--text-secondary);">
            Investido neste mês: <strong class="value-positive">${formatCurrency(investidoMes)}</strong>
          </div>
          ${meta.obs ? `<div class="obs-block mt-2">${meta.obs}</div>` : ''}
          ${histHTML ? `<div class="mt-2"><div class="fs-sm fw-bold mb-1" style="color:var(--text-secondary);">Últimos aportes:</div>${histHTML}</div>` : ''}
        </div>`;
    }).join('');
  }

  openUpdateMeta(id) {
    this.editingMetaId = id;
    document.getElementById('metaAddValor').value = '';
    document.getElementById('metaAddObs').value = '';
    openModal('modalAtualizarMeta');
  }

  openModalEditarMeta(id) {
    this.editingMetaId = id;
    const meta = this.dm.data.metas.find(m => m.id === id);
    if (meta) {
      document.getElementById('editMetaNome').value = meta.nome || '';
      document.getElementById('editMetaValorMeta').value = meta.valorMeta || 0;
      document.getElementById('editMetaValorAtual').value = meta.valorAtual || 0;
      document.getElementById('editMetaObs').value = meta.obs || '';
      openModal('modalEditarMeta');
    }
  }

  saveEdicaoMeta() {
    const nome = document.getElementById('editMetaNome').value.trim();
    const valorMeta = parseFloat(document.getElementById('editMetaValorMeta').value);
    const valorAtual = parseFloat(document.getElementById('editMetaValorAtual').value) || 0;
    const obs = document.getElementById('editMetaObs').value.trim();
    
    if (!nome || !valorMeta) { showToast('Preencha nome e valor da meta!', 'error'); return; }
    
    const meta = this.dm.data.metas.find(m => m.id === this.editingMetaId);
    if (meta) {
      meta.nome = nome;
      meta.valorMeta = valorMeta;
      meta.valorAtual = valorAtual;
      meta.obs = obs;
      this.dm.save();
      closeModal('modalEditarMeta');
      this.renderMetas();
      this.renderDashboard();
      showToast('Meta atualizada!', 'success');
    }
  }

  deleteMeta(id) {
    if (confirm('Excluir esta meta?')) {
      this.dm.data.metas = this.dm.data.metas.filter(m => m.id !== id);
      this.dm.save();
      this.renderMetas();
      showToast('Meta excluída!', 'info');
    }
  }

  // ── CONFIGURAÇÕES ──
  renderConfiguracoes() {
    // Clinics
    const cBody = document.getElementById('clinicasConfigBody');
    cBody.innerHTML = this.dm.data.clinicas.map(c => `
      <tr>
        <td style="font-weight:600;">${c.nome}</td>
        <td class="text-right">
          <input type="number" class="editable-value" value="${c.diariaPadrao}" step="0.01"
            onchange="app.updateClinicaDiaria('${c.id}',this.value)">
        </td>
        <td>
          <input type="color" value="${c.cor}" style="width:36px;height:28px;border:none;cursor:pointer;background:transparent;"
            onchange="app.updateClinicaCor('${c.id}',this.value)">
        </td>
        <td>
          <button class="btn-icon" onclick="app.deleteClinica('${c.id}')" title="Remover">🗑️</button>
        </td>
      </tr>
    `).join('');

    // Fixed categories
    const catBody = document.getElementById('categoriasFixasBody');
    catBody.innerHTML = this.dm.data.categoriasFixas.map(cat => `
      <tr>
        <td>${cat.nome}</td>
        <td class="text-center">
          <input type="checkbox" ${cat.compartilhado ? 'checked' : ''}
            onchange="app.updateCatFixaCompart('${cat.id}',this.checked)">
        </td>
        <td>
          <button class="btn-icon" onclick="app.deleteCatFixa('${cat.id}')" title="Remover">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  updateClinicaDiaria(id, value) {
    const clinic = this.dm.data.clinicas.find(c => c.id === id);
    if (clinic) { clinic.diariaPadrao = parseFloat(value) || 0; this.dm.save(); }
  }

  updateClinicaCor(id, value) {
    const clinic = this.dm.data.clinicas.find(c => c.id === id);
    if (clinic) { clinic.cor = value; this.dm.save(); this.renderAll(); }
  }

  deleteClinica(id) {
    if (confirm('Remover esta clínica?')) {
      this.dm.data.clinicas = this.dm.data.clinicas.filter(c => c.id !== id);
      this.dm.save();
      this.renderAll();
    }
  }

  updateCatFixaCompart(id, value) {
    const cat = this.dm.data.categoriasFixas.find(c => c.id === id);
    if (cat) { cat.compartilhado = value; this.dm.save(); }
  }

  deleteCatFixa(id) {
    if (confirm('Remover esta categoria?')) {
      this.dm.data.categoriasFixas = this.dm.data.categoriasFixas.filter(c => c.id !== id);
      this.dm.save();
      this.renderConfiguracoes();
    }
  }

  // ── EXPORTAÇÃO ──
  generateReportHTML(month) {
    const totalReceitas = this.calcTotalReceitas(month);
    const resumo = this.calcResumoDespesas(month);
    const producaoMes = this.calcProducaoDoMes(month);
    const saldo = totalReceitas - resumo.total;
    const salarioDisponivel = totalReceitas - resumo.pago;
    
    const m = this.dm.getMonth(month);

    let html = `
      <div style="max-width: 800px; margin: 0 auto; color: #333; font-family: 'Inter', Arial, sans-serif;">
        <h1 style="color: #111128; border-bottom: 2px solid #448aff; padding-bottom: 10px;">Relatório Financeiro</h1>
        <p style="color: #666; font-size: 14px;">Período: ${formatMonth(month)}</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 15px; background: #f0fdf4; border: 1px solid #ddd; width: 50%;">
              <div style="font-size: 12px; color: #555; text-transform: uppercase; font-weight: bold;">Receitas Totais</div>
              <div style="font-size: 24px; color: #00e676; font-weight: bold; margin-top: 5px;">${formatCurrency(totalReceitas)}</div>
            </td>
            <td style="padding: 15px; background: #fff5f5; border: 1px solid #ddd; width: 50%;">
              <div style="font-size: 12px; color: #555; text-transform: uppercase; font-weight: bold;">Despesas Pagas</div>
              <div style="font-size: 24px; color: #ff5252; font-weight: bold; margin-top: 5px;">${formatCurrency(resumo.pago)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px; background: #f8f9fa; border: 1px solid #ddd;">
              <div style="font-size: 12px; color: #555; text-transform: uppercase; font-weight: bold;">Produção em Clínicas</div>
              <div style="font-size: 24px; color: #ffab40; font-weight: bold; margin-top: 5px;">${formatCurrency(producaoMes)}</div>
            </td>
            <td style="padding: 15px; background: #f4f6ff; border: 1px solid #ddd;">
              <div style="font-size: 12px; color: #555; text-transform: uppercase; font-weight: bold;">Salário Disponível</div>
              <div style="font-size: 24px; color: #448aff; font-weight: bold; margin-top: 5px;">${formatCurrency(salarioDisponivel)}</div>
            </td>
          </tr>
        </table>

        <h3 style="margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #111128;">Gastos Fixos (Minha Parte)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">Descrição</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Vencimento</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Valor</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (m.gastosFixos && m.gastosFixos.length > 0) {
      m.gastosFixos.forEach(g => {
        const minhaParte = g.compartilhado ? g.valor / 2 : g.valor;
        const status = g.pago ? 'Pago' : 'Pendente';
        const cor = g.pago ? '#00e676' : '#ff5252';
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${g.descricao}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${g.vencimento ? 'Dia ' + g.vencimento : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(minhaParte)}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: ${cor}; font-weight: bold;">${status}</td>
          </tr>
        `;
      });
    } else {
      html += `<tr><td colspan="4" style="padding: 8px; border: 1px solid #ddd; text-align: center;">Nenhum gasto fixo cadastrado.</td></tr>`;
    }

    html += `
          </tbody>
        </table>

        <h3 style="margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #111128;">Gastos Variáveis</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">Descrição</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Data</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (m.gastosVariaveis && m.gastosVariaveis.length > 0) {
      m.gastosVariaveis.forEach(g => {
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${g.descricao}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(g.data)}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(g.valor)}</td>
          </tr>
        `;
      });
    } else {
      html += `<tr><td colspan="3" style="padding: 8px; border: 1px solid #ddd; text-align: center;">Nenhum gasto variável.</td></tr>`;
    }

    html += `
          </tbody>
        </table>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; text-align: right; color: #777; font-size: 12px;">
          Gerado pelo Dashboard Financeiro Pessoal em ${new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>
    `;

    return html;
  }

  exportPDF() {
    try {
      const reportHTML = this.generateReportHTML(this.currentMonth);
      document.getElementById('reportContent').innerHTML = reportHTML;
      window.print();
    } catch (e) {
      console.error('Erro ao gerar relatório HTML:', e);
      alert('Ocorreu um erro interno: ' + e.message);
    }
  }

  async exportGoogleDocs() {
    const url = this.dm.data.appsScriptUrl;
    if (!url) {
      showToast('Configure a URL do Google Apps Script primeiro na aba de Configurações!', 'error');
      return;
    }

    const m = this.currentMonth;
    const mes = this.dm.getMonth(m);
    const totalReceitas = this.calcTotalReceitas(m);
    const resumo = this.calcResumoDespesas(m);
    const salarioDisponivel = totalReceitas - resumo.pago;
    
    // Prepare diarias
    const diarias = [];
    if (mes.diarias.modo === 'automatico') {
      const dAuto = this.calcDiariasAuto(m);
      this.dm.data.clinicas.forEach(c => {
        if (dAuto[c.id] && dAuto[c.id].dias > 0) {
          diarias.push(`${c.nome}: ${dAuto[c.id].dias} dias - ${formatCurrency(dAuto[c.id].total)}`);
        }
      });
    } else {
      Object.values(mes.diarias.manual || {}).forEach(d => {
        diarias.push(`${d.clinica || 'Extra'}: ${d.dias || 1} dias - ${formatCurrency(d.valorReal)}`);
      });
    }

    // Prepare outras receitas
    const outrasReceitas = [];
    (mes.outrasReceitas || []).forEach(r => {
      outrasReceitas.push(`${r.descricao}: ${formatCurrency(r.valor)}`);
    });

    // Prepare gastos fixos
    const gastosFixos = [];
    (mes.gastosFixos || []).forEach(g => {
      const valorStr = formatCurrency(g.compartilhado ? g.valor / 2 : g.valor);
      const statusStr = g.pago ? 'Pago' : 'Pendente';
      gastosFixos.push(`${g.descricao}: ${valorStr} (${statusStr})`);
    });

    // Prepare gastos variáveis
    const gastosVariaveis = [];
    (mes.gastosVariaveis || []).forEach(g => {
      gastosVariaveis.push(`${g.descricao}: ${formatCurrency(g.valor)} - Data: ${g.data || '-'}`);
    });

    // Prepare investimentos
    const res = this.calcReserva();
    const investimentos = {
      reservaSaldo: formatCurrency(res.saldo),
      metas: (this.dm.data.metas || []).map(meta => {
        const pct = meta.valorMeta > 0 ? (meta.valorAtual / meta.valorMeta * 100).toFixed(1) : 0;
        return `${meta.nome}: ${formatCurrency(meta.valorAtual)} de ${formatCurrency(meta.valorMeta)} (${pct}%)`;
      })
    };

    const payload = {
      mes: formatMonth(m),
      totalReceitas: formatCurrency(totalReceitas),
      despesasPagas: formatCurrency(resumo.pago),
      faltaPagar: formatCurrency(resumo.pendente),
      salarioDisponivel: formatCurrency(salarioDisponivel),
      diarias: diarias,
      outrasReceitas: outrasReceitas,
      gastosFixos: gastosFixos,
      gastosVariaveis: gastosVariaveis,
      investimentos: investimentos
    };

    showToast('Enviando para o Google Docs...', 'info');
    try {
      // Uso de GET para contornar problemas de CORS pesados em arquivos locais (file:///)
      const finalUrl = url + '?data=' + encodeURIComponent(JSON.stringify(payload));
      const response = await fetch(finalUrl, { method: 'GET' });
      
      const result = await response.json();
      if (result.success) {
        showToast('Enviado com sucesso!', 'success');
        if (result.url) {
          setTimeout(() => window.open(result.url, '_blank'), 1000);
        }
      } else {
        showToast('Erro do servidor: ' + result.error, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de conexão. Verifique se copiou a URL inteira e se permitiu acesso para "Qualquer pessoa".', 'error');
    }
  }
}

// ── INITIALIZE ──
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  window.app = app;
});
