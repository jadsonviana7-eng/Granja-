const CLOUD_URL = "https://script.google.com/macros/s/AKfycbxZG-L7s932UnGNn-OA9FV3R2KKrvfybIvR6pH50G3GQkcCyvl8WDkU_IW0GiiU_YOoZA/exec";
const STORE_KEY = "granjaViana_v2_final";
const today = new Date().toISOString().slice(0, 10);

// ─── Estado do período financeiro ───────────────────────────────────────────
// Formato interno: "YYYY-MM-DD"  |  Formato exibição: "DD/MM/YYYY"
let periodoInicio = `${today.slice(0, 8)}01`; // Dia 1 do mês atual
let periodoFim    = today;                     // Hoje
let extratoInicio = `${today.slice(0, 8)}01`;
let extratoFim    = today;

const FEED_PHASES = {
    inicial: { label: "Inicial", consumoKgDia: 0.04 },
    crescimento: { label: "Crescimento", consumoKgDia: 0.08 },
    prePostura: { label: "Pré-Postura", consumoKgDia: 0.10 },
    postura: { label: "Postura", consumoKgDia: 0.12 }
};

const LEGACY_PHASES = {
    cria: "inicial",
    recria: "crescimento"
};

const tabs = [
    ["page-visao-geral", "Visão Geral"],
    ["page-venda", "Financeiro"],
    ["page-producao", "Produção"],
    ["page-cadastro", "Cadastros"],
    ["page-dados", "Dados"]
];

let db = loadDb();
let activeCharts = {};
let currentEditingProductId = null;
let currentEditingClientId = null;
let currentEditingInsumoId = null;

function loadDb() {
    const raw = localStorage.getItem(STORE_KEY);
    let data;

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = {};
    }

    return normalizeDatabase(data);
}

function normalizeDatabase(data) {
    data = data || {};
    data.estoque = data.estoque || { Grande: 0, Medio: 0, Pequeno: 0 };
    data.estoque.Grande = Number(data.estoque.Grande) || 0;
    data.estoque.Medio = Number(data.estoque.Medio) || 0;
    data.estoque.Pequeno = Number(data.estoque.Pequeno) || 0;
    data.insumos = Array.isArray(data.insumos) ? data.insumos : [];
    data.clientes = Array.isArray(data.clientes) ? data.clientes : [];
    data.produtos = Array.isArray(data.produtos) ? data.produtos : [];
    data.historico = Array.isArray(data.historico) ? data.historico : [];
    data.coletas = Array.isArray(data.coletas) ? data.coletas : [];
    data.config = data.config || {};
    data.config.plantel = normalizePlantel(data.config.plantel || {});

    data.insumos = (data.insumos || []).filter(Boolean).map(normalizeInsumo);
    data.produtos = (data.produtos || []).filter(Boolean).map(normalizeProduto);
    data.coletas = (data.coletas || []).filter(Boolean).map(normalizeColeta);
    data.historico = (data.historico || []).filter(Boolean).map(normalizeHistorico);

    return data;
}

function normalizePlantel(plantel) {
    const normalized = { inicial: 0, crescimento: 0, prePostura: 0, postura: 0 };

    Object.entries(plantel || {}).forEach(([fase, qtd]) => {
        const key = LEGACY_PHASES[fase] || fase;
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
            normalized[key] += Number(qtd) || 0;
        }
    });

    return normalized;
}

function normalizeInsumo(insumo) {
    const tipoLegado = LEGACY_PHASES[insumo.tipoConsumo] || insumo.tipoConsumo;
    const tipoConsumo = FEED_PHASES[tipoLegado] ? tipoLegado : "GERAL";

    return {
        ...insumo,
        tipoConsumo,
        qtd: Number(insumo.qtd) || 0,
        unidade: tipoConsumo === "GERAL" ? "un" : "kg"
    };
}

function normalizeProduto(produto) {
    let comp = produto.composicao || produto.insumos || [];
    
    // Se a composição vier como String (comum ao carregar do Google Sheets), converte de volta para Array
    if (typeof comp === 'string' && comp.trim() !== "") {
        try {
            comp = JSON.parse(comp);
        } catch (e) {
            console.warn("Erro ao converter composição do produto:", produto.nome);
            comp = [];
        }
    }

    // Se for um objeto único (comum em integrações de 1 item), transforma em Array
    if (comp && typeof comp === 'object' && !Array.isArray(comp)) {
        comp = [comp];
    }

    return {
        ...produto,
        preco: Number(produto.preco) || 0,
        tipoOvo: normalizeEggType(produto.tipoOvo || produto.tipo || produto.productType || "Grande"),
        ovosPorItem: Number(produto.ovosPorItem || produto.ovos || produto.productEggs) || 0,
        composicao: Array.isArray(comp) ? comp : []
    };
}

function normalizeEggType(tipo) {
    return tipo === "Médio" ? "Medio" : (tipo || "Grande");
}

function normalizeColeta(coleta) {
    const bruto = Number(coleta.bruto ?? coleta.coletados ?? coleta.coletado ?? 0) || 0;
    const perda = Number(coleta.perda ?? coleta.perdas ?? 0) || 0;
    const liquido = Number(coleta.liquido ?? (bruto - perda)) || 0;

    return {
        ...coleta,
        id: coleta.id || Date.now() + Math.random(),
        data: dateToISO(coleta.data) || today,
        tipo: normalizeEggType(coleta.tipo || "Grande"),
        bruto,
        perda,
        liquido
    };
}

function normalizeHistorico(item) {
    const statusBruto = String(item.status || item.Status || "pago").toLowerCase();
    const status = statusBruto.includes("pendente") ? "pendente" : "pago";

    return {
        ...item,
        id: item.id || Date.now() + Math.random(),
        data: dateToISO(item.data) || today,
        valor: Number(item.valor) || 0,
        qtd: Number(item.qtd ?? item.quantidade ?? 0) || 0,
        dataPagamento: item.dataPagamento || item.Datapagamento || item.datapagamento || "",
        status: status
    };
}

// Função principal de salvamento (Local + Nuvem)
function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    render();
    if (typeof syncToCloud === 'function') syncToCloud();
}

function esc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function money(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value) || 0);
}

function formatNumber(value, decimals = 2) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(decimals);
}

function dateToISO(dataStr) {
    if (!dataStr) return "";
    const clean = String(dataStr).split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.split("/");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return clean;
}

function formatarDataBR(dataStr) {
    const iso = dateToISO(dataStr);
    if (!iso || !iso.includes("-")) return dataStr || "";
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
}

function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
}

function getInsumoUnit(insumo) {
    return insumo && insumo.tipoConsumo !== "GERAL" ? "kg" : "un";
}

function isRacao(insumo) {
    return insumo && insumo.tipoConsumo !== "GERAL";
}

function getPhaseLabel(fase) {
    return FEED_PHASES[fase]?.label || "Geral";
}

