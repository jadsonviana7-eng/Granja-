import { FEED_PHASES, STORE_KEY, LOW_SUPPLY_THRESHOLD, CRITICAL_SUPPLY_THRESHOLD } from '../config/constants.js';
import { state, save, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import { esc, formatNumber, isRacao, getPhaseLabel } from '../utils/formatters.js';
import { toast } from '../utils/icons.js';

export function renderStock() {
    const { db } = state;

    const eggSigla = { Grande: "G", Medio: "M", Pequeno: "P" };
    const eggCards = ["Grande", "Medio", "Pequeno"].map(tipo => {
        const qtdOvos = Number(db.estoque[tipo]) || 0;
        const bandejas30 = Math.floor(qtdOvos / 30);
        return `
            <div class="stock-card stock-card-eggs">
                <div class="egg-icon-badge">${eggSigla[tipo] || "O"}</div>
                <small>Ovos ${tipo === "Medio" ? "Médio" : tipo}</small>
                <b>${qtdOvos.toLocaleString('pt-BR')}</b>
                <span class="tray-pill">${bandejas30} bdj (30 un)</span>
            </div>
        `;
    }).join("");

    const racoes = db.insumos.filter(isRacao);
    const feedCards = racoes.map(insumo => {
        const fase = insumo.tipoConsumo;
        const consumo = (db.config.plantel[fase] || 0) * FEED_PHASES[fase].consumoKgDia;
        const dias = consumo > 0 ? Math.floor((insumo.qtd || 0) / consumo) : null;
        const pct = dias === null ? 100 : Math.min(100, Math.max(6, Math.round((dias / 30) * 100)));
        const barColor = dias === null
            ? "var(--green)"
            : dias <= 4
                ? "var(--red)"
                : dias <= 10
                    ? "var(--amber)"
                    : "var(--green)";

        return `
            <div class="feed-silo-card">
                <div class="feed-silo-top">
                    <span class="feed-silo-name" title="${esc(insumo.nome)}">🌾 ${esc(insumo.nome)}</span>
                    <span class="feed-silo-qty">${formatNumber(insumo.qtd)} kg</span>
                </div>
                <div class="feed-progress-track">
                    <div class="feed-progress-bar" style="width: ${pct}%; background: ${barColor};"></div>
                </div>
                <div class="feed-silo-meta">
                    <span>Fase ${esc(getPhaseLabel(fase))} (${formatNumber(consumo)} kg/dia)</span>
                    <strong style="color: ${barColor};">${dias !== null ? `${dias} dias restantes` : "Sem consumo ativo"}</strong>
                </div>
            </div>
        `;
    }).join("");

    const outrosInsumos = db.insumos.filter(insumo => !isRacao(insumo) && (Number(insumo.qtd) || 0) >= 1);
    const insumosAcabando = outrosInsumos.filter(insumo => (Number(insumo.qtd) || 0) <= LOW_SUPPLY_THRESHOLD);

    const otherCards = outrosInsumos.map(insumo => {
        const qtd = Number(insumo.qtd) || 0;
        const isCritical = qtd <= CRITICAL_SUPPLY_THRESHOLD;
        const isLow = qtd <= LOW_SUPPLY_THRESHOLD;
        const stateClass = isCritical ? "is-critical" : (isLow ? "is-low" : "");
        const icon = isLow ? "⚠️" : "📦";
        const alertTag = isLow
            ? `<span class="supply-alert-tag">${isCritical ? "Crítico!" : "Acabando"}</span>`
            : "";

        return `
            <div class="supply-chip ${stateClass}" title="${isLow ? `Atenção: Estoque baixo de ${esc(insumo.nome)} (${formatNumber(qtd)} un)` : esc(insumo.nome)}">
                <span>${icon} ${esc(insumo.nome)}:</span>
                <b>${formatNumber(qtd)} un</b>
                ${alertTag}
            </div>
        `;
    }).join("");

    const lowSupplyAlertHtml = insumosAcabando.length > 0 ? `
        <div class="supply-low-alert-banner">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
                <strong>Alerta de reposição:</strong>
                ${insumosAcabando.map(i => `${esc(i.nome)} (${formatNumber(i.qtd)} un)`).join(", ")}
                ${insumosAcabando.length === 1 ? "está acabando." : "estão acabando."}
            </div>
        </div>
    ` : "";

    const totalOvos = (Number(db.estoque.Grande) || 0) + (Number(db.estoque.Medio) || 0) + (Number(db.estoque.Pequeno) || 0);

    const panel = document.getElementById("stockPanel");
    if (panel) {
        panel.innerHTML = `
            <div>
                <div class="stock-section-title">
                    <span>🥚 Estoque de Ovos</span>
                    <span style="color: var(--green);">${totalOvos.toLocaleString('pt-BR')} ovos no total</span>
                </div>
                <div class="egg-stock-grid">${eggCards}</div>
            </div>
            ${racoes.length > 0 ? `
                <div>
                    <div class="stock-section-title">
                        <span>🌾 Silo & Autonomia de Ração</span>
                    </div>
                    <div class="feed-stock-list">${feedCards}</div>
                </div>
            ` : ''}
            ${outrosInsumos.length > 0 ? `
                <div>
                    <div class="stock-section-title">
                        <span>📦 Embalagens e Insumos</span>
                        ${insumosAcabando.length > 0 ? `<span class="supply-section-warning">⚠️ ${insumosAcabando.length} acabando</span>` : ""}
                    </div>
                    ${lowSupplyAlertHtml}
                    <div class="other-stock-chips">${otherCards}</div>
                </div>
            ` : ''}
        `;
    }
}

export function renderPlantel() {
    const { db } = state;
    let htmlFases = "";
    let totalAves = 0;
    let consumoTotalGeral = 0;

    Object.entries(FEED_PHASES).forEach(([fase, config]) => {
        const qtdAves = Number(db.config.plantel[fase]) || 0;
        const consumoFase = qtdAves * config.consumoKgDia;

        totalAves += qtdAves;
        consumoTotalGeral += consumoFase;

        const input = document.querySelector(`.plantel-input[data-fase="${fase}"]`);
        if (input) input.value = qtdAves;

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

    const totalAvesEl = document.getElementById("totalAvesGeral");
    const consumoEl = document.getElementById("consumoDiarioEstimado");
    const detalheConsumoEl = document.getElementById("detalheConsumoPorFase");

    if (totalAvesEl) totalAvesEl.textContent = totalAves;
    if (consumoEl) consumoEl.textContent = consumoTotalGeral.toFixed(2);
    if (detalheConsumoEl) detalheConsumoEl.innerHTML = htmlFases;
}

export function getConsumoDiarioTotal() {
    const { db } = state;
    return Object.entries(FEED_PHASES).reduce((acc, [fase, config]) => (
        acc + ((Number(db.config.plantel[fase]) || 0) * config.consumoKgDia)
    ), 0);
}

export function saveGalinhas() {
    if (!isCurrentUserAdmin()) {
        renderPlantel();
        return toast("Apenas administradores podem alterar o plantel.");
    }
    const { db } = state;
    document.querySelectorAll(".plantel-input").forEach(input => {
        const fase = input.dataset.fase;
        const qtd = Math.max(0, parseInt(input.value, 10) || 0);
        db.config.plantel[fase] = qtd;

        if (supabaseClient) {
            supabaseClient.from('plantel').upsert({ fase, quantidade_aves: qtd }, { onConflict: 'fase' })
                .then(({ error }) => { if (error) console.error("Erro ao salvar fase " + fase + ":", error); });
        }
    });

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: "PLANTEL",
        resumo: `Configuração do plantel atualizada`,
        detalhes: { ...db.config.plantel }
    });
    toast("Plantel atualizado!");
}

export async function processarConsumoRacao() {
    const { db } = state;
    const agora = new Date();
    const hojeISO = agora.toISOString().slice(0, 10);
    const ultima = db.config.ultimaDataConsumo
        ? db.config.ultimaDataConsumo.slice(0, 10)
        : null;

    if (!ultima) {
        db.config.ultimaDataConsumo = hojeISO;
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
        return;
    }

    const msUltima = new Date(ultima + "T00:00:00").getTime();
    const msHoje = new Date(hojeISO + "T00:00:00").getTime();
    const diasPassados = Math.round((msHoje - msUltima) / (1000 * 60 * 60 * 24));

    if (diasPassados < 1) return;

    let houveDesconto = false;

    Object.entries(FEED_PHASES).forEach(([fase, config]) => {
        const aves = Number(db.config.plantel[fase]) || 0;
        if (aves <= 0) return;

        const consumoTotal = aves * config.consumoKgDia * diasPassados;
        const racoes = db.insumos.filter(ins => ins.tipoConsumo === fase);
        if (racoes.length === 0) return;

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

    db.config.ultimaDataConsumo = hojeISO;
    localStorage.setItem(STORE_KEY, JSON.stringify(db));

    if (houveDesconto) {
        console.info(`[Granja] Consumo de ração processado: ${diasPassados} dia(s).`);
    }
}

export function agendarProximoConsumo() {
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 1, 0);

    const tempoAteMeiaNoite = amanha.getTime() - agora.getTime();
    setTimeout(() => {
        processarConsumoRacao();
    }, tempoAteMeiaNoite);
}

export function rebuildEggStock(estoqueGeral) {
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

