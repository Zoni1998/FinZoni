
window.nvidiaProxy = async (body, timeoutMs = 65000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/nvidia-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text();
      let errorCode = 'NVIDIA_REQUEST_FAILED';
      try {
        const parsed = JSON.parse(errText);
        errorCode = parsed.error?.message || parsed.error || errorCode;
      } catch {}
      throw new Error(`HTTP ${res.status}: ${errorCode}`);
    }
    const data = await res.json();
    return { data: data, error: null };
  } catch (err) {
    const error = err?.name === 'AbortError' ? new Error('NVIDIA_TIMEOUT') : err;
    return { data: null, error };
  } finally {
    clearTimeout(timeoutId);
  }
};

/* ========================================
   DASHBOARD FINANCEIRO - APPLICATION LOGIC
   ======================================== */


function validateFinancialData(data) {
  if (!data || typeof data !== 'object') return false;
  // Strip dangerous keys
  delete data.__proto__;
  delete data.constructor;
  // Schema validation
  if (data.meses && typeof data.meses !== 'object') return false;
  if (data.clinicas && !Array.isArray(data.clinicas)) return false;
  if (data.categoriasFixas && !Array.isArray(data.categoriasFixas)) return false;
  if (data.categoriasVariaveis && !Array.isArray(data.categoriasVariaveis)) return false;
  if (data.metas && !Array.isArray(data.metas)) return false;
  if (data.cartoes && !Array.isArray(data.cartoes)) return false;
  if (data.comprasCartao && !Array.isArray(data.comprasCartao)) return false;
  if (data.reserva && typeof data.reserva !== 'object') return false;
  if (data.reserva && data.reserva.movimentacoes && !Array.isArray(data.reserva.movimentacoes)) return false;
  // Validate month data structure
  if (data.meses) {
    for (const key of Object.keys(data.meses)) {
      const mes = data.meses[key];
      if (typeof mes !== 'object') return false;
      if (mes.gastosFixos && !Array.isArray(mes.gastosFixos)) return false;
      if (mes.gastosVariaveis && !Array.isArray(mes.gastosVariaveis)) return false;
      if (mes.outrasReceitas && !Array.isArray(mes.outrasReceitas)) return false;
    }
  }
  return true;
}

// ── CONSTANTS ──
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const STORAGE_KEY = 'findash_data_v1';
const YEAR = new Date().getFullYear();