function deleteIcon() {
    return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

function iconSvg(name) {
    const icons = {
        venda: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
        despesa: '<path d="M16 3h5v5"/><path d="m21 3-7 7"/><path d="M8 21H3v-5"/><path d="m3 21 7-7"/>',
        producao: '<path d="M12 3c4 0 7 4 7 9 0 6-3 9-7 9s-7-3-7-9c0-5 3-9 7-9Z"/><path d="M9 12h6"/>',
        historico: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 2"/>',
        extrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
        plantel: '<path d="M7 20h10"/><path d="M12 20V9"/><path d="M8 9c0-3 2-5 4-5s4 2 4 5c0 2-1 4-4 4s-4-2-4-4Z"/>',
        cliente: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
        produto: '<path d="m21 16-9 5-9-5V8l9-5 9 5Z"/><path d="m3.3 7.6 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        insumo: '<path d="M10 2v7.3L4.2 19A2 2 0 0 0 6 22h12a2 2 0 0 0 1.8-3L14 9.3V2"/><path d="M8 2h8"/><path d="M7 16h10"/>',
        dados: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
        editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="m15 5 4 4"/>'
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.produto}</svg>`;
}

function makeHeaderIcon(name) {
    return `<span class="header-icon">${iconSvg(name)}</span>`;
}

function decorateCardHeaders() {
    const pairs = [
        ["Nova Venda", "venda"],
        ["Nova Despesa", "despesa"],
        ["Coleta Diária", "producao"],
        ["Histórico de Coletas", "historico"],
        ["Extrato", "extrato"],
        ["Gerenciamento do Plantel", "plantel"],
        ["Novo Cliente", "cliente"],
        ["Novo Produto", "produto"],
        ["Cadastrar Insumo", "insumo"],
        ["Sincronização Nuvem", "dados"],
        ["Editar Lançamento", "editar"],
        ["Editar Cliente", "cliente"],
        ["Editar Insumo", "insumo"]
    ];

    document.querySelectorAll(".card-header h2").forEach((title) => {
        if (title.dataset.decorated) return;
        const text = title.textContent.trim();
        const match = pairs.find(([label]) => text.includes(label));
        if (!match) return;
        title.innerHTML = `${makeHeaderIcon(match[1])}<span>${esc(text)}</span>`;
        title.dataset.decorated = "true";
    });
}

function buildTabs() {
    const html = tabs.map(([id, label]) => (
        `<button class="tab-btn" data-page="${id}" onclick="showPage('${id}')">${esc(label)}</button>`
    )).join("");

    const top = document.getElementById("topTabs");
    const bottom = document.getElementById("bottomTabs");
    if (top) top.innerHTML = html;
    if (bottom) bottom.innerHTML = html;
}

function showPage(id) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    document.getElementById(id)?.classList.add("active");
    document.querySelectorAll(`[data-page="${id}"]`).forEach(btn => btn.classList.add("active"));

    // LÓGICA NOVA: Oculta o stockPanel se não for a página de venda (Financeiro)
    const panel = document.getElementById("stockPanel");
    if (panel && window.innerWidth <= 768) {
        if (id !== "page-venda" && id !== "page-visao-geral") {
            panel.classList.add("is-hidden");
        } else {
            panel.classList.remove("is-hidden");
        }
    }

    if (id === "page-cadastro") {
        renderInsumosNoProduto();
        renderPlantel();
    }
}

function render() {
    renderStock();
    renderSelects();
    renderLists();
    renderFinance();
    renderExtract();
    renderColetas();
    renderPlantel();
    renderDashboard();
    updateExpenseInsumoFields();
    toggleUnitIndicator();
}

function renderDashboard() {
    const ctxProd = document.getElementById('chartProducao')?.getContext('2d');
    const ctxClient = document.getElementById('chartVendasCliente')?.getContext('2d');
    const ctxCity = document.getElementById('chartVendasCidade')?.getContext('2d');

    if (!ctxProd || !ctxClient || !ctxCity) return;

    // Destruir gráficos antigos para evitar sobreposição
    Object.values(activeCharts).forEach(chart => chart.destroy());

    // 1. Dados Produção (Linha: Dia 1 ao dia atual do mês)
    const startOfMonth = moment().startOf('month');
    const endOfRange = moment(); 
    const diasDoMesAtual = [];
    let currentDay = startOfMonth.clone();
    while (currentDay.isSameOrBefore(endOfRange, 'day')) {
        diasDoMesAtual.push(currentDay.format('YYYY-MM-DD'));
        currentDay.add(1, 'day');
    }

    const dadosProducao = diasDoMesAtual.map(dia => {
        return db.coletas.filter(c => dateToISO(c.data) === dia).reduce((acc, c) => acc + c.liquido, 0);
    });
    const maxProducao = Math.max(...dadosProducao, 0);

    activeCharts.prod = new Chart(ctxProd, {
        type: 'line',
        data: {
            labels: diasDoMesAtual.map(d => formatarDataBR(d).slice(0, 5)),
            datasets: [{
                label: 'Produção Total',
                data: dadosProducao,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: maxProducao + 200 } }
        }
    });

    // 2. Vendas por Cliente/Cidade (Filtro Mês Atual)
    const mesAtualIncio = moment().startOf('month').format('YYYY-MM-DD');
    const vendasMes = db.historico.filter(h => h.tipo === 'VENDA' && dateToISO(h.data) >= mesAtualIncio);
    
    const groupData = (key) => {
        const map = {};
        vendasMes.forEach(v => {
            let label = v[key] || "Outros";
            if (key === 'cidade') {
                const cliente = db.clientes.find(c => c.nome === v.cliente);
                label = cliente?.cidade || "Não Informada";
            }
            map[label] = (map[label] || 0) + v.valor;
        });
        return { labels: Object.keys(map), values: Object.values(map) };
    };

    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 110, left: 20, top: 10, bottom: 10 } },
        plugins: {
            legend: {
                position: window.innerWidth < 600 ? 'bottom' : 'right',
                align: 'center',
                labels: {
                    boxWidth: 12,
                    padding: 20,
                    generateLabels: (chart) => {
                        const data = chart.data;
                        return data.labels.map((label, i) => ({
                            text: `${label}: ${currencyFormatter.format(data.datasets[0].data[i])}`,
                            fillStyle: data.datasets[0].backgroundColor[i], // Cor de fundo do quadradinho
                            strokeStyle: data.datasets[0].backgroundColor[i], // Cor da borda do quadradinho
                            lineWidth: 0,
                            hidden: !chart.getDataVisibility(i),
                            index: i
                        }));
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => ` Total: ${currencyFormatter.format(context.parsed)}`
                }
            }
        }
    };

    const coresExpandidas = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#4ade80', '#fb7185'];

    const dataClient = groupData('cliente');
    activeCharts.client = new Chart(ctxClient, {
        type: 'doughnut',
        data: { labels: dataClient.labels, datasets: [{ data: dataClient.values, backgroundColor: coresExpandidas }] },
        options: pieOptions
    });

    const dataCity = groupData('cidade');
    activeCharts.city = new Chart(ctxCity, {
        type: 'doughnut',
        data: { labels: dataCity.labels, datasets: [{ data: dataCity.values, backgroundColor: coresExpandidas.slice().reverse() }] },
        options: pieOptions
    });
}

function renderStock() {
    const eggCards = ["Grande", "Medio", "Pequeno"].map(tipo => `
        <div class="stock-card stock-card-eggs">
            <small>Ovos ${tipo}</small>
            <b>${formatNumber(db.estoque[tipo] || 0)}</b>
        </div>
    `).join("");

    const feedCards = db.insumos.filter(isRacao).map(insumo => {
        const fase = insumo.tipoConsumo;
        const consumo = (db.config.plantel[fase] || 0) * FEED_PHASES[fase].consumoKgDia;
        const dias = consumo > 0 ? Math.floor((insumo.qtd || 0) / consumo) : 0;
        return `
            <div class="stock-card stock-card-feed">
                <small>${esc(insumo.nome)}</small>
                <b>${formatNumber(insumo.qtd)} kg</b>
                <span>${esc(getPhaseLabel(fase))} · ${formatNumber(consumo)} kg/dia · ${dias || "∞"} dias</span>
            </div>
        `;
    }).join("");

    const otherCards = db.insumos.filter(insumo => !isRacao(insumo)).map(insumo => `
        <div class="stock-card stock-card-other">
            <small>${esc(insumo.nome)}</small>
            <b>${formatNumber(insumo.qtd)} </b>
        </div>
    `).join("");

    const panel = document.getElementById("stockPanel");
    if (panel) panel.innerHTML = eggCards + feedCards + otherCards;
}

function renderSelects() {
    const clients = document.getElementById("saleClient");
    if (clients) {
        clients.innerHTML = '<option value="">Consumidor Geral</option>' +
            db.clientes.map(c => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join("");
    }

    const products = document.getElementById("saleProduct");
    if (products) {
        products.innerHTML = '<option value="">Selecione um produto...</option>' +
            db.produtos.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join("");
    }

    atualizarSelectInsumosDespesa();
}

function renderLists() {
    renderClients();
    renderProducts();
    renderInsumos();
}

function renderClients() {
    const list = document.getElementById("clientList");
    if (!list) return;
    list.innerHTML = db.clientes.map(c => `
        <div class="item">
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <b style="font-size: 1.1rem;">${esc(c.nome)}</b>
                <small style="color: var(--muted); margin-top: 2px;">
                    ${esc([c.telefone, c.cidade].filter(Boolean).join(" · "))}
                </small>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="icon-btn blue" type="button" onclick="openClientEditModal(${c.id})" title="Editar cliente">
                    ${iconSvg('editar')}
                </button>
                <button class="icon-btn danger" type="button" onclick="deleteItem('clientes', ${c.id})" title="Excluir cliente">
                    ${deleteIcon()}
                </button>
            </div>
        </div>
    `).join("");
}

function renderProducts() {
    const list = document.getElementById("productList");
    if (!list) return;
    list.innerHTML = db.produtos.map(p => {
        let compHtml = "";
        if (p.composicao && p.composicao.length > 0) {
            const items = p.composicao.map(c => {
                const ins = db.insumos.find(i => String(i.id) === String(c.insumoId));
                return ins ? `${ins.nome} (${formatNumber(c.qtdNecessaria)})` : null;
            }).filter(Boolean);
            if (items.length > 0) {
                compHtml = `<div style="margin-top:4px; font-size: 0.75rem; color: var(--muted);">
                    <i class="fas fa-layer-group"></i> <b>Composição:</b> ${esc(items.join(", "))}
                </div>`;
            }
        }

        return `
        <div class="item">
            <div style="display: flex; flex-direction: column; align-items: flex-start; width: 100%;">
                <b style="font-size: 1.1rem;">${esc(p.nome)}</b>
                <small style="color: var(--muted); margin-top: 2px;">
                    ${esc(p.tipoOvo)} · ${p.ovosPorItem || 0} ovos · Unit.: ${money(p.preco)}
                </small>
                ${compHtml}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="icon-btn blue" type="button" onclick="openProductEditModal(${p.id})" title="Editar produto">
                    ${iconSvg('editar')}
                </button>
                <button class="icon-btn danger" type="button" onclick="deleteItem('produtos', ${p.id})" title="Excluir produto">
                    ${deleteIcon()}
                </button>
            </div>
        </div>`;
    }).join("");
}

function renderInsumos() {
    const list = document.getElementById("insumoList");
    if (!list) return;
    list.innerHTML = db.insumos.map(ins => `
        <div class="item">
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <b style="font-size: 1.1rem;">${esc(ins.nome)}</b>
                <small style="color: var(--muted); margin-top: 2px;">
                    ${isRacao(ins) ? `Ração ${esc(getPhaseLabel(ins.tipoConsumo))}` : "Insumo geral"} · 
                    ${formatNumber(ins.qtd)} ${getInsumoUnit(ins)}
                </small>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="icon-btn blue" type="button" onclick="openInsumoEditModal(${ins.id})" title="Editar insumo">
                    ${iconSvg('editar')}
                </button>
                <button class="icon-btn danger" type="button" onclick="deleteItem('insumos', ${ins.id})" title="Excluir insumo">
                    ${deleteIcon()}
                </button>
            </div>
        </div>
    `).join("");
}

function renderFinance() {
    const ini = periodoInicio;
    const fim = periodoFim;

    const noperiodo = db.historico.filter(h => {
        const d = dateToISO(h.data);
        return d >= ini && d <= fim;
    });

    const vendas    = noperiodo.filter(h => h.tipo === "VENDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const pendentes = noperiodo.filter(h => h.tipo === "VENDA" && h.status === "pendente").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const saidas    = noperiodo.filter(h => h.tipo === "SAIDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);

    document.getElementById("vendasMes").textContent    = money(vendas);
    document.getElementById("pendentesMes").textContent = money(pendentes);
    document.getElementById("despesasMes").textContent  = money(saidas);
    document.getElementById("saldoMes").textContent     = money(vendas - saidas);
}

function renderExtract() {
    const extractElement = document.getElementById("extractList");
    if (!extractElement) return;

    const start = extratoInicio;
    const end = extratoFim;
    const type = document.getElementById("filterType")?.value || "TODOS";

    // 1. Filtramos os dados normalmente
    let filtrado = db.historico.filter(item => {
        const itemDataISO = dateToISO(item.data);
        const matchDate = (!start || itemDataISO >= start) && (!end || itemDataISO <= end);
        const matchType = type === "TODOS" || item.tipo === type;
        return matchDate && matchType && (item.tipo === "VENDA" || item.tipo === "SAIDA");
    });

    // 2. ORDENAÇÃO: Da data mais recente para a mais antiga
    // Usamos o localeCompare ou comparação de strings ISO para garantir a ordem correta
    filtrado.sort((a, b) => {
        const dateA = dateToISO(a.data);
        const dateB = dateToISO(b.data);
        
        // Se as datas forem diferentes, ordena pela data (descendente)
        if (dateB !== dateA) {
            return dateB.localeCompare(dateA);
        }
        // Se a data for a mesma, usamos o ID como critério de desempate (o último criado aparece primeiro)
        return (b.id || 0) - (a.id || 0);
    });

    const count = document.getElementById("extractCount");
    if (count) count.textContent = `${filtrado.length} registros`;

    // 3. Renderizamos (removemos o .reverse() antigo pois o .sort() já resolveu)
    extractElement.innerHTML = filtrado.map(h => {
        const qtd = Number(h.qtd ?? h.quantidade) || 0;
        const valorTotal = Number(h.valor) || 0;
        const valorUnitario = Number(h.valorUnitario) || (qtd > 0 ? valorTotal / qtd : 0);
        const corLinha = h.tipo === "VENDA" ? "var(--green)" : "var(--red)";
        const tituloTopo = h.tipo === "VENDA" ? (h.cliente || "Consumidor Geral") : (h.insumo || h.descricao || "Despesa");
        const nomeSubtitulo = h.tipo === "VENDA" ? (h.produto || "Produto não informado") : (h.insumo ? h.descricao : h.categoria || "Geral");
        const unidade = h.unidade ? ` ${h.unidade}` : "";

        // Exibe observação apenas se existir e for diferente do título/detalhe já mostrado
        const obsText = (h.descricao && h.descricao !== tituloTopo && h.descricao !== nomeSubtitulo) ? h.descricao : "";

        const statusAtual = String(h.status || "pago").toLowerCase();
        const dataPagamentoHtml = (statusAtual === "pago" && h.dataPagamento) 
            ? `<div style="font-size: 0.65rem; color: var(--muted); margin-top: 2px; font-weight: 600;">pago em ${formatarDataBR(h.dataPagamento)}</div>` 
            : "";

        return `
            <div class="item" style="border-left-color: ${corLinha}; cursor:pointer;" onclick="openEditModal(${h.id})">
                <div class="item-row">
                    <div class="item-left">
                        <span style="font-size: 0.8rem; color: var(--muted); font-weight: 500;">${formatarDataBR(h.data)}</span>
                        <div style="margin: 3px 0;"><b style="font-size: 1.1rem; color: var(--ink); text-transform: uppercase;">${esc(tituloTopo)}</b></div>
                        <div class="item-data-line" style="margin-top: 5px;">
                            ${obsText ? `<span><strong>Obs:</strong> ${esc(obsText)}</span>` : ''}
                            <span><strong>Detalhe:</strong> ${esc(nomeSubtitulo || "-")}</span>
                            <span><strong>Qtd:</strong> ${formatNumber(qtd)}${unidade}</span>
                            <span><strong>Un:</strong> ${money(valorUnitario)}</span>
                        </div>
                    </div>
                    <div class="item-right" style="text-align: right;">
                        <b style="color: ${corLinha}; font-size: 1.2rem;">${money(valorTotal)}</b>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span class="badge ${statusAtual === "pendente" ? "amber" : "green"}" style="font-size: 0.65rem; padding: 2px 8px;">${statusAtual.toUpperCase()}</span>
                            ${dataPagamentoHtml}
                        </div>
                    </div>
                </div>
            </div>`;
    }).join("");
}

function renderColetas() {
    const lista = document.getElementById("coletaList");
    const filtroData = document.getElementById("filtroDataColeta");
    if (!lista) return;

    let mesFiltro, anoFiltro;

    if (filtroData && filtroData.value) {
        const partes = filtroData.value.split("-");
        anoFiltro = parseInt(partes[0]);
        mesFiltro = parseInt(partes[1]) - 1;
    } else {
        const agora = new Date();
        mesFiltro = agora.getMonth();
        anoFiltro = agora.getFullYear();
        if (filtroData) filtroData.value = `${anoFiltro}-${String(mesFiltro + 1).padStart(2, '0')}`;
    }

    const coletasFiltradas = db.coletas
        .filter(coleta => {
            const iso = dateToISO(coleta.data);
            if (!iso) return false;
            const [ano, mes] = iso.split("-").map(Number);
            return ano === anoFiltro && mes === (mesFiltro + 1);
        })
        .sort((a, b) => dateToISO(b.data).localeCompare(dateToISO(a.data)));

    let html = "";
    if (coletasFiltradas.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:var(--muted);">Nenhuma coleta registrada neste mês.</div>';
    } else {
        coletasFiltradas.forEach(item => {
            html += `
                <div class="item">
                    <div style="display: flex; flex-direction: column; align-items: flex-start;">
                        <span style="font-size: 0.75rem; color: var(--muted); font-weight: bold; text-transform: uppercase;">
                            ${formatarDataBR(item.data)}
                        </span>
                        <b style="font-size: 1.05rem; color: var(--ink); margin: 2px 0;">
                            Ovos ${esc(item.tipo)}
                        </b>
                        <small style="color: var(--muted); font-size: 0.85rem;">
                            <strong>${item.liquido} ovos líquidos</strong> · ${item.bruto} coletados · ${item.perda} perdas
                        </small>
                    </div>
                    
                    <button class="icon-btn danger" type="button" onclick="deleteItem('coletas', ${item.id})" title="Excluir coleta">
                        ${deleteIcon()}
                    </button>
                </div>`;
        });
    }
    lista.innerHTML = html;
}

function renderPlantel() {
    let htmlFases = "";
    let totalAves = 0;
    let consumoTotalGeral = 0;

    // Percorremos cada fase definida no sistema
    Object.entries(FEED_PHASES).forEach(([fase, config]) => {
        const qtdAves = Number(db.config.plantel[fase]) || 0;
        const consumoFase = qtdAves * config.consumoKgDia;
        
        totalAves += qtdAves;
        consumoTotalGeral += consumoFase;

        // Atualiza o valor do input na tela (se existir)
        const input = document.querySelector(`.plantel-input[data-fase="${fase}"]`);
        if (input) input.value = qtdAves;

        // Criamos uma linha de informação para cada fase
        htmlFases += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--line);">
                <span style="font-weight: 500;">${config.label}:</span>
                <div style="text-align: right;">
                    <div style="color: var(--ink); font-weight: bold;">${formatNumber(consumoFase)} kg/dia</div>
                    <small style="color: var(--muted); font-size: 0.75rem;">(${qtdAves} aves x ${config.consumoKgDia}kg)</small>
                </div>
            </div>
        `;
    });

    // Atualizamos os totais nos elementos da tela
    const totalAvesEl = document.getElementById("totalAvesGeral");
    const consumoEl = document.getElementById("consumoDiarioEstimado");
    const detalheConsumoEl = document.getElementById("detalheConsumoPorFase");

    if (totalAvesEl) totalAvesEl.textContent = totalAves;
    if (consumoEl) consumoEl.textContent = consumoTotalGeral.toFixed(2);
    
    // Se você criar um container no HTML com id "detalheConsumoPorFase", ele mostrará a lista
    if (detalheConsumoEl) {
        detalheConsumoEl.innerHTML = htmlFases;
    }
}

