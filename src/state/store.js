import { STORE_KEY, COMPANY_STORE_KEY, LOGS_STORE_KEY, DEFAULT_EMPRESA, FEED_PHASES, LEGACY_PHASES } from '../config/constants.js';
import { dateToISO, getTodayISO, normalizeEggType, padZero } from '../utils/formatters.js';

const today = getTodayISO();
const initDate = new Date();

export const state = {
    db: null,
    currentUser: null,
    currentRole: 'common',
    dataPeriodoDashboard: new Date(initDate),
    dataPeriodoColeta: new Date(initDate),
    periodoInicio: `${initDate.getFullYear()}-${padZero(initDate.getMonth() + 1)}-01`,
    periodoFim: `${initDate.getFullYear()}-${padZero(initDate.getMonth() + 1)}-${padZero(new Date(initDate.getFullYear(), initDate.getMonth() + 1, 0).getDate())}`,
    extratoInicio: `${today.slice(0, 8)}01`,
    extratoFim: today,
    renderCallback: null
};

export function isCurrentUserAdmin() {
    if (state.currentRole === 'admin') return true;
    const uid = state.currentUser?.id;
    if (uid && Array.isArray(state.db?.usuarios)) {
        const u = state.db.usuarios.find(item => item.id === uid);
        if (u?.role === 'admin') return true;
    }
    return state.currentUser?.user_metadata?.role === 'admin';
}

export function registerRenderCallback(fn) {
    state.renderCallback = fn;
}

export function triggerRender() {
    if (typeof state.renderCallback === 'function') {
        state.renderCallback();
    }
}

export function normalizePlantel(plantel) {
    const normalized = { inicial: 0, crescimento: 0, prePostura: 0, postura: 0 };

    Object.entries(plantel || {}).forEach(([fase, qtd]) => {
        const key = LEGACY_PHASES[fase] || fase;
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
            normalized[key] += Number(qtd) || 0;
        }
    });

    return normalized;
}

export function normalizeInsumo(insumo) {
    const tipoLegado = LEGACY_PHASES[insumo.tipoConsumo] || insumo.tipoConsumo;
    const tipoConsumo = FEED_PHASES[tipoLegado] ? tipoLegado : "GERAL";

    return {
        ...insumo,
        tipoConsumo,
        qtd: Number(insumo.qtd) || 0,
        unidade: tipoConsumo === "GERAL" ? "un" : "kg"
    };
}

export function normalizeProduto(produto) {
    let comp = produto.composicao || produto.insumos || [];

    if (typeof comp === 'string' && comp.trim() !== "") {
        try {
            comp = JSON.parse(comp);
        } catch (e) {
            console.warn("Erro ao converter composição do produto:", produto.nome);
            comp = [];
        }
    }

    if (comp && typeof comp === 'object' && !Array.isArray(comp)) {
        comp = [comp];
    }

    return {
        ...produto,
        preco: Number(produto.preco ?? produto.preco_padrao ?? 0) || 0,
        tipoOvo: normalizeEggType(produto.tipoOvo || produto.tipo || produto.productType || "Grande"),
        ovosPorItem: Number(produto.ovosPorItem || produto.ovos || produto.productEggs) || 0,
        composicao: Array.isArray(comp) ? comp : []
    };
}

export function normalizeColeta(coleta) {
    const bruto = Number(coleta.bruto ?? coleta.coletados ?? coleta.coletado ?? 0) || 0;
    const perda = Number(coleta.perda ?? coleta.perdas ?? 0) || 0;
    const liquido = Number(coleta.liquido ?? (bruto - perda)) || 0;

    return {
        ...coleta,
        id: coleta.id || Date.now() + Math.random(),
        data: dateToISO(coleta.data) || getTodayISO(),
        tipo: normalizeEggType(coleta.tipo || "Grande"),
        bruto,
        perda,
        liquido
    };
}

export function normalizeHistorico(item) {
    const statusBruto = String(item.status || item.Status || "pago").toLowerCase();
    const status = statusBruto.includes("pendente") ? "pendente" : "pago";

    return {
        ...item,
        id: item.id || Date.now() + Math.random(),
        data: dateToISO(item.data) || getTodayISO(),
        valor: Number(item.valor ?? item.valor_total ?? 0) || 0,
        valorUnitario: Number(item.valorUnitario ?? item.valor_unitario ?? 0) || 0,
        qtd: Number(item.qtd ?? item.quantidade ?? 0) || 0,
        dataPagamento: item.dataPagamento || item.Datapagamento || item.datapagamento || "",
        status
    };
}

export function normalizeEmpresa(empresa) {
    let savedLocal = {};
    try {
        const raw = localStorage.getItem(COMPANY_STORE_KEY);
        if (raw) savedLocal = JSON.parse(raw);
    } catch {
        savedLocal = {};
    }
    const merged = { ...DEFAULT_EMPRESA, ...savedLocal, ...(empresa || {}) };
    return {
        nome: String(merged.nome || DEFAULT_EMPRESA.nome).trim(),
        subtitulo: String(merged.subtitulo ?? DEFAULT_EMPRESA.subtitulo).trim(),
        documento: String(merged.documento || "").trim(),
        responsavel: String(merged.responsavel || "").trim(),
        telefone: String(merged.telefone || "").trim(),
        email: String(merged.email || "").trim(),
        endereco: String(merged.endereco || "").trim(),
        chavePix: String(merged.chavePix || merged.pix || "").trim(),
        favorecidoPix: String(merged.favorecidoPix || merged.favorecido_pix || "").trim(),
        mensagemRodape: String(merged.mensagemRodape ?? merged.rodape ?? DEFAULT_EMPRESA.mensagemRodape).trim()
    };
}

export function normalizeDatabase(data) {
    data = data || {};
    data.estoque = data.estoque || { Grande: 0, Medio: 0, Pequeno: 0 };
    data.estoque.Grande = Number(data.estoque.Grande) || 0;
    data.estoque.Medio = Number(data.estoque.Medio) || 0;
    data.estoque.Pequeno = Number(data.estoque.Pequeno) || 0;
    data.insumos = Array.isArray(data.insumos) ? data.insumos : [];
    data.clientes = Array.isArray(data.clientes) ? data.clientes : [];
    data.produtos = Array.isArray(data.produtos) ? data.produtos : [];
    data.historico = Array.isArray(data.historico) ? data.historico : [];
    data.usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    data.coletas = Array.isArray(data.coletas) ? data.coletas : [];
    if (!Array.isArray(data.logs)) {
        try {
            const rawLogs = localStorage.getItem(LOGS_STORE_KEY);
            data.logs = rawLogs ? JSON.parse(rawLogs) : [];
        } catch {
            data.logs = [];
        }
    }
    data.config = data.config || {};
    data.config.plantel = normalizePlantel(data.config.plantel || {});
    data.config.empresa = normalizeEmpresa(data.config.empresa);

    data.insumos = (data.insumos || []).filter(Boolean).map(normalizeInsumo);
    data.produtos = (data.produtos || []).filter(Boolean).map(normalizeProduto);
    data.coletas = (data.coletas || []).filter(Boolean).map(normalizeColeta);
    data.historico = (data.historico || []).filter(Boolean).map(normalizeHistorico);

    return data;
}

export function loadDb() {
    const raw = localStorage.getItem(STORE_KEY);
    let data;

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = {};
    }

    state.db = normalizeDatabase(data);
    return state.db;
}

export function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.db));
    triggerRender();
}

// Inicializa o banco local ao carregar o módulo
loadDb();

