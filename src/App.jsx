import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ============================================================
// DESIGN SYSTEM — tokens, utilitários, tema
// ============================================================
const C = {
  brand: "#1a56db",
  brandDark: "#1e429f",
  brandLight: "#ebf5ff",
  success: "#057a55",
  successLight: "#f3faf7",
  warning: "#c27803",
  warningLight: "#fdf6b2",
  danger: "#e02424",
  dangerLight: "#fdf2f2",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  white: "#ffffff",
};

// ============================================================
// SUPABASE — conexão com banco de dados na nuvem
// Dados salvos no PostgreSQL via Supabase.
// Acessível de qualquer dispositivo com internet.
// ============================================================

const SUPABASE_URL = "https://uqldtczsylqbiotiodes.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxbGR0Y3pzeWxxYmlvdGlvZGVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjgwMzksImV4cCI6MjA4OTQ0NDAzOX0.rJvB_BfaQF_5I6n3n5KL452KQLea8ENEsX376TGzKDg";

// Cliente Supabase — chamadas diretas à API REST
const sb = {
  // Cabeçalhos padrão para todas as requisições
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  },

  // Cabeçalhos com token do usuário logado (para RLS funcionar)
  authHeaders(token) {
    return { ...this.headers, "Authorization": `Bearer ${token}` };
  },

  // ── AUTH ─────────────────────────────────────────────────

  async signUp({ email, password, nome, telefone }) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ email, password, data: { nome, telefone } }),
    });
    return r.json();
  },

  async signIn({ email, password }) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },

  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST", headers: this.authHeaders(token),
    });
  },

  async refreshToken(refreshToken) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return r.json();
  },

  async resetPassword(email) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ email }),
    });
    return r.json();
  },

  // ── CONTAS ───────────────────────────────────────────────

  async getContas(token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contas?order=data_vencimento.asc`, {
      headers: this.authHeaders(token),
    });
    return r.json();
  },

  async insertConta(token, conta) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contas`, {
      method: "POST",
      headers: { ...this.authHeaders(token), "Prefer": "return=representation" },
      body: JSON.stringify(conta),
    });
    return r.json();
  },

  async updateConta(token, id, dados) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contas?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...this.authHeaders(token), "Prefer": "return=representation" },
      body: JSON.stringify(dados),
    });
    return r.json();
  },

  async deleteConta(token, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/contas?id=eq.${id}`, {
      method: "DELETE", headers: this.authHeaders(token),
    });
  },

  // ── PREFERÊNCIAS DO USUÁRIO ──────────────────────────────

  async getPrefs(token, userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_prefs?id=eq.${userId}`, {
      headers: this.authHeaders(token),
    });
    const data = await r.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  },

  async savePrefs(token, userId, prefs) {
    // Upsert — cria se não existir, atualiza se já existir
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_prefs`, {
      method: "POST",
      headers: { ...this.authHeaders(token), "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: userId,
        moeda: prefs.moeda,
        dia_alerta_padrao: prefs.diaAlertaPadrao,
        categorias: prefs.categorias,
        updated_at: new Date().toISOString(),
      }),
    });
    return r.json();
  },
};

// ============================================================
// DADOS INICIAIS — carregados apenas na primeira vez
// Estrutura compatível com schema Prisma + PostgreSQL
// ============================================================
const CATEGORIAS_DEFAULT = [
  "Moradia", "Alimentação", "Transporte", "Saúde", "Educação",
  "Lazer", "Assinaturas", "Serviços", "Impostos", "Outros"
];

const FORMAS_PAGAMENTO = [
  "Débito", "Crédito", "PIX", "Boleto", "Transferência", "Dinheiro", "Débito automático"
];

function gerarId() {
  return Math.random().toString(36).slice(2, 10);
}

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = hoje.getMonth() + 1;

function dataStr(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const CONTAS_MOCK = [
  {
    id: gerarId(), user_id: "u1", nome: "Aluguel", descricao: "Aluguel mensal apartamento", tipo: "fixa",
    categoria: "Moradia", valor: 1800, data_vencimento: dataStr(anoAtual, mesAtual, 5),
    data_pagamento: null, status: "pendente", recorrente: true, frequencia: "mensal",
    forma_pagamento: "Transferência", observacoes: "Contrato até dez/2025", comprovante: null,
    created_at: "2024-01-01", updated_at: "2024-01-01"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Internet Fibra", descricao: "Plano 500MB", tipo: "fixa",
    categoria: "Serviços", valor: 99.90, data_vencimento: dataStr(anoAtual, mesAtual, 10),
    data_pagamento: dataStr(anoAtual, mesAtual, 9), status: "pago", recorrente: true, frequencia: "mensal",
    forma_pagamento: "Débito automático", observacoes: "", comprovante: null,
    created_at: "2024-01-01", updated_at: "2024-01-01"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Supermercado", descricao: "Compras da semana", tipo: "variável",
    categoria: "Alimentação", valor: 650, data_vencimento: dataStr(anoAtual, mesAtual, 20),
    data_pagamento: null, status: "pendente", recorrente: false, frequencia: "mensal",
    forma_pagamento: "Débito", observacoes: "", comprovante: null,
    created_at: "2024-01-05", updated_at: "2024-01-05"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Netflix", descricao: "Plano família", tipo: "fixa",
    categoria: "Assinaturas", valor: 55.90, data_vencimento: dataStr(anoAtual, mesAtual, 15),
    data_pagamento: dataStr(anoAtual, mesAtual, 14), status: "pago", recorrente: true, frequencia: "mensal",
    forma_pagamento: "Crédito", observacoes: "", comprovante: null,
    created_at: "2024-01-01", updated_at: "2024-01-01"
  },
  {
    id: gerarId(), user_id: "u1", nome: "IPVA", descricao: "Imposto veículo - cota única", tipo: "eventual",
    categoria: "Impostos", valor: 1240, data_vencimento: dataStr(anoAtual, mesAtual, 28),
    data_pagamento: null, status: "pendente", recorrente: false, frequencia: "anual",
    forma_pagamento: "Boleto", observacoes: "Placa ABC-1234", comprovante: null,
    created_at: "2024-01-10", updated_at: "2024-01-10"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Academia", descricao: "Mensalidade SmartFit", tipo: "fixa",
    categoria: "Saúde", valor: 99, data_vencimento: dataStr(anoAtual, mesAtual - 1 || 12, 1),
    data_pagamento: null, status: "vencido", recorrente: true, frequencia: "mensal",
    forma_pagamento: "Débito automático", observacoes: "", comprovante: null,
    created_at: "2024-01-01", updated_at: "2024-01-01"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Spotify", descricao: "Plano individual", tipo: "fixa",
    categoria: "Assinaturas", valor: 21.90, data_vencimento: dataStr(anoAtual, mesAtual, 18),
    data_pagamento: dataStr(anoAtual, mesAtual, 17), status: "pago", recorrente: true, frequencia: "mensal",
    forma_pagamento: "Crédito", observacoes: "", comprovante: null,
    created_at: "2024-01-01", updated_at: "2024-01-01"
  },
  {
    id: gerarId(), user_id: "u1", nome: "Consulta Médica", descricao: "Retorno cardiologista", tipo: "eventual",
    categoria: "Saúde", valor: 280, data_vencimento: dataStr(anoAtual, mesAtual, 22),
    data_pagamento: null, status: "pendente", recorrente: false, frequencia: "única",
    forma_pagamento: "PIX", observacoes: "Dr. Marcelo Santos", comprovante: null,
    created_at: "2024-01-12", updated_at: "2024-01-12"
  },
];

const HISTORICO_WPP_MOCK = [
  { id: 1, conta_id: CONTAS_MOCK[0].id, tipo: "lembrete_7d", enviado_em: "2024-01-28 09:00", status: "entregue", numero: "+55 11 99999-0000" },
  { id: 2, conta_id: CONTAS_MOCK[3].id, tipo: "lembrete_1d", enviado_em: "2024-01-14 08:00", status: "entregue", numero: "+55 11 99999-0000" },
];

// ============================================================
// UTILITÁRIOS
// ============================================================

// Configurações de moeda salvas no localStorage
function getMoeda() {
  try { return JSON.parse(localStorage.getItem("cf_prefs"))?.moeda || "BRL"; } catch { return "BRL"; }
}

const MOEDA_CONFIG = {
  BRL: { locale: "pt-BR", currency: "BRL" },
  USD: { locale: "en-US", currency: "USD" },
  EUR: { locale: "de-DE", currency: "EUR" },
};

const fmt = (v) => {
  const moeda = getMoeda();
  const cfg = MOEDA_CONFIG[moeda] || MOEDA_CONFIG.BRL;
  return Number(v).toLocaleString(cfg.locale, { style: "currency", currency: cfg.currency });
};
const fmtData = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function calcularStatus(conta) {
  if (conta.data_pagamento) return "pago";
  const venc = new Date(conta.data_vencimento + "T00:00:00");
  if (venc < hoje) return "vencido";
  return "pendente";
}

function diasParaVencer(data) {
  const d = new Date(data + "T00:00:00");
  const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
  return diff;
}

function alertaTipo(conta) {
  if (conta.status === "pago") return null;
  const dias = diasParaVencer(conta.data_vencimento);
  if (conta.status === "vencido") return { label: "Vencida", cor: C.danger, bg: C.dangerLight };
  if (dias === 0) return { label: "Vence hoje!", cor: C.danger, bg: C.dangerLight };
  if (dias <= 1) return { label: "1 dia", cor: C.danger, bg: C.dangerLight };
  if (dias <= 3) return { label: `${dias} dias`, cor: C.warning, bg: C.warningLight };
  if (dias <= 7) return { label: `${dias} dias`, cor: C.warning, bg: C.warningLight };
  return null;
}

// ============================================================
// COMPONENTES BASE
// ============================================================

const Badge = ({ status }) => {
  const map = {
    pago: { bg: "#f3faf7", color: "#057a55", label: "Pago" },
    pendente: { bg: "#fdf6b2", color: "#c27803", label: "Pendente" },
    vencido: { bg: "#fdf2f2", color: "#e02424", label: "Vencido" },
    fixa: { bg: "#ebf5ff", color: "#1a56db", label: "Fixa" },
    variável: { bg: "#f5f3ff", color: "#7e3af2", label: "Variável" },
    eventual: { bg: "#fdf6b2", color: "#c27803", label: "Eventual" },
  };
  const s = map[status] || { bg: C.gray100, color: C.gray700, label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

const Card = ({ children, style = {} }) => (
  <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, boxShadow: "0 1px 3px rgba(0,0,0,.06)", ...style }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled = false, style = {} }) => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit",
    fontWeight: 600, borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "all .15s", whiteSpace: "nowrap",
    padding: size === "sm" ? "6px 14px" : size === "lg" ? "11px 24px" : "8px 18px",
    fontSize: size === "sm" ? 13 : 14,
  };
  const variants = {
    primary: { background: C.brand, color: C.white },
    secondary: { background: C.gray100, color: C.gray700, border: `1px solid ${C.gray200}` },
    danger: { background: C.danger, color: C.white },
    success: { background: C.success, color: C.white },
    ghost: { background: "transparent", color: C.gray700, border: `1px solid ${C.gray200}` },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

const Input = ({ label, value, onChange, type = "text", placeholder = "", required = false, options, style = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
    {label && <label style={{ fontSize: 13, fontWeight: 600, color: C.gray700 }}>{label}{required && <span style={{ color: C.danger }}> *</span>}</label>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14, background: C.white, color: C.gray900, outline: "none" }}>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    ) : type === "textarea" ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14, color: C.gray900, outline: "none" }} />
    )}
  </div>
);

const Modal = ({ title, children, onClose, width = 560 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.gray900 }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.gray500, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>{children}</div>
    </div>
  </div>
);

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const bg = type === "success" ? C.success : type === "error" ? C.danger : C.warning;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: bg, color: C.white, padding: "12px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,.2)", display: "flex", alignItems: "center", gap: 10, maxWidth: 340 }}>
      <span>{type === "success" ? "✓" : "!"}</span> {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", marginLeft: 8 }}>✕</button>
    </div>
  );
};

// ============================================================
// TELA DE LOGIN / CADASTRO — autenticação real via Supabase
// ============================================================
const AuthScreen = ({ onLogin }) => {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", senha: "", confirmar: "" });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [recuperar, setRecuperar] = useState(false);
  const [recuperarOk, setRecuperarOk] = useState(false);

  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  const handleLogin = async () => {
    if (!form.email || !form.senha) { setErro("Preencha e-mail e senha."); return; }
    setLoading(true); setErro("");
    const res = await sb.signIn({ email: form.email, password: form.senha });
    setLoading(false);
    if (res.error || !res.access_token) {
      setErro("E-mail ou senha incorretos. Verifique e tente novamente.");
      return;
    }
    const userData = {
      id: res.user.id, email: res.user.email,
      nome: res.user.user_metadata?.nome || res.user.email,
      telefone: res.user.user_metadata?.telefone || "",
      token: res.access_token,
      refresh_token: res.refresh_token,
    };
    localStorage.setItem("cf_token", res.access_token);
    localStorage.setItem("cf_refresh_token", res.refresh_token);
    localStorage.setItem("cf_user", JSON.stringify(userData));
    onLogin(userData);
  };

  const handleCadastro = async () => {
    if (!form.nome || !form.email || !form.senha) { setErro("Preencha todos os campos obrigatórios."); return; }
    if (form.senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    if (form.senha !== form.confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true); setErro("");
    const res = await sb.signUp({ email: form.email, password: form.senha, nome: form.nome, telefone: form.telefone });
    setLoading(false);
    if (res.error) { setErro(res.error.message || "Erro ao criar conta. Tente novamente."); return; }
    if (!res.access_token) {
      setTab("login");
      alert("Conta criada! Verifique seu e-mail para confirmar o cadastro, depois faça login.");
      return;
    }
    const userData = { id: res.user.id, email: res.user.email, nome: form.nome, telefone: form.telefone, token: res.access_token };
    localStorage.setItem("cf_token", res.access_token);
    localStorage.setItem("cf_user", JSON.stringify(userData));
    onLogin(userData);
  };

  const handleRecuperar = async () => {
    if (!form.email) { setErro("Digite seu e-mail."); return; }
    setLoading(true);
    await sb.resetPassword(form.email);
    setLoading(false);
    setRecuperarOk(true);
  };

  if (recuperar) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f0f4ff 0%, #e8f4fd 100%)", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 400, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Logo size={36} />
          <h2 style={{ margin: "16px 0 4px", fontSize: 22, color: C.gray900 }}>Recuperar senha</h2>
          <p style={{ color: C.gray500, fontSize: 14 }}>Enviaremos um link para seu e-mail</p>
        </div>
        {recuperarOk ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
            <p style={{ color: C.success, fontWeight: 600 }}>E-mail enviado! Verifique sua caixa de entrada.</p>
            <Btn variant="primary" onClick={() => { setRecuperar(false); setRecuperarOk(false); }} style={{ marginTop: 16 }}>Voltar ao login</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {erro && <div style={{ background: C.dangerLight, color: C.danger, padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>{erro}</div>}
            <Input label="E-mail" value={form.email} onChange={f("email")} type="email" placeholder="seu@email.com" />
            <Btn variant="primary" onClick={handleRecuperar} disabled={loading} size="lg" style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </Btn>
            <button onClick={() => setRecuperar(false)} style={{ background: "none", border: "none", color: C.brand, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Voltar ao login</button>
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "linear-gradient(135deg, #f0f4ff 0%, #e8f4fd 100%)" }}>
      <div className="auth-left" style={{ display: "none", flex: 1, background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDark} 100%)`, alignItems: "center", justifyContent: "center", padding: 48, flexDirection: "column", gap: 24 }}>
        <Logo size={48} white />
        <div style={{ color: C.white, textAlign: "center" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px" }}>ContasFácil</h1>
          <p style={{ opacity: .8, fontSize: 16, lineHeight: 1.6, maxWidth: 320 }}>Gerencie suas despesas pessoais e familiares com inteligência e praticidade.</p>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {["Alertas automáticos", "Gráficos detalhados", "Dados na nuvem", "Acesso de qualquer lugar"].map(ft => (
            <span key={ft} style={{ background: "rgba(255,255,255,.15)", color: C.white, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>✓ {ft}</span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Card style={{ width: "100%", maxWidth: 440, padding: "32px 36px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <Logo size={32} />
            <h2 style={{ margin: "14px 0 4px", fontSize: 22, color: C.gray900 }}>
              {tab === "login" ? "Bem-vindo de volta" : "Criar conta gratuita"}
            </h2>
          </div>
          <div style={{ display: "flex", background: C.gray100, borderRadius: 8, padding: 4, marginBottom: 24 }}>
            {["login", "cadastro"].map(t => (
              <button key={t} onClick={() => { setTab(t); setErro(""); }}
                style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, background: tab === t ? C.white : "transparent", color: tab === t ? C.brand : C.gray500, boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.1)" : "none", transition: "all .15s" }}>
                {t === "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>
          {erro && <div style={{ background: C.dangerLight, color: C.danger, padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14, fontWeight: 500 }}>{erro}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tab === "cadastro" && <Input label="Nome completo" value={form.nome} onChange={f("nome")} placeholder="Seu nome" required />}
            <Input label="E-mail" value={form.email} onChange={f("email")} type="email" placeholder="seu@email.com" required />
            {tab === "cadastro" && <Input label="Telefone (WhatsApp)" value={form.telefone} onChange={f("telefone")} type="tel" placeholder="+55 11 99999-9999" />}
            <Input label="Senha" value={form.senha} onChange={f("senha")} type="password" placeholder="mínimo 6 caracteres" required />
            {tab === "cadastro" && <Input label="Confirmar senha" value={form.confirmar} onChange={f("confirmar")} type="password" placeholder="••••••••" required />}
            <Btn variant="primary" onClick={tab === "login" ? handleLogin : handleCadastro} disabled={loading} size="lg" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
              {loading ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar conta"}
            </Btn>
            {tab === "login" && (
              <button onClick={() => { setRecuperar(true); setErro(""); }} style={{ background: "none", border: "none", color: C.brand, cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                Esqueci minha senha
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// LOGO
// ============================================================
const Logo = ({ size = 32, white = false }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: size, height: size, background: white ? "rgba(255,255,255,.2)" : C.brandLight, borderRadius: size * 0.28, display: "flex", alignItems: "center", justifyContent: "center", border: white ? "2px solid rgba(255,255,255,.4)" : `2px solid ${C.brand}` }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z" fill={white ? "white" : C.brand} />
      </svg>
    </div>
    <span style={{ fontWeight: 800, fontSize: size * 0.55, color: white ? "white" : C.brand, letterSpacing: -0.5 }}>ContasFácil</span>
  </div>
);

// ============================================================
// SIDEBAR
// ============================================================
const MENU = [
  { id: "dashboard", icon: "⊞", label: "Dashboard" },
  { id: "contas", icon: "📋", label: "Contas" },
  { id: "alertas", icon: "🔔", label: "Alertas" },
  { id: "relatorios", icon: "📊", label: "Relatórios" },
  { id: "whatsapp", icon: "💬", label: "WhatsApp" },
  { id: "configuracoes", icon: "⚙️", label: "Configurações" },
];

const Sidebar = ({ active, onNav, collapsed, onToggle, user, onLogout }) => (
  <aside style={{
    width: collapsed ? 64 : 240, minHeight: "100vh", background: C.gray900,
    display: "flex", flexDirection: "column", transition: "width .2s", flexShrink: 0, position: "relative"
  }}>
    <div style={{ padding: collapsed ? "20px 12px" : "20px 20px", borderBottom: `1px solid rgba(255,255,255,.08)`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
      {!collapsed && <Logo size={28} white />}
      {collapsed && <div style={{ width: 36, height: 36, background: "rgba(255,255,255,.1)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z" fill="white" /></svg>
      </div>}
      <button onClick={onToggle} style={{ background: "rgba(255,255,255,.08)", border: "none", color: "white", cursor: "pointer", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {collapsed ? "→" : "←"}
      </button>
    </div>
    <nav style={{ flex: 1, padding: "12px 0" }}>
      {MENU.map(m => (
        <button key={m.id} onClick={() => onNav(m.id)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "12px 0" : "12px 20px", background: active === m.id ? "rgba(26,86,219,.3)" : "none", border: "none", cursor: "pointer", color: active === m.id ? "#93c5fd" : "rgba(255,255,255,.6)", fontWeight: active === m.id ? 700 : 500, fontSize: 14, transition: "all .15s", borderLeft: active === m.id ? `3px solid ${C.brand}` : "3px solid transparent", justifyContent: collapsed ? "center" : "flex-start" }}>
          <span style={{ fontSize: 18, minWidth: 24, textAlign: "center" }}>{m.icon}</span>
          {!collapsed && m.label}
        </button>
      ))}
    </nav>
    <div style={{ padding: collapsed ? "16px 8px" : "16px 20px", borderTop: `1px solid rgba(255,255,255,.08)` }}>
      {!collapsed && <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
          {user?.nome?.[0]?.toUpperCase() || "U"}
        </div>
        <div style={{ overflow: "hidden" }}>
          <p style={{ margin: 0, color: "white", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nome || "Usuário"}</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,.5)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
        </div>
      </div>}
      <button onClick={onLogout} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        🚪 {!collapsed && "Sair"}
      </button>
    </div>
  </aside>
);

// ============================================================
// HEADER
// ============================================================
const Header = ({ titulo, alertas }) => (
  <header style={{ background: C.white, borderBottom: `1px solid ${C.gray200}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.gray900 }}>{titulo}</h1>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <button style={{ background: C.gray100, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 18 }}>🔔</button>
        {alertas > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: C.danger, color: "white", fontSize: 10, fontWeight: 700, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{alertas}</span>}
      </div>
    </div>
  </header>
);

// ============================================================
// FORMULÁRIO DE CONTA
// ============================================================
const FormConta = ({ initial, onSave, onClose }) => {
  const blank = { nome: "", descricao: "", tipo: "fixa", categoria: "Moradia", valor: "", data_vencimento: "", data_pagamento: "", status: "pendente", recorrente: false, frequencia: "mensal", forma_pagamento: "PIX", observacoes: "" };
  const [form, setForm] = useState(initial ? { ...initial, valor: String(initial.valor) } : blank);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.nome || !form.valor || !form.data_vencimento) {
      setErro("Preencha nome, valor e data de vencimento.");
      return;
    }
    setSalvando(true);
    const nova = {
      ...form,
      id: initial?.id || gerarId(),
      user_id: "u1",
      valor: parseFloat(form.valor),
      created_at: initial?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    nova.status = calcularStatus(nova);
    try {
      await onSave(nova);
    } catch (e) {
      setErro("Erro ao salvar. Tente novamente.");
    }
    setSalvando(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && <div style={{ background: C.dangerLight, color: C.danger, padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>{erro}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Input label="Nome da conta" value={form.nome} onChange={f("nome")} placeholder="Ex: Aluguel" required style={{ gridColumn: "1 / -1" }} />
        <Input label="Tipo" value={form.tipo} onChange={f("tipo")} options={["fixa", "variável", "eventual"]} />
        <Input label="Categoria" value={form.categoria} onChange={f("categoria")} options={CATEGORIAS_DEFAULT} />
        <Input label={`Valor (${getMoeda()})`} value={form.valor} onChange={f("valor")} type="number" placeholder="0,00" required />
        <Input label="Forma de Pagamento" value={form.forma_pagamento} onChange={f("forma_pagamento")} options={FORMAS_PAGAMENTO} />
        <Input label="Data de Vencimento" value={form.data_vencimento} onChange={f("data_vencimento")} type="date" required />
        <Input label="Data de Pagamento" value={form.data_pagamento} onChange={f("data_pagamento")} type="date" />
        <Input label="Frequência" value={form.frequencia} onChange={f("frequencia")} options={["mensal", "semanal", "anual", "única"]} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <input type="checkbox" checked={form.recorrente} onChange={e => f("recorrente")(e.target.checked)} id="rec" style={{ width: 16, height: 16, cursor: "pointer" }} />
          <label htmlFor="rec" style={{ fontSize: 14, fontWeight: 600, color: C.gray700, cursor: "pointer" }}>Recorrente</label>
        </div>
      </div>
      <Input label="Descrição" value={form.descricao} onChange={f("descricao")} placeholder="Detalhes da conta..." />
      <Input label="Observações" value={form.observacoes} onChange={f("observacoes")} type="textarea" placeholder="Informações adicionais..." />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
        <Btn variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Btn>
        <Btn variant="primary" onClick={submit} disabled={salvando}>
          {salvando ? "⏳ Salvando..." : "💾 Salvar conta"}
        </Btn>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const StatCard = ({ label, valor, sub, bg, color, icon }) => (
  <Card style={{ padding: 20 }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: C.gray500, fontWeight: 600 }}>{label}</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: color || C.gray900 }}>{valor}</p>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.gray500 }}>{sub}</p>}
      </div>
      <div style={{ background: bg || C.gray100, width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{icon}</div>
    </div>
  </Card>
);

const CORES_PIZZA = ["#1a56db", "#7e3af2", "#057a55", "#c27803", "#e02424", "#0891b2", "#dc2626", "#059669"];

const Dashboard = ({ contas, onNovaConta }) => {
  const contasMes = contas.filter(c => {
    const d = new Date(c.data_vencimento + "T00:00:00");
    return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
  });

  const totalMes = contasMes.reduce((s, c) => s + c.valor, 0);
  const pago = contasMes.filter(c => c.status === "pago").reduce((s, c) => s + c.valor, 0);
  const pendente = contasMes.filter(c => c.status === "pendente").reduce((s, c) => s + c.valor, 0);
  const vencido = contasMes.filter(c => c.status === "vencido").reduce((s, c) => s + c.valor, 0);

  const proximas = contasMes.filter(c => c.status !== "pago").sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento)).slice(0, 5);

  const ultimas = contas.filter(c => c.status === "pago" && c.data_pagamento).sort((a, b) => new Date(b.data_pagamento) - new Date(a.data_pagamento)).slice(0, 5);

  const porCategoria = CATEGORIAS_DEFAULT.map(cat => ({
    name: cat, value: contasMes.filter(c => c.categoria === cat).reduce((s, c) => s + c.valor, 0)
  })).filter(c => c.value > 0);

  const mesesLabel = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const barData = mesesLabel.map((m, i) => {
    const cs = contas.filter(c => {
      const d = new Date(c.data_vencimento + "T00:00:00");
      return d.getMonth() === i && d.getFullYear() === anoAtual;
    });
    return { mes: m, total: cs.reduce((s, c) => s + c.valor, 0), pago: cs.filter(c => c.status === "pago").reduce((s, c) => s + c.valor, 0) };
  });

  const alertasCount = contas.filter(c => alertaTipo(c)).length;

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
      {alertasCount > 0 && (
        <div style={{ background: "#fffbeb", border: `1px solid #f59e0b`, borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ color: "#92400e", fontWeight: 600, fontSize: 14 }}>
            Você tem <strong>{alertasCount}</strong> conta(s) com alertas de vencimento!
          </span>
          <Btn variant="secondary" size="sm" style={{ marginLeft: "auto" }} onClick={() => {}}>Ver alertas</Btn>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <StatCard label="Total do Mês" valor={fmt(totalMes)} icon="💳" bg={C.brandLight} color={C.brand} sub={`${contasMes.length} contas`} />
        <StatCard label="Total Pago" valor={fmt(pago)} icon="✅" bg={C.successLight} color={C.success} sub={`${contasMes.filter(c => c.status === "pago").length} contas`} />
        <StatCard label="A Pagar" valor={fmt(pendente)} icon="⏳" bg={C.warningLight} color={C.warning} sub={`${contasMes.filter(c => c.status === "pendente").length} contas`} />
        <StatCard label="Vencido" valor={fmt(vencido)} icon="🚨" bg={C.dangerLight} color={C.danger} sub={`${contasMes.filter(c => c.status === "vencido").length} contas`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.gray900 }}>Por Categoria (mês atual)</h3>
          {porCategoria.length > 0 ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {porCategoria.map((c, i) => (
                  <span key={c.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.gray700 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CORES_PIZZA[i % CORES_PIZZA.length], display: "inline-block" }} />
                    {c.name} {fmt(c.value)}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={porCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} paddingAngle={2}>
                    {porCategoria.map((_, i) => <Cell key={i} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : <p style={{ color: C.gray500, fontSize: 14 }}>Sem dados para o mês atual.</p>}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.gray900 }}>Despesas por Mês ({anoAtual})</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="total" fill={C.brand} radius={[4, 4, 0, 0]} name="Total" />
              <Bar dataKey="pago" fill={C.success} radius={[4, 4, 0, 0]} name="Pago" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.gray900 }}>Próximas a Vencer</h3>
            <Btn variant="primary" size="sm" onClick={onNovaConta}>+ Nova</Btn>
          </div>
          {proximas.length === 0 ? <p style={{ color: C.gray500, fontSize: 14 }}>Nenhuma conta pendente 🎉</p> :
            proximas.map(c => {
              const al = alertaTipo(c);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: C.gray900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</p>
                    <p style={{ margin: 0, fontSize: 12, color: C.gray500 }}>{fmtData(c.data_vencimento)}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: C.gray900 }}>{fmt(c.valor)}</p>
                    {al && <span style={{ fontSize: 11, fontWeight: 600, color: al.cor }}>{al.label}</span>}
                  </div>
                </div>
              );
            })}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.gray900 }}>Últimas Pagas</h3>
          {ultimas.length === 0 ? <p style={{ color: C.gray500, fontSize: 14 }}>Nenhum pagamento registrado.</p> :
            ultimas.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: C.gray900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.gray500 }}>Pago em {fmtData(c.data_pagamento)}</p>
                </div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: C.success }}>{fmt(c.valor)}</p>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// MÓDULO CONTAS
// ============================================================
const ContasModule = ({ contas, setContas, showToast, onSave, onDelete, onMarcarPago }) => {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [modal, setModal] = useState(null);
  const [editando, setEditando] = useState(null);
  const [confirmarDel, setConfirmarDel] = useState(null);
  const [detalhe, setDetalhe] = useState(null);

  const filtradas = contas.filter(c => {
    const b = busca.toLowerCase();
    const matchBusca = !b || c.nome.toLowerCase().includes(b) || c.categoria.toLowerCase().includes(b);
    return matchBusca && (!filtroTipo || c.tipo === filtroTipo) && (!filtroStatus || c.status === filtroStatus) && (!filtroCategoria || c.categoria === filtroCategoria);
  });

  // Usa as funções do Supabase passadas como props
  const handleSave = async (conta) => {
    if (onSave) {
      await onSave(conta);
    }
    setModal(null);
    setEditando(null);
  };

  const handleDelete = async (id) => {
    if (onDelete) {
      await onDelete(id);
    } else {
      setContas(prev => prev.filter(c => c.id !== id));
      showToast("Conta removida.", "success");
    }
    setConfirmarDel(null);
  };

  const marcarPago = async (id) => {
    if (onMarcarPago) {
      await onMarcarPago(id);
    } else {
      const hoje2 = new Date().toISOString().split("T")[0];
      setContas(prev => prev.map(c => c.id === id ? { ...c, status: "pago", data_pagamento: hoje2 } : c));
      showToast("Pagamento registrado!", "success");
    }
  };

  return (
    <div style={{ padding: 28 }}>
      {modal === "nova" && <Modal title={editando ? "Editar Conta" : "Nova Conta"} onClose={() => { setModal(null); setEditando(null); }} width={620}>
        <FormConta initial={editando} onSave={handleSave} onClose={() => { setModal(null); setEditando(null); }} />
      </Modal>}

      {confirmarDel && <Modal title="Confirmar exclusão" onClose={() => setConfirmarDel(null)} width={420}>
        <p style={{ color: C.gray700, marginBottom: 20 }}>Tem certeza que deseja excluir a conta <strong>"{confirmarDel.nome}"</strong>? Esta ação não pode ser desfeita.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setConfirmarDel(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={() => handleDelete(confirmarDel.id)}>🗑️ Excluir</Btn>
        </div>
      </Modal>}

      {detalhe && <Modal title="Detalhes da Conta" onClose={() => setDetalhe(null)} width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.gray900 }}>{detalhe.nome}</h2>
              <p style={{ margin: "4px 0 0", color: C.gray500, fontSize: 14 }}>{detalhe.descricao || "Sem descrição"}</p>
            </div>
            <Badge status={detalhe.status} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Valor", fmt(detalhe.valor)],
              ["Tipo", detalhe.tipo],
              ["Categoria", detalhe.categoria],
              ["Forma de pagamento", detalhe.forma_pagamento],
              ["Vencimento", fmtData(detalhe.data_vencimento)],
              ["Pagamento", fmtData(detalhe.data_pagamento)],
              ["Recorrente", detalhe.recorrente ? "Sim" : "Não"],
              ["Frequência", detalhe.frequencia],
            ].map(([k, v]) => (
              <div key={k} style={{ background: C.gray50, borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ margin: 0, fontSize: 12, color: C.gray500, fontWeight: 600 }}>{k}</p>
                <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700, color: C.gray900 }}>{v}</p>
              </div>
            ))}
          </div>
          {detalhe.observacoes && <div style={{ background: C.warningLight, borderRadius: 8, padding: "12px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}><strong>Obs:</strong> {detalhe.observacoes}</p>
          </div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {detalhe.status !== "pago" && <Btn variant="success" size="sm" onClick={() => { marcarPago(detalhe.id); setDetalhe(null); }}>✅ Marcar como Pago</Btn>}
            <Btn variant="secondary" size="sm" onClick={() => { setEditando(detalhe); setDetalhe(null); setModal("nova"); }}>✏️ Editar</Btn>
          </div>
        </div>
      </Modal>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flex: 1, flexWrap: "wrap" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar contas..." style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14, minWidth: 200, flex: 1 }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            <option value="">Todos os tipos</option>
            <option value="fixa">Fixa</option><option value="variável">Variável</option><option value="eventual">Eventual</option>
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option>
          </select>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            <option value="">Todas categorias</option>
            {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Btn variant="primary" onClick={() => { setEditando(null); setModal("nova"); }}>+ Nova Conta</Btn>
      </div>

      <Card>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.gray50, borderBottom: `1px solid ${C.gray200}` }}>
                {["Nome", "Tipo", "Categoria", "Valor", "Vencimento", "Pagamento", "Status", "Alerta", "Ações"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.gray500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: C.gray500 }}>Nenhuma conta encontrada.</td></tr>
              ) : filtradas.map(c => {
                const al = alertaTipo(c);
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => setDetalhe(c)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, color: C.brand, textAlign: "left", padding: 0 }}>{c.nome}</button>
                    </td>
                    <td style={{ padding: "12px 16px" }}><Badge status={c.tipo} /></td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: C.gray700 }}>{c.categoria}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700, color: C.gray900 }}>{fmt(c.valor)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: C.gray700, whiteSpace: "nowrap" }}>{fmtData(c.data_vencimento)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: c.data_pagamento ? C.success : C.gray400, whiteSpace: "nowrap" }}>{fmtData(c.data_pagamento)}</td>
                    <td style={{ padding: "12px 16px" }}><Badge status={c.status} /></td>
                    <td style={{ padding: "12px 16px" }}>
                      {al ? <span style={{ fontSize: 12, fontWeight: 600, color: al.cor, background: al.bg, padding: "3px 8px", borderRadius: 12, whiteSpace: "nowrap" }}>{al.label}</span> : <span style={{ color: C.gray300 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
                        {c.status !== "pago" && <Btn variant="success" size="sm" onClick={() => marcarPago(c.id)}>✓ Pago</Btn>}
                        <Btn variant="ghost" size="sm" onClick={() => { setEditando(c); setModal("nova"); }}>✏️</Btn>
                        <Btn variant="ghost" size="sm" onClick={() => setConfirmarDel(c)} style={{ color: C.danger }}>🗑️</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.gray100}`, fontSize: 13, color: C.gray500 }}>
          {filtradas.length} conta(s) encontrada(s) · Total: {fmt(filtradas.reduce((s, c) => s + c.valor, 0))}
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// MÓDULO ALERTAS
// ============================================================
const AlertasModule = ({ contas }) => {
  const alertas = contas.filter(c => c.status !== "pago").map(c => {
    const al = alertaTipo(c);
    const dias = diasParaVencer(c.data_vencimento);
    return al ? { conta: c, alerta: al, dias } : null;
  }).filter(Boolean).sort((a, b) => a.dias - b.dias);

  const tiposAlerta = [
    { key: "vencido", label: "Vencidas", icon: "🚨", count: alertas.filter(a => a.conta.status === "vencido").length, cor: C.danger },
    { key: "hoje", label: "Vence hoje", icon: "⏰", count: alertas.filter(a => a.dias === 0).length, cor: C.danger },
    { key: "1d", label: "Em 1 dia", icon: "⚡", count: alertas.filter(a => a.dias === 1).length, cor: C.warning },
    { key: "3d", label: "Em 3 dias", icon: "🔔", count: alertas.filter(a => a.dias > 1 && a.dias <= 3).length, cor: C.warning },
    { key: "7d", label: "Em 7 dias", icon: "📅", count: alertas.filter(a => a.dias > 3 && a.dias <= 7).length, cor: C.brand },
  ];

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        {tiposAlerta.map(t => (
          <Card key={t.key} style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: t.cor }}>{t.count}</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.gray500, fontWeight: 600 }}>{t.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.gray200}` }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.gray900 }}>Central de Alertas</h3>
        </div>
        {alertas.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <p style={{ color: C.gray500, fontWeight: 600 }}>Nenhum alerta ativo! Todas as contas estão em dia.</p>
          </div>
        ) : alertas.map(({ conta, alerta, dias }) => (
          <div key={conta.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: `1px solid ${C.gray100}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: alerta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              {conta.status === "vencido" ? "🚨" : dias <= 1 ? "⏰" : dias <= 3 ? "⚡" : "🔔"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.gray900 }}>{conta.nome}</p>
                <Badge status={conta.tipo} />
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: C.gray500 }}>
                {conta.categoria} · Vence em {fmtData(conta.data_vencimento)}
                {conta.status === "vencido" ? ` · Atrasada há ${Math.abs(dias)} dia(s)` : ""}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: C.gray900 }}>{fmt(conta.valor)}</p>
              <span style={{ fontSize: 12, fontWeight: 700, color: alerta.cor }}>{alerta.label}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
};

// ============================================================
// MÓDULO RELATÓRIOS
// ============================================================
const RelatoriosModule = ({ contas }) => {
  const [periodo, setPeriodo] = useState("mes");
  const [mesSel, setMesSel] = useState(String(mesAtual));
  const [anoSel, setAnoSel] = useState(String(anoAtual));

  const contasFiltradas = contas.filter(c => {
    const d = new Date(c.data_vencimento + "T00:00:00");
    if (periodo === "mes") return d.getMonth() + 1 === Number(mesSel) && d.getFullYear() === Number(anoSel);
    return d.getFullYear() === Number(anoSel);
  });

  const total = contasFiltradas.reduce((s, c) => s + c.valor, 0);
  const pago = contasFiltradas.filter(c => c.status === "pago").reduce((s, c) => s + c.valor, 0);
  const porTipo = ["fixa", "variável", "eventual"].map(t => ({ tipo: t, valor: contasFiltradas.filter(c => c.tipo === t).reduce((s, c) => s + c.valor, 0), qtd: contasFiltradas.filter(c => c.tipo === t).length }));
  const porCat = CATEGORIAS_DEFAULT.map(cat => ({ cat, valor: contasFiltradas.filter(c => c.categoria === cat).reduce((s, c) => s + c.valor, 0) })).filter(c => c.valor > 0).sort((a, b) => b.valor - a.valor);

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Filtros</h3>
          <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            <option value="mes">Mensal</option><option value="ano">Anual</option>
          </select>
          {periodo === "mes" && <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => <option key={m} value={String(i + 1)}>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i]}</option>)}
          </select>}
          <select value={anoSel} onChange={e => setAnoSel(e.target.value)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }}>
            {[2023, 2024, 2025].map(a => <option key={a} value={String(a)}>{a}</option>)}
          </select>
          <Btn variant="secondary" size="sm" onClick={() => { }} style={{ marginLeft: "auto" }}>📥 Exportar PDF</Btn>
          <Btn variant="ghost" size="sm" onClick={() => { }}>📊 Exportar Excel</Btn>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <StatCard label="Total do Período" valor={fmt(total)} icon="💳" bg={C.brandLight} color={C.brand} />
        <StatCard label="Total Pago" valor={fmt(pago)} icon="✅" bg={C.successLight} color={C.success} />
        <StatCard label="Total Pendente/Vencido" valor={fmt(total - pago)} icon="⏳" bg={C.warningLight} color={C.warning} />
        <StatCard label="Qtd. de Contas" valor={contasFiltradas.length} icon="📋" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Por Tipo</h3>
          {porTipo.map(t => (
            <div key={t.tipo} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <Badge status={t.tipo} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 6, background: C.gray100, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${total > 0 ? (t.valor / total * 100) : 0}%`, height: "100%", background: C.brand, borderRadius: 4 }} />
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gray900, whiteSpace: "nowrap" }}>{fmt(t.valor)}</span>
              <span style={{ fontSize: 12, color: C.gray500 }}>({t.qtd})</span>
            </div>
          ))}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Por Categoria</h3>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {porCat.map((c, i) => (
              <div key={c.cat} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: CORES_PIZZA[i % CORES_PIZZA.length], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: C.gray700 }}>{c.cat}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.gray900, whiteSpace: "nowrap" }}>{fmt(c.valor)}</span>
                <span style={{ fontSize: 12, color: C.gray400 }}>{total > 0 ? (c.valor / total * 100).toFixed(0) : 0}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.gray200}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Histórico de Contas</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {["Nome", "Tipo", "Categoria", "Valor", "Vencimento", "Pagamento", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.gray500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contasFiltradas.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}` }}>
                  <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600, color: C.gray900 }}>{c.nome}</td>
                  <td style={{ padding: "10px 16px" }}><Badge status={c.tipo} /></td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: C.gray700 }}>{c.categoria}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 700 }}>{fmt(c.valor)}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: C.gray700 }}>{fmtData(c.data_vencimento)}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: c.data_pagamento ? C.success : C.gray400 }}>{fmtData(c.data_pagamento)}</td>
                  <td style={{ padding: "10px 16px" }}><Badge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// MÓDULO WHATSAPP
// ============================================================
const WhatsAppModule = ({ user, historico }) => {
  const [config, setConfig] = useState({
    ativo: false, numero: user?.telefone || "", provedor: "twilio",
    token: "", from: "", modelo: "Olá {nome}! Lembrete: a conta *{conta}* no valor de *{valor}* vence em {dias} dia(s), no dia {data}. ContasFácil 💡",
    lembrete_7d: true, lembrete_3d: true, lembrete_1d: true, no_dia: true, atraso: true
  });
  const [salvo, setSalvo] = useState(false);

  const f = (k) => (v) => setConfig(p => ({ ...p, [k]: v }));

  const salvar = () => {
    // TODO: PUT /api/configuracoes/whatsapp → prisma.userConfig.update
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, background: "#dcfce7", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>💬</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Integração WhatsApp</h3>
            <p style={{ margin: "2px 0 0", color: C.gray500, fontSize: 13 }}>Compatível com Twilio WhatsApp, Meta Cloud API e WhatsApp Business API</p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.gray700 }}>Ativar alertas</span>
            <div onClick={() => f("ativo")(!config.ativo)} style={{ width: 44, height: 24, borderRadius: 12, background: config.ativo ? C.success : C.gray300, cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ position: "absolute", top: 3, left: config.ativo ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Input label="Número WhatsApp (com DDI)" value={config.numero} onChange={f("numero")} placeholder="+55 11 99999-9999" />
          <Input label="Provedor" value={config.provedor} onChange={f("provedor")} options={[
            { value: "twilio", label: "Twilio WhatsApp" },
            { value: "meta", label: "Meta Cloud API" },
            { value: "business", label: "WhatsApp Business API" }
          ]} />
          <Input label="Token de Autenticação" value={config.token} onChange={f("token")} type="password" placeholder="Seu token de API" />
          <Input label="Número remetente (From)" value={config.from} onChange={f("from")} placeholder="+14155238886 (Twilio sandbox)" />
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Configurar Alertas</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {[
            { key: "lembrete_7d", label: "7 dias antes" },
            { key: "lembrete_3d", label: "3 dias antes" },
            { key: "lembrete_1d", label: "1 dia antes" },
            { key: "no_dia", label: "No dia do vencimento" },
            { key: "atraso", label: "Alerta de atraso" },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.gray700 }}>
              <input type="checkbox" checked={config[key]} onChange={e => f(key)(e.target.checked)} style={{ width: 16, height: 16 }} />
              {label}
            </label>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Modelo da Mensagem</h3>
        <p style={{ color: C.gray500, fontSize: 13, marginBottom: 12 }}>Variáveis disponíveis: {"{nome}"}, {"{conta}"}, {"{valor}"}, {"{dias}"}, {"{data}"}</p>
        <Input value={config.modelo} onChange={f("modelo")} type="textarea" />
        <div style={{ marginTop: 12, background: "#dcfce7", borderRadius: 10, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 6 }}>📱 Prévia:</p>
          <p style={{ margin: 0, fontSize: 14, color: "#166534" }}>
            {config.modelo.replace("{nome}", "Maria Silva").replace("{conta}", "Aluguel").replace("{valor}", "R$ 1.800,00").replace("{dias}", "3").replace("{data}", "05/02/2025")}
          </p>
        </div>
        <div style={{ marginTop: 14, padding: "12px 16px", background: C.warningLight, borderRadius: 8, fontSize: 13, color: "#92400e" }}>
          ⚠️ <strong>Aviso legal:</strong> Use apenas integrações oficiais como Twilio, Meta Cloud API ou WhatsApp Business API. Soluções não oficiais violam os Termos de Uso do WhatsApp.
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Histórico de Envios</h3>
        {historico.length === 0 ? <p style={{ color: C.gray500, fontSize: 14 }}>Nenhum envio registrado ainda.</p> :
          historico.map(h => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <span style={{ fontSize: 18 }}>{h.status === "entregue" ? "✅" : "❌"}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.gray900 }}>{h.tipo.replace(/_/g, " ").replace("lembrete", "Lembrete")} · {h.numero}</p>
                <p style={{ margin: 0, fontSize: 12, color: C.gray500 }}>{h.enviado_em}</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: h.status === "entregue" ? C.success : C.danger }}>{h.status}</span>
            </div>
          ))}
      </Card>

      <Btn variant="primary" onClick={salvar} size="lg" style={{ alignSelf: "flex-start" }}>
        {salvo ? "✓ Configurações salvas!" : "💾 Salvar configurações"}
      </Btn>
    </div>
  );
};

// ============================================================
// MÓDULO CONFIGURAÇÕES
// ============================================================
const ConfiguracoesModule = ({ user, setUser, showToast }) => {
  const [perfil, setPerfil] = useState({ nome: user?.nome || "", email: user?.email || "", telefone: user?.telefone || "", senhaAtual: "", novaSenha: "" });
  const [prefs, setPrefs] = useState({ moeda: "BRL", diaAlertaPadrao: "7", categorias: [...CATEGORIAS_DEFAULT] });
  const [novaCategoria, setNovaCategoria] = useState("");
  const [carregandoPrefs, setCarregandoPrefs] = useState(true);
  const [salvandoPrefs, setSalvandoPrefs] = useState(false);

  const fp = (k) => (v) => setPerfil(p => ({ ...p, [k]: v }));
  const fpr = (k) => (v) => setPrefs(p => ({ ...p, [k]: v }));

  // Carrega preferências do Supabase ao abrir a página
  useEffect(() => {
    if (!user?.token) return;
    sb.getPrefs(user.token, user.id)
      .then(data => {
        if (data) {
          const prefsCarregadas = {
            moeda: data.moeda || "BRL",
            diaAlertaPadrao: data.dia_alerta_padrao || "7",
            categorias: data.categorias?.length > 0 ? data.categorias : [...CATEGORIAS_DEFAULT],
          };
          setPrefs(prefsCarregadas);
          // Atualiza localStorage também para fmt() funcionar imediatamente
          localStorage.setItem("cf_prefs", JSON.stringify(prefsCarregadas));
        }
      })
      .finally(() => setCarregandoPrefs(false));
  }, [user?.token]);

  const salvarPerfil = () => {
    setUser(prev => ({ ...prev, nome: perfil.nome, email: perfil.email }));
    showToast("Perfil atualizado com sucesso!", "success");
  };

  const salvarPreferencias = async () => {
    setSalvandoPrefs(true);
    const res = await sb.savePrefs(user.token, user.id, prefs);
    setSalvandoPrefs(false);
    if (res && !res.error) {
      // Atualiza localStorage para fmt() usar a moeda correta imediatamente
      localStorage.setItem("cf_prefs", JSON.stringify(prefs));
      showToast("Preferências salvas na nuvem! ☁️", "success");
    } else {
      showToast("Erro ao salvar preferências.", "error");
    }
  };

  const adicionarCategoria = () => {
    if (!novaCategoria.trim()) return;
    setPrefs(p => ({ ...p, categorias: [...p.categorias, novaCategoria.trim()] }));
    setNovaCategoria("");
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, maxWidth: 700 }}>
      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>👤 Perfil do Usuário</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Input label="Nome completo" value={perfil.nome} onChange={fp("nome")} />
          <Input label="E-mail" value={perfil.email} onChange={fp("email")} type="email" />
          <Input label="Telefone (WhatsApp)" value={perfil.telefone} onChange={fp("telefone")} />
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: C.gray700 }}>Alterar senha</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Input label="Senha atual" value={perfil.senhaAtual} onChange={fp("senhaAtual")} type="password" />
            <Input label="Nova senha" value={perfil.novaSenha} onChange={fp("novaSenha")} type="password" />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Btn variant="primary" onClick={salvarPerfil}>💾 Salvar perfil</Btn>
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>⚙️ Preferências</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Moeda" value={prefs.moeda} onChange={fpr("moeda")} options={[{ value: "BRL", label: "Real (BRL)" }, { value: "USD", label: "Dólar (USD)" }, { value: "EUR", label: "Euro (EUR)" }]} />
          <Input label="Dia padrão de alerta (dias antes do vencimento)" value={prefs.diaAlertaPadrao} onChange={fpr("diaAlertaPadrao")} options={["1", "3", "5", "7", "10", "15"]} />
        </div>
        <div style={{ marginTop: 16 }}>
          <Btn variant="primary" onClick={salvarPreferencias} disabled={salvandoPrefs}>
            {salvandoPrefs ? "⏳ Salvando..." : "💾 Salvar preferências"}
          </Btn>
        </div>
      </Card>

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>🏷️ Categorias Personalizadas</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {prefs.categorias.map(cat => (
            <span key={cat} style={{ background: C.brandLight, color: C.brandDark, padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              {cat}
              <button onClick={() => setPrefs(p => ({ ...p, categorias: p.categorias.filter(c => c !== cat) }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.brandDark, fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nova categoria..." onKeyDown={e => e.key === "Enter" && adicionarCategoria()}
            style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray300}`, fontSize: 14 }} />
          <Btn variant="primary" onClick={adicionarCategoria}>+ Adicionar</Btn>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// APP PRINCIPAL — dados reais via Supabase