function getConsumoDiarioTotal() {
    return Object.entries(FEED_PHASES).reduce((acc, [fase, config]) => (
        acc + ((Number(db.config.plantel[fase]) || 0) * config.consumoKgDia)
    ), 0);
}

function renderInsumosNoProduto() {
    const container = document.getElementById("productCompositionList");
    if (!container) return;

    const insumosGerais = (db.insumos || []).filter(ins => !isRacao(ins));
    if (insumosGerais.length === 0) {
        container.innerHTML = '<em style="color:var(--muted); font-size:0.8rem;">Cadastre insumos gerais primeiro...</em>';
        return;
    }

    container.innerHTML = insumosGerais.map(ins => `
        <div class="comp-item">
            <span style="font-size: 0.85rem; color: var(--ink);">${esc(ins.nome)}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" step="1" class="insumo-comp-qty" data-id="${ins.id}" placeholder="0" style="width: 70px; padding: 3px 6px; font-size: 0.85rem; border: 1px solid var(--line); border-radius: 4px;">
                <small style="color: var(--muted); font-size: 0.7rem;">${getInsumoUnit(ins)}</small>
            </div>
        </div>
    `).join("");
}

function openCompositionModal(context = 'new') {
    // Se for um novo produto, limpamos os campos. 
    // Para edição, os campos já foram preparados ao clicar no lápis de editar.
    if (context === 'new') renderInsumosNoProduto(); 

    const modal = document.getElementById("compositionModal");
    if (modal) {
        modal.dataset.context = context;
        modal.style.display = "flex";
    }
}

