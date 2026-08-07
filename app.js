
window.nvidiaProxy = async (body) => {
  try {
    const res = await fetch('/api/nvidia-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        throw new Error(errJson.error || errText);
      } catch(e) {
        throw new Error(errText);
      }
    }
    const data = await res.json();
    return { data: data, error: null };
  } catch (err) {
    return { data: null, error: err };
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
    nvidiaApiKey: '',
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
            if (!parsed.reserva) parsed.reserva = { movimentacoes: [], obs: '' };
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
    if (!this.data.reserva) this.data.reserva = { movimentacoes: [], obs: '' };
    if (!this.data.categoriasFixas) this.data.categoriasFixas = getDefaultData().categoriasFixas;
    if (!this.data.categoriasVariaveis) this.data.categoriasVariaveis = getDefaultData().categoriasVariaveis;
    if (!this.data.cartoes) this.data.cartoes = [];
    if (!this.data.comprasCartao) this.data.comprasCartao = [];
    if (!this.data.meses) this.data.meses = {};
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
  const icons = { success: '✅', error: 'âŒ', info: 'â„¹ï¸' };
  const icon = document.createElement('span');
  icon.textContent = icons[type] || 'â„¹ï¸';
  toast.appendChild(icon);
  toast.appendChild(document.createTextNode(' ' + msg));
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
  
  iaAttachedFile = null;
  iaAudioRecognition = null;
  iaAudioIsRecording = false;
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
      
      if (accessToken && r…39913 tokens truncated…  <h3 style="margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #111128;">Gastos Fixos (Minha Parte)</h3>
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
      { id: 'whale', title: 'Baleia', desc: 'Acumulou 20.000 XP', xpReq: 20000, icon: 'ðŸ‹' },
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
        statusEl.innerHTML = '<span style="color:var(--green)">Vencendo! ðŸ†</span>';
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
            alerts.push(`<div class="notification-item"><div class="notification-icon">⚠️</div><div class="notification-text">A conta <strong>${escapeHTML(g.descricao)}</strong> está atrasada há ${Math.abs(diffDays)} dia(s)!</div></div>`);
          } else if (diffDays <= 3) {
            alerts.push(`<div class="notification-item"><div class="notification-icon">â°</div><div class="notification-text">A conta <strong>${escapeHTML(g.descricao)}</strong> vence em ${diffDays === 0 ? 'hoje' : diffDays + ' dia(s)'}!</div></div>`);
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