// ============================================================
export default function App() {
  // Restaura sessão salva no localStorage ao recarregar
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cf_user")); } catch { return null; }
  });
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [paginaAtiva, setPaginaAtiva] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalNovaConta, setModalNovaConta] = useState(false);
  const [historico] = useState(HISTORICO_WPP_MOCK);

  const showToast = useCallback((msg, type = "success") => setToast({ msg, type }), []);

  // ── Carregar contas do Supabase ao logar ─────────────────
  useEffect(() => {
    if (!user?.token) return;
    setCarregando(true);

    const carregarContas = async (token) => {
      const data = await sb.getContas(token);
      if (Array.isArray(data)) {
        setContas(data.map(c => ({ ...c, status: calcularStatus(c) })));
        return true;
      }
      return false;
    };

    const iniciar = async () => {
      // Tenta carregar com o token atual
      const ok = await carregarContas(user.token);

      if (!ok) {
        // Token expirado — tenta renovar com refresh_token
        const refreshToken = localStorage.getItem("cf_refresh_token");
        if (refreshToken) {
          const res = await sb.refreshToken(refreshToken);
          if (res.access_token) {
            // Salva novo token e tenta de novo
            const novoUser = { ...user, token: res.access_token, refresh_token: res.refresh_token };
            setUserState(novoUser);
            localStorage.setItem("cf_user", JSON.stringify(novoUser));
            localStorage.setItem("cf_token", res.access_token);
            localStorage.setItem("cf_refresh_token", res.refresh_token);
            await carregarContas(res.access_token);
          } else {
            // Refresh também expirou — precisa logar novamente
            showToast("Sessão expirada. Faça login novamente.", "error");
            handleLogout();
          }
        } else {
          handleLogout();
        }
      }
      setCarregando(false);
    };

    iniciar();
  }, [user?.id]);

  const setUser = useCallback((u) => {
    setUserState(u);
    localStorage.setItem("cf_user", JSON.stringify(u));
  }, []);

  const handleLogout = useCallback(async () => {
    if (user?.token) await sb.signOut(user.token);
    setUserState(null);
    setContas([]);
    localStorage.removeItem("cf_token");
    localStorage.removeItem("cf_user");
  }, [user?.token]);

  // ── Salvar conta (criar ou editar) no Supabase ───────────
  const handleSaveConta = async (conta) => {
    const existe = contas.find(c => c.id === conta.id);

    // Garante token válido antes de salvar
    let token = user.token;

    const dadosConta = {
      id: conta.id,
      user_id: user.id,
      nome: conta.nome,
      descricao: conta.descricao || "",
      tipo: conta.tipo,
      categoria: conta.categoria,
      valor: parseFloat(conta.valor),
      data_vencimento: conta.data_vencimento || null,
      data_pagamento: conta.data_pagamento || null,
      status: calcularStatus(conta),
      recorrente: conta.recorrente || false,
      frequencia: conta.frequencia,
      forma_pagamento: conta.forma_pagamento,
      observacoes: conta.observacoes || "",
    };

    try {
      let res;

      if (existe) {
        // Editar conta existente
        res = await sb.updateConta(token, conta.id, { ...dadosConta, updated_at: new Date().toISOString() });
      } else {
        // Criar nova conta
        res = await sb.insertConta(token, dadosConta);
      }

      // Verifica se retornou erro de autenticação
      if (res?.code === "PGRST301" || res?.message?.includes("JWT")) {
        // Token expirado — renova e tenta de novo
        const refreshToken = localStorage.getItem("cf_refresh_token");
        if (refreshToken) {
          const renewed = await sb.refreshToken(refreshToken);
          if (renewed.access_token) {
            token = renewed.access_token;
            const novoUser = { ...user, token: renewed.access_token, refresh_token: renewed.refresh_token };
            setUserState(novoUser);
            localStorage.setItem("cf_user", JSON.stringify(novoUser));
            localStorage.setItem("cf_token", renewed.access_token);
            localStorage.setItem("cf_refresh_token", renewed.refresh_token);
            // Tenta salvar de novo com novo token
            res = existe
              ? await sb.updateConta(token, conta.id, { ...dadosConta, updated_at: new Date().toISOString() })
              : await sb.insertConta(token, dadosConta);
          }
        }
      }

      if (Array.isArray(res) && res[0]) {
        if (existe) {
          setContas(prev => prev.map(c => c.id === conta.id ? { ...res[0], status: calcularStatus(res[0]) } : c));
          showToast("Conta atualizada!", "success");
        } else {
          setContas(prev => [...prev, { ...res[0], status: calcularStatus(res[0]) }]);
          showToast("Conta criada e salva na nuvem! ☁️", "success");
        }
      } else {
        // Mostra o erro real para debug
        const erroMsg = res?.message || res?.error || JSON.stringify(res);
        showToast(`Erro ao salvar: ${erroMsg}`, "error");
        console.error("Erro Supabase:", res);
      }
    } catch (err) {
      showToast("Erro de conexão ao salvar conta.", "error");
      console.error("Erro:", err);
    }

    setModalNovaConta(false);
  };

  // ── Deletar conta no Supabase ─────────────────────────────
  const handleDeleteConta = async (id) => {
    await sb.deleteConta(user.token, id);
    setContas(prev => prev.filter(c => c.id !== id));
    showToast("Conta removida.", "success");
  };

  // ── Marcar como pago no Supabase ──────────────────────────
  const handleMarcarPago = async (id) => {
    const hoje2 = new Date().toISOString().split("T")[0];
    await sb.updateConta(user.token, id, { status: "pago", data_pagamento: hoje2, updated_at: new Date().toISOString() });
    setContas(prev => prev.map(c => c.id === id ? { ...c, status: "pago", data_pagamento: hoje2 } : c));
    showToast("Pagamento registrado!", "success");
  };

  const alertasCount = contas.filter(c => alertaTipo(c)).length;

  // ── Recarregar contas com renovação automática de token ──
  const recarregarContas = useCallback(async () => {
    setCarregando(true);
    try {
      let token = user.token;
      let data = await sb.getContas(token);

      if (!Array.isArray(data)) {
        const refreshToken = localStorage.getItem("cf_refresh_token");
        if (refreshToken) {
          const res = await sb.refreshToken(refreshToken);
          if (res.access_token) {
            token = res.access_token;
            const novoUser = { ...user, token: res.access_token, refresh_token: res.refresh_token };
            setUserState(novoUser);
            localStorage.setItem("cf_user", JSON.stringify(novoUser));
            localStorage.setItem("cf_token", res.access_token);
            localStorage.setItem("cf_refresh_token", res.refresh_token);
            data = await sb.getContas(token);
          }
        }
      }

      if (Array.isArray(data)) {
        setContas(data.map(c => ({ ...c, status: calcularStatus(c) })));
        showToast(`${data.length} conta(s) carregada(s)!`, "success");
      } else {
        showToast("Sessão expirada. Faça login novamente.", "error");
        handleLogout();
      }
    } catch {
      showToast("Erro de conexão. Verifique sua internet.", "error");
    }
    setCarregando(false);
  }, [user]);

  if (!user) return <AuthScreen onLogin={setUser} />;

  const titulos = {
    dashboard: "Dashboard", contas: "Minhas Contas", alertas: "Central de Alertas",
    relatorios: "Relatórios", whatsapp: "Integração WhatsApp", configuracoes: "Configurações"
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.gray50, color: C.gray900 }}>
      <Sidebar active={paginaAtiva} onNav={setPaginaAtiva} collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)} user={user} onLogout={handleLogout} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <Header titulo={titulos[paginaAtiva]} alertas={alertasCount} />

        {/* Banner de status da conexão */}
        <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "8px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>☁️</span>
          <span style={{ fontSize: 13, color: "#166534", fontWeight: 500 }}>
            {carregando ? "Carregando dados do Supabase..." : `Dados sincronizados na nuvem · ${contas.length} conta(s)`}
          </span>
          <Btn variant="ghost" size="sm" style={{ marginLeft: "auto", fontSize: 12 }}
            onClick={recarregarContas} disabled={carregando}>
            🔄 {carregando ? "Atualizando..." : "Atualizar"}
          </Btn>
        </div>

        <main style={{ flex: 1, overflowY: "auto" }}>
          {modalNovaConta && (
            <Modal title="Nova Conta" onClose={() => setModalNovaConta(false)} width={620}>
              <FormConta onSave={handleSaveConta} onClose={() => setModalNovaConta(false)} />
            </Modal>
          )}

          {carregando && contas.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 48 }}>⏳</div>
              <p style={{ color: C.gray500, fontWeight: 600 }}>Carregando suas contas...</p>
            </div>
          ) : (
            <>
              {paginaAtiva === "dashboard" && <Dashboard contas={contas} onNovaConta={() => setModalNovaConta(true)} />}
              {paginaAtiva === "contas" && (
                <ContasModule
                  contas={contas} setContas={setContas} showToast={showToast}
                  onDelete={handleDeleteConta} onMarcarPago={handleMarcarPago} onSave={handleSaveConta}
                />
              )}
              {paginaAtiva === "alertas" && <AlertasModule contas={contas} />}
              {paginaAtiva === "relatorios" && <RelatoriosModule contas={contas} />}
              {paginaAtiva === "whatsapp" && <WhatsAppModule user={user} historico={historico} />}
              {paginaAtiva === "configuracoes" && <ConfiguracoesModule user={user} setUser={setUser} showToast={showToast} />}
            </>
          )}
        </main>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        * { box-sizing: border-box; }
        .auth-left { display: none !important; }
        @media (min-width: 769px) { .auth-left { display: flex !important; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        input:focus, select:focus, textarea:focus { outline: 2px solid #1a56db; outline-offset: 1px; }
      `}</style>
    </div>
  );
}