function openSaleModal() {
    const modal = document.getElementById("saleModal");
    if (modal) modal.style.display = "flex";
}

function closeSaleModal() {
    const modal = document.getElementById("saleModal");
    if (modal) modal.style.display = "none";
}

function openExpenseModal() {
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.display = "flex";
}

function closeExpenseModal() {
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.display = "none";
}

function openProductEditModal(id) {
    const prod = db.produtos.find(p => p.id === id);
    if (!prod) return;

    currentEditingProductId = id;
    document.getElementById("editProdId").value = prod.id;
    document.getElementById("editProdName").value = prod.nome;
    document.getElementById("editProdPrice").value = money(prod.preco);
    document.getElementById("editProdType").value = prod.tipoOvo;
    document.getElementById("editProdEggs").value = prod.ovosPorItem;
    
    // Preparamos a lista de insumos e marcamos os valores atuais do produto
    renderInsumosNoProduto();
    if (prod.composicao) {
        prod.composicao.forEach(c => {
            const input = document.querySelector(`.insumo-comp-qty[data-id="${c.insumoId}"]`);
            if (input) input.value = c.qtdNecessaria;
        });
    }

    const count = (prod.composicao || []).length;
    document.getElementById("compositionSummaryEdit").textContent = count > 0 
        ? `✅ ${count} insumo(s) configurado(s).` 
        : "Nenhuma composição definida.";

    document.getElementById("productEditModal").style.display = "flex";
}

function closeProductEditModal() {
    document.getElementById("productEditModal").style.display = "none";
    currentEditingProductId = null;
}

function openClientEditModal(id) {
    const client = db.clientes.find(c => c.id === id);
    if (!client) return;

    currentEditingClientId = id;
    document.getElementById("editClientId").value = client.id;
    document.getElementById("editClientName").value = client.nome;
    document.getElementById("editClientPhone").value = client.telefone || "";
    document.getElementById("editClientCity").value = client.cidade || "";
    document.getElementById("clientEditModal").style.display = "flex";
}

function closeClientEditModal() {
    document.getElementById("clientEditModal").style.display = "none";
    currentEditingClientId = null;
}

function openInsumoEditModal(id) {
    const insumo = db.insumos.find(i => i.id === id);
    if (!insumo) return;

    currentEditingInsumoId = id;
    document.getElementById("editInsumoId").value = insumo.id;
    document.getElementById("editInsumoName").value = insumo.nome;
    document.getElementById("editInsumoTipo").value = insumo.tipoConsumo;
    document.getElementById("editInsumoQty").value = insumo.qtd;
    
    toggleEditUnitIndicator();
    document.getElementById("insumoEditModal").style.display = "flex";
}

function closeInsumoEditModal() {
    document.getElementById("insumoEditModal").style.display = "none";
    currentEditingInsumoId = null;
}

function closeCompositionModal() {
    const modal = document.getElementById("compositionModal");
    if (modal) modal.style.display = "none";
}

function updateCompositionSummary() {
    const modal = document.getElementById("compositionModal");
    const context = modal.dataset.context || 'new';
    
    const count = Array.from(document.querySelectorAll(".insumo-comp-qty"))
        .filter(input => parseFloat(input.value) > 0).length;
    
    const summaryId = context === 'edit' ? "compositionSummaryEdit" : "compositionSummary";
    const summary = document.getElementById(summaryId);
    
    if (summary) {
        summary.textContent = count > 0 
        ? `✅ ${count} insumo(s) configurado(s).` 
        : "Nenhuma composição definida.";
    }
    closeCompositionModal();
}

function toggleEditUnitIndicator() {
    const tipo = document.getElementById("editInsumoTipo")?.value || "GERAL";
    const unit = tipo === "GERAL" ? "un" : "kg";
    const indicator = document.getElementById("editUnitIndicator");
    if (indicator) indicator.textContent = unit;
}

function atualizarSelectInsumosDespesa() {
    const select = document.getElementById("expenseInsumo");
    if (!select) return;

    select.innerHTML = '<option value="">Selecione...</option>' + db.insumos.map(ins => `
        <option value="${ins.id}">${esc(ins.nome)} (${getInsumoUnit(ins)})</option>
    `).join("");
}

function formatarCampoMoeda(e) {
    let value = e.target.value.replace(/\D/g, "");
    value = (value / 100).toFixed(2).replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    e.target.value = "R$ " + value;
}

function getValueFromMask(idOrElement) {
    const el = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
    if (!el) return 0;
    const value = el.value.replace(/[R$\s.]/g, "").replace(",", ".");
    return parseFloat(value) || 0;
}

function setupCurrencyMasks() {
    const inputs = [
        "productPrice", "saleUnitValue", "saleDiscount", 
        "expenseUnitValue", "editProdPrice", "editUnit", "editDisc"
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", formatarCampoMoeda);
    });
}

function updateExpenseInsumoFields() {
    const mode = document.getElementById("expenseMode")?.value || "FINANCEIRO";
    const field = document.getElementById("expenseInsumoField");
    const select = document.getElementById("expenseInsumo");
    const qtyLabel = document.getElementById("expenseQtyLabel");
    const info = document.getElementById("expenseStockInfo");
    const insumo = db.insumos.find(item => String(item.id) === String(select?.value));

    if (field) field.style.display = mode === "ESTOQUE" ? "block" : "none";
    if (qtyLabel) qtyLabel.textContent = mode === "ESTOQUE" && insumo ? `Qtd (${getInsumoUnit(insumo)})` : "Qtd";
    if (info) {
        if (mode !== "ESTOQUE") {
            info.textContent = "Esta despesa não altera o estoque.";
        } else if (!insumo) {
            info.textContent = "Selecione o insumo comprado.";
        } else {
            const detalhe = isRacao(insumo) ? `ração da fase ${getPhaseLabel(insumo.tipoConsumo)}` : "insumo geral";
            info.textContent = `Entrada em ${getInsumoUnit(insumo)} para ${detalhe}. Estoque atual: ${formatNumber(insumo.qtd)} ${getInsumoUnit(insumo)}.`;
        }
    }
}