// ── DEFAULT DATA ──
function getDefaultData() {
  return {
    year: YEAR,
    perfil: { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0, perfilRisco: 'moderado', objetivoFinanceiro: '', aporteMensal: 0, horizonteAnos: 0 },
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
    nvidiaApiKey: '',
    reserva: {
      saldoInicial: 0,
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
    this.savePromise = Promise.resolve(true);
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
        let parsedData = data.data;
        if (typeof parsedData === 'string') {
          if (parsedData === '[object Object]') {
            parsedData = getDefaultData();
          } else {
            try {
              parsedData = JSON.parse(parsedData);
            } catch(e) {
              parsedData = getDefaultData();
            }
          }
        }
        this.data = parsedData;

        // Validate & migrate data
        this.validateAndMigrate();
        this.ensureAllMonths();
  
        // Sync fixed expenses sharing with categories
        for (let m = 1; m <= 12; m++) {
          app.syncFixedSharing(m);
        }
        this.save();
  
        return true;
      } else if (!this.userId) { // Auto-Migration from localStorage
        const localRaw = localStorage.getItem('findash_data_v1');
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw);
            if (!parsed.perfil) parsed.perfil = { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 };
            if (!parsed.metas) parsed.metas = [];
            if (!parsed.reserva) parsed.reserva = { saldoInicial: 0, movimentacoes: [], obs: '' };
            if (parsed.reserva.saldoInicial === undefined) parsed.reserva.saldoInicial = 0;
            if (!parsed.categoriasFixas) parsed.categoriasFixas = getDefaultData().categoriasFixas;
            if (!parsed.categoriasVariaveis) parsed.categoriasVariaveis = getDefaultData().categoriasVariaveis;
            if (!parsed.cartoes) parsed.cartoes = [];
            if (!parsed.comprasCartao) parsed.comprasCartao = [];
            this.data = parsed;
            showToast('Dados do seu PC importados para a Nuvem com sucesso!', 'success');
            localStorage.removeItem('findash_data_v1'); // CLEAR AFTER MIGRATION
          } catch (err) {
            this.data = getDefaultData();
          }
        } else {
          this.data = getDefaultData();
        }
        this.ensureAllMonths();
        this.save();
      }
      return true;
    } catch (e) {
      console.error('Error in load:', e);
      return false;
    }
  }

  save() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.queueSave();
    }, 1000);
  }

  saveNow() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    return this.queueSave();
  }

  queueSave() {
    // Capture the state at the moment of the action and serialize writes so a
    // slower, older request can never overwrite a newer checkbox state.
    const payload = JSON.stringify(this.data);
    this.savePromise = this.savePromise
      .catch(() => false)
      .then(() => this._save(payload));
    return this.savePromise;
  }

  async _save(payload = JSON.stringify(this.data)) {
    if (!this.userId || !sbClient) return false;
    try {
      const { data: exist } = await sbClient
        .from('finances')
        .select('user_id')
        .eq('user_id', this.userId)
        .single();

      let error;
      if (exist) {
        const { error: updateError } = await sbClient
          .from('finances')
          .update({ data: payload })
          .eq('user_id', this.userId);
        error = updateError;
      } else {
        const { error: insertError } = await sbClient
          .from('finances')
          .insert({ user_id: this.userId, data: payload });
        error = insertError;
      }
      
      if (error) {
        console.error('Error saving data:', error);
        showToast('Erro ao salvar na nuvem!', 'error');
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error in save:', e);
      showToast('Erro ao salvar na nuvem!', 'error');
      return false;
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
      if (!validateFinancialData(imported)) {
        showToast('Dados inválidos: estrutura do arquivo não reconhecida!', 'error');
        return false;
      }
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

  validateAndMigrate() {
    if (!this.data) this.data = getDefaultData();
    if (!this.data.perfil) this.data.perfil = { nome: 'Minha Conta', foto: '', nivel: 1, xp: 0 };
    if (!this.data.metas) this.data.metas = [];
    if (!this.data.reserva) this.data.reserva = { saldoInicial: 0, movimentacoes: [], obs: '' };
    if (this.data.reserva.saldoInicial === undefined) this.data.reserva.saldoInicial = 0;
    if (!this.data.categoriasFixas) this.data.categoriasFixas = getDefaultData().categoriasFixas;
    if (!this.data.categoriasVariaveis) this.data.categoriasVariaveis = getDefaultData().categoriasVariaveis;
    if (!this.data.cartoes) this.data.cartoes = [];
    if (!this.data.comprasCartao) this.data.comprasCartao = [];
    this.data.cartoes.forEach(cartao => {
      if (cartao.limite === undefined) cartao.limite = cartao.limiteTotal ?? cartao.creditLimit ?? null;
      if (cartao.fechamento === undefined) cartao.fechamento = cartao.diaFechamento ?? cartao.closingDay ?? null;
      if (cartao.vencimento === undefined) cartao.vencimento = cartao.diaVencimento ?? cartao.dueDay ?? null;
    });
    if (!this.data.meses) this.data.meses = {};

    // Preserve recorded years and transaction dates; never relabel historical data.
    if (!Number.isInteger(Number(this.data.year))) this.data.year = YEAR;

    if (this.data.appsScriptUrl === undefined) this.data.appsScriptUrl = '';
    if (this.data.nvidiaApiKey === undefined) this.data.nvidiaApiKey = '';
    if (this.data.nvidiaModel === undefined) this.data.nvidiaModel = 'meta/llama-3.1-8b-instruct';
  }
}

// ── UTILITY FUNCTIONS ──
let isPrivacyMode = localStorage.getItem('findash_privacy') === 'true';

function formatCurrency(value) {
  if (isPrivacyMode) return 'R$ ****';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatMonth(monthIndex) {
  return `${MONTHS[monthIndex - 1]} ${app?.dm?.data?.year || YEAR}`;
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
  const icons = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' };
  const icon = document.createElement('span');
  icon.textContent = icons[type] || '\u2139\uFE0F';
  toast.appendChild(icon);
  toast.appendChild(document.createTextNode(' ' + msg));
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show');
  if (id === 'modalIA') {
    document.body.classList.add('zoni-chat-open');
    requestAnimationFrame(() => {
      const input = document.getElementById('iaChatInput');
      if (input) input.focus({ preventScroll: true });
    });
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show');
  if (id === 'modalIA') {
    document.body.classList.remove('zoni-chat-open');
    document.getElementById('btnAudioIA')?.classList.remove('is-recording');
  }
}


// ── MAIN APP ──
class App {
  
  iaAttachedFile = null;
  iaAudioRecognition = null;
  iaAudioIsRecording = false;
constructor() {
    this.dm = new DataManager();
    this.currentMonth = new Date().getMonth() + 1; // 1-based
    this.charts = {};
    this.selectedDay = null;
    this.editingMetaId = null;
    this.editingCartaoIndex = null;
    this.selectedCartaoId = null;
    this.faturaFilterAll = false;
    this.conversationHistory = [];
    this.zoniBusy = false;

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
      showToast('Erro crítico no login: ' + (e.message || e), 'error');
      alert('Erro crítico: ' + e.stack);
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
    if (this.zoniBusy) {
      showToast('Aguarde o Zoni concluir a solicitação antes de sair.', 'info');
      return;
    }
    await sbClient.auth.signOut();
    this.conversationHistory = [];
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
    
    if (!this.eventsBound) {
      this.bindNavigation();
      this.bindMonthSelector();
      this.bindModals();
      this.bindExportImport();
      this.bindNotes();
      this.initTheme();
      this.eventsBound = true;
    }
    this.populateYearSelector();
    this.updateProfileUI();
    this.updatePrivacyIcon();
    this.renderAll();
    
    // Initial GSAP Entrance
    if (window.gsap) {
      const isAmoled = document.documentElement.classList.contains('theme-amoled');
      if (isAmoled) {
        gsap.fromTo(
          [".sidebar", ".main-header", ".summary-card", ".card"],
          { opacity: 0 },
          { opacity: 1, duration: 0.18, ease: "power1.out", clearProps: "all" }
        );
      } else {
        gsap.fromTo(".sidebar", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: "power3.out", clearProps: "all" });
        gsap.fromTo(".main-header", { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.1, ease: "power3.out", clearProps: "all" });
        gsap.fromTo(".summary-card", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, delay: 0.2, ease: "power3.out", clearProps: "all" });
        gsap.fromTo(".card", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, delay: 0.4, ease: "power3.out", clearProps: "all" });
      }
    }
  }

  togglePrivacy() {
    isPrivacyMode = !isPrivacyMode;
    localStorage.setItem('findash_privacy', isPrivacyMode);
    this.updatePrivacyIcon();
    this.renderAll();
  }

  updatePrivacyIcon() {
    const btn = document.getElementById('btnPrivacy');
    if (btn) {
      btn.innerHTML = isPrivacyMode 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
  }

  // ── THEME ──
  populateYearSelector() {
    const select = document.getElementById('extratoYearSelect');
    if (!select) return;
    const currentYear = YEAR;
    const selectedYear = Number(this.dm?.data?.year || currentYear);
    select.innerHTML = '';
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === selectedYear) opt.selected = true;
      select.appendChild(opt);
    }
  }

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
    const isAmoled = document.documentElement.classList.contains('theme-amoled');
    return {
      text: isLight ? '#1a1a24' : (isAmoled ? '#d4d4d8' : '#e8e8f0'),
      grid: isLight ? 'rgba(0,0,0,0.05)' : (isAmoled ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.05)'),
      tooltipBg: isLight ? 'rgba(255,255,255,0.95)' : (isAmoled ? '#000000' : '#1a1a2e'),
      tooltipText: isLight ? '#1a1a24' : '#e8e8f0',
      tooltipBorder: isLight ? 'rgba(0,0,0,0.1)' : (isAmoled ? '#262626' : 'rgba(255,255,255,0.1)')
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

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'amoled' ? '#000000' : (theme === 'light' ? '#f8fafc' : '#0a0a1a'));
    }
  }

  // ── NAVIGATION ──
  bindNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => {
          t.classList.remove('active');
          t.style.opacity = '0';
        });
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) {
          tab.classList.add('active');
          if (window.gsap) {
             const isAmoled = document.documentElement.classList.contains('theme-amoled');
             if (isAmoled) {
               gsap.fromTo(tab, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
             } else {
               gsap.fromTo(tab,
                 { opacity: 0, y: 15 },
                 { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
               );
             }
          } else {
             tab.style.opacity = '1';
          }
        }
        this.activeTab = btn.dataset.tab;
        this.renderCurrentTab(btn.dataset.tab);
        // Close mobile menu
        this.closeMobileMenu();
      });
    });

    // Mobile menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileOverlay');
      const willOpen = !sidebar.classList.contains('open');
      sidebar.classList.toggle('open', willOpen);
      overlay.classList.toggle('show', willOpen);
      document.body.classList.toggle('sidebar-open', willOpen);
    });
    document.getElementById('mobileOverlay').addEventListener('click', (event) => { event.preventDefault(); });
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', () => this.closeMobileMenu());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        this.closeMobileMenu();
        this.closeNotifications();
      }
    });

    document.addEventListener('pointerdown', event => {
      const panel = document.getElementById('notificationsPanel');
      const trigger = document.getElementById('btnNotifications');
      if (!panel || panel.style.display === 'none') return;
      if (panel.contains(event.target) || trigger?.contains(event.target)) return;
      this.closeNotifications();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) this.closeMobileMenu();
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
    document.getElementById('prevMonth').onclick = () => this.changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => this.changeMonth(1);
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
    document.getElementById('currentMonthLabel').textContent = `${MONTHS[this.currentMonth - 1]} ${this.dm.data.year || YEAR}`;
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
      document.getElementById('gastoVarData').value = `${this.dm.data.year || YEAR}-${String(this.currentMonth).padStart(2,'0')}-01`;
      const catSelect = document.getElementById('gastoVarCategoria');
      if (catSelect) {
        catSelect.innerHTML = (this.dm.data.categoriasVariaveis || []).map(c => `<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('') + '<option value="">Sem categoria</option>';
      }
      openModal('modalGastoVar');
    });
    document.getElementById('btnSalvarGastoVar').addEventListener('click', () => this.saveGastoVar());

    // Cartões
    const btnAddCartao = document.getElementById('btnAddCartao');
    if (btnAddCartao) {
      btnAddCartao.addEventListener('click', () => {
        this.editingCartaoIndex = null;
        document.getElementById('cartaoNome').value = '';
        document.getElementById('cartaoLimite').value = '';
        document.getElementById('cartaoFechamento').value = '';
        document.getElementById('cartaoVencimento').value = '';
        document.getElementById('modalCartaoTitle').textContent = 'Adicionar Cartão';
        document.getElementById('btnSalvarCartao').textContent = 'Salvar Cartão';
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
        select.innerHTML = this.dm.data.cartoes.map(c => `<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('');
        if (this.selectedCartaoId != null && Array.from(select.options).some(option => String(option.value) === String(this.selectedCartaoId))) {
          select.value = String(this.selectedCartaoId);
        }
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
      document.getElementById('receitaData').value = `${this.dm.data.year || YEAR}-${String(this.currentMonth).padStart(2,'0')}-01`;
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

    const reservaSaldoEl = document.getElementById('reservaSaldo');
    if (reservaSaldoEl) {
      reservaSaldoEl.style.cursor = 'pointer';
      reservaSaldoEl.title = 'Clique para ajustar o saldo real da reserva';
      reservaSaldoEl.setAttribute('role', 'button');
      reservaSaldoEl.setAttribute('tabindex', '0');
      const abrirAjuste = () => this.ajustarSaldoReserva();
      reservaSaldoEl.addEventListener('click', abrirAjuste);
      reservaSaldoEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          abrirAjuste();
        }
      });
    }

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

  async ajustarSaldoReserva() {
    const saldoAtual = Number(this.calcReserva().saldo || 0);
    const valorDigitado = window.prompt(
      'Informe o saldo real atual da Reserva de Emergência.\nEsse ajuste não será registrado como depósito ou saque.',
      saldoAtual.toFixed(2).replace('.', ',')
    );

    if (valorDigitado === null) return;

    const bruto = String(valorDigitado)
      .trim()
      .replace(/^R\$\s*/i, '')
      .replace(/\s/g, '');
    const normalizado = bruto.includes(',')
      ? bruto.replace(/\./g, '').replace(',', '.')
      : bruto;
    const saldoDesejado = Number(normalizado);

    if (!Number.isFinite(saldoDesejado) || saldoDesejado < 0) {
      showToast('Informe um saldo válido maior ou igual a zero.', 'error');
      return;
    }

    const movimentacoes = this.dm.data.reserva.movimentacoes || [];
    const saldoLiquidoMovimentacoes = movimentacoes.reduce((total, mov) => {
      const valor = Number(mov.valor || 0);
      return total + (mov.tipo === 'deposito' ? valor : -valor);
    }, 0);

    const saldoInicialAnterior = Number(this.dm.data.reserva.saldoInicial || 0);
    this.dm.data.reserva.saldoInicial = saldoDesejado - saldoLiquidoMovimentacoes;

    const salvo = await this.dm.saveNow();
    if (!salvo) {
      this.dm.data.reserva.saldoInicial = saldoInicialAnterior;
      this.renderAll();
      showToast('Não foi possível salvar o ajuste da reserva.', 'error');
      return;
    }

    this.renderAll();
    showToast('Saldo da reserva ajustado sem criar depósito.', 'success');
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

  // Sincroniza compartilhado dos gastos fixos com as categorias globais
  syncFixedSharing(month) {
    const mes = this.dm.getMonth(month);
    const catMap = {};
    (this.dm.data.categoriasFixas || []).forEach(c => { catMap[c.nome] = c.compartilhado; });
    let changed = false;
    (mes.gastosFixos || []).forEach(g => {
      const catShared = catMap[g.descricao];
      if (catShared !== undefined && g.compartilhado !== catShared) {
        g.compartilhado = catShared;
        changed = true;
      }
    });
    return changed;
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
    let saldo = Number(this.dm.data.reserva?.saldoInicial || 0);
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

  saveNvidiaModel() {
    const el = document.getElementById('nvidiaModelSelect');
    if (el) {
      this.dm.data.nvidiaModel = el.value;
      this.dm.save();
      showToast('Modelo atualizado e salvo!', 'success');
    }
  }

  async carregarModelosNvidia() {
    if (!this.dm.data.nvidiaApiKey) {
      showToast('Configure a chave da NVIDIA primeiro.', 'error');
      return;
    }
    const btn = document.getElementById('btnCarregarModelos');
    if (btn) btn.innerText = 'Carregando...';
    try {
      const { data, error } = await window.nvidiaProxy({
        action: 'models', apiKey: this.dm.data.nvidiaApiKey
      });
      if (error) throw new Error(error.message);
      if (data && data.error) throw new Error(data.error || 'Erro ao carregar modelos');
      
      const select = document.getElementById('nvidiaModelSelect');
      if (select && data.data) {
        select.innerHTML = '';
        data.data.forEach(model => {
          const opt = document.createElement('option');
          opt.value = model.id;
          opt.innerText = model.id;
          if (model.id === this.dm.data.nvidiaModel) opt.selected = true;
          select.appendChild(opt);
        });
        showToast('Modelos carregados!', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro: ' + e.message, 'error');
    } finally {
      if (btn) btn.innerText = 'Carregar da Nuvem';
    }
  }

  saveNvidiaKey() {
    const el = document.getElementById('nvidiaApiKey');
    if (!el) return;
    this.dm.data.nvidiaApiKey = el.value.trim();
    this.dm.save();
    showToast('Chave da API salva com sucesso!', 'success');
  }

  // --- IA Avançada ---
  async getSystemPrompt(personaOverride = null) {
    const persona = personaOverride || document.getElementById('iaPersonaSelector')?.value || 'auto';
    return window.FinZoniContext.prompt(this, persona);
  }

  async callNvidia(messages, max_tokens = 500, temp = 0.7, jsonMode = false, tools = null, timeoutMs = 65000, modelOverride = null) {
    const apiKey = this.dm.data.nvidiaApiKey;
    if (!apiKey) throw new Error('Chave da API NVIDIA não configurada na aba de Configurações.');
    
    const body = {
      action: 'chat',
      apiKey: apiKey,
      model: modelOverride || this.dm.data.nvidiaModel || 'meta/llama-3.1-8b-instruct',
      messages,
      temperature: temp,
      max_tokens
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('NVIDIA_TIMEOUT')), timeoutMs);
    });
    const proxyPromise = window.nvidiaProxy({ ...body }, Math.max(1000, timeoutMs - 1000));
    const { data: feData, error } = await Promise.race([proxyPromise, timeoutPromise])
      .finally(() => clearTimeout(timeoutId));
    if (error) throw new Error(error.message);
    const data = feData;
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error(data?.error?.message || data?.error || 'NVIDIA_INVALID_RESPONSE');
    
    // Return the full message object to allow tool_calls parsing
    if (tools) {
      return message;
    }
    
    let txt = message.content;
    if (typeof txt !== 'string') throw new Error('NVIDIA_INVALID_RESPONSE');
    
    // Strip <think> tags
    txt = txt.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    // Strip common AI thought monologues
    const commonPrefixes = [
      "The user wants me to", "The user is asking", "Here is a", "Let's analyze", "I will", "Based on", 
      "I need to check", "Looking at", "The summary says", "Let me check", "To answer this", "The current month"
    ];
    let removedPrefix = true;
    while(removedPrefix) {
      removedPrefix = false;
      for (const prefix of commonPrefixes) {
        if (txt.toLowerCase().startsWith(prefix.toLowerCase())) {
           const doubleNewline = txt.indexOf('\n\n');
           const singleNewline = txt.indexOf('\n');
           let breakIdx = -1;
           if (doubleNewline !== -1) breakIdx = doubleNewline;
           else if (singleNewline !== -1 && singleNewline < 200) breakIdx = singleNewline;
           
           if (breakIdx !== -1) {
              txt = txt.substring(breakIdx + 1).trim();
              removedPrefix = true;
           } else {
              // If we can't find a line break, maybe the whole thing is just thoughts and no answer?
              // Try finding a period after 50 chars? Let's just break at first period.
              const period = txt.indexOf('.');
              if (period !== -1) {
                txt = txt.substring(period + 1).trim();
                removedPrefix = true;
              }
           }
        }
      }
    }
    
    return txt;
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
    const source = typeof markdown === 'string' ? markdown : '';
    const lines = source.split('\n');
    let htmlResult = '';
    let tableRows = [];
    let sawTable = false;

    const flushTable = () => {
      if (!tableRows.length) return;
      const header = tableRows[0];
      const body = tableRows.slice(1);
      let tableHtml = '<div class="consultoria-table-wrap"><table class="data-table consultoria-table"><thead><tr>';
      header.forEach(col => { tableHtml += `<th>${escapeHTML(col.replace(/\*\*/g, ''))}</th>`; });
      tableHtml += '</tr></thead><tbody>';
      body.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(col => { tableHtml += `<td>${escapeHTML(col.replace(/\*\*/g, ''))}</td>`; });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      htmlResult += tableHtml;
      tableRows = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isTableLine = line.startsWith('|') && line.endsWith('|');

      if (isTableLine) {
        sawTable = true;
        const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
        const isSeparator = cells.every(cell => /^:?-{3,}:?$/.test(cell));
        if (!isSeparator) tableRows.push(cells);
        continue;
      }

      flushTable();

      if (!line) continue;
      const formatted = escapeHTML(line)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      htmlResult += `<p class="consultoria-paragraph">${formatted}</p>`;
    }

    flushTable();

    if (sawTable) return htmlResult;
    return escapeHTML(source)
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  buildConsultoriaFallback(personaId, aporte, marketData, despesasMensais = 0, reservaSaldo = 0) {
    const valor = Math.max(0, Number(aporte) || 0);
    const reservaMeses = despesasMensais > 0 ? reservaSaldo / despesasMensais : 0;

    const profiles = {
      thiago: [
        ['BOVA11', 25, 'Mensal'],
        ['HGLG11', 25, 'Mensal'],
        ['Tesouro Selic', 25, 'Mensal'],
        ['IVVB11', 25, 'Mensal']
      ],
      bruno: [
        ['Tesouro IPCA+', 60, 'Mensal'],
        ['Tesouro Selic', 20, 'Mensal'],
        ['BOVA11', 15, 'Mensal'],
        ['Bitcoin', 5, 'Mensal']
      ],
      nathalia: [
        ['CDB 100%+ CDI com liquidez diária', 60, 'Mensal'],
        ['Tesouro Selic', 30, 'Mensal'],
        ['Tesouro IPCA+', 10, 'Mensal']
      ],
      barsi: [
        ['BBAS3', 30, 'Mensal'],
        ['TAEE11', 25, 'Mensal'],
        ['EGIE3', 20, 'Mensal'],
        ['SANB11', 15, 'Mensal'],
        ['KLBN11', 10, 'Mensal']
      ],
      mira: [
        ['HGLG11', 30, 'Mensal'],
        ['BTLG11', 25, 'Mensal'],
        ['MXRF11', 20, 'Mensal'],
        ['BOVA11', 15, 'Mensal'],
        ['Tesouro Selic', 10, 'Mensal']
      ]
    };

    let allocation = profiles[personaId];
    if (!allocation) {
      allocation = reservaMeses < 3
        ? [
            ['Tesouro Selic', 50, 'Mensal'],
            ['CDB 100%+ CDI com liquidez diária', 25, 'Mensal'],
            ['IVVB11', 15, 'Mensal'],
            ['BOVA11', 10, 'Mensal']
          ]
        : [
            ['Tesouro Selic', 30, 'Mensal'],
            ['IVVB11', 25, 'Mensal'],
            ['BOVA11', 20, 'Mensal'],
            ['HGLG11', 15, 'Mensal'],
            ['Tesouro IPCA+', 10, 'Mensal']
          ];
    }

    const rows = allocation.map(([asset, pct, recurrence], index) => {
      let itemValue = valor * pct / 100;
      if (index === allocation.length - 1) {
        const allocated = allocation.slice(0, -1).reduce((sum, [, p]) => sum + Math.round((valor * p / 100) * 100) / 100, 0);
        itemValue = Math.max(0, valor - allocated);
      }
      return `| ${asset} | ${itemValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ${pct}% | ${recurrence} |`;
    });

    const reservaMsg = reservaMeses < 3
      ? `Sua reserva cobre aproximadamente ${reservaMeses.toFixed(1)} mês(es) das despesas atuais. Por isso, a simulação prioriza liquidez e segurança antes de aumentar o risco.`
      : `Sua reserva já cobre aproximadamente ${reservaMeses.toFixed(1)} mês(es) das despesas atuais, então a simulação pode distribuir melhor entre liquidez, proteção e crescimento.`;

    return `**Plano de contingência do Zoni**\n\nA NVIDIA demorou mais do que o limite desta consulta, então gerei uma simulação local para você não ficar sem resposta. ${reservaMsg}\n\nCom Selic em ${marketData.selic}% a.a. e CDI em ${marketData.cdi.toFixed(2)}% a.a., renda fixa continua relevante na composição. Esta é uma simulação educacional e deve ser revisada antes de qualquer aporte.\n\n| Ativo | Valor (R$) | Porcentagem (%) | Recorrência |\n|---|---:|---:|---|\n${rows.join('\n')}`;
  }

  async gerarConsultoria() {
    const statusEl = document.getElementById('consultoriaStatus');
    const resultEl = document.getElementById('consultoriaResultado');
    const marketEl = document.getElementById('consultoriaMarketData');
    const btn = document.getElementById('btnGerarConsultoria');

    const hasNvidiaKey = Boolean(this.dm.data.nvidiaApiKey);

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    marketEl.classList.add('hidden');
    btn.disabled = true;

    try {
      const marketData = await this.fetchMarketData();
      marketEl.innerHTML = `<strong>Taxas usadas na análise:</strong> Selic: ${marketData.selic}% a.a. · CDI: ${marketData.cdi.toFixed(2)}% a.a. · Dólar: R$ ${marketData.dolar.toFixed(2)} · BTC: R$ ${marketData.btc.toLocaleString('pt-BR')}`;
      marketEl.classList.remove('hidden');

      const selectedPersonaId = document.getElementById('consultoriaPersonaSelect').value;
      const sysPrompt = await this.getSystemPrompt(selectedPersonaId);

      const receitas = this.calcTotalReceitas(this.currentMonth) || 0;
      const despesas = this.calcResumoDespesas(this.currentMonth).total || 0;
      const availableMoney = receitas - despesas;
      const reservaSaldo = Number(this.calcReserva().saldo || 0);
      const patrimonioTotal = reservaSaldo + (this.dm.data.metas || []).reduce((sum, mt) => sum + Number(mt.valorAtual || 0), 0);
      const targetAporte = availableMoney > 0 ? availableMoney : Math.max(0, receitas * 0.3);
      const aporte = targetAporte > 0 ? targetAporte : 1000;

      let filosofiaInstrucao = "Diversifique entre liquidez, proteção contra inflação e crescimento, sem concentrar excessivamente.";
      if (selectedPersonaId === 'thiago') {
        filosofiaInstrucao = "Use a lógica ARCA: Ações, Real Estate/FIIs, Caixa/Renda Fixa e Ativos Internacionais.";
      } else if (selectedPersonaId === 'bruno') {
        filosofiaInstrucao = "Use estratégia barbell: maior peso em proteção/renda fixa e pequena parcela em ativos de maior volatilidade.";
      } else if (selectedPersonaId === 'nathalia') {
        filosofiaInstrucao = "Priorize reserva de emergência e produtos líquidos; só aumente renda variável se a reserva estiver adequada.";
      } else if (selectedPersonaId === 'barsi') {
        filosofiaInstrucao = "Foque em ações brasileiras de empresas sólidas e pagadoras de dividendos, com diversificação setorial.";
      } else if (selectedPersonaId === 'mira') {
        filosofiaInstrucao = "Foque em FIIs e ações de qualidade, explicando a lógica de renda passiva e diversificação.";
      }

      const consultoriaPrompt = `
TAREFA: gerar uma simulação de aporte objetiva e curta.

DADOS:
- Patrimônio registrado: R$ ${patrimonioTotal.toFixed(2)}
- Receitas do mês: R$ ${receitas.toFixed(2)}
- Despesas do mês: R$ ${despesas.toFixed(2)}
- Reserva atual: R$ ${reservaSaldo.toFixed(2)}
- Capital sugerido para simular aporte agora: R$ ${aporte.toFixed(2)}
- Selic: ${marketData.selic}% a.a.
- CDI: ${marketData.cdi.toFixed(2)}% a.a.
- Dólar: R$ ${marketData.dolar.toFixed(2)}
- Bitcoin: R$ ${marketData.btc}

ESTILO: ${filosofiaInstrucao}

REGRAS:
1. Responda em português do Brasil.
2. Seja direto: no máximo 2 parágrafos antes da tabela.
3. Inclua exatamente uma tabela Markdown com: | Ativo | Valor (R$) | Porcentagem (%) | Recorrência |
4. A soma dos valores deve ser R$ ${aporte.toFixed(2)} e das porcentagens 100%.
5. Não prometa retorno e deixe claro que é simulação educacional.
`;

      const msgList = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: consultoriaPrompt }
      ];

      let responseText;
      if (hasNvidiaKey) {
        try {
          statusEl.innerHTML = '<span class="consultoria-spinner">✨</span> Gerando uma sugestão objetiva...';
          responseText = await this.callNvidia(
            msgList,
            700,
            0.45,
            false,
            null,
            45000,
            'meta/llama-3.1-8b-instruct'
          );
        } catch (aiError) {
          console.warn('Consultoria NVIDIA indisponível; usando fallback local:', aiError);
          statusEl.innerHTML = '<span class="consultoria-spinner">⚡</span> A IA demorou. Montando uma simulação local...';
          responseText = this.buildConsultoriaFallback(selectedPersonaId, aporte, marketData, despesas, reservaSaldo);
        }
      } else {
        statusEl.innerHTML = '<span class="consultoria-spinner">⚡</span> Montando uma simulação local...';
        responseText = this.buildConsultoriaFallback(selectedPersonaId, aporte, marketData, despesas, reservaSaldo);
      }

      resultEl.innerHTML = window.DOMPurify
        ? window.DOMPurify.sanitize(this.parseMarkdownTable(responseText))
        : this.parseMarkdownTable(responseText);
      resultEl.classList.remove('hidden');
    } catch (e) {
      resultEl.innerHTML = `<div class="consultoria-error"><strong>Não consegui montar a carteira agora.</strong><br><span>${escapeHTML(e.message || 'Erro inesperado')}</span><br><button class="btn btn-ghost btn-sm" onclick="app.gerarConsultoria()">Tentar novamente</button></div>`;
      resultEl.classList.remove('hidden');
    } finally {
      statusEl.classList.add('hidden');
      btn.disabled = false;
    }
  }

  async consultarIA() {
    if (this.zoniBusy) { openModal('modalIA'); return; }
    if (!this.dm.data.nvidiaApiKey) {
      showToast('Configure sua chave NVIDIA NIM na aba Configurações.', 'error');
      return;
    }
    openModal('modalIA');
    
    try {
      const sysPrompt = await this.getSystemPrompt();
      
      if (!this.conversationHistory || this.conversationHistory.length === 0) {
        this.conversationHistory = [{ role: 'system', content: sysPrompt }];
        
        const abasWelcome = {
          dashboard: "Olá! Eu sou o Zoni, seu assistente financeiro. Posso analisar seus números, registrar movimentações e ajudar você a decidir o próximo passo. O que fazemos agora?",
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

        let welcomeMsg = abasWelcome[this.activeTab] || "Olá! Eu sou o Zoni. Posso analisar e organizar sua vida financeira. O que fazemos agora?";

        if (selectedPersona === 'thiago') {
          welcomeMsg = "Olá! Sou o Zoni. Vou usar um estilo direto e focado no longo prazo para analisar sua carteira e seu caixa. O que quer organizar?";
        } else if (selectedPersona === 'bruno') {
          welcomeMsg = "Olá! Sou o Zoni. Vou analisar seus números de forma objetiva, com foco em constância e disciplina. Por onde começamos?";
        } else if (selectedPersona === 'nathalia') {
          welcomeMsg = "Olá! Sou o Zoni. Vamos olhar seus gastos com leveza e encontrar dinheiro para economizar e investir?";
        } else if (selectedPersona === 'barsi') {
          welcomeMsg = "Olá! Sou o Zoni. Posso analisar seus aportes com foco em empresas sólidas, dividendos e longo prazo.";
        } else if (selectedPersona === 'mira') {
          welcomeMsg = "Olá! Sou o Zoni. Vou explicar renda variável de forma simples e paciente. Qual é sua dúvida de hoje?";
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
      console.error('Falha ao abrir o Zoni:', e);
      const histDiv = document.getElementById('iaChatHistory');
      histDiv.innerHTML = `<div class="zoni-error-state">Não consegui iniciar o Zoni agora.<button class="btn btn-outline btn-sm" onclick="app.consultarIA()">Tentar novamente</button></div>`;
    }
  }

  limparChatIA() {
    if (this.zoniBusy) return;
    this.conversationHistory = [];
    this.consultarIA();
  }

  changeIAPersona() {
    if (this.zoniBusy) return;
    // Quando a persona muda, limpamos o chat para a nova IA se apresentar adequadamente
    this.limparChatIA();
  }

  closeMobileMenu() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('mobileOverlay')?.classList.remove('show');
    document.body.classList.remove('sidebar-open');
  }

  usarSugestaoZoni(texto) {
    const input = document.getElementById('iaChatInput');
    if (!input) return;
    input.value = texto;
    this.enviarMensagemIA();
  }

  resizeIAInput(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }

  handleIAInputKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) return;
    event.preventDefault();
    this.enviarMensagemIA();
  }

  renderChatHistory() {
    const histDiv = document.getElementById('iaChatHistory');
    if (!histDiv) return;

    let html = '';
    for (let i = 1; i < this.conversationHistory.length; i++) {
      const msg = this.conversationHistory[i];
      if (msg.role === 'system' || msg.role === 'tool' || msg.tool_calls) continue;

      const isUser = msg.role === 'user';
      let txt = '';

      if (msg.displayHtml) {
        txt = msg.displayHtml;
      } else if (typeof msg.content === 'string') {
        txt = escapeHTML(msg.content)
          .replace(/\n/g, '<br/>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      } else if (Array.isArray(msg.content)) {
        txt = msg.content
          .map(c => c.type === 'text' ? escapeHTML(c.text || '') : '[Imagem]')
          .join('<br/>');
      }

      html += `
        <div class="zoni-message-row ${isUser ? 'is-user' : 'is-assistant'}">
          <div class="zoni-message-bubble">
            ${txt}
          </div>
        </div>
      `;
    }

    if (this.conversationHistory.filter(msg => msg.role !== 'system').length <= 1) {
      html += `
        <div class="zoni-suggestions" aria-label="Sugestões para o Zoni">
          <button onclick="app.usarSugestaoZoni('Quanto posso gastar até o fim do mês?')">Quanto posso gastar?</button>
          <button onclick="app.usarSugestaoZoni('Paguei uma despesa fixa')">Marcar conta como paga</button>
          <button onclick="app.usarSugestaoZoni('Trabalhei hoje em uma clínica')">Registrar produção</button>
          <button onclick="app.usarSugestaoZoni('Simule uma meta de investimento para mim')">Simular uma meta</button>
        </div>`;
    }

    histDiv.innerHTML = html;
    histDiv.scrollTop = histDiv.scrollHeight;
  }

  handleIaFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.iaAttachedFile = file;
    document.getElementById('iaAttachmentName').innerText = file.name;
    document.getElementById('iaAttachmentPreview').style.display = 'flex';
  }

  removeIaAttachment() {
    this.iaAttachedFile = null;
    document.getElementById('iaFileInput').value = '';
    document.getElementById('iaAttachmentPreview').style.display = 'none';
  }

  async lerPdfParaTexto(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(s => s.str).join(' ') + '\n';
      }
      return fullText;
    } catch (e) {
      console.error('Erro ao ler PDF:', e);
      return 'ERRO_AO_LER_PDF';
    }
  }

  async lerImagemParaBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  
  startAudioIA() {
    if (this.iaAudioIsRecording) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Seu navegador não suporta reconhecimento de voz.', 'error');
      return;
    }
    
    this.iaAudioRecognition = new SpeechRecognition();
    this.iaAudioRecognition.lang = 'pt-BR';
    this.iaAudioRecognition.interimResults = true;
    
    this.iaAudioRecognition.onstart = () => {
      this.iaAudioIsRecording = true;
      document.getElementById('btnAudioIA').style.backgroundColor = 'var(--danger-color)';
      document.getElementById('btnAudioIA').style.color = 'white';
      document.getElementById('iaChatInput').placeholder = 'Ouvindo...';
    };
    
    this.iaAudioRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const input = document.getElementById('iaChatInput');
      if (finalTranscript) {
         input.value += (input.value ? ' ' : '') + finalTranscript;
      }
    };
    
    this.iaAudioRecognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      this.stopAudioIA();
    };
    
    this.iaAudioRecognition.onend = () => {
      this.stopAudioIA();
    };
    
    this.iaAudioRecognition.start();
  }

  stopAudioIA() {
    if (!this.iaAudioIsRecording) return;
    this.iaAudioIsRecording = false;
    
    if (this.iaAudioRecognition) {
      this.iaAudioRecognition.stop();
    }
    
    document.getElementById('btnAudioIA').style.backgroundColor = 'var(--card-bg)';
    document.getElementById('btnAudioIA').style.color = 'var(--text-secondary)';
    document.getElementById('iaChatInput').placeholder = 'Pergunte sobre seus gastos...';
    
    // Automatically send message after stopping if input is not empty
    setTimeout(() => {
        const input = document.getElementById('iaChatInput').value.trim();
        if(input.length > 0) this.enviarMensagemIA();
    }, 500);
  }

  validateIATool(name, args) {
    const required = {
      adicionar_despesa: ['descricao', 'valor', 'data'], excluir_despesa: ['id'],
      adicionar_receita: ['descricao', 'valor', 'data'], excluir_receita: ['id'],
      adicionar_despesa_fixa: ['descricao', 'valor', 'vencimento'], excluir_despesa_fixa: ['id'],
      adicionar_cartao: ['nome', 'limite', 'fechamento', 'vencimento'],
      adicionar_compra_cartao: ['cartaoId', 'descricao', 'data', 'valorTotal', 'parcelas'],
      marcar_despesa_fixa: ['descricao'], registrar_producao: ['clinica', 'valor', 'data']
    };
    if ((required[name] || []).some(key => args[key] == null || args[key] === '')) return 'Faltam dados obrigatórios; peça ao usuário antes de alterar.';
    for (const key of ['valor', 'valorTotal', 'limite']) {
      if (args[key] != null && (typeof args[key] !== 'number' || !Number.isFinite(args[key]) || args[key] <= 0 || args[key] > 1e12)) return 'Valor inválido; nenhuma alteração executada.';
    }
    for (const key of ['vencimento', 'fechamento']) {
      if (args[key] != null && (!Number.isInteger(args[key]) || args[key] < 1 || args[key] > 31)) return 'Dia deve estar entre 1 e 31.';
    }
    if (args.parcelas != null && (!Number.isInteger(args.parcelas) || args.parcelas < 1 || args.parcelas > 600)) return 'Quantidade de parcelas inválida.';
    if (args.data != null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.data)) return 'Data inválida; use AAAA-MM-DD.';
      const [year, month, day] = args.data.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day || year !== Number(this.dm.data.year)) return 'Data inválida ou ano não disponível nesta conta.';
    }
    if (args.cartaoId && !(this.dm.data.cartoes || []).some(card => String(card.id) === String(args.cartaoId))) return 'Cartão não encontrado.';
    if (args.categoriaId && !(this.dm.data.categoriasVariaveis || []).some(category => category.id === args.categoriaId)) return 'Categoria não encontrada.';
    return null;
  }

  async enviarMensagemIA() {
    const inputEl = document.getElementById('iaChatInput');
    const text = inputEl.value.trim().slice(0, 1200);
    if (!text || this.zoniBusy) return;
    this.zoniBusy = true;
    inputEl.disabled = true;
    const sendButton = document.getElementById('btnSendIA');
    if (sendButton) sendButton.disabled = true;

    let turnModified = false;
    let saveFailed = false;
    this.conversationHistory.push({ role: 'user', content: text });
    inputEl.value = '';
    const histDiv = document.getElementById('iaChatHistory');
    let slowTimer = null;
    const addLoading = () => {
      histDiv.innerHTML += `
        <div id="iaLoadingIndicator" class="zoni-message-row is-assistant zoni-loading-row">
          <div class="zoni-message-bubble zoni-loading-bubble">
            <span class="zoni-loading-spark" aria-hidden="true">✨</span>
            <span class="zoni-loading-text">Processando...</span>
            <span class="zoni-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
        </div>
      `;
      histDiv.scrollTop = histDiv.scrollHeight;
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        const label = document.querySelector('#iaLoadingIndicator .zoni-loading-text');
        if (label) label.textContent = 'A NVIDIA está demorando um pouco...';
      }, 8000);
    };
    const tools = [
      window.FinZoniContext.tool,
      { type: 'function', function: { name: 'somar_valores', description: 'Soma valores com precisão em centavos. Use para somar registros consultados; não faça contas mentalmente.', parameters: { type: 'object', properties: { valores: { type: 'array', items: { type: 'number' }, maxItems: 1000 } }, required: ['valores'] } } },
      {
        "type": "function",
        "function": {
          "name": "resumo_financeiro",
          "description": "Obtém o saldo atual e o resumo financeiro (receitas, despesas, saldo restante).",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "listar_categorias",
          "description": "Lista todas as categorias variáveis disponíveis e seus IDs.",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "listar_despesas_variaveis",
          "description": "Lista as despesas variáveis (gastos extras) cadastradas. Retorna id, descricao, valor, data.",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "adicionar_despesa",
          "description": "Adiciona uma nova despesa variável (gasto variável).",
          "parameters": {
            "type": "object",
            "properties": {
              "descricao": { "type": "string", "description": "Nome da despesa (ex: Almoço Burger King)" },
              "valor": { "type": "number", "description": "Valor numérico (ex: 35.50)" },
              "data": { "type": "string", "description": "Data no formato YYYY-MM-DD" },
              "categoriaId": { "type": "string", "description": "ID da categoria." }
            },
            "required": ["descricao", "valor", "data"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "excluir_despesa",
          "description": "Remove uma despesa variável pelo seu ID.",
          "parameters": {
            "type": "object",
            "properties": {
              "id": { "type": "string", "description": "ID da despesa a ser removida" }
            },
            "required": ["id"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "adicionar_receita",
          "description": "Adiciona uma nova receita (entrada de dinheiro).",
          "parameters": {
            "type": "object",
            "properties": {
              "descricao": { "type": "string", "description": "Nome da receita (ex: Salário)" },
              "valor": { "type": "number", "description": "Valor numérico (ex: 2000.00)" },
              "data": { "type": "string", "description": "Data no formato YYYY-MM-DD" }
            },
            "required": ["descricao", "valor", "data"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "listar_receitas",
          "description": "Lista todas as receitas (entradas). Retorna id, descricao, valor, data.",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "excluir_receita",
          "description": "Remove uma receita pelo seu ID.",
          "parameters": {
            "type": "object",
            "properties": {
              "id": { "type": "string", "description": "ID da receita" }
            },
            "required": ["id"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "adicionar_despesa_fixa",
          "description": "Adiciona um gasto fixo (que se repete todo mês).",
          "parameters": {
            "type": "object",
            "properties": {
              "descricao": { "type": "string", "description": "Nome (ex: Conta de Luz)" },
              "valor": { "type": "number", "description": "Valor numérico (ex: 150.00)" },
              "vencimento": { "type": "number", "description": "Dia do vencimento (1 a 31)" },
              "compartilhado": { "type": "boolean", "description": "Se é dividido (divide o valor por 2)" }
            },
            "required": ["descricao", "valor", "vencimento"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "listar_despesas_fixas",
          "description": "Lista despesas fixas (contas mensais).",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "excluir_despesa_fixa",
          "description": "Remove uma despesa fixa pelo ID.",
          "parameters": {
            "type": "object",
            "properties": {
              "id": { "type": "string", "description": "ID da despesa fixa" }
            },
            "required": ["id"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "adicionar_cartao",
          "description": "Adiciona um novo cartão de crédito.",
          "parameters": {
            "type": "object",
            "properties": {
              "nome": { "type": "string", "description": "Nome do cartão (ex: Nubank, Mercado Pago)" },
              "limite": { "type": "number", "description": "Limite total do cartão (ex: 5000.00)" },
              "fechamento": { "type": "number", "description": "Dia do fechamento (1 a 31)" },
              "vencimento": { "type": "number", "description": "Dia do vencimento da fatura (1 a 31)" }
            },
            "required": ["nome", "limite", "fechamento", "vencimento"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "listar_cartoes",
          "description": "Lista todos os cartões de crédito cadastrados e seus IDs.",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "adicionar_compra_cartao",
          "description": "Lança uma nova compra parcelada ou à vista em um cartão de crédito.",
          "parameters": {
            "type": "object",
            "properties": {
              "cartaoId": { "type": "string", "description": "ID do cartão onde a compra foi feita." },
              "descricao": { "type": "string", "description": "Descrição da compra (ex: TV, Supermercado)" },
              "data": { "type": "string", "description": "Data da compra (YYYY-MM-DD)" },
              "valorTotal": { "type": "number", "description": "Valor total da compra (ex: 2000.00)" },
              "parcelas": { "type": "number", "description": "Quantidade de parcelas (1 para à vista)" }
            },
            "required": ["cartaoId", "descricao", "data", "valorTotal", "parcelas"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "marcar_despesa_fixa",
          "description": "Marca uma despesa fixa do mês atual como paga ou pendente pelo nome. Use quando o usuário disser que pagou uma conta ou cartão.",
          "parameters": {
            "type": "object",
            "properties": {
              "descricao": { "type": "string", "description": "Nome da despesa, por exemplo Cartão Itaú" },
              "pago": { "type": "boolean", "description": "true para paga, false para pendente" }
            },
            "required": ["descricao", "pago"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "registrar_producao",
          "description": "Registra uma diária ou produção realizada em uma clínica.",
          "parameters": {
            "type": "object",
            "properties": {
              "clinica": { "type": "string", "description": "Nome da clínica" },
              "valor": { "type": "number", "description": "Valor produzido ou recebido pela diária" },
              "data": { "type": "string", "description": "Data YYYY-MM-DD" }
            },
            "required": ["clinica", "valor", "data"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "calcular_disponivel_mes",
          "description": "Calcula quanto ainda pode ser gasto no mês depois das contas pagas, pendentes e aportes.",
          "parameters": { "type": "object", "properties": {} }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "simular_meta",
          "description": "Simula juros compostos para uma meta com valor inicial e aportes mensais.",
          "parameters": {
            "type": "object",
            "properties": {
              "valorInicial": { "type": "number" },
              "aporteMensal": { "type": "number" },
              "taxaMensal": { "type": "number", "description": "Taxa percentual ao mês, por exemplo 0.8" },
              "meses": { "type": "number" }
            },
            "required": ["aporteMensal", "taxaMensal", "meses"]
          }
        }
      }
    ];

    try {
      this.renderChatHistory();
      addLoading();
      const exactAnswer = window.FinZoniContext.exactCardAnswer(this, text);
      if (exactAnswer) {
        this.conversationHistory.push({ role: 'assistant', content: exactAnswer });
        return;
      }
      const systemPrompt = await this.getSystemPrompt();
      this.conversationHistory = this.conversationHistory.filter(message => message.role !== 'system');
      // Keep complete turns together so tool results never lose their calls.
      while (this.conversationHistory.length > 40) {
        const nextTurn = this.conversationHistory.findIndex((message, index) => index > 0 && message.role === 'user');
        if (nextTurn < 0) break;
        this.conversationHistory.splice(0, nextTurn);
      }
      this.conversationHistory.unshift({ role: 'system', content: systemPrompt });
      let runLoop = true;
      let toolIterations = 0;
      const chatDeadline = Date.now() + 180000;
      const executedCalls = new Set();
      while (runLoop && toolIterations < 6) {
        toolIterations++;
        const remainingMs = chatDeadline - Date.now();
        if (remainingMs < 1000) throw new Error('NVIDIA_TIMEOUT');
        const responseMessage = await this.callNvidia(this.conversationHistory, 4096, 0.2, false, tools, Math.min(65000, remainingMs));
        
        if (responseMessage.tool_calls?.length) {
          this.conversationHistory.push(responseMessage);
          
          let modifiedData = false;

          const findGastoVariavel = (id) => {
             for (const m in this.dm.data.meses || {}) {
                if (!this.dm.data.meses[m].gastosVariaveis) continue;
        const idx = this.dm.data.meses[m].gastosVariaveis.findIndex(g => String(g.id) === String(id));
                if (idx > -1) return { mes: m, idx };
             }
             return null;
          };
          
          const findReceita = (id) => {
             for (const m in this.dm.data.meses || {}) {
                const key = this.dm.data.meses[m].outrasReceitas ? 'outrasReceitas' : 'receitas';
                const lista = this.dm.data.meses[m][key] || [];
                const idx = lista.findIndex(g => String(g.id) === String(id));
                if (idx > -1) return { mes: m, key, idx };
             }
             return null;
          };
          
          const findGastoFixo = (id) => {
             for (const m in this.dm.data.meses || {}) {
                if (!this.dm.data.meses[m].gastosFixos) continue;
                const idx = this.dm.data.meses[m].gastosFixos.findIndex(g => String(g.id) === String(id));
                if (idx > -1) return { mes: m, idx };
             }
             return null;
          };

          try {
          for (const toolCall of responseMessage.tool_calls) {
            const funcName = toolCall.function.name;
            let args;
            try {
              args = JSON.parse(toolCall.function.arguments || '{}');
              if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Objeto inválido');
            } catch (error) {
              this.conversationHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Argumentos inválidos. Corrija a chamada; nenhuma ação executada.' });
              continue;
            }
            let result = "";

            const confirmations = {
              adicionar_despesa: `Adicionar a despesa “${args.descricao || ''}” de ${formatCurrency(args.valor)}?`,
              excluir_despesa: 'Excluir esta despesa?',
              adicionar_receita: `Adicionar a receita “${args.descricao || ''}” de ${formatCurrency(args.valor)}?`,
              excluir_receita: 'Excluir esta receita?',
              adicionar_despesa_fixa: `Adicionar a despesa fixa “${args.descricao || ''}”?`,
              excluir_despesa_fixa: 'Excluir esta despesa fixa?',
              adicionar_cartao: `Adicionar o cartão “${args.nome || ''}”?`,
              adicionar_compra_cartao: `Lançar “${args.descricao || ''}” no cartão?`,
              marcar_despesa_fixa: `Confirmar “${args.descricao || ''}” como ${args.pago === false ? 'pendente' : 'paga'}?`,
              registrar_producao: `Registrar ${formatCurrency(args.valor)} de produção na clínica ${args.clinica || ''}?`
            };
            if (confirmations[funcName]) {
              const validationError = this.validateIATool(funcName, args);
              const signature = JSON.stringify([funcName, args]);
              if (validationError || executedCalls.has(signature)) {
                this.conversationHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: validationError || 'Esta ação já foi executada nesta mensagem; não foi repetida.' });
                continue;
              }
              executedCalls.add(signature);
            }
            if (confirmations[funcName] && !confirm(confirmations[funcName])) {
              this.conversationHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Ação cancelada pelo usuário.' });
              continue;
            }

            if (funcName === 'consultar_plataforma') {
              result = JSON.stringify(window.FinZoniContext.query(this, args));
            } else if (funcName === 'somar_valores') {
              result = JSON.stringify(Array.isArray(args.valores) && args.valores.length <= 1000 && args.valores.every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e12)
                ? { total: args.valores.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100 }
                : { erro: 'Informe até 1000 valores numéricos válidos.' });
            } else if (funcName === 'resumo_financeiro') {
              const despesas = this.calcResumoDespesas(this.currentMonth);
              const receitas = this.calcTotalReceitas(this.currentMonth);
              const res = { receitas, despesas, saldo: receitas - despesas.total };
              result = JSON.stringify(res);
            } 
            else if (funcName === 'listar_categorias') {
              const cats = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
              result = JSON.stringify(cats);
            }
            else if (funcName === 'listar_despesas_variaveis') {
              const mesObj = this.dm.getMonth(this.currentMonth);
              result = JSON.stringify(mesObj.gastosVariaveis || []);
            }
            else if (funcName === 'adicionar_despesa') {
              const gasto = {
                id: crypto.randomUUID(),
                descricao: args.descricao,
                valor: parseFloat(args.valor),
                data: args.data,
                categoriaId: args.categoriaId || (this.dm.data.categoriasVariaveis && this.dm.data.categoriasVariaveis.length > 0 ? this.dm.data.categoriasVariaveis[0].id : "")
              };
              const m = parseInt(String(args.data || '').slice(5, 7), 10) || this.currentMonth;
              const mesObj = this.dm.getMonth(m);
              if (!mesObj.gastosVariaveis) mesObj.gastosVariaveis = [];
              mesObj.gastosVariaveis.push(gasto);
              modifiedData = true;
              result = `Despesa adicionada com sucesso. ID gerado: ${gasto.id}`;
            }
            else if (funcName === 'excluir_despesa') {
              const loc = findGastoVariavel(args.id);
              if (loc) {
                 this.dm.data.meses[loc.mes].gastosVariaveis.splice(loc.idx, 1);
                 modifiedData = true;
                 result = "Despesa removida com sucesso.";
              } else {
                 result = "Erro: Despesa não encontrada.";
              }
            }
            else if (funcName === 'adicionar_receita') {
              const receita = {
                id: crypto.randomUUID(),
                descricao: args.descricao,
                valor: parseFloat(args.valor),
                data: args.data
              };
              const m = parseInt(String(args.data || '').slice(5, 7), 10) || this.currentMonth;
              const mesObj = this.dm.getMonth(m);
              if (!mesObj.outrasReceitas) mesObj.outrasReceitas = [];
              mesObj.outrasReceitas.push(receita);
              modifiedData = true;
              result = `Receita adicionada. ID: ${receita.id}`;
            }
            else if (funcName === 'listar_receitas') {
              const mesObj = this.dm.getMonth(this.currentMonth);
              result = JSON.stringify(mesObj.outrasReceitas || mesObj.receitas || []);
            }
            else if (funcName === 'excluir_receita') {
              const loc = findReceita(args.id);
              if (loc) {
                 this.dm.data.meses[loc.mes][loc.key].splice(loc.idx, 1);
                 modifiedData = true;
                 result = "Receita excluída.";
              } else {
                 result = "Erro: Receita não encontrada.";
              }
            }
            else if (funcName === 'adicionar_despesa_fixa') {
              const fixa = {
                id: crypto.randomUUID(),
                descricao: args.descricao,
                valor: parseFloat(args.valor),
                vencimento: parseInt(args.vencimento),
                compartilhado: !!args.compartilhado
              };
              const mesObj = this.dm.getMonth(this.currentMonth);
              if (!mesObj.gastosFixos) mesObj.gastosFixos = [];
              mesObj.gastosFixos.push(fixa);
              modifiedData = true;
              result = `Despesa fixa adicionada. ID: ${fixa.id}`;
            }
            else if (funcName === 'listar_despesas_fixas') {
              const mesObj = this.dm.getMonth(this.currentMonth);
              result = JSON.stringify(mesObj.gastosFixos || []);
            }
            else if (funcName === 'excluir_despesa_fixa') {
              const loc = findGastoFixo(args.id);
              if (loc) {
                 this.dm.data.meses[loc.mes].gastosFixos.splice(loc.idx, 1);
                 modifiedData = true;
                 result = "Despesa fixa excluída.";
              } else {
                 result = "Erro: Despesa fixa não encontrada.";
              }
            }

            else if (funcName === 'adicionar_cartao') {
              const c = {
                id: crypto.randomUUID(),
                nome: args.nome,
                limite: parseFloat(args.limite),
                fechamento: parseInt(args.fechamento),
                vencimento: parseInt(args.vencimento),
                cor: '#8a05be'
              };
              if (!this.dm.data.cartoes) this.dm.data.cartoes = [];
              this.dm.data.cartoes.push(c);
              modifiedData = true;
              result = `Cartão adicionado. ID: ${c.id}`;
            }
            else if (funcName === 'listar_cartoes') {
              result = JSON.stringify(this.dm.data.cartoes || []);
            }
            else if (funcName === 'adicionar_compra_cartao') {
              const compra = {
                id: crypto.randomUUID(),
                cartaoId: args.cartaoId,
                descricao: args.descricao,
                data: args.data,
                valorTotal: parseFloat(args.valorTotal),
                parcelas: parseInt(args.parcelas),
                valorParcela: parseFloat(args.valorTotal) / parseInt(args.parcelas),
                mesInicio: String(args.data || '').slice(0, 7)
              };
              if (!this.dm.data.comprasCartao) this.dm.data.comprasCartao = [];
              this.dm.data.comprasCartao.push(compra);
              modifiedData = true;
              result = `Compra no cartão adicionada com sucesso. ID: ${compra.id}`;
            }
            else if (funcName === 'marcar_despesa_fixa') {
              const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const procurado = normalizar(args.descricao);
              const mesObj = this.dm.getMonth(this.currentMonth);
              const despesas = mesObj.gastosFixos || [];
              const gasto = despesas.find(item => normalizar(item.descricao) === procurado)
                || despesas.find(item => normalizar(item.descricao).includes(procurado) || procurado.includes(normalizar(item.descricao)));
              if (gasto) {
                gasto.pago = args.pago !== false;
                modifiedData = true;
                result = `${gasto.descricao} foi marcada como ${gasto.pago ? 'paga' : 'pendente'}.`;
              } else {
                result = `Não encontrei “${args.descricao}”. Contas disponíveis: ${despesas.map(item => item.descricao).join(', ')}.`;
              }
            }
            else if (funcName === 'registrar_producao') {
              const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const clinica = (this.dm.data.clinicas || []).find(item => normalizar(item.nome) === normalizar(args.clinica))
                || (this.dm.data.clinicas || []).find(item => normalizar(item.nome).includes(normalizar(args.clinica)));
              const valor = Number(args.valor);
              const partesData = String(args.data || '').split('-').map(Number);
              if (!clinica || !Number.isFinite(valor) || valor <= 0 || partesData.length !== 3 || !partesData[1] || !partesData[2]) {
                result = `Não consegui registrar. Clínicas disponíveis: ${(this.dm.data.clinicas || []).map(item => item.nome).join(', ')}.`;
              } else {
                const mesObj = this.dm.getMonth(partesData[1]);
                if (mesObj.diarias.modo === 'manual') {
                  if (!mesObj.diarias.manual[clinica.id]) mesObj.diarias.manual[clinica.id] = { diasPrevistos: 0, valorPrevisto: 0, diasReais: 0, valorReal: 0 };
                  mesObj.diarias.manual[clinica.id].diasReais += 1;
                  mesObj.diarias.manual[clinica.id].valorReal += valor;
                } else {
                  const dia = String(partesData[2]);
                  if (!mesObj.diarias.diasTrabalhados[dia]) mesObj.diarias.diasTrabalhados[dia] = [];
                  mesObj.diarias.diasTrabalhados[dia].push({ clinicaId: clinica.id, valor, comissao: 0 });
                }
                modifiedData = true;
                result = `Produção de ${formatCurrency(valor)} registrada em ${clinica.nome} no dia ${String(partesData[2]).padStart(2, '0')}/${String(partesData[1]).padStart(2, '0')}.`;
              }
            }
            else if (funcName === 'calcular_disponivel_mes') {
              const receitas = Number(this.calcTotalReceitas(this.currentMonth) || 0);
              const despesas = this.calcResumoDespesas(this.currentMonth);
              const prefixo = `${this.dm.data.year || YEAR}-${String(this.currentMonth).padStart(2, '0')}`;
              const aportesReserva = (this.dm.data.reserva?.movimentacoes || []).filter(item => item.tipo === 'deposito' && String(item.data || '').startsWith(prefixo)).reduce((total, item) => total + Number(item.valor || 0), 0);
              const aportesMetas = (this.dm.data.metas || []).flatMap(meta => meta.historico || []).filter(item => String(item.data || '').startsWith(prefixo)).reduce((total, item) => total + Number(item.valor || 0), 0);
              result = JSON.stringify({ receitas, pago: despesas.pago, pendente: despesas.pendente, aportes: aportesReserva + aportesMetas, disponivelAposCompromissos: receitas - despesas.total - aportesReserva - aportesMetas });
            }
            else if (funcName === 'simular_meta') {
              const inicial = Math.max(0, Number(args.valorInicial) || 0);
              const aporte = Math.max(0, Number(args.aporteMensal) || 0);
              const meses = Math.max(1, Math.min(600, parseInt(args.meses) || 1));
              const taxa = Math.max(0, Number(args.taxaMensal) || 0) / 100;
              let total = inicial;
              for (let mes = 0; mes < meses; mes++) total = total * (1 + taxa) + aporte;
              result = JSON.stringify({ valorInicial: inicial, aporteMensal: aporte, taxaMensalPercentual: taxa * 100, meses, totalProjetado: total, totalAportado: inicial + aporte * meses, rendimentos: total - inicial - aporte * meses });
            }
            else {
              result = "Ferramenta não reconhecida.";
            }

            this.conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result
            });
          }

          } finally {
            // Save mutations even if a later tool in the same response fails.
            if (modifiedData) {
              turnModified = true;
              const saved = await this.dm.saveNow();
              if (!saved) {
                saveFailed = true;
                throw new Error('ZONI_SAVE_FAILED');
              }
              this.conversationHistory[0].content = await this.getSystemPrompt();
              this.renderAll();
            }
          }

          const lInd = document.getElementById('iaLoadingIndicator');
          if (lInd) lInd.remove();
          addLoading();

        } else {
          if (!responseMessage.content?.trim()) throw new Error('NVIDIA_EMPTY_RESPONSE');
          this.conversationHistory.push({ role: 'assistant', content: responseMessage.content });
          runLoop = false;
        }
      }
      if (toolIterations >= 6 && runLoop) {
        this.conversationHistory.push({ role: 'assistant', content: 'Consegui avançar parcialmente, mas interrompi para manter suas ações seguras. Você pode continuar com uma nova mensagem.' });
      }
    } catch(e) {
      console.error('Falha no Zoni:', e);
      const timedOut = String(e?.message || '').includes('NVIDIA_TIMEOUT');
      // Complete unresolved tool messages before the next request.
      const resolved = new Set(this.conversationHistory.filter(message => message.role === 'tool').map(message => message.tool_call_id));
      for (const message of [...this.conversationHistory]) {
        for (const call of message.tool_calls || []) {
          if (!resolved.has(call.id)) {
            this.conversationHistory.push({ role: 'tool', tool_call_id: call.id, content: 'Execução interrompida. Não repetir esta ação automaticamente; consulte os dados atuais.' });
            resolved.add(call.id);
          }
        }
      }
      const errorMessage = String(e?.message || '');
      this.conversationHistory.push({
        role: 'assistant',
        content: saveFailed ? 'A alteração está na tela, mas não consegui confirmar a gravação na nuvem. Não repita o lançamento; verifique sua conexão e salve novamente.'
          : turnModified ? 'Algumas alterações confirmadas foram salvas, mas não consegui concluir a resposta. Não repita os lançamentos; consulte os dados atuais.'
          : /401|403/.test(errorMessage) ? 'A NVIDIA recusou o acesso. Verifique sua chave de API e as permissões do modelo nas Configurações.'
          : /429/.test(errorMessage) ? 'A NVIDIA atingiu o limite de solicitações. Aguarde um pouco antes de tentar novamente.'
          : /400|404/.test(errorMessage) ? 'A NVIDIA recusou a configuração da solicitação. Verifique se o modelo selecionado suporta ferramentas.'
          : timedOut
          ? 'A NVIDIA demorou mais que o esperado e interrompi esta tentativa. Nenhuma ação pendente foi repetida. Tente novamente.'
          : 'Não consegui concluir isso agora. Seus dados não foram alterados. Tente novamente em instantes.'
      });
    } finally {
    clearTimeout(slowTimer);
    const lInd = document.getElementById('iaLoadingIndicator');
    if (lInd) lInd.remove();
    this.zoniBusy = false;
    inputEl.disabled = false;
    if (sendButton) sendButton.disabled = false;
    this.renderChatHistory();
    inputEl.focus();
    }
  }

  async sugerirCategoriaAuto(descricao) {
    if (!descricao || descricao.trim().length < 3) return;
    const catLabel = document.getElementById('categoriaSugestaoLabel');
    const catSelect = document.getElementById('gastoVarCategoria');
    if (!catLabel || !catSelect || !this.dm.data.nvidiaApiKey) return;
    
    catLabel.style.display = 'block';
    catLabel.innerText = '✨ IA analisando transação...';

    const catDisp = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
    if (catDisp.length === 0) { catLabel.style.display = 'none'; return; }

    const prompt = `Você classifica despesas. Despesa: "${descricao}".
Categorias: ${JSON.stringify(catDisp)}
Retorne JSON com {"categoriaId": "id_da_categoria_escolhida"}. Se não conseguir, devolva a id da primeira. OBRIGATÓRIO DEVOLVER UM JSON VALIDO.`;

    try {
      const result = await this.callNvidia([{role: 'user', content: prompt}], 150, 0.1, true);
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
    if(!this.dm.data.nvidiaApiKey) { showToast('Configure sua chave da NVIDIA NIM primeiro.', 'error'); return; }

    input.disabled = true;
    btn.innerHTML = '✨ Processando...';

    const catDisp = (this.dm.data.categoriasVariaveis || []).map(c => ({ id: c.id, nome: c.nome }));
    const hoje = new Date().toISOString().slice(0,10);

    const prompt = `Hoje: ${hoje}. Texto: "${text}"
Categorias Variaveis: ${JSON.stringify(catDisp)}
Extraia os dados em formato JSON estrito, adivinhando a categoria correta:
{ "descricao": "nome", "valor": float_positivo, "data": "YYYY-MM-DD", "tipo": "variavel|fixo|receita", "categoriaId": "id_da_categoria_se_variavel_senao_null" }`;

    try {
      const result = await this.callNvidia([{role: 'user', content: prompt}], 300, 0.1, true);
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
    if(!this.dm.data.nvidiaApiKey) { showToast('Configure a API Key.', 'error'); return; }
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
      const result = await this.callNvidia([{role: 'user', content: prompt}], 800, 0.1, true);
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
    const prefix = `${this.dm.data.year || YEAR}-${currentMonthStr}`;
    
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
          <div class="forecast-label">${escapeHTML(c.nome)}</div>
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

  
  forcarNovoInsight() {
    if (this.insightBusy) return;
    this.insightRetryAt = 0;
    this.dm.data.insightTurnoId = null;
    this.dm.data.insightTexto = null;
    this.dm.save();
    this.checkAndFetchInsight();
  }

  renderInsightFallback(message, status = 'Disponível sob demanda') {
    const contentEl = document.getElementById('insightContent');
    const timerEl = document.getElementById('insightTimer');
    if (!contentEl) return;
    contentEl.innerHTML = `
      <div class="insight-fallback">
        <span>${escapeHTML(window.FinZoniContext.insight(this))}</span>
        <button class="btn btn-outline btn-sm" onclick="app.forcarNovoInsight()">Tentar novamente</button>
      </div>`;
    if (timerEl) timerEl.innerText = status === 'Tente novamente quando quiser' ? 'Resumo calculado • IA indisponível' : status;
  }

  async checkAndFetchInsight() {
    if (this.insightBusy || this.zoniBusy || Date.now() < (this.insightRetryAt || 0)) return;
    const apiKey = this.dm.data.nvidiaApiKey;
    const contentEl = document.getElementById('insightContent');
    const timerEl = document.getElementById('insightTimer');
    if (!contentEl) return;

    if (!apiKey) {
      contentEl.innerText = window.FinZoniContext.insight(this);
      if(timerEl) timerEl.innerText = "Resumo calculado • configure a IA para sugestões";
      return;
    }

    const agora = new Date();
    const hora = agora.getHours();
    
    // Calcula o turno atual: 0 (00h-07h), 1 (08h-15h), 2 (16h-23h)
    let turnoAtual = 0;
    if (hora >= 8 && hora < 16) turnoAtual = 1;
    else if (hora >= 16) turnoAtual = 2;
    
    const hojeStr = window.FinZoniContext.localDate(agora);
    const idTurno = `${hojeStr}-${turnoAtual}-${this.dm.data.year}-${this.currentMonth}`;

    const turnosNomes = ["(00:00 - 08:00)", "(08:00 - 16:00)", "(16:00 - 00:00)"];

    const localInsight = window.FinZoniContext.insight(this);
    const insightDataKey = JSON.stringify([localInsight, window.FinZoniContext.cardReport(this)]);
    if (this.dm.data.insightTurnoId === idTurno && this.dm.data.insightDataKey === insightDataKey && this.dm.data.insightTexto) {
      contentEl.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(this.dm.data.insightTexto) : this.dm.data.insightTexto;
      if(timerEl) timerEl.innerText = `Turno Atual ${turnosNomes[turnoAtual]}`;
      return;
    }

    contentEl.innerText = localInsight;
    if(timerEl) timerEl.innerText = "Analisando...";
    
    this.insightBusy = true;
    const insightUserId = this.dm.userId;
    try {
      // Pega o resumo de contexto
      const sysPrompt = 'Você é o Zoni. Dê uma sugestão breve baseada somente no resumo fornecido. Não calcule, não cite valores nem números, não invente informações. Responda em português, sem HTML e sem pensamentos internos.';

      const { data: aiData, error } = await window.nvidiaProxy({
          action: 'chat',
          apiKey: this.dm.data.nvidiaApiKey,
          model: this.dm.data.nvidiaModel || 'meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: `${localInsight}\nDê uma única sugestão útil, sem repetir os números.` }
          ],
          temperature: 0.2,
          max_tokens: 4096
      });

      if (error) throw new Error(error.message);
      const res = { ok: true, json: async () => aiData };
      const data = await res.json();

      let txt = data?.choices?.[0]?.message?.content;
      if (typeof txt !== 'string' || !txt.trim()) throw new Error('Resposta vazia da NVIDIA NIM');
      txt = txt.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      
      const commonPrefixes = ["The user wants me to", "Here is a", "Let's analyze", "I will", "Based on"];
      for (const prefix of commonPrefixes) {
        if (txt.toLowerCase().startsWith(prefix.toLowerCase())) {
           const splitIndex = txt.indexOf(':');
           const newlineIndex = txt.indexOf('\n');
           let breakIdx = -1;
           if (splitIndex !== -1 && newlineIndex !== -1) breakIdx = Math.min(splitIndex, newlineIndex);
           else if (splitIndex !== -1) breakIdx = splitIndex;
           else if (newlineIndex !== -1) breakIdx = newlineIndex;
           
           if (breakIdx !== -1) {
              txt = txt.substring(breakIdx + 1).trim();
           }
        }
      }
      
      if (!txt || /\d|R\$|<|>/.test(txt)) throw new Error('Sugestão inválida; preservar resumo calculado.');
      const novoInsight = `${localInsight}\n${txt}`;

      
            // Formata markdown básico antes de salvar e exibir
      const formattedInsight = novoInsight
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // negrito
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // itálico
        .replace(/\n/g, '<br/>'); // quebra de linha

      if (this.dm.userId !== insightUserId || this.currentMonth !== Number(idTurno.split('-').at(-1)) || window.FinZoniContext.insight(this) !== localInsight) return;
      this.dm.data.insightTurnoId = idTurno;
      this.dm.data.insightDataKey = insightDataKey;
      this.dm.data.insightTexto = formattedInsight;
      this.dm.save();
      
      contentEl.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(formattedInsight) : formattedInsight;
      if(timerEl) timerEl.innerText = `Turno Atual ${turnosNomes[turnoAtual]}`;
      
    } catch (e) {
      console.error('Falha ao gerar insight:', e);
      this.insightRetryAt = Date.now() + 60000;
      this.renderInsightFallback('Não consegui gerar seu insight agora.', 'Tente novamente quando quiser');
    } finally {
      this.insightBusy = false;
    }
  }

  // ── CHARTS ──
  renderCharts() {
    const renderers = [
      ['despesas', () => this.renderDespesasChart()],
      ['receitas/despesas', () => this.renderReceitasDespesasChart()],
      ['diárias', () => this.renderDiariasChart()],
      ['saldo', () => this.renderSaldoChart()]
    ];

    renderers.forEach(([name, render]) => {
      try {
        render();
      } catch (error) {
        console.error(`Erro ao renderizar gráfico de ${name}:`, error);
      }
    });
  }

  formatChartCurrency(value) {
    const n = Number(value) || 0;
    const abs = Math.abs(n);
    if (abs >= 1000000) return `R$ ${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return formatCurrency(n);
  }

  renderDespesasChart() {
    const mes = this.dm.getMonth(this.currentMonth);
    const cats = {};

    (mes.gastosFixos || []).forEach(g => {
      const label = g.descricao || 'Outros';
      const valor = g.compartilhado ? Number(g.valor || 0) / 2 : Number(g.valor || 0);
      cats[label] = (cats[label] || 0) + valor;
    });

    (mes.gastosVariaveis || []).forEach(g => {
      const label = g.descricao || 'Outros';
      cats[label] = (cats[label] || 0) + Number(g.valor || 0);
    });

    const isMobile = window.innerWidth <= 768;
    const maxCategorias = isMobile ? 5 : 7;
    const ordenadas = Object.entries(cats)
      .filter(([, valor]) => valor > 0)
      .sort((a, b) => b[1] - a[1]);

    const visiveis = ordenadas.slice(0, maxCategorias);
    if (ordenadas.length > maxCategorias) {
      const restante = ordenadas.slice(maxCategorias).reduce((total, [, valor]) => total + valor, 0);
      visiveis.push(['Outros', restante]);
    }

    const labels = visiveis.map(([label]) => label);
    const values = visiveis.map(([, valor]) => valor);
    const palette = ['#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f59e0b', '#06b6d4', '#64748b', '#ec4899'];

    if (this.charts.despesas) this.charts.despesas.destroy();

    const canvas = document.getElementById('chartDespesas');
    if (!canvas) return;

    const cColor = this.getChartColors();
    const total = values.reduce((sum, value) => sum + value, 0);

    if (!labels.length) {
      this.charts.despesas = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Sem dados'],
          datasets: [{ data: [1], backgroundColor: ['rgba(148,163,184,0.16)'], borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: isMobile ? 1.1 : 1.5,
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
      });
      return;
    }

    const centerTextPlugin = {
      id: 'centerTextFinZoni',
      afterDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;

        const arc = meta.data[0];
        const ctx = chart.ctx;
        const x = arc.x;
        const y = arc.y;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = cColor.text;
        ctx.font = `700 ${isMobile ? 17 : 19}px Inter`;
        ctx.fillText(formatCurrency(total), x, y + 8);
        ctx.fillStyle = document.documentElement.classList.contains('theme-light') ? '#64748b' : '#94a3b8';
        ctx.font = `600 ${isMobile ? 9 : 10}px Inter`;
        ctx.fillText('TOTAL', x, y - 17);
        ctx.restore();
      }
    };

    this.charts.despesas = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: palette.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: isMobile ? 1.08 : 1.35,
        cutout: '72%',
        layout: { padding: 6 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: cColor.text,
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              padding: isMobile ? 10 : 12,
              font: { family: 'Inter', size: isMobile ? 10 : 11 }
            }
          },
          tooltip: {
            backgroundColor: cColor.tooltipBg,
            titleColor: cColor.tooltipText,
            bodyColor: cColor.tooltipText,
            borderColor: cColor.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => {
                const valor = Number(ctx.raw || 0);
                const pct = total > 0 ? (valor / total) * 100 : 0;
                return `${ctx.label}: ${formatCurrency(valor)} · ${pct.toFixed(1)}%`;
              }
            }
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

    const isMobile = window.innerWidth <= 768;
    const cColor = this.getChartColors();
    const canvas = document.getElementById('chartReceitasDespesas');
    if (!canvas) return;

    this.charts.receitasDespesas = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: MONTHS.map(m => m.substring(0, 3)),
        datasets: [
          {
            label: 'Receitas',
            data: receitas,
            backgroundColor: 'rgba(16,185,129,0.82)',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: isMobile ? 15 : 22
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: 'rgba(239,68,68,0.80)',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: isMobile ? 15 : 22
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: isMobile ? 1.18 : 1.65,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: cColor.text,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: isMobile ? 6 : 12,
              font: { family: 'Inter', size: isMobile ? 10 : 11 }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: cColor.grid },
            ticks: {
              color: cColor.text,
              maxTicksLimit: 5,
              font: { family: 'Inter', size: isMobile ? 10 : 11 },
              callback: value => this.formatChartCurrency(value)
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: cColor.text,
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              padding: 14,
              font: { family: 'Inter', size: isMobile ? 10 : 11 }
            }
          },
          tooltip: {
            backgroundColor: cColor.tooltipBg,
            titleColor: cColor.tooltipText,
            bodyColor: cColor.tooltipText,
            borderColor: cColor.tooltipBorder,
            borderWidth: 1,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` }
          }
        }
      }
    });
  }

  renderDiariasChart() {
    const totals = this.calcDiariasAuto(this.currentMonth);
    const clinicas = this.dm.data.clinicas || [];

    if (this.charts.diarias) this.charts.diarias.destroy();

    const isMobile = window.innerWidth <= 768;
    const cColor = this.getChartColors();
    const canvas = document.getElementById('chartDiarias');
    if (!canvas) return;

    const dados = clinicas.map(c => ({
      nome: c.nome,
      cor: c.cor || '#3b82f6',
      dias: Number(totals[c.id]?.dias || 0),
      valor: Number(totals[c.id]?.valor || 0)
    }));

    this.charts.diarias = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: dados.map(item => item.nome),
        datasets: [{
          label: 'Ganhos',
          data: dados.map(item => item.valor),
          backgroundColor: dados.map(item => item.cor + 'CC'),
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: isMobile ? 1.22 : 1.75,
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: cColor.grid },
            ticks: {
              color: cColor.text,
              maxTicksLimit: 5,
              font: { family: 'Inter', size: isMobile ? 10 : 11 },
              callback: value => this.formatChartCurrency(value)
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: cColor.text,
              font: { family: 'Inter', size: isMobile ? 10 : 11, weight: '600' }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cColor.tooltipBg,
            titleColor: cColor.tooltipText,
            bodyColor: cColor.tooltipText,
            borderColor: cColor.tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: ctx => {
                const item = dados[ctx.dataIndex];
                return [`Ganhos: ${formatCurrency(item.valor)}`, `${item.dias} ${item.dias === 1 ? 'diária' : 'diárias'}`];
              }
            }
          }
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

    const isMobile = window.innerWidth <= 768;
    const cColor = this.getChartColors();
    const canvas = document.getElementById('chartSaldo');
    if (!canvas) return;

    this.charts.saldo = new Chart(canvas, {
      type: 'line',
      data: {
        labels: MONTHS.map(m => m.substring(0, 3)),
        datasets: [{
          label: 'Saldo',
          data: saldos,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.10)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: saldos.map(s => s >= 0 ? '#10b981' : '#ef4444'),
          pointBorderColor: saldos.map(s => s >= 0 ? '#10b981' : '#ef4444'),
          pointRadius: isMobile ? 3 : 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: isMobile ? 1.2 : 1.7,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: cColor.text,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: isMobile ? 6 : 12,
              font: { family: 'Inter', size: isMobile ? 10 : 11 }
            }
          },
          y: {
            grid: { color: cColor.grid },
            ticks: {
              color: cColor.text,
              maxTicksLimit: 6,
              font: { family: 'Inter', size: isMobile ? 10 : 11 },
              callback: value => this.formatChartCurrency(value)
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cColor.tooltipBg,
            titleColor: cColor.tooltipText,
            bodyColor: cColor.tooltipText,
            borderColor: cColor.tooltipBorder,
            borderWidth: 1,
            callbacks: { label: ctx => `Saldo: ${formatCurrency(ctx.raw)}` }
          }
        }
      }
    });
  }

  // ── DIÃRIAS ──
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
      `<div class="legend-item"><div class="legend-dot" style="background:${c.cor}"></div>${escapeHTML(c.nome)} (${formatCurrency(c.diariaPadrao)})</div>`
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
          <div class="forecast-label" style="color:${c.cor}">${escapeHTML(c.nome)}</div>
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
      <div class="forecast-item" style="border:1px solid var(--border-light);background:var(--bg-card);">
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
    const daysInMonth = getDaysInMonth(this.currentMonth, this.dm.data.year || YEAR);
    const firstDay = getFirstDayOfMonth(this.currentMonth, this.dm.data.year || YEAR);
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
    document.getElementById('modalDiaLabel').textContent = `${day} de ${MONTHS[this.currentMonth - 1]} de ${this.dm.data.year || YEAR}`;

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
            <span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span>
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
          <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
          <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
      const recordIndex = mes.gastosFixos.indexOf(g);
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
        <tr data-expense-index="${recordIndex}" style="opacity: ${g.pago ? '0.6' : '1'}; transition: opacity 0.2s;">
          <td>
            ${escapeHTML(g.descricao)}
            ${g.compartilhado ? '<span class="shared-badge">50/50</span>' : ''}
          </td>
          <td class="text-right">
            <input type="number" class="editable-value" style="width:50px;text-align:center;" value="${g.vencimento||''}" min="1" max="31" placeholder="-"
              onchange="app.updateGastoFixo('', 'vencimento', this.value, ${recordIndex})"
              onkeydown="if(event.key==='Enter') this.blur();">
            <br/>${badge}
          </td>
          <td class="text-right">
            <input type="text" inputmode="decimal" class="editable-value value-negative" value="${g.valor||0}"
              onchange="app.updateGastoFixo('', 'valor', this.value, ${recordIndex})"
              onkeydown="if(event.key==='Enter') this.blur();">
          </td>
          <td class="text-center">
            <input type="checkbox" ${g.compartilhado ? 'checked' : ''}
              onchange="app.updateGastoFixo('', 'compartilhado', this.checked, ${recordIndex})">
          </td>
          <td class="text-right value-negative">${formatCurrency(minhaParte)}</td>
          <td class="text-center">
            <input type="checkbox" ${g.pago ? 'checked' : ''}
              onchange="app.updateGastoFixo('', 'pago', this.checked, ${recordIndex})">
          </td>
          <td>
            <button class="btn-icon" onclick="app.deleteGastoFixo('', ${recordIndex})" title="Remover" aria-label="Remover despesa fixa">&#128465;</button>
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
            <input type="text" class="editable-value" value="${escapeHTML(g.descricao)}"
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
          <td><button class="btn-icon" onclick="app.deleteGastoVar('${g.id}')" title="Remover" aria-label="Remover despesa">&#128465;</button></td>
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
              <span style="font-size:0.85rem;font-weight:600;">${escapeHTML(cat.nome)}</span>
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
    const resumo = this.calcResumoDespesas(this.currentMonth);
    document.getElementById('despesasPagasMes').textContent = formatCurrency(resumo.pago);
    document.getElementById('despesasPendentesMes').textContent = formatCurrency(resumo.pendente);
    document.getElementById('totalDespesasMes').textContent = formatCurrency(resumo.total);
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

  async updateGastoFixo(id, field, value, recordIndex) {
    const mes = this.dm.getMonth(this.currentMonth);
    const g = Number.isInteger(recordIndex)
      ? mes.gastosFixos[recordIndex]
      : mes.gastosFixos.find(x => String(x.id) === String(id));
    if (g) {
      if (field === 'valor') {
        const strVal = String(value).replace(',', '.');
        g[field] = parseFloat(strVal) || 0;
      }
      else if (field === 'vencimento') {
        g[field] = value;
      }
      else if (field === 'pago' || field === 'compartilhado') {
        g[field] = (value === true || value === 'true');
      }
      else {
        g[field] = value;
      }
      if (field === 'pago' || field === 'compartilhado') {
        // Reflect the change immediately and persist this exact state before
        // allowing a later save to overtake it.
        this.renderDespesas();
        this.renderDashboard();
        await this.dm.saveNow();
      } else {
        this.dm.save();
        this.renderDespesas();
        this.renderDashboard();
      }
    }
  }

  deleteGastoFixo(id, recordIndex) {
    const mes = this.dm.getMonth(this.currentMonth);
    if (Number.isInteger(recordIndex)) {
      mes.gastosFixos.splice(recordIndex, 1);
    } else {
      mes.gastosFixos = mes.gastosFixos.filter(g => String(g.id) !== String(id));
    }
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
              <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
              <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
            <input type="text" class="editable-value" value="${escapeHTML(r.descricao)}"
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
          <td><button class="btn-icon" onclick="app.deleteReceita('${r.id}')" title="Remover" aria-label="Remover receita">&#128465;</button></td>
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
            <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
            <td><span style="color:${c.cor};font-weight:600;">${escapeHTML(c.nome)}</span></td>
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
          <td><button class="btn-icon" onclick="app.deleteReservaMov('${m.id}')" title="Remover" aria-label="Remover movimentação">&#128465;</button></td>
        </tr>`;
    });
    movBody.innerHTML = movHTML || '<tr><td colspan="5" class="text-center" style="color:var(--text-muted);padding:24px;">Nenhuma movimentação registrada</td></tr>';

    // Reserve notes
    document.getElementById('reservaObs').value = this.dm.data.reserva.obs || '';

    // Goals
    this.renderMetas();
    this.renderAchievements();
    
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
        return `<div class="goal-history-row fs-sm">
          <span>${h.data} — ${formatCurrency(h.valor)} ${h.obs ? '— ' + h.obs : ''}</span>
          <button class="btn-icon" onclick="app.deleteAporteMeta('${meta.id}', ${actualIdx})" title="Remover aporte" aria-label="Remover aporte">&#128465;</button>
        </div>`;
      }).join('');

      // Calculate investido no mês
      const currentMonthStr = String(this.currentMonth).padStart(2, '0');
      const prefix = `${this.dm.data.year || YEAR}-${currentMonthStr}`;
      let investidoMes = 0;
      (meta.historico || []).forEach(h => {
        if (h.data && h.data.startsWith(prefix)) {
          investidoMes += h.valor;
        }
      });

      return `
        <div class="goal-card">
          <div class="goal-header">
            <div class="goal-name">🎯 ${escapeHTML(meta.nome)}</div>
            <div class="goal-actions">
              <button class="btn btn-success btn-sm" onclick="app.openUpdateMeta('${meta.id}')">+ Adicionar</button>
              <button class="btn-icon" onclick="app.openModalEditarMeta('${meta.id}')" title="Editar" aria-label="Editar meta">&#9998;</button>
              <button class="btn-icon" onclick="app.deleteMeta('${meta.id}')" title="Excluir" aria-label="Excluir meta">&#128465;</button>
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

  // ── CARTÃ•ES DE CRÉDITO ──
  saveCartao() {
    const nome = document.getElementById('cartaoNome').value.trim();
    const limite = parseFloat(document.getElementById('cartaoLimite').value);
    const fechamento = parseInt(document.getElementById('cartaoFechamento').value);
    const vencimento = parseInt(document.getElementById('cartaoVencimento').value);
    const cor = document.getElementById('cartaoCor').value;
    
    if (!nome || !Number.isFinite(limite) || limite <= 0 || !Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31 || !Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
      showToast('Preencha todos os campos do cartão!', 'error');
      return;
    }
    
    if (Number.isInteger(this.editingCartaoIndex) && this.dm.data.cartoes[this.editingCartaoIndex]) {
      Object.assign(this.dm.data.cartoes[this.editingCartaoIndex], { nome, limite, fechamento, vencimento, cor });
    } else {
      const novoCartao = { id: generateId(), nome, limite, fechamento, vencimento, cor };
      this.dm.data.cartoes.push(novoCartao);
      this.selectedCartaoId = novoCartao.id;
      this.faturaFilterAll = false;
    }
    this.editingCartaoIndex = null;
    this.dm.save();
    closeModal('modalCartao');
    this.renderAll();
    showToast('Cartão salvo!', 'success');
  }

  editCartao(index) {
    const cartao = (this.dm.data.cartoes || [])[index];
    if (!cartao) return;
    this.editingCartaoIndex = index;
    document.getElementById('cartaoNome').value = cartao.nome || '';
    document.getElementById('cartaoLimite').value = cartao.limite != null && Number.isFinite(Number(cartao.limite)) ? Number(cartao.limite) : '';
    document.getElementById('cartaoFechamento').value = cartao.fechamento != null && Number.isFinite(Number(cartao.fechamento)) ? Number(cartao.fechamento) : '';
    document.getElementById('cartaoVencimento').value = cartao.vencimento != null && Number.isFinite(Number(cartao.vencimento)) ? Number(cartao.vencimento) : '';
    document.getElementById('cartaoCor').value = cartao.cor || '#8a05be';
    document.getElementById('modalCartaoTitle').textContent = 'Configurar Cartão';
    document.getElementById('btnSalvarCartao').textContent = 'Salvar Alterações';
    openModal('modalCartao');
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
    const rail = document.getElementById('cartoesGrid');
    const dots = document.getElementById('cartoesDots');
    if (!rail) return;

    const cartoes = this.dm.data.cartoes || [];
    if (cartoes.length === 0) {
      this.selectedCartaoId = null;
      rail.innerHTML = `
        <div class="wallet-empty-state">
          <strong>Sua carteira está vazia</strong>
          <span>Cadastre um cartão para acompanhar faturas e limite disponível.</span>
          <button class="btn btn-primary" onclick="document.getElementById('btnAddCartao').click()">+ Adicionar cartão</button>
        </div>`;
      if (dots) dots.innerHTML = '';
      this.updateWalletSummary(null);
      return;
    }

    const selectedExists = cartoes.some(c => String(c.id) === String(this.selectedCartaoId));
    if (!selectedExists) {
      const preferred = cartoes.find(c => Number(c.limite) > 0 && Number(c.vencimento) > 0) || cartoes[0];
      this.selectedCartaoId = preferred.id;
    }

    const holder = String(this.dm.data.perfil?.nome || 'Titular do cartão').toUpperCase();
    const monthKey = `${this.dm.data.year || YEAR}-${String(this.currentMonth).padStart(2, '0')}`;

    rail.innerHTML = cartoes.map((c, index) => {
      const selected = String(c.id) === String(this.selectedCartaoId);
      const limite = Number(c.limite);
      const fechamento = Number(c.fechamento);
      const vencimento = Number(c.vencimento);
      const limiteValido = Number.isFinite(limite) && limite > 0;
      const fechamentoValido = Number.isInteger(fechamento) && fechamento >= 1 && fechamento <= 31;
      const vencimentoValido = Number.isInteger(vencimento) && vencimento >= 1 && vencimento <= 31;
      const cadastroIncompleto = !limiteValido || !fechamentoValido || !vencimentoValido;
      const nomeNormalizado = String(c.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const brandClass = nomeNormalizado.includes('itau') ? 'is-itau' : nomeNormalizado.includes('amazon') ? 'is-amazon' : 'is-generic';
      const brandMark = nomeNormalizado.includes('amazon') ? 'a' : nomeNormalizado.includes('itau') ? 'itaú' : escapeHTML(String(c.nome || '?').slice(0, 1).toUpperCase());
      const ending = String(c.id ?? index).replace(/\D/g, '').slice(-4).padStart(4, '0');
      const currentInvoice = this.calcFaturaCartao(c.id, monthKey);

      return `
        <article class="wallet-credit-card ${brandClass} ${selected ? 'is-selected' : ''} ${cadastroIncompleto ? 'is-incomplete' : ''}"
          style="--wallet-card-color:${c.cor || '#2563eb'}" onclick="app.selectCartao(${index})"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.selectCartao(${index})}" role="button" tabindex="0"
          aria-label="Selecionar ${escapeHTML(c.nome || 'cartão')}" aria-pressed="${selected}">
          <div class="wallet-card-top">
            <div class="wallet-brand"><span class="wallet-brand-mark">${brandMark}</span><strong>${escapeHTML(c.nome || 'Cartão')}</strong></div>
            <span class="wallet-contactless" aria-hidden="true">)))</span>
          </div>
          <div class="wallet-chip" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="wallet-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;${ending}</div>
          <div class="wallet-card-bottom">
            <div><span>Titular</span><strong>${escapeHTML(holder)}</strong></div>
            <strong class="wallet-card-network">VISA</strong>
          </div>
          <div class="wallet-card-meta">
            <span>${fechamentoValido ? `Fecha dia ${fechamento}` : 'Fechamento não informado'}</span>
            <span>${vencimentoValido ? `Vence dia ${vencimento}` : 'Vencimento não informado'}</span>
          </div>
          <div class="wallet-card-footer">
            <span>${cadastroIncompleto ? 'Complete os dados para ver o resumo' : `Fatura ${formatCurrency(currentInvoice)}`}</span>
            <button class="wallet-card-edit" onclick="event.stopPropagation();app.editCartao(${index})" aria-label="${cadastroIncompleto ? 'Completar dados' : 'Editar cartão'}">${cadastroIncompleto ? 'Completar dados' : 'Editar'}</button>
          </div>
        </article>`;
    }).join('');

    if (dots) {
      dots.innerHTML = cartoes.map(c => `<span class="${String(c.id) === String(this.selectedCartaoId) ? 'active' : ''}"></span>`).join('');
    }
    const previousButton = document.getElementById('walletCardPrev');
    const nextButton = document.getElementById('walletCardNext');
    if (previousButton) previousButton.disabled = cartoes.length < 2;
    if (nextButton) nextButton.disabled = cartoes.length < 2;
    const selectedCard = cartoes.find(c => String(c.id) === String(this.selectedCartaoId));
    this.updateWalletSummary(selectedCard || cartoes[0]);
  }

  valorParcelaCartao(compra, index) {
    const parcelas = Math.max(1, Math.min(600, Math.trunc(Number(compra.parcelas) || 1)));
    const total = Number(compra.valorTotal);
    const stored = Number(compra.valorParcela);
    if (Number.isFinite(total) && total > 0 && (!Number.isFinite(stored) || Math.abs(stored - total / parcelas) < 0.011)) {
      const cents = Math.round(total * 100);
      const regular = Math.floor(cents / parcelas);
      return (index === parcelas - 1 ? cents - regular * (parcelas - 1) : regular) / 100;
    }
    return Number.isFinite(stored) ? Math.round(stored * 100) / 100 : 0;
  }

  parcelasFaturaCartao(cartaoId, monthKey) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey))) return [];
    const [targetYear, targetMonth] = String(monthKey).split('-').map(Number);
    return (this.dm.data.comprasCartao || []).flatMap(compra => {
      if (cartaoId !== 'all' && String(compra.cartaoId) !== String(cartaoId)) return [];
      const inicio = compra.mesInicio || String(compra.data || '').slice(0, 7);
      const [startYear, startMonth] = inicio.split('-').map(Number);
      if (![targetYear, targetMonth, startYear, startMonth].every(Number.isFinite) || startMonth < 1 || startMonth > 12) return [];
      const diff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
      const parcelas = Math.max(1, Number(compra.parcelas) || 1);
      return diff >= 0 && diff < parcelas ? [{ compra, parcelaAtual: diff + 1, valor: this.valorParcelaCartao(compra, diff) }] : [];
    });
  }

  calcFaturaCartao(cartaoId, monthKey) {
    return this.parcelasFaturaCartao(cartaoId, monthKey).reduce((total, item) => total + Math.round(item.valor * 100), 0) / 100;
  }

  calcCartaoEmAberto(cartaoId, monthKey) {
    const [targetYear, targetMonth] = String(monthKey).split('-').map(Number);
    return (this.dm.data.comprasCartao || []).reduce((total, compra) => {
      if (String(compra.cartaoId) !== String(cartaoId)) return total;
      const inicio = compra.mesInicio || String(compra.data || '').slice(0, 7);
      const [startYear, startMonth] = inicio.split('-').map(Number);
      if (![targetYear, targetMonth, startYear, startMonth].every(Number.isFinite)) return total;
      const diff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
      const parcelas = Math.max(1, Number(compra.parcelas) || 1);
      const remaining = diff < 0 ? parcelas : diff >= parcelas ? 0 : parcelas - diff;
      let remainingCents = 0;
      for (let index = parcelas - remaining; index < parcelas; index++) remainingCents += Math.round(this.valorParcelaCartao(compra, index) * 100);
      return total + remainingCents / 100;
    }, 0);
  }

  updateWalletSummary(cartao) {
    const summary = document.getElementById('walletSummary');
    if (!summary) return;
    const year = this.dm.data.year || YEAR;
    const monthKey = `${year}-${String(this.currentMonth).padStart(2, '0')}`;
    const limite = Number(cartao?.limite);
    const limiteValido = Number.isFinite(limite) && limite > 0;
    const vencimento = Number(cartao?.vencimento);
    const fechamento = Number(cartao?.fechamento);
    const vencimentoValido = Number.isInteger(vencimento) && vencimento >= 1 && vencimento <= 31;
    const fechamentoValido = Number.isInteger(fechamento) && fechamento >= 1 && fechamento <= 31;
    const faturaAtual = cartao ? this.calcFaturaCartao(cartao.id, monthKey) : 0;
    const emAberto = cartao ? this.calcCartaoEmAberto(cartao.id, monthKey) : 0;
    const disponivel = limiteValido ? Math.max(0, limite - emAberto) : null;
    const percentual = limiteValido ? Math.min(100, Math.max(0, (emAberto / limite) * 100)) : 0;

    document.getElementById('walletOpenAmount').textContent = formatCurrency(faturaAtual);
    document.getElementById('walletAvailableLimit').textContent = disponivel == null ? '—' : formatCurrency(disponivel);
    document.getElementById('walletLimitPercent').textContent = limiteValido ? `${percentual.toFixed(0)}% usado` : '—';
    document.getElementById('walletTotalLimit').textContent = limiteValido ? `de ${formatCurrency(limite)}` : 'Limite não informado';
    document.getElementById('walletLimitFill').style.width = `${percentual}%`;
    document.getElementById('walletDueLabel').textContent = vencimentoValido ? `Vence dia ${vencimento}` : 'Vencimento não informado';
    document.getElementById('walletBestDay').textContent = fechamentoValido ? `Dia ${fechamento === 31 ? 1 : fechamento + 1}` : '—';
    document.getElementById('walletDueDays').textContent = vencimentoValido ? this.getWalletDueText(vencimento) : 'Complete os dados';
    summary.style.setProperty('--wallet-accent', cartao?.cor || '#22a8ff');
  }

  getWalletDueText(vencimento) {
    const now = new Date();
    const displayYear = this.dm.data.year || YEAR;
    if (now.getFullYear() !== displayYear || now.getMonth() + 1 !== this.currentMonth) return `Dia ${vencimento}`;
    const due = new Date(displayYear, this.currentMonth - 1, vencimento, 23, 59, 59);
    const days = Math.ceil((due - now) / 86400000);
    if (days < 0) return 'Vencida';
    if (days === 0) return 'Vence hoje';
    return `${days} dia${days === 1 ? '' : 's'}`;
  }

  selectCartao(index) {
    const cartao = (this.dm.data.cartoes || [])[index];
    if (!cartao) return;
    this.selectedCartaoId = cartao.id;
    this.faturaFilterAll = false;
    this.renderCartoes();
    const select = document.getElementById('faturaCartaoSelect');
    if (select) select.value = String(cartao.id);
    this.renderFaturas();
    this.scrollSelectedCartaoIntoView();
  }

  navigateCartao(direction) {
    const cartoes = this.dm.data.cartoes || [];
    if (cartoes.length < 2) return;
    const currentIndex = Math.max(0, cartoes.findIndex(card => String(card.id) === String(this.selectedCartaoId)));
    const nextIndex = (currentIndex + direction + cartoes.length) % cartoes.length;
    this.selectCartao(nextIndex);
  }

  scrollSelectedCartaoIntoView() {
    requestAnimationFrame(() => {
      const rail = document.getElementById('cartoesGrid');
      const selected = rail?.querySelector('.wallet-credit-card.is-selected');
      if (!rail || !selected) return;
      const target = selected.offsetLeft - Math.max(0, (rail.clientWidth - selected.offsetWidth) / 2);
      rail.scrollLeft = Math.max(0, target);
    });
  }

  handleFaturaCartaoChange() {
    const select = document.getElementById('faturaCartaoSelect');
    if (select?.value && select.value !== 'all') {
      this.faturaFilterAll = false;
      this.selectedCartaoId = select.value;
      this.renderCartoes();
    } else if (select?.value === 'all') {
      this.faturaFilterAll = true;
    }
    this.renderFaturas();
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
    
    const previousCardFilter = selCartao.value;
    selCartao.innerHTML = '<option value="all">Todos os Cartões</option>' + (this.dm.data.cartoes||[]).map(c=>`<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('');
    const desiredCardFilter = this.faturaFilterAll ? 'all' : (this.selectedCartaoId ?? previousCardFilter ?? 'all');
    if (Array.from(selCartao.options).some(option => String(option.value) === String(desiredCardFilter))) {
      selCartao.value = String(desiredCardFilter);
    }
    
    const selectedMonth = selMonth.value;
    const selectedCartaoId = selCartao.value;
    
    let itemsHTML = '';
    let faturaTotal = 0;
    
    const compras = this.parcelasFaturaCartao(selectedCartaoId, selectedMonth);
    const cartoesDict = {};
    (this.dm.data.cartoes||[]).forEach(c => cartoesDict[c.id] = c);
    
    compras.forEach(({ compra, parcelaAtual, valor }) => {
       if (selectedCartaoId !== 'all' && String(compra.cartaoId) !== String(selectedCartaoId)) return;
       
       const [y1, m1] = (compra.mesInicio || String(compra.data || '').slice(0, 7)).split('-').map(Number);
       const [y2, m2] = selectedMonth.split('-').map(Number);
       const diffMonths = (y2 - y1) * 12 + (m2 - m1);
       
       if (diffMonths >= 0 && diffMonths < compra.parcelas) {
          const cartao = cartoesDict[compra.cartaoId];
          faturaTotal += Math.round(valor * 100);
          itemsHTML += `
            <tr>
              <td>${compra.data.split('-').reverse().join('/')}</td>
              <td><span style="border-bottom:2px solid ${cartao?.cor||'#fff'}">${cartao?.nome || 'Desconhecido'}</span></td>
              <td>${escapeHTML(compra.descricao)}</td>
              <td class="text-center">${parcelaAtual}/${compra.parcelas}</td>
              <td class="text-right value-negative">${formatCurrency(valor)}</td>
              <td><button class="btn-icon" onclick="app.deleteCompraCartao('${compra.id}')" title="Excluir Compra Inteira" aria-label="Excluir compra">&#128465;</button></td>
            </tr>
          `;
       }
    });
    
    tbody.innerHTML = itemsHTML || '<tr><td colspan="6" class="text-center text-muted">Nenhuma compra nesta fatura.</td></tr>';
    totalEl.textContent = formatCurrency(faturaTotal / 100);

    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(selectedYear, selectedMonthNumber, 1);
    const nextMonthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    const filterId = selectedCartaoId === 'all' ? 'all' : selectedCartaoId;
    const nextTotal = this.calcFaturaCartao(filterId, nextMonthKey);
    const selectedCard = (this.dm.data.cartoes || []).find(card => String(card.id) === String(selectedCartaoId));
    const dueDay = Number(selectedCard?.vencimento);
    const dueValid = Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31;
    const shortYear = String(selectedYear).slice(-2);
    const nextShortYear = String(nextDate.getFullYear()).slice(-2);
    const currentTitle = document.getElementById('walletCurrentInvoiceTitle');
    const currentDue = document.getElementById('walletCurrentInvoiceDue');
    const nextTitle = document.getElementById('walletNextInvoiceTitle');
    const nextDue = document.getElementById('walletNextInvoiceDue');
    const nextValue = document.getElementById('walletNextInvoiceValue');
    if (currentTitle) currentTitle.textContent = `Fatura atual · ${MONTHS[selectedMonthNumber - 1].slice(0, 3)}/${shortYear}`;
    if (nextTitle) nextTitle.textContent = `Próxima fatura · ${MONTHS[nextDate.getMonth()].slice(0, 3)}/${nextShortYear}`;
    if (currentDue) currentDue.textContent = dueValid ? `Vence ${String(dueDay).padStart(2, '0')}/${String(selectedMonthNumber).padStart(2, '0')}/${selectedYear}` : selectedCartaoId === 'all' ? 'Todos os cartões' : 'Vencimento não informado';
    if (nextDue) nextDue.textContent = dueValid ? `Vence ${String(dueDay).padStart(2, '0')}/${String(nextDate.getMonth() + 1).padStart(2, '0')}/${nextDate.getFullYear()}` : selectedCartaoId === 'all' ? 'Todos os cartões' : 'Vencimento não informado';
    if (nextValue) nextValue.textContent = formatCurrency(nextTotal);
  }

  deleteCompraCartao(id) {
    if (!confirm('Deseja excluir esta compra e TODAS as suas parcelas do cartão?')) return;
    this.dm.data.comprasCartao = this.dm.data.comprasCartao.filter(c => String(c.id) !== String(id));
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
        <td style="font-weight:600;">${escapeHTML(c.nome)}</td>
        <td class="text-right">
          <input type="number" class="editable-value" value="${c.diariaPadrao}" step="0.01"
            onchange="app.updateClinicaDiaria('${c.id}',this.value)">
        </td>
        <td>
          <input type="color" value="${c.cor}" style="width:36px;height:28px;border:none;cursor:pointer;background:transparent;"
            onchange="app.updateClinicaCor('${c.id}',this.value)">
        </td>
        <td>
          <button class="btn-icon" onclick="app.deleteClinica('${c.id}')" title="Remover" aria-label="Remover clínica">&#128465;</button>
        </td>
      </tr>
    `).join('');

    // Fixed categories
    const catBody = document.getElementById('categoriasFixasBody');
    catBody.innerHTML = this.dm.data.categoriasFixas.map(cat => `
      <tr>
        <td>${escapeHTML(cat.nome)}</td>
        <td class="text-center">
          <input type="checkbox" ${cat.compartilhado ? 'checked' : ''}
            onchange="app.updateCatFixaCompart('${cat.id}',this.checked)">
        </td>
        <td>
          <button class="btn-icon" onclick="app.deleteCatFixa('${cat.id}')" title="Remover" aria-label="Remover categoria fixa">&#128465;</button>
        </td>
      </tr>
    `).join('');

    // Variable categories
    const cvBody = document.getElementById('categoriasVarBody');
    if (cvBody) {
      cvBody.innerHTML = (this.dm.data.categoriasVariaveis || []).map(cat => `
        <tr>
          <td>
            <input type="text" class="editable-value" value="${escapeHTML(cat.nome)}"
              onchange="app.updateCatVarNome('${cat.id}',this.value)">
          </td>
          <td class="text-right">
            <input type="number" class="editable-value value-negative" style="text-align:right" value="${cat.orcamento}"
              onchange="app.updateCatVarOrcamento('${cat.id}',this.value)">
          </td>
          <td>
            <button class="btn-icon" onclick="app.deleteCatVar('${cat.id}')" title="Remover" aria-label="Remover categoria variável">&#128465;</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="text-center text-muted">Nenhuma categoria variável</td></tr>';
    }

    // API Keys
    const appsEl = document.getElementById('appsScriptUrl');
    if (appsEl) appsEl.value = this.dm.data.appsScriptUrl || '';
    
    const groqEl = document.getElementById('nvidiaApiKey');
    if (groqEl) groqEl.value = this.dm.data.nvidiaApiKey || '';

    const modelEl = document.getElementById('nvidiaModelSelect');
    if (modelEl) {
      const currentModel = this.dm.data.nvidiaModel || 'meta/llama-3.1-8b-instruct';
      let found = false;
      for (let i = 0; i < modelEl.options.length; i++) {
        if (modelEl.options[i].value === currentModel) found = true;
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = currentModel;
        opt.innerText = currentModel;
        modelEl.appendChild(opt);
      }
      modelEl.value = currentModel;
    }
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
      <div style="max-width: 800px; margin: 0 auto; color: #333; font-family: 'Outfit', Arial, sans-serif;">
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
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHTML(g.descricao)}</td>
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
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHTML(g.descricao)}</td>
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
          diarias.push(`${escapeHTML(c.nome)}: ${dAuto[c.id].dias} dias - ${formatCurrency(dAuto[c.id].total)}`);
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
      outrasReceitas.push(`${escapeHTML(r.descricao)}: ${formatCurrency(r.valor)}`);
    });

    // Prepare gastos fixos
    const gastosFixos = [];
    (mes.gastosFixos || []).forEach(g => {
      const valorStr = formatCurrency(g.compartilhado ? g.valor / 2 : g.valor);
      const statusStr = g.pago ? 'Pago' : 'Pendente';
      gastosFixos.push(`${escapeHTML(g.descricao)}: ${valorStr} (${statusStr})`);
    });

    // Prepare gastos variáveis
    const gastosVariaveis = [];
    (mes.gastosVariaveis || []).forEach(g => {
      gastosVariaveis.push(`${escapeHTML(g.descricao)}: ${formatCurrency(g.valor)} - Data: ${g.data || '-'}`);
    });

    // Prepare investimentos
    const res = this.calcReserva();
    const investimentos = {
      reservaSaldo: formatCurrency(res.saldo),
      metas: (this.dm.data.metas || []).map(meta => {
        const pct = meta.valorMeta > 0 ? (meta.valorAtual / meta.valorMeta * 100).toFixed(1) : 0;
        return `${escapeHTML(meta.nome)}: ${formatCurrency(meta.valorAtual)} de ${formatCurrency(meta.valorMeta)} (${pct}%)`;
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
  // â•â•â•â•â•â•â•â•â•â•â• NEW FEATURES (PROFILE, GAMIFICATION, EXTRATO) â•â•â•â•â•â•â•â•â•â•â•
  openProfileModal() {
    const p = this.dm.data.perfil || (this.dm.data.perfil = {});
    const nameInput = document.getElementById('profileNameInput');
    const riskInput = document.getElementById('profileRiskInput');
    const goalInput = document.getElementById('profileGoalInput');
    const aporteInput = document.getElementById('profileMonthlyContributionInput');
    const horizonInput = document.getElementById('profileHorizonInput');
    const preview = document.getElementById('profilePicPreview');

    if (nameInput) nameInput.value = p.nome || '';
    if (riskInput) riskInput.value = p.perfilRisco || 'moderado';
    if (goalInput) goalInput.value = p.objetivoFinanceiro || '';
    if (aporteInput) aporteInput.value = Number(p.aporteMensal || 0) || '';
    if (horizonInput) horizonInput.value = Number(p.horizonteAnos || 0) || '';
    if (preview) {
      preview.src = p.foto || document.getElementById('userProfilePic')?.src || '';
    }

    const nivel = Number(p.nivel || 1);
    const xp = Number(p.xp || 0);
    const xpBase = (nivel - 1) * 1000;
    const xpPct = Math.min(100, Math.max(0, ((xp - xpBase) / 1000) * 100));
    const reserva = Number(this.calcReserva().saldo || 0);
    const receitas = Number(this.calcTotalReceitas(this.currentMonth) || 0);
    const despesas = Number(this.calcResumoDespesas(this.currentMonth).total || 0);
    const saldo = receitas - despesas;

    const levelEl = document.getElementById('profileModalLevel');
    const xpEl = document.getElementById('profileModalXp');
    const xpFill = document.getElementById('profileModalXpFill');
    const reserveEl = document.getElementById('profileModalReserve');
    const balanceEl = document.getElementById('profileModalBalance');

    if (levelEl) levelEl.textContent = `Nível ${nivel}`;
    if (xpEl) xpEl.textContent = `${xp.toLocaleString('pt-BR')} XP`;
    if (xpFill) xpFill.style.width = `${xpPct}%`;
    if (reserveEl) reserveEl.textContent = formatCurrency(reserva);
    if (balanceEl) {
      balanceEl.textContent = formatCurrency(saldo);
      balanceEl.classList.toggle('is-negative', saldo < 0);
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
        const MAX = 320;
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
        document.getElementById('profilePicPreview').src = canvas.toDataURL('image/jpeg', 0.84);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  saveProfile() {
    const p = this.dm.data.perfil || (this.dm.data.perfil = {});
    const nome = document.getElementById('profileNameInput')?.value.trim();
    const fotoSrc = document.getElementById('profilePicPreview')?.src || '';
    const perfilRisco = document.getElementById('profileRiskInput')?.value || 'moderado';
    const objetivoFinanceiro = document.getElementById('profileGoalInput')?.value.trim() || '';
    const aporteMensal = Math.max(0, Number(document.getElementById('profileMonthlyContributionInput')?.value || 0));
    const horizonteAnos = Math.max(0, Number(document.getElementById('profileHorizonInput')?.value || 0));

    if (nome) p.nome = nome;
    if (fotoSrc && fotoSrc.startsWith('data:')) p.foto = fotoSrc;
    p.perfilRisco = perfilRisco;
    p.objetivoFinanceiro = objetivoFinanceiro;
    p.aporteMensal = aporteMensal;
    p.horizonteAnos = horizonteAnos;

    this.dm.save();
    this.updateProfileUI();
    closeModal('modalProfile');
    showToast('Perfil financeiro atualizado!', 'success');
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
      { id: 'whale', title: 'Baleia', desc: 'Acumulou 20.000 XP', xpReq: 20000, icon: '\uD83D\uDC0B' },
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
        if (m.data && m.data.startsWith(`${this.dm.data.year || YEAR}-01`) && m.tipo === 'deposito') guardado += m.valor;
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
        statusEl.innerHTML = '<span style="color:var(--green)">Vencendo! \uD83C\uDFC6</span>';
      } else {
        statusEl.innerHTML = '<span style="color:var(--red)">Perdendo 😢</span>';
      }
    }
  }


  renderExtratoAnual() {
    const yearSelect = document.getElementById('extratoYearSelect');
    if (!yearSelect) return;
    const selectedYear = Number(yearSelect.value || this.dm.data.year || YEAR);
    const dataYear = Number(this.dm.data.year || YEAR);
    const tbody = document.getElementById('extratoAnualBody');
    const tfoot = document.getElementById('extratoAnualFoot');
    
    let totais = { receitas: 0, despesas: 0, investimentos: 0 };
    let labels = [];
    let saldos = [];
    let html = '';
    
    for(let m=1; m<=12; m++) {
       const isDataYear = selectedYear === dataYear;
       const rec = isDataYear ? this.calcTotalReceitas(m) : 0;
       const desp = isDataYear ? this.calcResumoDespesas(m).total : 0;
       
       const mesStr = `${selectedYear}-${String(m).padStart(2,'0')}`;
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
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    
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
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    panel.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('notifications-open', !isOpen);
  }

  closeNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.remove('is-open');
    document.body.classList.remove('notifications-open');
  }

  openNotificationTarget(tabName, expenseIndex = null) {
    this.closeNotifications();

    const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (navItem) navItem.click();

    if (tabName === 'despesas' && expenseIndex !== null && expenseIndex !== undefined) {
      window.setTimeout(() => {
        const row = document.querySelector(`#gastosFixosBody tr[data-expense-index="${expenseIndex}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.remove('notification-target-highlight');
        void row.offsetWidth;
        row.classList.add('notification-target-highlight');
        window.setTimeout(() => row.classList.remove('notification-target-highlight'), 2600);
      }, 220);
    }
  }

  checkAlerts() {
    const mes = this.dm.getMonth(this.currentMonth);
    if (!mes || !mes.gastosFixos) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const currentYear = this.dm.data.year || new Date().getFullYear();

    const alerts = [];
    mes.gastosFixos.forEach((g, expenseIndex) => {
      if (!g.pago && g.vencimento) {
        const day = parseInt(g.vencimento, 10);
        if (!isNaN(day)) {
          const vDate = new Date(currentYear, this.currentMonth - 1, day);
          vDate.setHours(0,0,0,0);

          const diffTime = vDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            alerts.push(`<button type="button" class="notification-item" onclick="app.openNotificationTarget('despesas', ${expenseIndex})"><div class="notification-icon">⚠️</div><div class="notification-text"><span class="notification-kicker">Conta atrasada</span>A conta <strong>${escapeHTML(g.descricao)}</strong> está atrasada há ${Math.abs(diffDays)} dia(s)!</div><div class="notification-arrow" aria-hidden="true">›</div></button>`);
          } else if (diffDays <= 3) {
            alerts.push(`<button type="button" class="notification-item" onclick="app.openNotificationTarget('despesas', ${expenseIndex})"><div class="notification-icon">⏰</div><div class="notification-text"><span class="notification-kicker">Vencimento próximo</span>A conta <strong>${escapeHTML(g.descricao)}</strong> vence em ${diffDays === 0 ? 'hoje' : diffDays + ' dia(s)'}!</div><div class="notification-arrow" aria-hidden="true">›</div></button>`);
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




