import { LOW_SUPPLY_THRESHOLD } from '../config/constants.js';
import { state, save, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import {
    esc,
    money,
    formatNumber,
    getInsumoUnit,
    isRacao,
    getPhaseLabel,
    normalizeEggType,
    getValueFromMask
} from '../utils/formatters.js';
import { iconSvg, deleteIcon, toast } from '../utils/icons.js';

export function renderSelects() {
    const { db } = state;

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

export function atualizarSelectInsumosDespesa() {
    const select = document.getElementById("expenseInsumo");
    if (!select) return;

    select.innerHTML = '<option value="">Selecione...</option>' + state.db.insumos.map(ins => `
        <option value="${ins.id}">${esc(ins.nome)} (${getInsumoUnit(ins)})</option>
    `).join("");
}

export function renderLists() {
    renderClients();
    renderProducts();
    renderInsumos();
}

export function renderClients() {
    const list = document.getElementById("clientList");
    if (!list) return;
    list.innerHTML = state.db.clientes.map(c => `
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

export function renderProducts() {
    const list = document.getElementById("productList");
    if (!list) return;
    const { db } = state;

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

export function renderInsumos() {
    const list = document.getElementById("insumoList");
    if (!list) return;
    list.innerHTML = state.db.insumos.map(ins => {
        const qtd = Number(ins.qtd) || 0;
        let statusBadge = "";
        if (!isRacao(ins)) {
            if (qtd < 1) {
                statusBadge = `<span class="badge red" style="font-size: 0.65rem; min-height: 20px; padding: 0 7px;">Sem estoque</span>`;
            } else if (qtd <= LOW_SUPPLY_THRESHOLD) {
                statusBadge = `<span class="badge amber" style="font-size: 0.65rem; min-height: 20px; padding: 0 7px;">⚠️ Acabando</span>`;
            }
        }
        return `
        <div class="item">
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <b style="font-size: 1.1rem;">${esc(ins.nome)}</b>
                    ${statusBadge}
                </div>
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
    `;
    }).join("");
}

export function renderInsumosNoProduto() {
    const container = document.getElementById("productCompositionList");
    if (!container) return;

    const insumosGerais = (state.db.insumos || []).filter(ins => !isRacao(ins));
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

export function openCompositionModal(context = 'new') {
    if (context === 'new') renderInsumosNoProduto();

    const modal = document.getElementById("compositionModal");
    if (modal) {
        modal.dataset.context = context;
        modal.style.display = "flex";
    }
}

export function closeCompositionModal() {
    const modal = document.getElementById("compositionModal");
    if (modal) modal.style.display = "none";
}

export function updateCompositionSummary() {
    const modal = document.getElementById("compositionModal");
    const context = modal?.dataset.context || 'new';

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

export function openProductEditModal(id) {
    if (!isCurrentUserAdmin()) return toast("Apenas administradores podem editar produtos.");
    const prod = state.db.produtos.find(p => p.id === id);
    if (!prod) return;

    document.getElementById("editProdId").value = prod.id;
    document.getElementById("editProdName").value = prod.nome;
    document.getElementById("editProdPrice").value = money(prod.preco);
    document.getElementById("editProdType").value = prod.tipoOvo;
    document.getElementById("editProdEggs").value = prod.ovosPorItem;

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

export function closeProductEditModal() {
    document.getElementById("productEditModal").style.display = "none";
}

export function openClientEditModal(id) {
    if (!isCurrentUserAdmin()) return toast("Apenas administradores podem editar clientes.");
    const client = state.db.clientes.find(c => c.id === id);
    if (!client) return;

    document.getElementById("editClientId").value = client.id;
    document.getElementById("editClientName").value = client.nome;
    document.getElementById("editClientPhone").value = client.telefone || "";
    document.getElementById("editClientCity").value = client.cidade || "";
    document.getElementById("clientEditModal").style.display = "flex";
}

export function closeClientEditModal() {
    document.getElementById("clientEditModal").style.display = "none";
}

export function openInsumoEditModal(id) {
    if (!isCurrentUserAdmin()) return toast("Apenas administradores podem editar insumos.");
    const insumo = state.db.insumos.find(i => i.id === id);
    if (!insumo) return;

    document.getElementById("editInsumoId").value = insumo.id;
    document.getElementById("editInsumoName").value = insumo.nome;
    document.getElementById("editInsumoTipo").value = insumo.tipoConsumo;
    document.getElementById("editInsumoQty").value = insumo.qtd;

    toggleEditUnitIndicator();
    document.getElementById("insumoEditModal").style.display = "flex";
}

export function closeInsumoEditModal() {
    document.getElementById("insumoEditModal").style.display = "none";
}

export function toggleUnitIndicator() {
    const tipo = document.getElementById("insumoTipoConsumo")?.value || "GERAL";
    const unit = tipo === "GERAL" ? "un" : "kg";
    const indicator = document.getElementById("unitIndicator");
    const label = document.getElementById("insumoQtyLabel");
    if (indicator) indicator.textContent = unit;
    if (label) label.textContent = `Estoque Inicial (${unit})`;
}

export function toggleEditUnitIndicator() {
    const tipo = document.getElementById("editInsumoTipo")?.value || "GERAL";
    const unit = tipo === "GERAL" ? "un" : "kg";
    const indicator = document.getElementById("editUnitIndicator");
    if (indicator) indicator.textContent = unit;
}

export async function handleInsumo(e) {
    e.preventDefault();
    const nome = document.getElementById("insumoName").value.trim();
    const tipoConsumo = document.getElementById("insumoTipoConsumo").value;
    const qtd = parseFloat(document.getElementById("insumoQtyInitial").value) || 0;
    const unidade = tipoConsumo === "GERAL" ? "un" : "kg";

    if (!nome) return toast("Informe o nome do insumo!");

    const id = Date.now();

    if (supabaseClient) {
        const { error } = await supabaseClient.from('insumos').insert({
            id, nome, tipo_consumo: tipoConsumo, qtd, unidade
        });
        if (error) return toast("Erro no banco: " + error.message);
    }

    state.db.insumos.push({ id, nome, qtd, tipoConsumo, unidade });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "CADASTROS",
        resumo: `Novo insumo cadastrado: ${nome} (${formatNumber(qtd)} ${unidade})`,
        detalhes: { id, nome, tipoConsumo, estoqueInicial: `${formatNumber(qtd)} ${unidade}` }
    });
    e.target.reset();
    toggleUnitIndicator();
    toast(`Insumo cadastrado: ${formatNumber(qtd)} ${unidade}.`);
}

export async function handleInsumoEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem editar insumos.");
    const { db } = state;
    const id = parseInt(document.getElementById("editInsumoId").value, 10);
    const index = db.insumos.findIndex(i => i.id === id);
    if (index === -1) return;

    const nome = document.getElementById("editInsumoName").value.trim();
    if (!nome) return toast("O nome é obrigatório!");

    const tipoConsumo = document.getElementById("editInsumoTipo").value;
    const qtd = parseFloat(document.getElementById("editInsumoQty").value) || 0;
    const unidade = tipoConsumo === "GERAL" ? "un" : "kg";

    if (supabaseClient) {
        const { error } = await supabaseClient.from('insumos').update({
            nome, tipo_consumo: tipoConsumo, qtd, unidade
        }).eq('id', id);
        if (error) return toast("Erro ao atualizar no banco: " + error.message);
    }

    const oldInsumo = { ...db.insumos[index] };
    db.insumos[index].nome = nome;
    db.insumos[index].tipoConsumo = tipoConsumo;
    db.insumos[index].qtd = qtd;
    db.insumos[index].unidade = unidade;

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: "CADASTROS",
        resumo: `Insumo editado: ${nome} (${formatNumber(qtd)} ${unidade})`,
        detalhes: {
            id,
            nomeAnterior: oldInsumo.nome,
            nomeNovo: nome,
            qtdAnterior: `${formatNumber(oldInsumo.qtd)} ${oldInsumo.unidade}`,
            qtdNova: `${formatNumber(qtd)} ${unidade}`,
            tipoConsumo
        }
    });
    closeInsumoEditModal();
    toast("Insumo atualizado com sucesso!");
}

export async function handleClient(e) {
    e.preventDefault();
    const nome = document.getElementById("clientName").value.trim();
    if (!nome) return toast("Informe o nome do cliente!");

    const telefone = document.getElementById("clientPhone").value.trim();
    const cidade = document.getElementById("clientCity").value.trim();

    let id = Date.now();
    if (supabaseClient) {
        const { data, error } = await supabaseClient.from('clientes').insert({ nome, telefone, cidade }).select();
        if (error) return toast("Erro no banco: " + error.message);
        if (data && data[0]) id = data[0].id;
    }

    state.db.clientes.push({
        id,
        nome,
        telefone,
        cidade
    });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "CADASTROS",
        resumo: `Novo cliente cadastrado: ${nome}`,
        detalhes: { id, nome, telefone: telefone || "-", cidade: cidade || "-" }
    });
    e.target.reset();
    toast("Cliente salvo!");
}

export async function handleClientEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem editar clientes.");
    const { db } = state;
    const id = parseInt(document.getElementById("editClientId").value, 10);
    const index = db.clientes.findIndex(c => c.id === id);
    if (index === -1) return;

    const novoNome = document.getElementById("editClientName").value.trim();
    if (!novoNome) return toast("O nome é obrigatório!");

    const novoTelefone = document.getElementById("editClientPhone").value.trim();
    const novaCidade = document.getElementById("editClientCity").value.trim();

    if (supabaseClient) {
        const { error } = await supabaseClient.from('clientes').update({
            nome: novoNome, telefone: novoTelefone, cidade: novaCidade
        }).eq('id', id);
        if (error) return toast("Erro ao atualizar no banco: " + error.message);
    }

    const oldClient = { ...db.clientes[index] };
    db.clientes[index].nome = novoNome;
    db.clientes[index].telefone = novoTelefone;
    db.clientes[index].cidade = novaCidade;

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: "CADASTROS",
        resumo: `Cliente editado: ${novoNome}`,
        detalhes: {
            id,
            nomeAnterior: oldClient.nome,
            nomeNovo: novoNome,
            telefone: novoTelefone || "-",
            cidade: novaCidade || "-"
        }
    });
    closeClientEditModal();
    toast("Cliente atualizado com sucesso!");
}

export async function handleProduct(e) {
    e.preventDefault();
    const nome = document.getElementById("productName").value.trim();
    if (!nome) return toast("Informe o nome do produto!");
    const preco = getValueFromMask("productPrice") || parseFloat(document.getElementById("productPrice").value) || 0;
    const composicao = [];
    document.querySelectorAll(".insumo-comp-qty").forEach(input => {
        const valor = parseFloat(input.value) || 0;
        if (valor > 0) {
            composicao.push({ insumoId: String(input.dataset.id), qtdNecessaria: valor });
        }
    });

    const tipoOvo = normalizeEggType(document.getElementById("productType").value);
    const ovosPorItem = parseInt(document.getElementById("productEggs").value, 10) || 0;

    let id = Date.now();
    if (supabaseClient) {
        const { data, error } = await supabaseClient.from('produtos').insert({
            nome,
            preco_padrao: preco,
            tipo_ovo: tipoOvo,
            ovos_por_item: ovosPorItem,
            composicao
        }).select();
        if (error) return toast("Erro no banco: " + error.message);
        if (data && data[0]) id = data[0].id;
    }

    state.db.produtos.push({ id, nome, preco, tipoOvo, ovosPorItem, composicao });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "CADASTROS",
        resumo: `Novo produto cadastrado: ${nome} (${money(preco)})`,
        detalhes: { id, nome, preco: money(preco), tipoOvo, ovosPorItem }
    });
    e.target.reset();
    document.getElementById("productPrice").value = money(0);
    updateCompositionSummary();
    renderInsumosNoProduto();
    toast("Produto cadastrado com sucesso!");
}

export async function handleProductEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem editar produtos.");
    const { db } = state;
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

    const novoNome = document.getElementById("editProdName").value.trim();
    const novoPreco = getValueFromMask("editProdPrice");
    const novoTipoOvo = normalizeEggType(document.getElementById("editProdType").value);
    const novosOvos = parseInt(document.getElementById("editProdEggs").value, 10) || 0;

    if (supabaseClient) {
        const { error } = await supabaseClient.from('produtos').update({
            nome: novoNome,
            preco_padrao: novoPreco,
            tipo_ovo: novoTipoOvo,
            ovos_por_item: novosOvos,
            composicao
        }).eq('id', id);
        if (error) return toast("Erro ao atualizar no banco: " + error.message);
    }

    const oldProd = { ...db.produtos[index] };
    db.produtos[index].nome = novoNome;
    db.produtos[index].preco = novoPreco;
    db.produtos[index].tipoOvo = novoTipoOvo;
    db.produtos[index].ovosPorItem = novosOvos;
    db.produtos[index].composicao = composicao;

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: "CADASTROS",
        resumo: `Produto editado: ${novoNome} (${money(novoPreco)})`,
        detalhes: {
            id,
            nomeAnterior: oldProd.nome,
            nomeNovo: novoNome,
            precoAnterior: money(oldProd.preco),
            precoNovo: money(novoPreco),
            tipoOvo: novoTipoOvo,
            ovosPorItem: novosOvos
        }
    });
    closeProductEditModal();
    toast("Produto atualizado com sucesso!");
}