function toggleUnitIndicator() {
    const tipo = document.getElementById("insumoTipoConsumo")?.value || "GERAL";
    const unit = tipo === "GERAL" ? "un" : "kg";
    const indicator = document.getElementById("unitIndicator");
    const label = document.getElementById("insumoQtyLabel");
    if (indicator) indicator.textContent = unit;
    if (label) label.textContent = `Estoque Inicial (${unit})`;
}

function calculateSaleTotal() {
    const qty = parseFloat(document.getElementById("saleQty").value) || 0;
    const unit = getValueFromMask("saleUnitValue");
    const disc = getValueFromMask("saleDiscount");
    const totalField = document.getElementById("saleTotal");
    if (totalField) totalField.value = money(Math.max(0, (qty * unit) - disc));
}

function updateProductPrice() {
    const productId = document.getElementById("saleProduct")?.value;
    const produto = db.produtos.find(p => String(p.id) === String(productId));
    const field = document.getElementById("saleUnitValue");
    if (field) field.value = produto ? money(produto.preco) : "";
    calculateSaleTotal();
}

function calculateExpenseTotal() {
    const qty = parseFloat(document.getElementById("expenseQty").value) || 0;
    const unit = getValueFromMask("expenseUnitValue");
    const installments = parseInt(document.getElementById("expenseInstallments")?.value, 10) || 1;
    const total = qty * unit;
    const totalField = document.getElementById("expenseValue");
    if (totalField) totalField.value = money(total);
}

function toggleExpenseInstallments() {
    const method = document.getElementById("expensePaymentMethod")?.value;
    const section = document.getElementById("expenseInstallmentSection");
    if (section) section.style.display = method === "Cartão de Crédito" ? "block" : "none";
    calculateExpenseTotal();
}

function handleSale(e) {
    e.preventDefault();
    const prodId = document.getElementById("saleProduct").value;
    const prod = db.produtos.find(p => String(p.id) === String(prodId));

    if (!prod) return toast("Selecione um produto válido!");

    const qty = parseFloat(document.getElementById("saleQty").value) || 0;
    const unit = getValueFromMask("saleUnitValue");
    const disc = getValueFromMask("saleDiscount");
    const total = getValueFromMask("saleTotal");
    const ovosVendidos = (prod.ovosPorItem || 0) * qty;

    if (prod.tipoOvo && db.estoque[prod.tipoOvo] !== undefined) {
        db.estoque[prod.tipoOvo] = (Number(db.estoque[prod.tipoOvo]) || 0) - ovosVendidos;
    }

    prod.composicao.forEach(item => {
        const insumo = db.insumos.find(i => String(i.id) === String(item.insumoId));
        if (insumo) insumo.qtd = (Number(insumo.qtd) || 0) - ((Number(item.qtdNecessaria) || 0) * qty);
    });

    db.historico.push({
        id: Date.now(),
        data: document.getElementById("saleDate").value || today,
        tipo: "VENDA",
        cliente: document.getElementById("saleClient").value || "Consumidor Geral",
        produto: prod.nome,
        qtd: qty,
        valorUnitario: unit,
        desconto: disc,
        valor: total,
        descricao: document.getElementById("saleObs")?.value || "",
        status: document.getElementById("saleStatus").value,
        dataPagamento: document.getElementById("saleStatus").value === "pago" ? today : ""
    });

    save();
    e.target.reset();
    setDefaultDates();
    document.getElementById("saleQty").value = "1";
    document.getElementById("saleDiscount").value = "0.00";
    calculateSaleTotal();
    closeSaleModal();
    toast("Venda registrada e estoques atualizados!");
}

function handleProduction(e) {
    e.preventDefault();
    const type = document.getElementById("prodType").value;
    const coll = parseInt(document.getElementById("prodCollected").value, 10) || 0;
    const loss = parseInt(document.getElementById("prodLoss").value, 10) || 0;
    const liquido = coll - loss;

    db.estoque[type] = (Number(db.estoque[type]) || 0) + liquido;
    db.coletas.push({
        id: Date.now(),
        data: document.getElementById("prodDate").value || today,
        tipo: type,
        bruto: coll,
        perda: loss,
        liquido
    });

    save();
    e.target.reset();
    setDefaultDates();
    document.getElementById("prodLoss").value = "0";
    toast("Coleta salva!");
}

function handleExpense(e) {
    e.preventDefault();
    const mode = document.getElementById("expenseMode").value;
    const insumoId = document.getElementById("expenseInsumo").value;
    const insumo = db.insumos.find(i => String(i.id) === String(insumoId));
    const qtd = parseFloat(document.getElementById("expenseQty").value) || 0;
    const valorTotal = getValueFromMask("expenseValue");
    const valorUnitario = getValueFromMask("expenseUnitValue") || (qtd > 0 ? valorTotal / qtd : valorTotal);

    if (mode === "ESTOQUE") {
        if (!insumo) return toast("Selecione o insumo comprado.");
        insumo.qtd = (Number(insumo.qtd) || 0) + qtd;
    }

    db.historico.push({
        id: Date.now(),
        data: document.getElementById("expenseDate").value || today,
        tipo: "SAIDA",
        categoria: mode === "ESTOQUE" ? "INSUMO" : "DESPESA",
        descricao: document.getElementById("expenseDesc").value || (insumo ? `Compra de ${insumo.nome}` : "Despesa"),
        insumo: mode === "ESTOQUE" && insumo ? insumo.nome : "",
        insumoId: mode === "ESTOQUE" && insumo ? insumo.id : "",
        qtd,
        unidade: mode === "ESTOQUE" && insumo ? getInsumoUnit(insumo) : "",
        valorUnitario,
        valor: valorTotal,
        formaPagamento: document.getElementById("expensePaymentMethod").value,
        parcelas: parseInt(document.getElementById("expenseInstallments")?.value, 10) || 1,
        vencimentoDia: document.getElementById("expenseDueDay")?.value || "",
        status: "pago",
        dataPagamento: today
    });

    document.getElementById("expenseDesc").value = "";
    document.getElementById("expenseValue").value = "";

    save();
    e.target.reset();
    setDefaultDates();
    calculateExpenseTotal();
    updateExpenseInsumoFields();
    closeExpenseModal();
    toast(mode === "ESTOQUE" ? "Despesa registrada e estoque atualizado!" : "Despesa registrada!");
}

function handleInsumo(e) {
    e.preventDefault();
    const nome = document.getElementById("insumoName").value.trim();
    const tipoConsumo = document.getElementById("insumoTipoConsumo").value;
    const qtd = parseFloat(document.getElementById("insumoQtyInitial").value) || 0;

    if (!nome) return toast("Informe o nome do insumo!");

    db.insumos.push({
        id: Date.now(),
        nome,
        qtd,
        tipoConsumo,
        unidade: tipoConsumo === "GERAL" ? "un" : "kg"
    });

    save();
    e.target.reset();
    toggleUnitIndicator();
    toast(`Insumo cadastrado: ${formatNumber(qtd)} ${tipoConsumo === "GERAL" ? "un" : "kg"}.`);
}

function handleInsumoEdit(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById("editInsumoId").value, 10);
    const index = db.insumos.findIndex(i => i.id === id);
    if (index === -1) return;

    const nome = document.getElementById("editInsumoName").value.trim();
    if (!nome) return toast("O nome é obrigatório!");

    const tipoConsumo = document.getElementById("editInsumoTipo").value;
    const qtd = parseFloat(document.getElementById("editInsumoQty").value) || 0;

    db.insumos[index].nome = nome;
    db.insumos[index].tipoConsumo = tipoConsumo;
    db.insumos[index].qtd = qtd;
    db.insumos[index].unidade = tipoConsumo === "GERAL" ? "un" : "kg";

    save();
    closeInsumoEditModal();
    toast("Insumo atualizado com sucesso!");
}

function handleClient(e) {
    e.preventDefault();
    const nome = document.getElementById("clientName").value.trim();
    if (!nome) return toast("Informe o nome do cliente!");

    db.clientes.push({
        id: Date.now(),
        nome,
        telefone: document.getElementById("clientPhone").value.trim(),
        cidade: document.getElementById("clientCity").value.trim()
    });

    save();
    e.target.reset();
    toast("Cliente salvo!");
}

function handleClientEdit(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById("editClientId").value, 10);
    const index = db.clientes.findIndex(c => c.id === id);
    if (index === -1) return;

    const novoNome = document.getElementById("editClientName").value.trim();
    if (!novoNome) return toast("O nome é obrigatório!");

    db.clientes[index].nome = novoNome;
    db.clientes[index].telefone = document.getElementById("editClientPhone").value.trim();
    db.clientes[index].cidade = document.getElementById("editClientCity").value.trim();

    save();
    closeClientEditModal();
    toast("Cliente atualizado com sucesso!");
}

