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
    perfil: { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 },
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
    categoriasVariaveis: [
      { id: 'alimentacao', nome: 'Alimentação', orcamento: 500 },
      { id: 'lazer', nome: 'Lazer', orcamento: 300 },
      { id: 'transporte', nome: 'Transporte', orcamento: 200 }
    ],
    cartoes: [],
    comprasCartao: [],
    groqApiKey: '',
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
        if (!this.data.perfil) this.data.perfil = { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 };
        if (!this.data.metas) this.data.metas = [];
        if (!this.data.reserva) this.data.reserva = { movimentacoes: [], obs: '' };
        if (!this.data.categoriasFixas) this.data.categoriasFixas = getDefaultData().categoriasFixas;
        if (!this.data.categoriasVariaveis) this.data.categoriasVariaveis = getDefaultData().categoriasVariaveis;
        if (!this.data.cartoes) this.data.cartoes = [];
        if (!this.data.comprasCartao) this.data.comprasCartao = [];
      } else {
        // Auto-Migration from localStorage
        const localRaw = localStorage.getItem('findash_data_v1');
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw);
            if (!parsed.perfil) parsed.perfil = { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 };
            if (!parsed.metas) parsed.metas = [];
            if (!parsed.reserva) parsed.reserva = { movimentacoes: [], obs: '' };
            if (!parsed.categoriasFixas) parsed.categoriasFixas = getDefaultData().categoriasFixas;
            if (!parsed.categoriasVariaveis) parsed.categoriasVariaveis = getDefaultData().categoriasVariaveis;
            if (!parsed.cartoes) parsed.cartoes = [];
            if (!parsed.comprasCartao) parsed.comprasCartao = [];
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
        if (!this.data.perfil) this.data.perfil = { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 };
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
let isPrivacyMode = localStorage.getItem('findash_privacy') === 'true';