function handleProduct(e) {
    e.preventDefault();
    const nome = document.getElementById("productName").value.trim();
    if (!nome) return toast("Informe o nome do produto!");

    const composicao = [];
    document.querySelectorAll(".insumo-comp-qty").forEach(input => {
        const valor = parseFloat(input.value) || 0;
        if (valor > 0) {
            composicao.push({ insumoId: String(input.dataset.id), qtdNecessaria: valor });
        }
    });

    db.produtos.push({
        id: Date.now(),
        nome,
        preco: parseFloat(document.getElementById("productPrice").value) || 0,
        tipoOvo: normalizeEggType(document.getElementById("productType").value),
        ovosPorItem: parseInt(document.getElementById("productEggs").value, 10) || 0,
        composicao
    });

    save();
    e.target.reset();
    updateCompositionSummary(); // Limpa o texto do resumo
    renderInsumosNoProduto();    // Limpa os inputs no modal
    toast("Produto cadastrado com sucesso!");
}

function handleProductEdit(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById("editProdId").value, 10);
    const index = db.produtos.findIndex(p => p.id === id);
    if (index === -1) return;

    const composicao = [];
    document.querySelectorAll(".insumo-comp-qty").forEach(input => {
        const valor = parseFloat(input.value) || 0;
        if (valor > 0) {
            composicao.push({ insumoId: String(input.dataset.id), qtdNecessaria: valor });
        }
    });

    db.produtos[index].nome = document.getElementById("editProdName").value.trim();
    db.produtos[index].preco = getValueFromMask("editProdPrice");
    db.produtos[index].tipoOvo = normalizeEggType(document.getElementById("editProdType").value);
    db.produtos[index].ovosPorItem = parseInt(document.getElementById("editProdEggs").value, 10) || 0;
    db.produtos[index].composicao = composicao;

    save();
    closeProductEditModal();
    toast("Produto atualizado com sucesso!");
}

function saveGalinhas() {
    document.querySelectorAll(".plantel-input").forEach(input => {
        db.config.plantel[input.dataset.fase] = Math.max(0, parseInt(input.value, 10) || 0);
    });

    save();
    toast("Plantel atualizado!");
}

function processarConsumoRacao() {
    const agora = new Date();
    // Usamos meia-noite UTC do dia atual para comparar apenas datas
    const hojeISO = agora.toISOString().slice(0, 10);
    const ultima = db.config.ultimaDataConsumo
        ? db.config.ultimaDataConsumo.slice(0, 10)
        : null;

    if (!ultima) {
        // Primeira execução: registra hoje e sai sem descontar
        db.config.ultimaDataConsumo = hojeISO;
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
        return;
    }

    // Calcula dias completos passados desde o último consumo registrado
    const msUltima = new Date(ultima + "T00:00:00").getTime();
    const msHoje   = new Date(hojeISO  + "T00:00:00").getTime();
    const diasPassados = Math.round((msHoje - msUltima) / (1000 * 60 * 60 * 24));

    if (diasPassados < 1) return;

    let houveDesconto = false;

    Object.entries(FEED_PHASES).forEach(([fase, config]) => {
        const aves = Number(db.config.plantel[fase]) || 0;
        if (aves <= 0) return;

        const consumoTotal = aves * config.consumoKgDia * diasPassados;

        // Busca TODAS as rações desta fase (caso haja mais de um cadastro)
        const racoes = db.insumos.filter(ins => ins.tipoConsumo === fase);
        if (racoes.length === 0) return;

        // Desconta proporcionalmente (prioriza a primeira ração cadastrada)
        let restante = consumoTotal;
        racoes.forEach(racao => {
            if (restante <= 0) return;
            const descontar = Math.min(racao.qtd || 0, restante);
            racao.qtd = Math.max(0, (Number(racao.qtd) || 0) - restante);
            restante -= descontar;
        });

        db.historico.push({
            id: Date.now() + Math.random(),
            data: hojeISO,
            tipo: "SAIDA",
            categoria: "CONSUMO_RACAO",
            descricao: `Consumo automático ${diasPassados}d · Ração ${config.label}`,
            insumo: racoes[0].nome,
            insumoId: racoes[0].id,
            qtd: Number(consumoTotal.toFixed(2)),
            unidade: "kg",
            valorUnitario: 0,
            valor: 0,
            status: "pago"
        });

        houveDesconto = true;
    });

    // Atualiza a data de controle para hoje
    db.config.ultimaDataConsumo = hojeISO;

    // Persiste tudo de uma vez (não chama save() para não re-disparar render prematuramente)
    localStorage.setItem(STORE_KEY, JSON.stringify(db));

    if (houveDesconto) {
        console.info(`[Granja] Consumo de ração processado: ${diasPassados} dia(s).`);
    }
}

function deleteItem(collection, id) {
    if (!Array.isArray(db[collection])) return;
    
    // Busca o item antes de deletar para poder estornar o estoque
    const itemParaExcluir = db[collection].find(item => item.id === id);
    if (!itemParaExcluir) return;

    if (!confirm("Excluir este item? O estoque será ajustado automaticamente.")) return;

    // --- LÓGICA DE ESTORNO PARA PRODUÇÃO (COLETAS) ---
    if (collection === 'coletas') {
        const tipoOvo = itemParaExcluir.tipo; // Ex: "Grande", "Medio" ou "Pequeno"
        const qtdLiquida = Number(itemParaExcluir.liquido) || 0;

        if (db.estoque[tipoOvo] !== undefined) {
            // Se estamos excluindo a produção, subtraímos do estoque de ovos
            db.estoque[tipoOvo] = (Number(db.estoque[tipoOvo]) || 0) - qtdLiquida;
            
            // Garante que o estoque não fique negativo
            if (db.estoque[tipoOvo] < 0) db.estoque[tipoOvo] = 0;
        }
    }
    // ------------------------------------------------

    // Remove o item do array original
    db[collection] = db[collection].filter(item => item.id !== id);
    
    save(); // Salva e atualiza a interface
    toast("Item excluído e estoque atualizado.");
}

function openEditModal(id) {
    const item = db.historico.find(h => h.id === id);
    if (!item) return;

    document.getElementById("editId").value = item.id;
    document.getElementById("editDate").value = dateToISO(item.data);
    document.getElementById("editCliente").value = item.cliente || item.descricao || item.insumo || "";
    document.getElementById("editQty").value = item.qtd ?? item.quantidade ?? 0;
    document.getElementById("editUnit").value = money(item.valorUnitario || 0);
    document.getElementById("editDisc").value = money(item.desconto || 0);
    document.getElementById("editTotal").value = money(item.valor || 0);
    document.getElementById("editStatus").value = item.status || "pago";
    document.getElementById("editObs").value = item.descricao || "";
    document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("editModal").style.display = "none";
}

function calcEditTotal() {
    const q = parseFloat(document.getElementById("editQty").value) || 0;
    const u = getValueFromMask("editUnit");
    const d = getValueFromMask("editDisc");
    document.getElementById("editTotal").value = money(Math.max(0, (q * u) - d));
}

function handleEdit(e) {
    e.preventDefault();
    const id = parseFloat(document.getElementById("editId").value);
    const item = db.historico.find(h => h.id === id);
    if (!item) return;

    const newStatus = document.getElementById("editStatus").value;

    if (newStatus === "pago") {
        if (!item.dataPagamento) item.dataPagamento = today;
    } else {
        item.dataPagamento = "";
    }

    item.data = document.getElementById("editDate").value;
    item.qtd = parseFloat(document.getElementById("editQty").value) || 0;
    item.valorUnitario = getValueFromMask("editUnit");
    item.desconto = getValueFromMask("editDisc");
    item.valor = getValueFromMask("editTotal");
    item.status = newStatus;
    item.descricao = document.getElementById("editObs").value;

    if (item.tipo === "VENDA") item.cliente = document.getElementById("editCliente").value;
    if (item.tipo === "SAIDA" && !item.insumo) item.descricao = document.getElementById("editCliente").value;

    save();
    closeEditModal();
    toast("Alterações salvas!");
}

function deleteCurrentItem() {
    const id = parseFloat(document.getElementById("editId").value);
    const item = db.historico.find(h => h.id === id);

    if (!item) return;

    if (!confirm("Excluir permanentemente este lançamento? O estoque de ovos e insumos será estornado.")) return;

    // --- LÓGICA DE ESTORNO PARA VENDAS ---
    if (item.tipo === "VENDA") {
        // 1. Localiza o produto vendido para saber a composição e o tipo de ovo
        const produto = db.produtos.find(p => p.nome === item.produto);
        
        if (produto) {
            const qtdVendida = Number(item.qtd) || 0;

            // 2. Estorno de Ovos (Devolve ao estoque de ovos)
            if (produto.tipoOvo && db.estoque[produto.tipoOvo] !== undefined) {
                const ovosParaDevolver = (Number(produto.ovosPorItem) || 0) * qtdVendida;
                db.estoque[produto.tipoOvo] += ovosParaDevolver;
            }

            // 3. Estorno de Insumos (Sacolas, bandejas, etc.)
            if (Array.isArray(produto.composicao)) {
                produto.composicao.forEach(comp => {
                    const insumoNoBanco = db.insumos.find(i => String(i.id) === String(comp.insumoId));
                    if (insumoNoBanco) {
                        const qtdInsumoParaDevolver = (Number(comp.qtdNecessaria) || 0) * qtdVendida;
                        insumoNoBanco.qtd = (Number(insumoNoBanco.qtd) || 0) + qtdInsumoParaDevolver;
                    }
                });
            }
        }
    }

    // --- LÓGICA DE ESTORNO PARA DESPESAS (Mantida) ---
    if (item.tipo === "SAIDA" && item.categoria === "INSUMO" && item.insumoId) {
        const insumoNoBanco = db.insumos.find(i => String(i.id) === String(item.insumoId));
        if (insumoNoBanco) {
            insumoNoBanco.qtd = (Number(insumoNoBanco.qtd) || 0) - (Number(item.qtd) || 0);
            if (insumoNoBanco.qtd < 0) insumoNoBanco.qtd = 0;
        }
    }

    // Remove o registro do histórico
    db.historico = db.historico.filter(h => h.id !== id);

    save(); // Salva e atualiza os painéis visualmente
    closeEditModal();
    toast("Venda excluída e estoques estornados!");
}