function formatCurrency(value) {
  if (isPrivacyMode) return 'R$ ****';
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
    this.conversationHistory = [];

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
    
    let isRecovery = window.location.hash.includes('type=recovery');

    // Check for password recovery event
    sbClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isRecovery = true;
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
    
    if (isRecovery) {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
      this.showAuthView('update');
      return;
    }

    if (data.session) {
      this.dm.userId = data.session.user.id;
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      document.getElementById('appContainer').classList.add('loading-data');
      await this.dm.load();
      document.getElementById('appContainer').classList.remove('loading-data');
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
        document.getElementById('authOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        document.getElementById('appContainer').classList.add('loading-data');
        await this.dm.load();
        document.getElementById('appContainer').classList.remove('loading-data');
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
          document.getElementById('authOverlay').style.display = 'none';
          document.getElementById('appContainer').style.display = 'flex';
          document.getElementById('appContainer').classList.add('loading-data');
          await this.dm.load();
          document.getElementById('appContainer').classList.remove('loading-data');
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
      
      // Explicitly set session from URL hash just in case Supabase hasn't persisted it
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      
      if (accessToken && refreshToken) {
        await sbClient.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
      }

      const { error } = await sbClient.auth.updateUser({ password: newPassword });
      
      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error');
      } else {
        showToast('Senha atualizada com sucesso!', 'success');
        // Clear the recovery hash so refresh doesn't trigger recovery mode
        history.replaceState(null, null, ' ');
        
        // Load user data before proceeding to dashboard
        const { data: sessionData } = await sbClient.auth.getSession();
        if (sessionData && sessionData.session) {
          this.dm.userId = sessionData.session.user.id;
          document.getElementById('authOverlay').style.display = 'none';
          document.getElementById('appContainer').style.display = 'flex';
          document.getElementById('appContainer').classList.add('loading-data');
          await this.dm.load();
          document.getElementById('appContainer').classList.remove('loading-data');
        } else {
          document.getElementById('authOverlay').style.display = 'none';
          document.getElementById('appContainer').style.display = 'flex';
        }

        // Now logged in and password updated, proceed to dashboard
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
    if (!this.dm.data.categoriasVariaveis || this.dm.data.categoriasVariaveis.length === 0) {
      this.dm.data.categoriasVariaveis = [
        { id: 'alimentacao', nome: 'Alimentação', orcamento: 500 },
        { id: 'transporte', nome: 'Transporte', orcamento: 200 }
      ];
      this.dm.save();
    }
    
    this.bindNavigation();
    this.bindMonthSelector();
    this.bindModals();
    this.bindExportImport();
    this.bindNotes();
    this.initTheme();
    this.updateProfileUI();
    this.updatePrivacyIcon();
    this.renderAll();
  }

  togglePrivacy() {
    isPrivacyMode = !isPrivacyMode;
    localStorage.setItem('findash_privacy', isPrivacyMode);
    this.updatePrivacyIcon();
    this.renderAll();
  }

  updatePrivacyIcon() {
    const btn = document.getElementById('btnPrivacy');
    if (btn) btn.innerHTML = isPrivacyMode ? '🙈' : '👁️';
  }

  // ── THEME ──
  initTheme() {
    const theme = localStorage.getItem('findash_theme') || 'dark';
    this.applyTheme(theme);
  }

  changeTheme(theme) {
    localStorage.setItem('findash_theme', theme);
    this.applyTheme(theme);
    this.renderAll();
  }

  getChartColors() {
    const isLight = document.documentElement.classList.contains('theme-light');
    return {
      text: isLight ? '#1a1a24' : '#e8e8f0',
      grid: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
      tooltipBg: isLight ? 'rgba(255,255,255,0.95)' : '#1a1a2e',
      tooltipText: isLight ? '#1a1a24' : '#e8e8f0',
      tooltipBorder: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
    };
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
    
    const authSelector = document.getElementById('authThemeSelector');
    if (authSelector) authSelector.value = theme;

    const mainSelector = document.getElementById('mainThemeSelector');
    if (mainSelector) mainSelector.value = theme;
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
        this.activeTab = btn.dataset.tab;
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
    document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));
  }

  changeMonth(dir) {
    const prevMonthStr = this.currentMonth;
    if (dir === -1 && this.currentMonth > 1) {
      this.currentMonth--;
    } else if (dir === 1 && this.currentMonth < 12) {
      this.currentMonth++;
    } else {
      return;
    }
    
    // Recurrence check for next month
    if (dir === 1) {
      const prevMes = this.dm.getMonth(prevMonthStr);
      const currMes = this.dm.getMonth(this.currentMonth);
      if (currMes.gastosFixos.length === 0 && prevMes.gastosFixos.length > 0) {
        if (confirm(`Deseja importar as ${prevMes.gastosFixos.length} despesas fixas do mês anterior para este mês?`)) {
          currMes.gastosFixos = prevMes.gastosFixos.map(g => ({
            ...g,
            id: generateId(),
            pago: false, // Reset payment status
            vencimento: g.vencimento ? g.vencimento.replace(`-${String(prevMonthStr).padStart(2,'0')}-`, `-${String(this.currentMonth).padStart(2,'0')}-`) : g.vencimento
          }));
          this.dm.save();
          showToast('Despesas importadas!', 'success');
        }
      }
    }
    this.renderAll();
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
      const catSelect = document.getElementById('gastoVarCategoria');
      if (catSelect) {
        catSelect.innerHTML = (this.dm.data.categoriasVariaveis || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('') + '<option value="">Sem categoria</option>';
      }
      openModal('modalGastoVar');
    });
    document.getElementById('btnSalvarGastoVar').addEventListener('click', () => this.saveGastoVar());

    // Cartões
    const btnAddCartao = document.getElementById('btnAddCartao');
    if (btnAddCartao) {
      btnAddCartao.addEventListener('click', () => {
        document.getElementById('cartaoNome').value = '';
        document.getElementById('cartaoLimite').value = '';
        document.getElementById('cartaoFechamento').value = '';
        document.getElementById('cartaoVencimento').value = '';
        document.getElementById('modalCartaoTitle').textContent = 'Adicionar Cartão';
        openModal('modalCartao');
      });
    }
    const btnSalvarCartao = document.getElementById('btnSalvarCartao');
    if (btnSalvarCartao) btnSalvarCartao.addEventListener('click', () => this.saveCartao());

    const btnNovaCompraCartao = document.getElementById('btnNovaCompraCartao');
    if (btnNovaCompraCartao) {
      btnNovaCompraCartao.addEventListener('click', () => {
        const select = document.getElementById('compraCartaoId');
        if (!this.dm.data.cartoes || this.dm.data.cartoes.length === 0) {
          showToast('Adicione um cartão primeiro!', 'error');
          return;
        }
        select.innerHTML = this.dm.data.cartoes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        document.getElementById('compraDescricao').value = '';
        document.getElementById('compraData').value = new Date().toISOString().slice(0,10);
        document.getElementById('compraValorTotal').value = '';
        document.getElementById('compraParcelas').value = '1';
        openModal('modalCompraCartao');
      });
    }
    const btnSalvarCompraCartao = document.getElementById('btnSalvarCompraCartao');
    if (btnSalvarCompraCartao) btnSalvarCompraCartao.addEventListener('click', () => this.saveCompraCartao());

    const btnPagarFatura = document.getElementById('btnPagarFatura');
    if (btnPagarFatura) btnPagarFatura.addEventListener('click', () => this.pagarFaturaMes());

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
    const categoriaId = document.getElementById('gastoVarCategoria').value;
    if (!desc || !valor) { showToast('Preencha todos os campos!', 'error'); return; }
    const mes = this.dm.getMonth(this.currentMonth);
    mes.gastosVariaveis.push({ id: generateId(), descricao: desc, valor, data, categoriaId });
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
    
    if (tipo === 'deposito') {
      this.addXP(valor);
      if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
    
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
      if (addValor > 0) {
         this.addXP(addValor);
         if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
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

  saveGroqKey() {
    const el = document.getElementById('groqApiKey');
    if (!el) return;
    this.dm.data.groqApiKey = el.value.trim();
    this.dm.save();
    showToast('Chave da API salva com sucesso!', 'success');
  }

  // --- IA Avançada ---
  async getSystemPrompt(personaOverride) {
    const m = this.currentMonth;
    const mesObj = this.dm.getMonth(m);
    
    // 1. Receitas & Despesas Gerais
    const receitas = Number(this.calcTotalReceitas(m) || 0);
    const resumo = this.calcResumoDespesas(m);
    const despTotal = Number(resumo.total || 0);
    const producao = Number(this.calcProducaoDoMes(m) || 0);
    const saldoFinal = Number(receitas - despTotal);
    
    // 2. Transações
    const trRecs = (mesObj.receitas || []).map(r => `Rec: ${r.descricao} R$${Number(r.valor || 0).toFixed(2)} (Data: ${r.data})`).join('; ');
    const trFixas = (mesObj.gastosFixos || []).map(g => `Fixo: ${g.descricao} R$${Number(g.valor || 0).toFixed(2)} (Data: ${g.data})`).join('; ');
    const trVars = (mesObj.gastosVariaveis || []).map(g => `Var: ${g.descricao} R$${Number(g.valor || 0).toFixed(2)} (Cat: ${g.categoriaId}, Data: ${g.data})`).join('; ');

    // 3. Orçamento de Categorias Variáveis
    const catVarsText = (this.dm.data.categoriasVariaveis || []).map(cat => {
      const gastoCat = (mesObj.gastosVariaveis || []).filter(g => g.categoriaId === cat.id).reduce((sum, g) => sum + Number(g.valor || 0), 0);
      return `${cat.nome} (ID: ${cat.id}): Gasto R$ ${gastoCat.toFixed(2)} de R$ ${Number(cat.orcamento || 0).toFixed(2)}`;
    }).join('; ');

    // 4. Diárias (Produção)
    let diariasText = '';
    if (mesObj.diarias && mesObj.diarias.modo === 'automatico') {
      const worked = mesObj.diarias.diasTrabalhados || {};
      Object.keys(worked).forEach(d => {
         const dataStr = `${m}-${d.padStart(2, '0')}`;
         worked[d].forEach(e => {
            const clinic = this.dm.data.clinicas.find(c => c.id === e.clinicaId);
            const cName = clinic ? clinic.nome : 'Extra';
            diariasText += `Diária: ${cName} R$${Number(e.valor || 0).toFixed(2)} (Data: ${dataStr}); `;
         });
      });
    } else if (mesObj.diarias && mesObj.diarias.modo === 'manual') {
      const manual = mesObj.diarias.manual || {};
      Object.keys(manual).forEach(id => {
         const clinic = this.dm.data.clinicas.find(c => c.id === id);
         const cName = clinic ? clinic.nome : 'Extra';
         diariasText += `Diária Manual: ${cName} -> ${manual[id].diasReais || 0} dias trabalhados, R$${Number(manual[id].valorReal || 0).toFixed(2)}; `;
      });
    }
    if (!diariasText) diariasText = 'Nenhuma diária registrada.';

    // 5. Investimentos e Reserva
    const reservaSaldo = Number(this.calcReserva().saldo || 0);
    
    // Calcula o total investido/depositado no mês atual
    let investidoNoMes = 0;
    const prefixMes = `${YEAR}-${String(m).padStart(2, '0')}`;
    (this.dm.data.reserva.movimentacoes || []).forEach(mov => {
      if (mov.data && mov.data.startsWith(prefixMes) && mov.tipo === 'deposito') investidoNoMes += mov.valor;
    });
    const metasText = (this.dm.data.metas || []).map(mt => {
      let depMes = 0;
      (mt.historico || []).forEach(h => {
        if (h.data && h.data.startsWith(prefixMes)) depMes += h.valor;
      });
      investidoNoMes += depMes;
      return `Objetivo: ${mt.nome} | Saldo Acumulado R$${Number(mt.valorAtual || 0).toFixed(2)} / Alvo R$${Number(mt.valorMeta || 0).toFixed(2)} | Aportado neste mês: R$${depMes.toFixed(2)}`;
    }).join('; ');

    // 6. Histórico Resumido dos Meses Anteriores
    let historicoMesesText = '';
    const todosMeses = Object.keys(this.dm.data.meses || {}).sort();
    todosMeses.forEach(mesChave => {
      if (mesChave !== m) {
        const hRecs = Number(this.calcTotalReceitas(mesChave) || 0);
        const hDesps = Number(this.calcResumoDespesas(mesChave).total || 0);
        const hProd = Number(this.calcProducaoDoMes(mesChave) || 0);
        historicoMesesText += `Mês ${mesChave}: Receitas/Salário R$ ${hRecs.toFixed(2)} | Despesas R$ ${hDesps.toFixed(2)} | Produção/Diárias R$ ${hProd.toFixed(2)}\n`;
      }
    });
    if (!historicoMesesText) historicoMesesText = 'Nenhum histórico anterior.';

    // 7. Datas de Referência
    const hojeObj = new Date();
    const hojeStr = hojeObj.toISOString().slice(0, 10);
    const ontemObj = new Date(hojeObj);
    ontemObj.setDate(ontemObj.getDate() - 1);
    const ontemStr = ontemObj.toISOString().slice(0, 10);

    // 8. Contexto da Aba Atual (Persona Especialista) ou Persona Famosa Selecionada
    const selectorEl = document.getElementById('iaPersonaSelector');
    const selectedPersona = personaOverride || (selectorEl ? selectorEl.value : 'auto');
    let contextoLocal = '';

    if (selectedPersona === 'thiago') {
      contextoLocal = "PAPEL: Thiago Nigro. AÇÃO: Analise as finanças focando no longo prazo e na metodologia ARCA. Seja educado, direto e chame o usuário de 'Primo' de vez em quando. Ajude-o a encontrar dinheiro para aportar.";
    } else if (selectedPersona === 'bruno') {
      contextoLocal = "PAPEL: Bruno Perini. AÇÃO: Analise os números de forma objetiva, lógica e pragmática. Fale de forma séria. Dê dicas sobre consistência, estoicismo e a importância de criar fontes de renda e aportar com disciplina.";
    } else if (selectedPersona === 'nathalia') {
      contextoLocal = "PAPEL: Nathalia Arcuri. AÇÃO: Fale de forma levemente irreverente sobre cortes de gastos, mas sem perder a lógica. Ensine a regra 70/30 de forma didática. Ocasionalmente chame o usuário de 'criatura', mas priorize ser uma consultora útil e analítica.";
    } else if (selectedPersona === 'barsi') {
      contextoLocal = "PAPEL: Luiz Barsi. AÇÃO: Analise a carteira focando em dividendos e longo prazo. Defenda ações sólidas e descarte a especulação. Fale de forma madura e didática.";
    } else if (selectedPersona === 'mira') {
      contextoLocal = "PAPEL: Professor Mira. AÇÃO: Assuma a postura de um professor paciente de Renda Variável. Explique a lógica dos investimentos de forma clara e simples.";
    } else {
      const contextosAbas = {
        dashboard: "PAPEL: Planejador Financeiro Sênior.\\nAÇÃO: Analise a macro-visão financeira. Compare as receitas com as despesas totais. Alerte sobre desequilíbrios entre o que se ganha e o que se gasta. Dê conselhos estratégicos de alto nível para crescimento de patrimônio. Seja analítico e mire no longo prazo.",
        diarias: "PAPEL: Gestor de Carreira / Especialista em Faturamento Médico.\\nAÇÃO: Analise os dias trabalhados e o valor da 'Produção'. Avalie se o usuário está otimizando bem o tempo e o valor de cada clínica. Dê opiniões francas sobre clínicas que pagam pouco e incentive renegociação de diárias ou aumento de turnos onde paga mais.",
        despesas: "PAPEL: Analista de Redução de Custos (Implacável).\\nAÇÃO: Inspecione rigorosamente os 'Gastos Fixos' e 'Gastos Variáveis'. Procure padrões de desperdício (como muito gasto em comida, apps ou supérfluos). Critique orçamentos estourados nas Categorias e sugira ações imediatas para enxugar despesas de forma inteligente.",
        receitas: "PAPEL: Consultor de Aumento de Renda e Negócios.\\nAÇÃO: Analise o Salário atual e rendas extras. Sugira formas de diversificação de renda e estratégias ativas para ele faturar mais no seu serviço.",
        lancamentos: "PAPEL: Assistente Pessoal de Contabilidade.\\nAÇÃO: Seu objetivo é agilizar registros. Ajude o usuário a categorizar gastos rapidamente e aponte se o lançamento atual vai estourar a categoria dele.",
        investimentos: "PAPEL: Assessor de Investimentos (Private Wealth).\\nAÇÃO: Avalie o progresso da Reserva de Emergência e Metas. Calcule mentalmente se a reserva está segura. Dê dicas avançadas (como CDBs de liquidez diária para reserva, Tesouro Direto, e diversificação para metas longas). Incentive aportes consistentes.",
        cartoes: "PAPEL: Especialista em Gestão de Crédito e Milhas.\\nAÇÃO: Foque no peso das faturas do cartão de crédito. Aconselhe fortemente contra parcelamentos longos ou atrasos (juros rotativos). Avalie se a fatura está consumindo uma porcentagem perigosa da receita total e ensine a usar o limite ao favor dele.",
        extrato: "PAPEL: Auditor Contábil.\\nAÇÃO: Faça análises precisas. Quando o usuário pedir um histórico de dias (como ontem ou anteontem), varra as listas de gastos/receitas e entregue relatórios exatos do fluxo de caixa e somatórias perfeitas.",
        configuracoes: "PAPEL: Especialista de Suporte do Sistema.\\nAÇÃO: Ajude o usuário a configurar a plataforma, chaves de API e extrair o melhor do App."
      };
      contextoLocal = contextosAbas[this.activeTab] || 'Você é o consultor financeiro do usuário.';
    }

    return `ATENÇÃO: Você DEVE assumir TOTALMENTE a identidade e o estilo da Persona definida abaixo. NUNCA diga que você é uma IA. Aja, fale e respire como a pessoa ou especialista descrito, incorporando a linguagem de forma natural em todo o texto (não apenas colando bordões no começo).

CONTEXTO E IDENTIDADE ATUAL:
**${contextoLocal}**

REGRAS DE NEGÓCIO:
1. "Produção" e "Diárias" significam a mesma coisa: o dinheiro gerado trabalhando em clínicas no mês atual.
2. O que ele "Produz" no mês atual será recebido como "Salário" (Receitas) no MÊS SEGUINTE.

DATAS DO CALENDÁRIO (USE PARA RESPONDER PERGUNTAS SOBRE HOJE/ONTEM):
- HOJE: ${hojeStr}
- ONTEM: ${ontemStr}

DADOS FINANCEIROS GERAIS DO MÊS ATUAL (${m}):
- Saldo em Caixa (Receitas - Despesas): R$ ${saldoFinal.toFixed(2)}
- Produção Gerada Neste Mês (Diárias trabalhadas): R$ ${producao.toFixed(2)}
- Receitas Totais Recebidas (Salário): R$ ${receitas.toFixed(2)}
- Despesas Totais (Fixas + Variáveis): R$ ${despTotal.toFixed(2)}
- Total Investido/Aportado Neste Mês: R$ ${investidoNoMes.toFixed(2)}
- Reserva de Emergência: R$ ${reservaSaldo.toFixed(2)}
- Metas de Investimento: ${metasText || 'Nenhuma'}
- Orçamentos de Categorias Variáveis: ${catVarsText || 'Nenhuma'}

HISTÓRICO DE MESES PASSADOS:
${historicoMesesText}

TRANSAÇÕES DO MÊS DETALHADAS (Procure nestas listas se perguntarem de dias específicos):
- Diárias/Produção Trabalhadas: [${diariasText}]
- Receitas Recebidas: [${trRecs || 'Nenhuma'}]
- Gastos Fixos Pagos: [${trFixas || 'Nenhuma'}]
- Gastos Variáveis (do dia a dia): [${trVars || 'Nenhuma'}]

INSTRUÇÕES CRÍTICAS PARA A SUA ATUAÇÃO:
1. **É ESTRITAMENTE PROIBIDO agir como um assistente de IA ou atendente de telemarketing.** Não use frases clichês como "Como posso ajudar?", "Aproveite para...", "Se precisar de mais alguma coisa". 
2. A sua resposta inteira (do começo ao fim) deve parecer ter sido escrita pela pessoa real da Persona escolhida. Impregne o texto com a personalidade, tom de voz, ironia ou seriedade exigidos pelo seu papel.
3. Formate sempre os valores em R$ e negrito.
4. Se o usuário perguntar de um gasto (ex: iFood) e ele não estiver na lista de transações, reaja de acordo com a sua Persona (ex: dê uma bronca por não ter anotado, ou diga que não encontrou na análise), mas NUNCA use frases robóticas do tipo "não tenho registro no sistema".`;
  }

  async callGroq(messages, max_tokens = 500, temp = 0.7, jsonMode = false) {
    const apiKey = this.dm.data.groqApiKey;
    if (!apiKey) throw new Error('Chave da API Groq não configurada na aba de Configurações.');
    
    const body = {
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: temp,
      max_tokens
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error?.message || `Erro API: ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // --- CONSULTORIA DE APORTES (MARKET DATA) ---
  async fetchMarketData() {
    let selic = 10.5; // fallback
    let dolar = 5.5;
    let btc = 350000;
    
    try {
      // Taxa Selic Anual - BCB SGS Série 432 (Meta Selic)
      const resSelic = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
      const dataSelic = await resSelic.json();
      if (dataSelic && dataSelic[0] && dataSelic[0].valor) {
        selic = parseFloat(dataSelic[0].valor);
      }
    } catch(e) { console.warn('Erro ao buscar Selic no BCB:', e); }
    
    try {
      // Câmbio - AwesomeAPI
      const resCambio = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,BTC-BRL');
      const dataCambio = await resCambio.json();
      if (dataCambio.USDBRL) dolar = parseFloat(dataCambio.USDBRL.bid);
      if (dataCambio.BTCBRL) btc = parseFloat(dataCambio.BTCBRL.bid);
    } catch(e) { console.warn('Erro ao buscar Dólar/BTC:', e); }
    
    return { selic, cdi: selic - 0.1, dolar, btc };
  }

  parseMarkdownTable(markdown) {
    // Procura por tabela Markdown simples e converte para HTML
    let inTable = false;
    let tableHtml = '<table class="data-table" style="margin-top: 15px;">';
    const lines = markdown.split('\n');
    let hasTable = false;
    
    let htmlResult = '';
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      if (line.startsWith('|') && line.endsWith('|')) {
        hasTable = true;
        if (!inTable) {
           inTable = true;
        }
        
        if (line.includes('---')) {
          continue; // Ignorar linha separadora
        }
        
        let cols = line.split('|').slice(1, -1).map(c => c.trim());
        tableHtml += '<tr>';
        cols.forEach(col => {
           // Checar se é a primeira linha para th
           if (i === 0 || lines[i-1].includes('---')) {
             tableHtml += `<th>${col.replace(/\*\*/g, '')}</th>`;
           } else {
             tableHtml += `<td>${col.replace(/\*\*/g, '')}</td>`;
           }
        });
        tableHtml += '</tr>';
      } else {
        if (inTable) {
          tableHtml += '</table>';
          htmlResult += tableHtml;
          inTable = false;
        }
        if (line !== '') {
          // Normal paragraph
          let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          htmlResult += `<p style="margin-bottom: 8px;">${formattedLine}</p>`;
        }
      }
    }
    
    if (inTable) {
      tableHtml += '</table>';
      htmlResult += tableHtml;
    }
    
    return hasTable ? htmlResult : markdown.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  async gerarConsultoria() {
    const statusEl = document.getElementById('consultoriaStatus');
    const resultEl = document.getElementById('consultoriaResultado');
    const marketEl = document.getElementById('consultoriaMarketData');
    const btn = document.getElementById('btnGerarConsultoria');
    
    if (!this.dm.data.groqApiKey) {
      showToast('Configure a chave da API Groq nas Configurações!', 'error');
      return;
    }
    
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    marketEl.classList.add('hidden');
    btn.disabled = true;
    
    try {
      // 1. Fetch Dados Reais
      const marketData = await this.fetchMarketData();
      marketEl.innerHTML = `<strong>Taxas Atuais (Tempo Real):</strong> Selic: ${marketData.selic}% a.a. | CDI: ${marketData.cdi.toFixed(2)}% a.a. | Dólar: R$ ${marketData.dolar.toFixed(2)} | BTC: R$ ${marketData.btc.toLocaleString('pt-BR')}`;
      marketEl.classList.remove('hidden');
      
      // 2. Prepara Contexto Base
      const selectedPersonaId = document.getElementById('consultoriaPersonaSelect').value;
      const sysPrompt = await this.getSystemPrompt(selectedPersonaId);
      
      const receitas = this.calcTotalReceitas(this.currentMonth) || 0;
      const despesas = this.calcResumoDespesas(this.currentMonth).total || 0;
      const availableMoney = receitas - despesas;
      
      const reservaSaldo = Number(this.calcReserva().saldo || 0);
      let totalMetasAcumulado = 0;
      (this.dm.data.metas || []).forEach(mt => { totalMetasAcumulado += (mt.valorAtual || 0); });
      const patrimonioTotal = reservaSaldo + totalMetasAcumulado;
      
      const targetAporte = availableMoney > 0 ? availableMoney : (receitas * 0.3); // Sugere aportar 30% da receita se não sobrar nada
      const strAporte = targetAporte > 0 ? targetAporte.toFixed(2) : '1000.00';
      
      let filosofiaInstrucao = "Especifique ativos reais de mercado focados em diversificação.";
      if (selectedPersonaId === 'thiago') {
        filosofiaInstrucao = "Siga ESTRITAMENTE a metodologia ARCA: Ações (nacionais), Real Estate (FIIs), Caixa (Renda Fixa/Tesouro) e Ativos Internacionais (BDRs/ETFs). A tabela DEVE dividir os aportes nestas 4 categorias e sugerir um ativo real para cada (ex: BOVA11, VISC11, Tesouro Selic, IVVB11).";
      } else if (selectedPersonaId === 'bruno') {
        filosofiaInstrucao = "Siga a estratégia do Barbell (anti-fragilidade) e longo prazo: maior peso em Tesouro IPCA+ longo (segurança/renda fixa) e uma parte em Bitcoin/Cripto ou Ações de valor. Sugira ativos como Tesouro IPCA+, BTC e Ações.";
      } else if (selectedPersonaId === 'nathalia') {
        filosofiaInstrucao = "Foque pesado na Reserva de Emergência (Tesouro Selic ou CDB 100%+ CDI com liquidez diária). Só sugira Renda Variável se o patrimônio já for alto. Recomende CDBs de bancos médios ou Tesouro IPCA.";
      } else if (selectedPersonaId === 'barsi') {
        filosofiaInstrucao = "Foco 100% em AÇÕES BOAS PAGADORAS DE DIVIDENDOS (Setores BEST: Bancos, Energia, Saneamento, Telecom, Seguros). NUNCA recomende Renda Fixa (chame de 'perda fixa'). Sugira ações reais (ex: TAEE11, BBAS3, KLBN11, EGIE3, SANB11).";
      } else if (selectedPersonaId === 'mira') {
        filosofiaInstrucao = "Foco em montar uma carteira de FIIs (Fundos Imobiliários) e Ações para gerar renda passiva (dividendos mensais) com segurança. Sugira ativos reais (ex: MXRF11, HGLG11, BTLG11 e ações perenes).";
      }

      const consultoriaPrompt = `
Você é a Persona definida no sistema. 
TAREFA EXCLUSIVA: Fazer uma Consultoria de Aportes baseada nos dados do mercado em TEMPO REAL.

DADOS DE PATRIMÔNIO DO USUÁRIO:
- Patrimônio Total Investido: R$ ${patrimonioTotal.toFixed(2)}
- Salário/Receitas deste mês: R$ ${receitas.toFixed(2)}
- Capital livre sugerido para aportar AGORA: R$ ${strAporte}

DADOS DE MERCADO HOJE:
- Selic: ${marketData.selic}% ao ano
- CDI: ${marketData.cdi.toFixed(2)}% ao ano
- Dólar: R$ ${marketData.dolar.toFixed(2)}
- Bitcoin: R$ ${marketData.btc}

REGRAS OBRIGATÓRIAS:
1. Comece com 1 ou 2 parágrafos analisando o Patrimônio Total dele e sugerindo em quais ativos ele deve investir os R$ ${strAporte} livres hoje, usando as taxas atuais de mercado. O seu texto inicial DEVE incorporar muito fortemente o seu tom de voz, seus jargões e sua metodologia.
2. A SUA ÚNICA RESPOSTA ESTRUTURAL DEVE CONTER UMA TABELA MARKDOWN EXATA COM ESTAS COLUNAS: | Ativo | Valor (R$) | Porcentagem (%) | Recorrência |
3. REGRAS DE ALOCAÇÃO DA SUA PERSONA: ${filosofiaInstrucao}
4. O Valor na tabela deve dividir EXATAMENTE os R$ ${strAporte}. A soma das porcentagens deve dar 100%.`;

      const msgList = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: consultoriaPrompt }
      ];

      // 3. Chama LLM
      const responseText = await this.callGroq(msgList, 1000, 0.7);
      
      // 4. Renderiza Resposta
      resultEl.innerHTML = this.parseMarkdownTable(responseText);
      resultEl.classList.remove('hidden');
      
    } catch(e) {
      resultEl.innerHTML = `<div style="color:var(--red);">Erro: ${e.message}</div>`;
      resultEl.classList.remove('hidden');
    } finally {
      statusEl.classList.add('hidden');
      btn.disabled = false;
    }
  }

  async consultarIA() {
    if (!this.dm.data.groqApiKey) {
      showToast('Configure a Chave Groq na aba Configurações.', 'error');
      return;
    }
    openModal('modalIA');
    
    try {
      const sysPrompt = await this.getSystemPrompt();
      
      if (!this.conversationHistory || this.conversationHistory.length === 0) {
        this.conversationHistory = [{ role: 'system', content: sysPrompt }];
        
        const abasWelcome = {
          dashboard: "Olá! Sou o FinZoni, seu consultor financeiro. Já cruzei todos os seus saldos, despesas e metas. Como posso te ajudar na visão geral?",
          diarias: "Olá! Sou o FinZoni, seu Gerente de Carreira. Analisei os seus dias trabalhados e a sua Produção. Quer dicas de como maximizar seus ganhos nas clínicas?",
          despesas: "Olá! Sou o FinZoni. Já listei todos os seus gastos fixos e variáveis. Quer que eu faça uma varredura para encontrarmos onde cortar gastos?",
          receitas: "Olá! Sou o FinZoni. Quer ajuda para analisar as suas fontes de renda e planejar o aumento do seu faturamento?",
          lancamentos: "Olá! Sou o FinZoni. Posso ajudar a analisar seus gastos. O que você gostaria de saber hoje?",
          investimentos: "Olá! Sou o FinZoni, seu Consultor de Investimentos. Analisei suas Metas e Reserva. Quer dicas para bater suas metas mais rápido?",
          cartoes: "Olá! Sou o FinZoni, especialista em Crédito. Estou de olho nas suas faturas para garantir que não pague juros. Tem dúvidas sobre suas compras?",
          extrato: "Olá! Sou o FinZoni. Posso varrer o seu extrato e fluxo de caixa detalhado. O que quer procurar?",
          configuracoes: "Olá! Sou o FinZoni. Precisa de ajuda com as configurações do sistema?"
        };

        const selectorEl = document.getElementById('iaPersonaSelector');
        const selectedPersona = selectorEl ? selectorEl.value : 'auto';

        let welcomeMsg = abasWelcome[this.activeTab] || "Olá! Eu sou o FinZoni. Como posso ajudar você hoje?";

        if (selectedPersona === 'thiago') {
          welcomeMsg = "E aí, Primo! Aqui é o Thiago Nigro. Já dei uma olhada na sua carteira e no seu caixa. Vamos aplicar o método ARCA e buscar a sua liberdade financeira hoje? O que quer analisar?";
        } else if (selectedPersona === 'bruno') {
          welcomeMsg = "Olá. Aqui é o Bruno Perini. Analisei seus números. O segredo da riqueza é o aporte constante e a disciplina de longo prazo. Qual área da sua vida financeira vamos organizar hoje?";
        } else if (selectedPersona === 'nathalia') {
          welcomeMsg = "Me Poupe, né Criatura! Que bagunça (ou não) é essa? Aqui é a Nathalia Arcuri e eu tô pronta pra pegar no seu pé e te fazer economizar pra investir. Vamos aplicar a regra 70/30?";
        } else if (selectedPersona === 'barsi') {
          welcomeMsg = "Olá, meu jovem. Aqui é o Barsi. Lembre-se: Ações garantem o futuro. Nada de perda fixa ou especulação. Quer que o vovô analise seus aportes para buscarmos bons dividendos?";
        } else if (selectedPersona === 'mira') {
          welcomeMsg = "Fala, galera! Aqui é o Professor Mira. Já vesti a camisa e estou pronto pra te ensinar como dar o próximo passo na Renda Variável sem medo. Qual a dúvida de hoje?";
        }

        this.conversationHistory.push({ role: 'assistant', content: welcomeMsg });
      } else {
        // Atualiza o prompt de sistema silenciosamente com a aba atual e os dados mais frescos
        if (this.conversationHistory[0].role === 'system') {
          this.conversationHistory[0].content = sysPrompt;
        } else {
          this.conversationHistory.unshift({ role: 'system', content: sysPrompt });
        }
      }
      
      this.renderChatHistory();
    } catch(e) {
      const histDiv = document.getElementById('iaChatHistory');
      histDiv.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;">Erro: ${e.message}</div>`;
    }
  }

  limparChatIA() {
    this.conversationHistory = [];
    this.consultarIA();
  }

  changeIAPersona() {
    // Quando a persona muda, limpamos o chat para a nova IA se apresentar adequadamente
    this.limparChatIA();
  }

  renderChatHistory() {
    const histDiv = document.getElementById('iaChatHistory');
    if (!histDiv) return;
    
    let html = '';
    for (let i = 1; i < this.conversationHistory.length; i++) {
      const msg = this.conversationHistory[i];
      const isUser = msg.role === 'user';
      const bg = isUser ? 'var(--purple)' : 'var(--bg-card)';
      const color = isUser ? '#fff' : 'var(--text-primary)';
      const border = isUser ? 'none' : '1px solid var(--border-color)';
      const align = isUser ? 'flex-end' : 'flex-start';
      const txt = msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      html += `
        <div style="display:flex; justify-content:${align}; width:100%;">
          <div style="background:${bg}; color:${color}; border:${border}; padding:12px 16px; border-radius:12px; max-width:85%; font-size:0.95rem; line-height:1.5; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            ${txt}
          </div>
        </div>
      `;
    }
    histDiv.innerHTML = html;
    histDiv.scrollTop = histDiv.scrollHeight;
  }

  async enviarMensagemIA() {
    const inputEl = document.getElementById('iaChatInput');
    const text = inputEl.value.trim();
    if (!text) return;

    this.conversationHistory.push({ role: 'user', content: text });
    inputEl.value = '';
    this.renderChatHistory();

    const histDiv = document.getElementById('iaChatHistory');
    histDiv.innerHTML += `
      <div id="iaLoadingIndicator" style="display:flex; justify-content:flex-start; width:100%; margin-top:5px;">
        <div style="background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); padding:12px 16px; border-radius:12px; font-size:0.9rem; opacity:0.7;">
          <span style="display:inline-block; animation: blink 1.4s infinite both;">✨</span> Pensando...
        </div>
      </div>
    `;
    histDiv.scrollTop = histDiv.scrollHeight;

    try {
      // Retornando temp para 0.7 para manter a lógica matemática e o bom português
      const responseText = await this.callGroq(this.conversationHistory, 500, 0.7);
      this.conversationHistory.push({ role: 'assistant', content: responseText });
    } catch(e) {
      this.conversationHistory.push({ role: 'assistant', content: `❌ Erro: ${e.message}` });
    }
    this.renderChatHistory();
  }

  async sugerirCategoriaAuto(descricao) {
    if (!descricao || descricao.trim().length < 3) return;
    const catLabel = document.getElementById('categoriaSugestaoLabel');
    const catSelect = document.getElementById('gastoVarCategoria');
    if (!catLabel || !catSelect || !this.dm.data.groqApiKey) return;
    
    catLabel.style.display = 'block';
    catLabel.innerText = '✨ IA analisando transação...';

    const catDisp = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
    if (catDisp.length === 0) { catLabel.style.display = 'none'; return; }

    const prompt = `Você classifica despesas. Despesa: "${descricao}".
Categorias: ${JSON.stringify(catDisp)}
Retorne JSON com {"categoriaId": "id_da_categoria_escolhida"}. Se não conseguir, devolva a id da primeira. OBRIGATÓRIO DEVOLVER UM JSON VALIDO.`;

    try {
      const result = await this.callGroq([{role: 'user', content: prompt}], 150, 0.1, true);
      const obj = JSON.parse(result);
      if (obj.categoriaId) {
        catSelect.value = obj.categoriaId;
        catLabel.innerText = '✨ Categoria auto-preenchida';
        setTimeout(() => { catLabel.style.display = 'none'; }, 2000);
      } else { catLabel.style.display = 'none'; }
    } catch(e) { catLabel.style.display = 'none'; }
  }

  async enviarLancamentoMagico() {
    const input = document.getElementById('magicoInput');
    const btn = document.getElementById('btnMagico');
    const text = input.value.trim();
    if(!text) return;
    if(!this.dm.data.groqApiKey) { showToast('Configure a API Key da Groq primeiro.', 'error'); return; }

    input.disabled = true;
    btn.innerHTML = '✨ Processando...';

    const catDisp = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
    const hoje = new Date().toISOString().slice(0,10);

    const prompt = `Hoje: ${hoje}. Texto: "${text}"
Categorias Variaveis: ${JSON.stringify(catDisp)}
Extraia os dados em formato JSON estrito, adivinhando a categoria correta:
{ "descricao": "nome", "valor": float_positivo, "data": "YYYY-MM-DD", "tipo": "variavel|fixo|receita", "categoriaId": "id_da_categoria_se_variavel_senao_null" }`;

    try {
      const result = await this.callGroq([{role: 'user', content: prompt}], 300, 0.1, true);
      const parsed = JSON.parse(result);
      
      const m = parsed.data.slice(0,7);
      if(!this.dm.data.meses[m]) Object.assign(this.dm.data.meses, { [m]: { receitas:[], gastosFixos:[], gastosVariaveis:[] } });
      const mesObj = this.dm.data.meses[m];
      const nova = { id: Date.now().toString(), descricao: parsed.descricao, valor: parsed.valor, data: parsed.data };

      if(parsed.tipo === 'variavel') {
        nova.categoriaId = parsed.categoriaId || (catDisp[0] ? catDisp[0].id : null);
        mesObj.gastosVariaveis.push(nova);
      } else if (parsed.tipo === 'fixo') {
        nova.pago = true;
        mesObj.gastosFixos.push(nova);
      } else {
        mesObj.receitas.push(nova);
      }

      this.dm.save();
      this.renderAll();
      showToast('✨ Lançamento Mágico adicionado!', 'success');
      input.value = '';
    } catch(e) { showToast('Erro na IA: ' + e.message, 'error'); }

    input.disabled = false;
    btn.innerHTML = 'Lançar Mágica';
    input.focus();
  }

  async autoCategorizarHistorico() {
    if(!this.dm.data.groqApiKey) { showToast('Configure a API Key.', 'error'); return; }
    const m = this.currentMonth;
    const mesObj = this.dm.getMonth(m);
    
    const semCat = mesObj.gastosVariaveis.filter(g => !g.categoriaId);
    if(semCat.length === 0) { showToast('Não há despesas variáveis sem categoria neste mês!', 'info'); return; }

    if(!confirm(`Deseja categorizar magicamente ${semCat.length} despesas de ${m} usando IA?`)) return;
    showToast('✨ Analisando histórico...', 'info');

    const catDisp = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
    const mapeamento = semCat.map(g => ({ id: g.id, descricao: g.descricao, valor: g.valor }));

    const prompt = `Categorize estas despesas. Categorias Disponíveis: ${JSON.stringify(catDisp)}
Despesas: ${JSON.stringify(mapeamento)}
Devolva JSON: {"resultados": [ {"id": "id_da_despesa", "categoriaId": "id_da_categoria"} ]}`;

    try {
      const result = await this.callGroq([{role: 'user', content: prompt}], 800, 0.1, true);
      const parsed = JSON.parse(result);
      
      let mudados = 0;
      if (parsed?.resultados) {
        parsed.resultados.forEach(res => {
          const despesa = mesObj.gastosVariaveis.find(g => g.id === res.id);
          if (despesa) { despesa.categoriaId = res.categoriaId; mudados++; }
        });
        if (mudados > 0) { this.dm.save(); this.renderAll(); showToast(`✨ ${mudados} despesas categorizadas!`, 'success'); }
      }
    } catch(e) { showToast('Erro ao categorizar: ' + e.message, 'error'); }
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
    this.renderCartoes();
    this.renderFaturas();
    this.checkAlerts();
  }

  renderCurrentTab(tab) {
    switch(tab) {
      case 'dashboard': this.renderDashboard(); break;
      case 'diarias': this.renderDiarias(); break;
      case 'despesas': this.renderDespesas(); break;
      case 'receitas': this.renderReceitas(); break;
      case 'investimentos': this.renderInvestimentos(); break;
      case 'cartoes': this.renderCartoes(); this.renderFaturas(); break;
      case 'configuracoes': this.renderConfiguracoes(); break;
    }
  }

  // ── DASHBOARD ──
  renderDashboard() {
    this.checkAndFetchInsight();
    
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

  async checkAndFetchInsight() {
    const apiKey = this.dm.data.groqApiKey;
    const contentEl = document.getElementById('insightContent');
    const timerEl = document.getElementById('insightTimer');
    if (!contentEl) return;

    if (!apiKey) {
      contentEl.innerText = "Vá em Configurações e insira sua chave da Groq para receber as análises da Inteligência Artificial.";
      if(timerEl) timerEl.innerText = "IA Desconectada";
      return;
    }

    const agora = new Date();
    const hora = agora.getHours();
    
    // Calcula o turno atual: 0 (00h-07h), 1 (08h-15h), 2 (16h-23h)
    let turnoAtual = 0;
    if (hora >= 8 && hora < 16) turnoAtual = 1;
    else if (hora >= 16) turnoAtual = 2;
    
    const hojeStr = agora.toISOString().slice(0, 10);
    const idTurno = `${hojeStr}-${turnoAtual}`;

    const turnosNomes = ["(00:00 - 08:00)", "(08:00 - 16:00)", "(16:00 - 00:00)"];

    if (this.dm.data.insightTurnoId === idTurno && this.dm.data.insightTexto) {
      contentEl.innerHTML = this.dm.data.insightTexto;
      if(timerEl) timerEl.innerText = `Turno Atual ${turnosNomes[turnoAtual]}`;
      return;
    }

    contentEl.innerHTML = "Lendo e processando seu fluxo de caixa para este turno... 🧠";
    if(timerEl) timerEl.innerText = "Analisando...";
    
    try {
      // Pega o resumo de contexto
      const sysPrompt = await this.getSystemPrompt();
      
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: "AGORA ESQUEÇA SEU PAPEL ANTERIOR. Aja como um analista de dados frio e genial. Leia todo o contexto de números do meu dashboard atual. Me dê APENAS UMA dica, alerta, previsão, padrão oculto ou incentivo baseado nos dados cruciais. Seja extremamente direto e impactante (use no máximo 2 frases marcantes). Use emojis se quiser. Nunca diga 'Olá' ou se apresente. Comece o texto diretamente." }
          ],
          temperature: 0.9,
          max_tokens: 150
        })
      });

      if (!res.ok) throw new Error('API Groq Offline');
      const data = await res.json();
      const novoInsight = data.choices[0].message.content;
      
      this.dm.data.insightTurnoId = idTurno;
      this.dm.data.insightTexto = novoInsight;
      this.dm.save();
      
      contentEl.innerHTML = novoInsight;
      if(timerEl) timerEl.innerText = `Turno Atual ${turnosNomes[turnoAtual]}`;
      
    } catch (e) {
      contentEl.innerHTML = "A IA estava pensando fundo demais e não conseguiu responder. Verifique sua conexão ou tente mais tarde.";
      if(timerEl) timerEl.innerText = "Falha Temporária";
    }
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

    const cColor = this.getChartColors();
    const totalDespesas = values.reduce((a, b) => a + b, 0);

    const centerTextPlugin = {
      id: 'centerText',
      beforeDraw(chart) {
        if (chart.config.type !== 'doughnut') return;
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;
        
        const centerX = meta.data[0].x;
        const centerY = meta.data[0].y;
        const innerRadius = chart.innerRadius || 50;

        ctx.restore();
        ctx.textBaseline = 'middle';
        const text = formatCurrency(totalDespesas);
        
        let fontSize = 20;
        ctx.font = `800 ${fontSize}px Inter`;
        while(ctx.measureText(text).width > innerRadius * 1.7 && fontSize > 10) {
          fontSize -= 1;
          ctx.font = `800 ${fontSize}px Inter`;
        }
        
        ctx.fillStyle = cColor.text;
        const textX = Math.round(centerX - ctx.measureText(text).width / 2);
        const textY = centerY + 8;
        ctx.fillText(text, textX, textY);
        
        ctx.font = `600 12px Inter`;
        ctx.fillStyle = cColor.text.replace('1)', '0.5)');
        const subText = 'TOTAL';
        const subX = Math.round(centerX - ctx.measureText(subText).width / 2);
        ctx.fillText(subText, subX, textY - 22);
        ctx.save();
      }
    };

    this.charts.despesas = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 8, cutout: '75%' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: cColor.text, font: { family: 'Inter', size: 11 }, padding: 12 } },
          tooltip: {
            backgroundColor: cColor.tooltipBg,
            titleColor: cColor.tooltipText,
            bodyColor: cColor.tooltipText,
            borderColor: cColor.tooltipBorder,
            borderWidth: 1,
            callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` }
          }
        }
      },
      plugins: [centerTextPlugin]
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

    const cColor = this.getChartColors();
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
          x: { grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter', size: 11 }, callback: v => formatCurrency(v) } }
        },
        plugins: {
          legend: { labels: { color: cColor.text, font: { family: 'Inter' } } },
          tooltip: { backgroundColor: cColor.tooltipBg, titleColor: cColor.tooltipText, bodyColor: cColor.tooltipText, borderColor: cColor.tooltipBorder, borderWidth: 1, callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` } }
        }
      }
    });
  }

  renderDiariasChart() {
    const totals = this.calcDiariasAuto(this.currentMonth);
    const clinicas = this.dm.data.clinicas;

    if (this.charts.diarias) this.charts.diarias.destroy();

    const cColor = this.getChartColors();
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
          y: { position: 'left', grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter' } }, title: { display: true, text: 'Dias', color: cColor.text } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: cColor.text, font: { family: 'Inter' }, callback: v => formatCurrency(v) }, title: { display: true, text: 'Valor', color: cColor.text } },
          x: { grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter' } } }
        },
        plugins: {
          legend: { labels: { color: cColor.text, font: { family: 'Inter' } } },
          tooltip: { backgroundColor: cColor.tooltipBg, titleColor: cColor.tooltipText, bodyColor: cColor.tooltipText, borderColor: cColor.tooltipBorder, borderWidth: 1 }
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

    const cColor = this.getChartColors();
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
          x: { grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter' } } },
          y: { grid: { color: cColor.grid }, ticks: { color: cColor.text, font: { family: 'Inter' }, callback: v => formatCurrency(v) } }
        },
        plugins: {
          legend: { labels: { color: cColor.text, font: { family: 'Inter' } } },
          tooltip: { backgroundColor: cColor.tooltipBg, titleColor: cColor.tooltipText, bodyColor: cColor.tooltipText, borderColor: cColor.tooltipBorder, borderWidth: 1, callbacks: { label: c => `Saldo: ${formatCurrency(c.raw)}` } }
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
        if (!isNaN(v)) {
          const currentYear = this.dm.data.year || new Date().getFullYear();
          const realToday = new Date();
          realToday.setHours(0,0,0,0);
          
          const vDate = new Date(currentYear, this.currentMonth - 1, v);
          vDate.setHours(0,0,0,0);
          
          const diffTime = vDate.getTime() - realToday.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            badge = `<span class="shared-badge" style="background:var(--red-soft);color:var(--red);">🔴 Vencido (${v})</span>`;
          } else if (diffDays === 0) {
            badge = `<span class="shared-badge" style="background:var(--red-soft);color:var(--red);">🔴 Vence Hoje</span>`;
          } else if (diffDays <= 2) {
            badge = `<span class="shared-badge" style="background:var(--red-soft);color:var(--red);">🔴 Vence dia ${v}</span>`;
          } else if (diffDays <= 5) {
            badge = `<span class="shared-badge" style="background:var(--amber-soft);color:var(--amber);">🟡 Vence dia ${v}</span>`;
          } else {
            badge = `<span class="shared-badge" style="background:var(--green-soft);color:var(--green);">🟢 Vence dia ${v}</span>`;
          }
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
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
              ${(this.dm.data.categoriasVariaveis || []).find(c => c.id === g.categoriaId)?.nome || 'Sem Categoria'}
            </div>
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

    // Orçamentos Variáveis (Budgeting)
    const orcGrid = document.getElementById('orcamentoVariavelGrid');
    if (orcGrid) {
      let orcHTML = '';
      const catVars = this.dm.data.categoriasVariaveis || [];
      catVars.forEach(cat => {
        const spent = (mes.gastosVariaveis || []).filter(g => g.categoriaId === cat.id).reduce((sum, g) => sum + g.valor, 0);
        const percent = Math.min(100, (spent / cat.orcamento) * 100);
        let color = 'var(--green)';
        if (percent >= 90) color = 'var(--red)';
        else if (percent >= 70) color = 'var(--amber)';

        orcHTML += `
          <div style="margin-bottom: 16px;">
            <div class="flex justify-between items-center mb-1">
              <span style="font-size:0.85rem;font-weight:600;">${cat.nome}</span>
              <span style="font-size:0.8rem;color:var(--text-secondary);">${formatCurrency(spent)} / ${formatCurrency(cat.orcamento)}</span>
            </div>
            <div class="progress-bar-container" style="height:6px;">
              <div class="progress-bar" style="height:6px;">
                <div class="progress-fill" style="width:${percent}%; background:${color}; border-radius:3px;"></div>
              </div>
            </div>
          </div>
        `;
      });
      orcGrid.innerHTML = orcHTML || '<div class="text-center" style="color:var(--text-muted);font-size:0.85rem;">Nenhuma categoria variável cadastrada.</div>';
    }

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
    
    // Simulator Init
    if (!this.simuladorIniciado) {
      this.setSimuladorTipo('investimento');
      this.simuladorIniciado = true;
    }
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
      const histHTML = (meta.historico || []).slice(-5).map((h, idx) => {
        const actualIdx = Math.max(0, meta.historico.length - 5) + idx;
        return `<div class="fs-sm" style="color:var(--text-muted);padding:4px 0;border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <span>${h.data} — ${formatCurrency(h.valor)} ${h.obs ? '— ' + h.obs : ''}</span>
          <button class="btn-icon" style="opacity:0.5; padding:2px;" onclick="app.deleteAporteMeta('${meta.id}', ${actualIdx})" title="Remover aporte">🗑️</button>
        </div>`;
      }).join('');

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

  deleteAporteMeta(metaId, index) {
    if(!confirm('Deseja excluir este registro do histórico de aportes?')) return;
    const meta = this.dm.data.metas.find(m => m.id === metaId);
    if(meta && meta.historico && meta.historico[index]) {
      const aporte = meta.historico[index];
      if (confirm(`Deseja também subtrair o valor de ${formatCurrency(aporte.valor)} do total atual da meta?\n\n[OK] = Excluir Histórico E Subtrair Valor\n[Cancelar] = APENAS Excluir Histórico (Matenha o Total atual)`)) {
        meta.valorAtual -= aporte.valor;
        if (meta.valorAtual < 0) meta.valorAtual = 0;
      }
      meta.historico.splice(index, 1);
      this.dm.save();
      this.renderAll();
      showToast('Registro removido!', 'success');
    }
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

  // ── SIMULADOR FINANCEIRO ──
  setSimuladorTipo(tipo) {
    this.simuladorTipo = tipo;
    const btnInv = document.getElementById('btnSimTipoInv');
    const btnFin = document.getElementById('btnSimTipoFin');
    
    if (tipo === 'investimento') {
      btnInv.className = 'btn btn-primary btn-sm';
      btnFin.className = 'btn btn-outline btn-sm';
      document.getElementById('lblSimValor').innerText = 'Valor Inicial (R$)';
      document.getElementById('lblSimAporte').innerText = 'Aporte Mensal (R$)';
      document.getElementById('lblSimResTotal').innerText = 'Total Acumulado';
      document.getElementById('lblSimResJuros').innerText = 'Juros Ganhos';
      document.getElementById('simResJurosCard').style.borderBottom = '2px solid var(--green)';
      document.getElementById('simResJuros').style.color = 'var(--green)';
    } else {
      btnFin.className = 'btn btn-primary btn-sm';
      btnInv.className = 'btn btn-outline btn-sm';
      document.getElementById('lblSimValor').innerText = 'Valor do Imóvel/Bem (R$)';
      document.getElementById('lblSimAporte').innerText = 'Entrada (R$)';
      document.getElementById('lblSimResTotal').innerText = 'Custo Total (Bem + Juros)';
      document.getElementById('lblSimResJuros').innerText = 'Juros Pagos ao Banco';
      document.getElementById('simResJurosCard').style.borderBottom = '2px solid var(--red)';
      document.getElementById('simResJuros').style.color = 'var(--red)';
    }
    
    // Auto-recalculate se já estiver aberto
    if (!document.getElementById('simuladorResultados').classList.contains('hidden')) {
      this.calcularSimulador();
    }
  }

  calcularSimulador() {
    this.simuladorTipo = this.simuladorTipo || 'investimento';
    const P = parseFloat(document.getElementById('simValor').value) || 0;
    const A = parseFloat(document.getElementById('simAporte').value) || 0;
    const i = (parseFloat(document.getElementById('simTaxa').value) || 0) / 100;
    const n = parseInt(document.getElementById('simPrazo').value) || 0;
    
    if (n <= 0 || isNaN(P)) {
      showToast('Preencha os valores corretamente', 'error');
      return;
    }
    
    document.getElementById('simuladorResultados').classList.remove('hidden');
    
    let labels = [];
    let dataPrincipal = [];
    let dataJuros = [];
    
    let totalAcumulado = 0;
    let totalPrincipal = 0;
    let jurosAcumulados = 0;
    
    if (this.simuladorTipo === 'investimento') {
      // Juros Compostos
      let currentVal = P;
      let totalAportado = P;
      
      for (let m = 0; m <= n; m++) {
        if (m > 0) {
          currentVal = (currentVal * (1 + i)) + A;
          totalAportado += A;
        }
        labels.push(`Mês ${m}`);
        dataPrincipal.push(totalAportado);
        dataJuros.push(currentVal - totalAportado);
      }
      totalAcumulado = currentVal;
      totalPrincipal = totalAportado;
      jurosAcumulados = totalAcumulado - totalPrincipal;
      
    } else {
      // Financiamento (Tabela Price Simplificada)
      const valorFinanciado = P - A;
      if (valorFinanciado <= 0) {
         showToast('Entrada maior ou igual ao valor do bem!', 'error');
         return;
      }
      
      let pmt = 0;
      if (i === 0) {
         pmt = valorFinanciado / n;
      } else {
         pmt = valorFinanciado * (i * Math.pow(1+i, n)) / (Math.pow(1+i, n) - 1);
      }
      
      let saldoDevedor = valorFinanciado;
      let jurosTotaisPagos = 0;
      
      labels.push(`Mês 0`);
      dataPrincipal.push(P);
      dataJuros.push(0);
      
      for (let m = 1; m <= n; m++) {
         const jurosMes = saldoDevedor * i;
         const amortizacaoMes = pmt - jurosMes;
         saldoDevedor -= amortizacaoMes;
         jurosTotaisPagos += jurosMes;
         
         labels.push(`Mês ${m}`);
         dataPrincipal.push(P);
         dataJuros.push(jurosTotaisPagos);
      }
      
      totalAcumulado = P + jurosTotaisPagos;
      totalPrincipal = P;
      jurosAcumulados = jurosTotaisPagos;
    }
    
    document.getElementById('simResTotal').innerText = formatCurrency(totalAcumulado);
    document.getElementById('simResPrincipal').innerText = formatCurrency(totalPrincipal);
    document.getElementById('simResJuros').innerText = formatCurrency(jurosAcumulados);
    
    this.renderSimuladorChart(labels, dataPrincipal, dataJuros);
  }
  
  renderSimuladorChart(labels, principal, juros) {
    const ctx = document.getElementById('simuladorChart').getContext('2d');
    if (this.simChart) this.simChart.destroy();
    
    const colorJuros = this.simuladorTipo === 'investimento' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
    const colorBorderJuros = this.simuladorTipo === 'investimento' ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)';
    const labelJuros = this.simuladorTipo === 'investimento' ? 'Juros Ganhos' : 'Juros Pagos';
    
    this.simChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Valor Principal',
            data: principal,
            borderColor: 'rgba(99, 102, 241, 1)',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            fill: true,
            tension: 0.4
          },
          {
            label: labelJuros,
            data: juros,
            borderColor: colorBorderJuros,
            backgroundColor: colorJuros,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: 'var(--text-primary)' } },
          tooltip: {
             callbacks: {
                label: function(context) {
                   let label = context.dataset.label || '';
                   if (label) label += ': ';
                   if (context.parsed.y !== null) {
                      label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                   }
                   return label;
                }
             }
          }
        },
        scales: {
          x: {
             grid: { color: 'rgba(255, 255, 255, 0.05)' },
             ticks: { color: 'var(--text-secondary)' }
          },
          y: {
             stacked: true,
             grid: { color: 'rgba(255, 255, 255, 0.05)' },
             ticks: { color: 'var(--text-secondary)' }
          }
        }
      }
    });
  }

  // ── CARTÕES DE CRÉDITO ──
  saveCartao() {
    const nome = document.getElementById('cartaoNome').value.trim();
    const limite = parseFloat(document.getElementById('cartaoLimite').value);
    const fechamento = parseInt(document.getElementById('cartaoFechamento').value);
    const vencimento = parseInt(document.getElementById('cartaoVencimento').value);
    const cor = document.getElementById('cartaoCor').value;
    
    if (!nome || isNaN(limite) || isNaN(fechamento) || isNaN(vencimento)) {
      showToast('Preencha todos os campos do cartão!', 'error');
      return;
    }
    
    this.dm.data.cartoes.push({ id: generateId(), nome, limite, fechamento, vencimento, cor });
    this.dm.save();
    closeModal('modalCartao');
    this.renderAll();
    showToast('Cartão salvo!', 'success');
  }

  saveCompraCartao() {
    const cartaoId = document.getElementById('compraCartaoId').value;
    const descricao = document.getElementById('compraDescricao').value.trim();
    const data = document.getElementById('compraData').value;
    const valorTotal = parseFloat(document.getElementById('compraValorTotal').value);
    const parcelas = parseInt(document.getElementById('compraParcelas').value);
    
    if (!cartaoId || !descricao || !data || isNaN(valorTotal) || isNaN(parcelas) || parcelas < 1) {
      showToast('Preencha os campos da compra corretamente!', 'error');
      return;
    }
    
    const mesInicio = data.substring(0, 7); // YYYY-MM
    const valorParcela = valorTotal / parcelas;
    
    this.dm.data.comprasCartao.push({
      id: generateId(),
      cartaoId,
      descricao,
      data,
      valorTotal,
      parcelas,
      valorParcela,
      mesInicio
    });
    
    this.dm.save();
    closeModal('modalCompraCartao');
    this.renderAll();
    showToast('Compra lançada com sucesso!', 'success');
  }

  renderCartoes() {
    const grid = document.getElementById('cartoesGrid');
    if (!grid) return;
    
    const cartoes = this.dm.data.cartoes || [];
    if (cartoes.length === 0) {
      grid.innerHTML = '<div class="text-center text-muted" style="width:100%; grid-column: 1 / -1;">Nenhum cartão cadastrado.</div>';
      return;
    }
    
    let html = '';
    cartoes.forEach(c => {
      let spentTotal = 0;
      (this.dm.data.comprasCartao || []).forEach(compra => {
        if (compra.cartaoId === c.id) {
          spentTotal += compra.valorTotal; 
        }
      });
      
      html += `
        <div class="achievement-card" style="border-top: 4px solid ${c.cor}; background: var(--bg-card); display:flex; flex-direction:column; align-items:flex-start; padding: 15px;">
          <div style="font-weight: 700; font-size:1.1rem; margin-bottom:5px;">${c.nome}</div>
          <div class="fs-sm mb-2" style="color:var(--text-secondary);">Fecha dia ${c.fechamento} | Vence dia ${c.vencimento}</div>
          <div style="width:100%; margin-top: auto;">
             <div class="flex justify-between fs-sm mb-1">
               <span style="color:var(--text-primary);">Limite: ${formatCurrency(c.limite)}</span>
             </div>
          </div>
        </div>
      `;
    });
    grid.innerHTML = html;
  }
  
  renderFaturas() {
    const selMonth = document.getElementById('faturaMonthSelect');
    const selCartao = document.getElementById('faturaCartaoSelect');
    const tbody = document.getElementById('faturaItemsBody');
    const totalEl = document.getElementById('faturaTotalMes');
    if (!selMonth || !selCartao || !tbody) return;
    
    if (selMonth.options.length === 0) {
      const year = this.dm.data.year || new Date().getFullYear();
      for(let i=1; i<=12; i++) {
        selMonth.options.add(new Option(`${MONTHS[i-1]} ${year}`, `${year}-${String(i).padStart(2,'0')}`));
      }
      selMonth.value = `${year}-${String(this.currentMonth).padStart(2,'0')}`;
    }
    
    if (selCartao.options.length <= 1) { 
      selCartao.innerHTML = '<option value="all">Todos os Cartões</option>' + (this.dm.data.cartoes||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
    }
    
    const selectedMonth = selMonth.value;
    const selectedCartaoId = selCartao.value;
    
    let itemsHTML = '';
    let faturaTotal = 0;
    
    const compras = this.dm.data.comprasCartao || [];
    const cartoesDict = {};
    (this.dm.data.cartoes||[]).forEach(c => cartoesDict[c.id] = c);
    
    compras.forEach(compra => {
       if (selectedCartaoId !== 'all' && compra.cartaoId !== selectedCartaoId) return;
       
       const [y1, m1] = compra.mesInicio.split('-').map(Number);
       const [y2, m2] = selectedMonth.split('-').map(Number);
       const diffMonths = (y2 - y1) * 12 + (m2 - m1);
       
       if (diffMonths >= 0 && diffMonths < compra.parcelas) {
          const cartao = cartoesDict[compra.cartaoId];
          const parcelaAtual = diffMonths + 1;
          faturaTotal += compra.valorParcela;
          itemsHTML += `
            <tr>
              <td>${compra.data.split('-').reverse().join('/')}</td>
              <td><span style="border-bottom:2px solid ${cartao?.cor||'#fff'}">${cartao?.nome || 'Desconhecido'}</span></td>
              <td>${compra.descricao}</td>
              <td class="text-center">${parcelaAtual}/${compra.parcelas}</td>
              <td class="text-right value-negative">${formatCurrency(compra.valorParcela)}</td>
              <td><button class="btn-icon" onclick="app.deleteCompraCartao('${compra.id}')" title="Excluir Compra Inteira">🗑️</button></td>
            </tr>
          `;
       }
    });
    
    tbody.innerHTML = itemsHTML || '<tr><td colspan="6" class="text-center text-muted">Nenhuma compra nesta fatura.</td></tr>';
    totalEl.textContent = formatCurrency(faturaTotal);
  }

  deleteCompraCartao(id) {
    if (!confirm('Deseja excluir esta compra e TODAS as suas parcelas do cartão?')) return;
    this.dm.data.comprasCartao = this.dm.data.comprasCartao.filter(c => c.id !== id);
    this.dm.save();
    this.renderAll();
  }

  pagarFaturaMes() {
    const totalText = document.getElementById('faturaTotalMes').textContent;
    if (confirm(`Deseja lançar o pagamento da fatura no valor de ${totalText} como um Gasto Fixo Pago no mês atual?`)) {
       const mes = this.dm.getMonth(this.currentMonth);
       const valor = parseFloat(totalText.replace(/[^\d,-]/g, '').replace(',', '.'));
       if (valor > 0) {
         mes.gastosFixos.push({
           id: generateId(),
           descricao: 'Fatura de Cartão',
           valor: valor,
           compartilhado: false,
           pago: true
         });
         this.dm.save();
         showToast('Pagamento da fatura lançado em Despesas!', 'success');
         this.renderAll();
       }
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

    // Variable categories
    const cvBody = document.getElementById('categoriasVarBody');
    if (cvBody) {
      cvBody.innerHTML = (this.dm.data.categoriasVariaveis || []).map(cat => `
        <tr>
          <td>
            <input type="text" class="editable-value" value="${cat.nome}"
              onchange="app.updateCatVarNome('${cat.id}',this.value)">
          </td>
          <td class="text-right">
            <input type="number" class="editable-value value-negative" style="text-align:right" value="${cat.orcamento}"
              onchange="app.updateCatVarOrcamento('${cat.id}',this.value)">
          </td>
          <td>
            <button class="btn-icon" onclick="app.deleteCatVar('${cat.id}')" title="Remover">🗑️</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="text-center text-muted">Nenhuma categoria variável</td></tr>';
    }

    // API Keys
    const appsEl = document.getElementById('appsScriptUrl');
    if (appsEl) appsEl.value = this.dm.data.appsScriptUrl || '';
    
    const groqEl = document.getElementById('groqApiKey');
    if (groqEl) groqEl.value = this.dm.data.groqApiKey || '';
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

  updateCatFixaCompart(id, comp) {
    const cat = this.dm.data.categoriasFixas.find(c => c.id === id);
    if (cat) { cat.compartilhado = comp; this.dm.save(); }
  }

  deleteCatFixa(id) {
    if (!confirm('Excluir esta categoria padrão de gasto fixo? Os meses atuais não serão afetados automaticamente.')) return;
    this.dm.data.categoriasFixas = this.dm.data.categoriasFixas.filter(c => c.id !== id);
    this.dm.save();
    this.renderConfiguracoes();
  }

  // ── CATEGORIAS VARIAVEIS (ORÇAMENTOS) ──
  addCategoriaVar() {
    const nome = prompt('Nome da Categoria Variável (ex: Alimentação):');
    if (!nome) return;
    const orc = parseFloat(prompt('Orçamento Mensal (R$):', '500'));
    if (isNaN(orc)) return;
    this.dm.data.categoriasVariaveis.push({ id: generateId(), nome, orcamento: orc });
    this.dm.save();
    this.renderConfiguracoes();
    this.renderAll();
  }

  updateCatVarNome(id, nome) {
    const cat = this.dm.data.categoriasVariaveis.find(c => c.id === id);
    if (cat) { cat.nome = nome; this.dm.save(); this.renderAll(); this.renderConfiguracoes(); }
  }

  updateCatVarOrcamento(id, orc) {
    const val = parseFloat(orc);
    if (isNaN(val)) return;
    const cat = this.dm.data.categoriasVariaveis.find(c => c.id === id);
    if (cat) { cat.orcamento = val; this.dm.save(); this.renderAll(); this.renderConfiguracoes(); }
  }

  deleteCatVar(id) {
    if (!confirm('Excluir esta categoria de gasto variável?')) return;
    this.dm.data.categoriasVariaveis = this.dm.data.categoriasVariaveis.filter(c => c.id !== id);
    this.dm.save();
    this.renderConfiguracoes();
    this.renderAll();
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
  // ═══════════ NEW FEATURES (PROFILE, GAMIFICATION, EXTRATO) ═══════════
  openProfileModal() {
    const p = this.dm.data.perfil;
    document.getElementById('profileNameInput').value = p.nome || '';
    if (p.foto) {
      document.getElementById('profilePicPreview').src = p.foto;
    }
    openModal('modalProfile');
  }

  handleProfilePicSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX; }
        } else {
          if (height > MAX) { width *= MAX / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        document.getElementById('profilePicPreview').src = canvas.toDataURL('image/jpeg', 0.8);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  saveProfile() {
    const nome = document.getElementById('profileNameInput').value.trim();
    const fotoSrc = document.getElementById('profilePicPreview').src;
    if (nome) this.dm.data.perfil.nome = nome;
    if (fotoSrc && fotoSrc.startsWith('data:')) this.dm.data.perfil.foto = fotoSrc;
    this.dm.save();
    this.updateProfileUI();
    closeModal('modalProfile');
    showToast('Perfil atualizado!', 'success');
  }

  updateProfileUI() {
    const p = this.dm.data.perfil;
    if (!p) return;
    const nameEl = document.getElementById('userProfileName');
    if (nameEl) nameEl.textContent = p.nome;
    if (p.foto) {
      const picEl = document.getElementById('userProfilePic');
      if (picEl) picEl.src = p.foto;
    }
    
    let titulo = 'Aprendiz';
    if (p.nivel >= 50) titulo = 'Magnata';
    else if (p.nivel >= 25) titulo = 'Acionista';
    else if (p.nivel >= 10) titulo = 'Investidor';
    else if (p.nivel >= 5) titulo = 'Poupador';
    
    const badgeEl = document.getElementById('userLevelBadge');
    if (badgeEl) badgeEl.textContent = `Lvl ${p.nivel} - ${titulo}`;
    
    const xpBase = (p.nivel - 1) * 1000;
    const currentLevelProgress = p.xp - xpBase;
    const progressPct = Math.min(100, Math.max(0, (currentLevelProgress / 1000) * 100));
    const fillEl = document.getElementById('userXpFill');
    if (fillEl) fillEl.style.width = `${progressPct}%`;
  }

  addXP(amount) {
    if (amount <= 0) return;
    const p = this.dm.data.perfil;
    p.xp += amount;
    const novoNivel = Math.floor(p.xp / 1000) + 1;
    if (novoNivel > p.nivel) {
      p.nivel = novoNivel;
      showToast(`🎉 Parabéns! Você subiu para o Nível ${novoNivel}!`, 'success');
      if (typeof confetti === 'function') confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 } });
    }
    this.updateProfileUI();
    this.renderAchievements();
  }

  renderAchievements() {
    const container = document.getElementById('achievementsGrid');
    if (!container) return;
    const xp = this.dm.data.perfil ? this.dm.data.perfil.xp : 0;
    const achievements = [
      { id: 'first_step', title: 'Primeiro Passo', desc: 'Guardou seu primeiro real', xpReq: 1, icon: '🌱' },
      { id: 'apprentice', title: 'Poupador', desc: 'Acumulou 1.000 XP', xpReq: 1000, icon: '💰' },
      { id: 'investor', title: 'Investidor', desc: 'Acumulou 5.000 XP', xpReq: 5000, icon: '📈' },
      { id: 'whale', title: 'Baleia', desc: 'Acumulou 20.000 XP', xpReq: 20000, icon: '🐋' },
      { id: 'diamond', title: 'Mãos de Diamante', desc: 'Acumulou 50.000 XP', xpReq: 50000, icon: '💎' },
      { id: 'magnate', title: 'Magnata', desc: 'Acumulou 100.000 XP', xpReq: 100000, icon: '👑' }
    ];
    container.innerHTML = achievements.map(a => {
      const unlocked = xp >= a.xpReq;
      return `
        <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
          <div class="achievement-icon">${a.icon}</div>
          <div class="achievement-title">${a.title}</div>
          <div class="achievement-desc">${a.desc}</div>
        </div>
      `;
    }).join('');
    this.renderMonthlyChallenge();
  }

  renderMonthlyChallenge() {
    const descEl = document.getElementById('challengeDesc');
    const statusEl = document.getElementById('challengeStatus');
    if (!descEl || !statusEl) return;

    if (this.currentMonth === 1) {
      descEl.textContent = 'Guarde pelo menos R$ 100 na reserva este mês para ganhar 500 XP!';
      const mesAtual = this.dm.getMonth(this.currentMonth);
      let guardado = 0;
      this.dm.data.reserva.movimentacoes.forEach(m => {
        if (m.data && m.data.startsWith(`${YEAR}-01`) && m.tipo === 'deposito') guardado += m.valor;
      });
      if (guardado >= 100) {
        statusEl.innerHTML = '<span style="color:var(--green)">Concluído! ✅</span>';
      } else {
        statusEl.innerHTML = `<span style="color:var(--amber)">Falta ${formatCurrency(100 - guardado)}</span>`;
      }
    } else {
      descEl.textContent = 'Gaste menos em despesas variáveis do que no mês passado!';
      const mesPassado = this.dm.getMonth(this.currentMonth - 1);
      const mesAtual = this.dm.getMonth(this.currentMonth);
      
      const gastoPassado = mesPassado.gastosVariaveis.reduce((sum, g) => sum + g.valor, 0);
      const gastoAtual = mesAtual.gastosVariaveis.reduce((sum, g) => sum + g.valor, 0);
      
      if (gastoPassado === 0) {
        statusEl.innerHTML = '<span style="color:var(--text-muted)">Sem dados</span>';
      } else if (gastoAtual < gastoPassado) {
        statusEl.innerHTML = '<span style="color:var(--green)">Vencendo! 🏆</span>';
      } else {
        statusEl.innerHTML = '<span style="color:var(--red)">Perdendo 😢</span>';
      }
    }
  }


  renderExtratoAnual() {
    const yearSelect = document.getElementById('extratoYearSelect');
    if (!yearSelect) return;
    const year = yearSelect.value;
    const tbody = document.getElementById('extratoAnualBody');
    const tfoot = document.getElementById('extratoAnualFoot');
    
    let totais = { receitas: 0, despesas: 0, investimentos: 0 };
    let labels = [];
    let saldos = [];
    let html = '';
    
    for(let m=1; m<=12; m++) {
       const rec = this.calcTotalReceitas(m);
       const desp = this.calcResumoDespesas(m).total;
       
       const mesStr = `${year}-${String(m).padStart(2,'0')}`;
       let inv = 0;
       this.dm.data.reserva.movimentacoes.forEach(mov => {
         if (mov.data && mov.data.startsWith(mesStr) && mov.tipo === 'deposito') inv += mov.valor;
       });
       // Count metas additions as investments for that month if they occurred (approx. via total if needed, but metas don't have explicit history timestamps. Let's rely on reserve for the chart, or XP additions).
       
       const saldo = rec - desp;
       
       totais.receitas += rec;
       totais.despesas += desp;
       totais.investimentos += inv;
       
       labels.push(MONTHS[m-1].substring(0,3));
       saldos.push(saldo);
       
       html += `
         <tr>
           <td>${MONTHS[m-1]}</td>
           <td class="text-right" style="color:var(--green)">${formatCurrency(rec)}</td>
           <td class="text-right" style="color:var(--red)">${formatCurrency(desp)}</td>
           <td class="text-right" style="color:var(--blue)">${formatCurrency(inv)}</td>
           <td class="text-right" style="font-weight:bold; color:${saldo>=0?'var(--green)':'var(--red)'}">${formatCurrency(saldo)}</td>
         </tr>
       `;
    }
    
    tbody.innerHTML = html;
    const saldoGeral = totais.receitas - totais.despesas;
    tfoot.innerHTML = `
      <tr style="font-weight:bold; background:var(--bg-glass);">
        <td>TOTAL DO ANO</td>
        <td class="text-right" style="color:var(--green)">${formatCurrency(totais.receitas)}</td>
        <td class="text-right" style="color:var(--red)">${formatCurrency(totais.despesas)}</td>
        <td class="text-right" style="color:var(--blue)">${formatCurrency(totais.investimentos)}</td>
        <td class="text-right" style="color:${saldoGeral>=0?'var(--green)':'var(--red)'}">${formatCurrency(saldoGeral)}</td>
      </tr>
    `;
    
    this.renderExtratoChart(labels, saldos);
  }

  renderExtratoChart(labels, saldos) {
    const ctx = document.getElementById('extratoChart');
    if (!ctx) return;
    if (this.charts.extrato) this.charts.extrato.destroy();
    
    const canvasCtx = ctx.getContext('2d');
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(68, 138, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(68, 138, 255, 0.0)');
    
    const cColor = this.getChartColors();
    this.charts.extrato = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Evolução do Saldo Mensal',
          data: saldos,
          borderColor: '#448aff',
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: { backgroundColor: cColor.tooltipBg, titleColor: cColor.tooltipText, bodyColor: cColor.tooltipText, borderColor: cColor.tooltipBorder, borderWidth: 1 }
        },
        scales: {
          y: { grid: { color: cColor.grid }, ticks: { color: cColor.text } },
          x: { grid: { display: false }, ticks: { color: cColor.text } }
        }
      }
    });
  }

  toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  checkAlerts() {
    const mes = this.dm.getMonth(this.currentMonth);
    if (!mes || !mes.gastosFixos) return;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const currentYear = this.dm.data.year || new Date().getFullYear();
    
    let alerts = [];
    mes.gastosFixos.forEach(g => {
      if (!g.pago && g.vencimento) {
        const day = parseInt(g.vencimento, 10);
        if (!isNaN(day)) {
          const vDate = new Date(currentYear, this.currentMonth - 1, day);
          vDate.setHours(0,0,0,0);
          
          const diffTime = vDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            alerts.push(`<div class="notification-item"><div class="notification-icon">⚠️</div><div class="notification-text">A conta <strong>${g.descricao}</strong> está atrasada há ${Math.abs(diffDays)} dia(s)!</div></div>`);
          } else if (diffDays <= 3) {
            alerts.push(`<div class="notification-item"><div class="notification-icon">⏰</div><div class="notification-text">A conta <strong>${g.descricao}</strong> vence em ${diffDays === 0 ? 'hoje' : diffDays + ' dia(s)'}!</div></div>`);
          }
        }
      }
    });
    
    const badge = document.getElementById('notificationBadge');
    const body = document.getElementById('notificationsBody');
    if (badge && body) {
      if (alerts.length > 0) {
        badge.textContent = alerts.length;
        badge.style.display = 'block';
        body.innerHTML = alerts.join('');
      } else {
        badge.style.display = 'none';
        body.innerHTML = '<div class="no-notifications">Nenhum alerta no momento.</div>';
      }
    }
  }

  handleGlobalSearch() {
    const termEl = document.getElementById('globalSearchInput');
    if (!termEl) return;
    const term = termEl.value.toLowerCase();
    
    const filterTable = (selector) => {
      document.querySelectorAll(selector).forEach(row => {
        // Skip total rows
        if (row.classList.contains('total-row')) return;
        
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    };
    
    filterTable('#gastosFixosBody tr');
    filterTable('#gastosVarBody tr');
    filterTable('#outrasReceitasBody tr');
    filterTable('#receitaDiariasBody tr');
  }

}

// ── INITIALIZE ──
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  window.app = app;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(registration => {
      console.log('ServiceWorker registered successfully.');
    }).catch(error => {
      console.log('ServiceWorker registration failed:', error);
    });
  }
});