function exportarCSV() {
    if (!db.historico.length) return toast("Não há dados para exportar.");
    const headers = ["ID", "Data", "Tipo", "Cliente", "Insumo", "Produto", "Qtd", "Unidade", "V.Unitario", "Desconto", "Total", "Status", "Descricao"];
    const rows = db.historico.map(h => [
        h.id,
        formatarDataBR(h.data),
        h.tipo,
        `"${h.cliente || ""}"`,
        `"${h.insumo || ""}"`,
        `"${h.produto || ""}"`,
        h.qtd || 0,
        h.unidade || "",
        h.valorUnitario || 0,
        h.desconto || 0,
        h.valor || 0,
        h.status || "",
        `"${h.descricao || ""}"`
    ]);

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(row => row.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `extrato_granja_${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("CSV exportado!");
}

function exportarPDF() {
    if (!db.historico.length) return toast("Não há dados para exportar.");
    const rows = db.historico.slice().reverse().map(h => `
        <tr>
            <td>${formatarDataBR(h.data)}</td>
            <td>${esc(h.tipo)}</td>
            <td>${esc(h.cliente || h.insumo || h.descricao || "-")}</td>
            <td>${formatNumber(h.qtd || 0)} ${esc(h.unidade || "")}</td>
            <td>${money(h.valor)}</td>
            <td>${esc(h.status || "pago").toUpperCase()}</td>
        </tr>
    `).join("");

    const win = window.open("", "_blank");
    win.document.write(`
        <html><head><title>Extrato Granja</title><style>
        body{font-family:Arial,sans-serif;padding:20px;color:#172033}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}
        th{background:#f1f5f9}
        </style></head><body>
        <h2>Relatório de Vendas e Despesas - Granja Rancho do Viana</h2>
        <p>Emitido em: ${formatarDataBR(today)}</p>
        <table><thead><tr><th>Data</th><th>Tipo</th><th>Cliente/Insumo</th><th>Qtd</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
        </body></html>
    `);
    win.document.close();
    win.onload = () => win.print();
}

function showFinancialReport() {
    const start = extratoInicio;
    const end = extratoFim;
    
    const periodLabel = document.getElementById("reportPeriodText");
    if (periodLabel) periodLabel.textContent = `Período: ${formatarDataBR(start)} até ${formatarDataBR(end)}`;

    let filtrado = db.historico.filter(item => {
        const itemDataISO = dateToISO(item.data);
        return itemDataISO >= start && itemDataISO <= end;
    });

    filtrado.sort((a, b) => dateToISO(a.data).localeCompare(dateToISO(b.data)));

    let totalVendas = 0;
    let totalDespesas = 0;

    const rowsHtml = filtrado.map((h, index) => {
        const val = Number(h.valor) || 0;
        if (h.tipo === "VENDA") totalVendas += val;
        else totalDespesas += val;

        const cor = h.tipo === "VENDA" ? "var(--green)" : "var(--red)";
        const titulo = h.tipo === "VENDA" ? (h.cliente || "Venda") : (h.insumo || h.descricao || "Despesa");
        const statusAtual = String(h.status || "pago").toLowerCase();
        const rowBg = index % 2 === 1 ? "#f9fafb" : "#ffffff";

        return `
            <tr style="background: ${rowBg};">
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatarDataBR(h.data)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: 600;">${esc(titulo)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${cor}; font-weight: 800; font-size: 0.75rem;">${h.tipo}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: 700;">${money(val)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    ${esc(statusAtual || "pago").toUpperCase()}
                    ${(statusAtual === "pago" && h.dataPagamento) 
                        ? `<div style="font-size: 0.7rem; color: var(--muted); font-weight: normal;">pago em ${formatarDataBR(h.dataPagamento)}</div>` 
                        : ""}
                </td>
            </tr>
        `;
    }).join("");

    const summaryHtml = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 1rem;">
                <span style="color: #64748b; font-weight: 600;">Total Receitas (Vendas):</span>
                <b style="color: var(--green); font-size: 1.1rem;">${money(totalVendas)}</b>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 1rem;">
                <span style="color: #64748b; font-weight: 600;">Total Saídas (Despesas):</span>
                <b style="color: var(--red); font-size: 1.1rem;">${money(totalDespesas)}</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 5px; padding-top: 12px; border-top: 2px dashed #cbd5e1; font-size: 1.25rem; font-weight: 900;">
                <span style="color: var(--ink);">SALDO DO PERÍODO:</span>
                <span style="color: ${totalVendas - totalDespesas >= 0 ? 'var(--green)' : 'var(--red)'}; background: #fff; padding: 2px 8px; border-radius: 4px;">${money(totalVendas - totalDespesas)}</span>
            </div>
        </div>
    `;

    document.getElementById("reportTableBody").innerHTML = rowsHtml || '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhum dado no período selecionado.</td></tr>';
    document.getElementById("reportSummaryContent").innerHTML = summaryHtml;
    document.getElementById("reportModal").style.display = "flex";
}

function closeReportModal() {
    document.getElementById("reportModal").style.display = "none";
}

function printReport() {
    const title = "Relatório Financeiro - Granja Rancho do Viana";
    const period = document.getElementById("reportPeriodText").textContent;
    const table = document.querySelector("#reportModal table").outerHTML;
    const summary = document.getElementById("reportSummaryContent").innerHTML;

    const win = window.open("", "_blank");
    win.document.write(`
        <html><head><title>${title}</title>
        <style>
            body { font-family: sans-serif; padding: 40px; color: #172033; line-height: 1.6; }
            h1 { font-size: 24px; border-bottom: 2px solid #172033; padding-bottom: 10px; margin-bottom: 5px; }
            p { font-weight: bold; margin-bottom: 30px; color: #2563eb; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #dfe7ef; padding: 12px; text-align: left; }
            th { background: #eeeeee; font-weight: bold; border-bottom: 2px solid #333; }
            tr:nth-child(even) { background: #f9f9f9; }
            .summary-box { background: #f8fafc; padding: 25px; border-radius: 12px; border: 2px solid #2563eb; }
            .summary-box div { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 18px; }
            b { font-weight: bold; }
        </style></head>
        <body>
            <h1>${title}</h1>
            <p>${period}</p>
            ${table}
            <div class="summary-box">
                ${summary}
            </div>
        </body></html>
    `);
    win.document.close();
    win.onload = () => win.print();
}

function atualizarBarra(p, t) {
    const container = document.getElementById("syncProgressContainer");
    const barra = document.getElementById("syncProgressBar");
    const texto = document.getElementById("syncStatusText");
    const perc = document.getElementById("syncPercentage");

    if (!container || !barra || !texto || !perc) return;
    container.style.display = "block";
    barra.style.width = `${p}%`;
    texto.innerText = t;
    perc.innerText = `${p}%`;
    if (p >= 100) setTimeout(() => { container.style.display = "none"; }, 3000);
}
function createCloudPayload() {
    // Criamos uma cópia profunda e normalizada para o payload de sincronização
    const banco = normalizeDatabase(JSON.parse(JSON.stringify(db)));

    // IMPORTANTE: Transformamos a composição de Array para String JSON aqui na raiz.
    // Isso garante que o Google Sheets receba um texto único contendo todos os insumos,
    // permitindo salvar 2, 10 ou mais itens na mesma coluna de forma íntegra.
    const produtosParaNuvem = banco.produtos.map(p => ({
        ...p,
        composicao: Array.isArray(p.composicao) ? JSON.stringify(p.composicao) : p.composicao
    }));

    const estoqueInsumos = banco.insumos.map(i => ({
        item: i.nome,
        grupo: i.tipoConsumo === "GERAL" ? "Insumo geral" : `Ração ${getPhaseLabel(i.tipoConsumo)}`,
        quantidade: i.qtd,
        unidade: i.unidade || getInsumoUnit(i)
    }));
    const estoqueOvos = Object.keys(banco.estoque).map(tipo => ({
        item: `Ovo ${tipo}`,
        grupo: "Ovos",
        quantidade: banco.estoque[tipo],
        unidade: "un"
    }));

    return {
        schemaVersion: 3,
        app: "granja-rancho-do-viana",
        updatedAt: new Date().toISOString(),
        ...banco,
        produtos: produtosParaNuvem, // Sobrescreve a lista na raiz com as composições em formato texto
        backupCompleto: banco,
        organizado: {
            estoque_geral: [...estoqueOvos, ...estoqueInsumos],
            producao: banco.coletas,
            extrato: banco.historico,
            plantel: banco.config.plantel,
            cadastros: {
                clientes: banco.clientes,
                produtos: produtosParaNuvem,
                insumos: banco.insumos
            }
        }
    };
}

async function syncToCloud() {
    if (!CLOUD_URL) return;

    atualizarBarra(10, "Preparando backup completo...");

    try {
        const payload = createCloudPayload(); // Sua função que gera o JSON complexo
        
        atualizarBarra(40, "Enviando dados estruturados...");

        const response = await fetch(CLOUD_URL, {
            method: "POST",
            mode: "no-cors", // Necessário para evitar erros de CORS no Google Apps Script
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action: "syncFull",
                data: payload
            })
        });

        atualizarBarra(100, "Sincronização concluída!");
        toast("✅ Backup completo salvo na planilha.");
    } catch (error) {
        console.error("Erro crítico na sincronização:", error);
        atualizarBarra(0, "Falha no backup");
        toast("❌ Erro ao salvar na nuvem.");
    }
}

async function loadFromCloud() {
    if (!CLOUD_URL) return;

    atualizarBarra(15, "Buscando dados na nuvem...");

    try {
        atualizarBarra(45, "Baixando backup...");
        const response = await fetch(`${CLOUD_URL}?t=${Date.now()}`, {
            method: "GET",
            cache: "no-store"
        });

        if (!response.ok) throw new Error("Falha na conexão");

        const cloudData = await response.json();
        db = normalizeDatabase(extractDatabaseFromCloud(cloudData));
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
        render();
        setDefaultDates();
        atualizarBarra(100, "Dados restaurados!");
        toast("Dados carregados da nuvem.");
    } catch (error) {
        console.error("Erro ao carregar:", error);
        atualizarBarra(0, "Falha ao carregar");
        toast("Não foi possível carregar da nuvem. Dados locais mantidos.");
    }
}

function extractDatabaseFromCloud(cloudData) {
    if (!cloudData) return null;

    // Se o dado vier de 'backupCompleto' ou direto da raiz
    const d = cloudData.backupCompleto || cloudData;

    return {
        estoque: d.estoque || { Grande: 0, Medio: 0, Pequeno: 0 },
        insumos: Array.isArray(d.insumos) ? d.insumos : [],
        clientes: Array.isArray(d.clientes) ? d.clientes : [],
        produtos: Array.isArray(d.produtos) ? d.produtos : [],
        historico: Array.isArray(d.historico || d.extrato) ? (d.historico || d.extrato) : [],
        coletas: Array.isArray(d.coletas || d.producao) ? (d.coletas || d.producao) : [],
        config: {
            plantel: d.config?.plantel || d.plantel || { inicial: 0, crescimento: 0, prePostura: 0, postura: 0 }
        }
    };
}

function rebuildEggStock(estoqueGeral) {
    const estoque = { Grande: 0, Medio: 0, Pequeno: 0 };
    if (!Array.isArray(estoqueGeral)) return estoque;

    estoqueGeral.forEach(item => {
        const nome = String(item.item || item.nome || "").toLowerCase();
        const quantidade = Number(item.quantidade ?? item.qtd ?? 0) || 0;
        if (nome.includes("grande")) estoque.Grande = quantidade;
        if (nome.includes("medio") || nome.includes("médio")) estoque.Medio = quantidade;
        if (nome.includes("pequeno")) estoque.Pequeno = quantidade;
    });

    return estoque;
}

function resetApp() {
    if (!confirm("Zerar todos os dados locais?")) return;
    localStorage.removeItem(STORE_KEY);
    db = loadDb();
    save();
    setDefaultDates();
    toast("Dados locais zerados.");
}

function setDefaultDates() {
    const saleDate = document.getElementById("saleDate");
    const prodDate = document.getElementById("prodDate");
    const expenseDate = document.getElementById("expenseDate");
    const coletaMonth = document.getElementById("filtroDataColeta");

    // Removemos o "!value" destes campos para FORÇAR a data de hoje ao abrir o app
    if (saleDate) saleDate.value = today;
    if (prodDate) prodDate.value = today;
    if (expenseDate) expenseDate.value = today; // Agora vai funcionar!
    if (coletaMonth && !coletaMonth.value) coletaMonth.value = today.slice(0, 7);
}

function bindForms() {
    document.getElementById("saleForm")?.addEventListener("submit", handleSale);
    document.getElementById("productionForm")?.addEventListener("submit", handleProduction);
    document.getElementById("expenseForm")?.addEventListener("submit", handleExpense);
    document.getElementById("insumoForm")?.addEventListener("submit", handleInsumo);
    document.getElementById("insumoEditForm")?.addEventListener("submit", handleInsumoEdit);
    document.getElementById("clientForm")?.addEventListener("submit", handleClient);
    document.getElementById("clientEditForm")?.addEventListener("submit", handleClientEdit);
    document.getElementById("productForm")?.addEventListener("submit", handleProduct);
    document.getElementById("productEditForm")?.addEventListener("submit", handleProductEdit);
    document.getElementById("editForm")?.addEventListener("submit", handleEdit);

    document.getElementById("filterType")?.addEventListener("change", renderExtract);
    document.getElementById("filtroDataColeta")?.addEventListener("input", renderColetas);
}

function configureRangePicker(selector, startVal, endVal, onUpdate) {
    const $el = $(selector);
    if (!$el.length) return;

    const ranges = {
        'Hoje': [moment(), moment()],
        'Ontem': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
        'Últimos 7 Dias': [moment().subtract(6, 'days'), moment()],
        'Últimos 30 Dias': [moment().subtract(29, 'days'), moment()],
        'Este Mês': [moment().startOf('month'), moment().endOf('month')],
        'Mês Passado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
    };

    const locale = {
        format: 'DD/MM/YYYY',
        separator: ' - ',
        applyLabel: 'Aplicar',
        cancelLabel: 'Cancelar',
        fromLabel: 'De',
        toLabel: 'Até',
        customRangeLabel: 'Customizado',
        daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
        monthNames: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
        firstDay: 1
    };

    $el.daterangepicker({
        startDate: moment(startVal),
        endDate: moment(endVal),
        ranges: ranges,
        locale: locale,
        alwaysShowCalendars: true,
        opens: 'center'
    }, (start, end) => {
        onUpdate(start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
        $el.find('span').html(start.format('DD/MM/YYYY') + ' - ' + end.format('DD/MM/YYYY'));
    });

    $el.find('span').html(moment(startVal).format('DD/MM/YYYY') + ' - ' + moment(endVal).format('DD/MM/YYYY'));
}

function setupPeriodoPicker() {
    configureRangePicker('#reportrange-financeiro', periodoInicio, periodoFim, (start, end) => {
        periodoInicio = start;
        periodoFim = end;
        renderFinance();
    });
}

function setupExtratoPicker() {
    configureRangePicker('#reportrange-extrato', extratoInicio, extratoFim, (start, end) => {
        extratoInicio = start;
        extratoFim = end;
        renderExtract();
    });
}

function init() {
    buildTabs();
    decorateCardHeaders();
    bindForms();
    setupPwaInstallButton();
    setDefaultDates();
    processarConsumoRacao();
    render();
    setupPeriodoPicker();
    setupExtratoPicker();
    setupCurrencyMasks();
    showPage("page-visao-geral");
}

document.addEventListener("DOMContentLoaded", init);

// Adiciona o toque para alternar no celular
    const panel = document.getElementById("stockPanel");
    if (panel) {
        panel.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                panel.classList.toggle("is-hidden");
            }
        });
    }

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => {
            console.warn("Service worker não registrado:", error);
        });
    });
}

let deferredInstallPrompt = null;

function setupPwaInstallButton() {
    const installButton = document.getElementById("installAppBtn");
    if (!installButton) return;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installButton.hidden = false;
    });

    installButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        installButton.hidden = true;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
    });

    window.addEventListener("appinstalled", () => {
        installButton.hidden = true;
        deferredInstallPrompt = null;
        toast("App instalado com sucesso!");
    });
}
