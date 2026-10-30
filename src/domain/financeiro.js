import { LOW_SUPPLY_THRESHOLD } from '../config/constants.js';
import { state, save, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import {
    dateToISO,
    formatarDataBR,
    esc,
    money,
    formatNumber,
    getInsumoUnit,
    isRacao,
    getPhaseLabel,
    getValueFromMask,
    getTodayISO,
    setDefaultDates
} from '../utils/formatters.js';
import { toast } from '../utils/icons.js';

export function renderFinance() {
    const { db, periodoInicio, periodoFim } = state;

    const noperiodo = db.historico.filter(h => {
        const d = dateToISO(h.data);
        return d >= periodoInicio && d <= periodoFim;
    });

    const vendas = noperiodo.filter(h => h.tipo === "VENDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const pendentes = noperiodo.filter(h => h.tipo === "VENDA" && h.status === "pendente").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const saidas = noperiodo.filter(h => h.tipo === "SAIDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);

    const formatResumo = (val) => money(val).replace("R$", "").trim();
    const elVendas = document.getElementById("vendasMes");
    const elPendentes = document.getElementById("pendentesMes");
    const elDespesas = document.getElementById("despesasMes");
    const elSaldo = document.getElementById("saldoMes");

    if (elVendas) elVendas.textContent = formatResumo(vendas);
    if (elPendentes) elPendentes.textContent = formatResumo(pendentes);
    if (elDespesas) elDespesas.textContent = formatResumo(saidas);
    if (elSaldo) elSaldo.textContent = formatResumo(vendas - saidas);
}

export function renderExtract() {
    const extractElement = document.getElementById("extractList");
    if (!extractElement) return;

    const { db, extratoInicio: start, extratoFim: end } = state;
    const type = document.getElementById("filterType")?.value || "TODOS";

    const itensNoPeriodo = db.historico.filter(item => {
        const itemDataISO = dateToISO(item.data);
        const matchDate = (!start || itemDataISO >= start) && (!end || itemDataISO <= end);
        return matchDate && (item.tipo === "VENDA" || item.tipo === "SAIDA");
    });

    const sumEntradas = itensNoPeriodo.filter(h => h.tipo === "VENDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const sumSaidas = itensNoPeriodo.filter(h => h.tipo === "SAIDA").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const sumPendentes = itensNoPeriodo.filter(h => h.tipo === "VENDA" && String(h.status || "").toLowerCase() === "pendente").reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
    const sumSaldo = sumEntradas - sumSaidas;

    const elEntradas = document.getElementById("vendaSumEntradas");
    const elSaidas = document.getElementById("vendaSumSaidas");
    const elSaldo = document.getElementById("vendaSumSaldo");
    const elPendentes = document.getElementById("vendaSumPendentes");

    if (elEntradas) elEntradas.textContent = money(sumEntradas);
    if (elSaidas) elSaidas.textContent = money(sumSaidas);
    if (elSaldo) {
        elSaldo.textContent = money(sumSaldo);
        elSaldo.style.color = sumSaldo >= 0 ? "var(--green)" : "var(--red)";
    }
    if (elPendentes) elPendentes.textContent = money(sumPendentes);

    const filtrado = itensNoPeriodo.filter(item => {
        return type === "TODOS" || item.tipo === type;
    });

    filtrado.sort((a, b) => {
        const dateA = dateToISO(a.data);
        const dateB = dateToISO(b.data);
        if (dateB !== dateA) {
            return dateB.localeCompare(dateA);
        }
        return (b.id || 0) - (a.id || 0);
    });

    const count = document.getElementById("extractCount");
    if (count) count.textContent = `${filtrado.length} registros`;

    extractElement.innerHTML = filtrado.map(h => {
        const qtd = Number(h.qtd ?? h.quantidade) || 0;
        const valorTotal = Number(h.valor) || 0;
        const valorUnitario = Number(h.valorUnitario) || (qtd > 0 ? valorTotal / qtd : 0);
        const corLinha = h.tipo === "VENDA" ? "var(--green)" : "var(--red)";
        const tituloTopo = h.tipo === "VENDA" ? (h.cliente || "Consumidor Geral") : (h.insumo || h.descricao || "Despesa");
        const nomeSubtitulo = h.tipo === "VENDA" ? (h.produto || "Produto não informado") : (h.insumo ? h.descricao : h.categoria || "Geral");
        const unidade = h.unidade ? ` ${h.unidade}` : "";
        const obsText = (h.descricao && h.descricao !== tituloTopo && h.descricao !== nomeSubtitulo) ? h.descricao : "";

        const statusAtual = String(h.status || "pago").toLowerCase();
        const dataPagamentoHtml = (statusAtual === "pago" && h.dataPagamento)
            ? `<div style="font-size: 0.65rem; color: var(--muted); margin-top: 2px; font-weight: 600;">pago em ${formatarDataBR(h.dataPagamento)}</div>`
            : "";

        const isVenda = h.tipo === "VENDA";
        const iconBg = isVenda ? "var(--green-soft)" : "var(--red-soft)";
        const iconColor = isVenda ? "var(--green)" : "var(--red)";
        const iconArrow = isVenda
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>`;

        return `
            <div class="item" style="border-left-color: ${corLinha}; cursor:pointer;" onclick="openEditModal(${h.id})">
                <div class="item-row">
                    <div class="extract-left-wrap">
                        <div class="extract-arrow-icon extract-icon-desktop" style="background: ${iconBg}; color: ${iconColor};">
                            ${iconArrow}
                        </div>
                        <div class="item-left">
                            <span style="font-size: 0.75rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;">${formatarDataBR(h.data)}</span>
                            <div style="margin: 1px 0;"><b style="font-size: 1.02rem; color: var(--ink);">${esc(tituloTopo)}</b></div>
                            <div class="item-data-line" style="margin-top: 3px;">
                                <span><strong>${isVenda ? 'Produto' : 'Item'}:</strong> ${esc(nomeSubtitulo || "-")}</span>
                                <span><strong>Qtd:</strong> ${formatNumber(qtd)}${unidade}</span>
                                <span><strong>Un:</strong> ${money(valorUnitario)}</span>
                                ${obsText ? `<span><strong>Obs:</strong> ${esc(obsText)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="item-right">
                        <div class="extract-arrow-icon extract-icon-mobile" style="background: ${iconBg}; color: ${iconColor};">
                            ${iconArrow}
                        </div>
                        <b style="color: ${corLinha}; font-size: 1.15rem; font-weight: 800;">${isVenda ? '+' : '-'} ${money(valorTotal)}</b>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                            <div class="extract-status-actions">
                                ${isVenda ? `<button type="button" class="btn-receipt-mini" onclick="openSaleReceipt(${h.id}, event)" title="Emitir Recibo"><i class="fas fa-file-invoice-dollar"></i> Recibo</button>` : ""}
                                <span class="badge ${statusAtual === "pendente" ? "amber" : "green"}" style="font-size: 0.65rem; padding: 2px 9px;">${statusAtual.toUpperCase()}</span>
                            </div>
                            ${dataPagamentoHtml}
                        </div>
                    </div>
                </div>
            </div>`;
    }).join("");
}

export function openSaleModal() {
    const modal = document.getElementById("saleModal");
    if (modal) modal.style.display = "flex";
}

export function closeSaleModal() {
    const modal = document.getElementById("saleModal");
    if (modal) modal.style.display = "none";
}

export function openExpenseModal() {
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.display = "flex";
}

export function closeExpenseModal() {
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.display = "none";
}

export function updateExpenseInsumoFields() {
    const mode = document.getElementById("expenseMode")?.value || "FINANCEIRO";
    const field = document.getElementById("expenseInsumoField");
    const select = document.getElementById("expenseInsumo");
    const qtyLabel = document.getElementById("expenseQtyLabel");
    const info = document.getElementById("expenseStockInfo");
    const insumo = state.db.insumos.find(item => String(item.id) === String(select?.value));

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

export function calculateSaleTotal() {
    const qty = parseFloat(document.getElementById("saleQty")?.value) || 0;
    const unit = getValueFromMask("saleUnitValue");
    const disc = getValueFromMask("saleDiscount");
    const totalField = document.getElementById("saleTotal");
    if (totalField) totalField.value = money(Math.max(0, (qty * unit) - disc));
}

export function updateProductPrice() {
    const productId = document.getElementById("saleProduct")?.value;
    const produto = state.db.produtos.find(p => String(p.id) === String(productId));
    const field = document.getElementById("saleUnitValue");
    if (field) field.value = produto ? money(produto.preco) : "";
    calculateSaleTotal();
}

export function calculateExpenseTotal() {
    const qty = parseFloat(document.getElementById("expenseQty")?.value) || 0;
    const unit = getValueFromMask("expenseUnitValue");
    const installments = parseInt(document.getElementById("expenseInstallments")?.value, 10) || 1;
    const total = qty * unit;
    const totalField = document.getElementById("expenseValue");
    const installmentField = document.getElementById("expenseInstallmentValue");

    if (totalField) totalField.value = money(total);
    if (installmentField) installmentField.value = money(installments > 0 ? total / installments : total);
}

export function toggleExpenseInstallments() {
    const method = document.getElementById("expensePaymentMethod")?.value;
    const section = document.getElementById("expenseInstallmentSection");
    if (section) section.style.display = method === "Cartão de Crédito" ? "block" : "none";
    calculateExpenseTotal();
}

export async function handleSale(e) {
    e.preventDefault();
    const { db } = state;
    const today = getTodayISO();
    const prodId = document.getElementById("saleProduct").value;
    const prod = db.produtos.find(p => String(p.id) === String(prodId));

    if (!prod) return toast("Selecione um produto válido!");

    const qty = parseFloat(document.getElementById("saleQty").value) || 0;
    const unit = getValueFromMask("saleUnitValue");
    const disc = getValueFromMask("saleDiscount");
    const total = Math.max(0, (qty * unit) - disc);

    const clienteNome = document.getElementById("saleClient").value || "Consumidor Geral";
    const clienteObj = db.clientes.find(c => c.nome === clienteNome);

    const transacaoId = Date.now();
    const payload = {
        id: transacaoId,
        data_transacao: document.getElementById("saleDate").value || today,
        tipo: "VENDA",
        cliente_id: clienteObj ? clienteObj.id : null,
        produto_id: prod.id,
        quantidade: qty,
        valor_unitario: unit,
        desconto: disc || 0,
        valor_total: total,
        descricao: document.getElementById("saleObs")?.value || "",
        status: document.getElementById("saleStatus").value,
        data_pagamento: document.getElementById("saleStatus").value === "pago" ? today : null
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from('transacoes').insert(payload);
        if (error) return toast("Erro ao salvar no banco: " + error.message);
    }

    if (prod.tipoOvo && db.estoque[prod.tipoOvo] !== undefined) {
        db.estoque[prod.tipoOvo] -= (prod.ovosPorItem || 0) * qty;
    }

    const insumoUpdates = [];
    const alertasInsumos = [];
    prod.composicao.forEach(item => {
        const insumo = db.insumos.find(i => String(i.id) === String(item.insumoId));
        if (insumo) {
            insumo.qtd = Math.max(0, (Number(insumo.qtd) || 0) - ((Number(item.qtdNecessaria) || 0) * qty));
            insumoUpdates.push({ id: insumo.id, qtd: insumo.qtd });
            if (!isRacao(insumo)) {
                if (insumo.qtd < 1) {
                    alertasInsumos.push(`${insumo.nome} esgotou`);
                } else if (insumo.qtd <= LOW_SUPPLY_THRESHOLD) {
                    alertasInsumos.push(`${insumo.nome} acabando (${formatNumber(insumo.qtd)} un)`);
                }
            }
        }
    });
    if (supabaseClient && insumoUpdates.length > 0) {
        insumoUpdates.forEach(async ({ id, qtd }) => {
            await supabaseClient.from('insumos').update({ qtd }).eq('id', id);
        });
    }

    db.historico.push({
        ...payload,
        id: transacaoId,
        data: payload.data_transacao,
        qtd: payload.quantidade,
        valorUnitario: payload.valor_unitario,
        valor: payload.valor_total,
        cliente: clienteNome,
        produto: prod.nome,
        dataPagamento: payload.data_pagamento || ""
    });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "VENDAS",
        resumo: `Venda registrada para ${clienteNome} — ${qty}x ${prod.nome} (${money(total)})`,
        detalhes: {
            id: transacaoId,
            data: payload.data_transacao,
            cliente: clienteNome,
            produto: prod.nome,
            quantidade: qty,
            valorUnitario: money(unit),
            desconto: money(disc || 0),
            valorTotal: money(total),
            status: payload.status
        }
    });
    e.target.reset();
    setDefaultDates();
    document.getElementById("saleQty").value = "1";
    document.getElementById("saleDiscount").value = money(0);
    calculateSaleTotal();
    closeSaleModal();
    if (alertasInsumos.length > 0) {
        toast(`Venda registrada! ⚠️ Atenção: ${alertasInsumos.join(" · ")}`);
    } else {
        toast("Venda registrada e estoques atualizados!");
    }
}

export async function handleExpense(e) {
    e.preventDefault();
    const { db } = state;
    const today = getTodayISO();
    const mode = document.getElementById("expenseMode").value;
    const insumoId = document.getElementById("expenseInsumo").value;
    const insumo = db.insumos.find(i => String(i.id) === String(insumoId));
    const qtd = parseFloat(document.getElementById("expenseQty").value) || 0;
    const unit = getValueFromMask("expenseUnitValue");
    const valorTotal = qtd * unit;
    const valorUnitario = unit;

    if (mode === "ESTOQUE") {
        if (!insumo) return toast("Selecione o insumo comprado.");
        insumo.qtd = (Number(insumo.qtd) || 0) + qtd;
        if (supabaseClient) {
            const { error: errEst } = await supabaseClient.from('insumos').update({ qtd: insumo.qtd }).eq('id', insumo.id);
            if (errEst) console.warn("Erro ao atualizar estoque do insumo:", errEst.message);
        }
    }

    const transacaoId = Date.now();
    const payload = {
        id: transacaoId,
        data_transacao: document.getElementById("expenseDate").value || today,
        tipo: "SAIDA",
        quantidade: qtd,
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
        descricao: document.getElementById("expenseDesc").value || (insumo ? `Compra de ${insumo.nome}` : "Despesa"),
        status: "pago",
        data_pagamento: today
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from('transacoes').insert(payload);
        if (error) return toast("Erro no banco: " + error.message);
    }

    db.historico.push({
        ...payload,
        id: transacaoId,
        data: payload.data_transacao,
        qtd: payload.quantidade,
        valorUnitario: payload.valor_unitario,
        valor: payload.valor_total,
        categoria: mode === "ESTOQUE" ? "INSUMO" : "DESPESA",
        insumo: mode === "ESTOQUE" && insumo ? insumo.nome : "",
        insumoId: mode === "ESTOQUE" && insumo ? insumo.id : "",
        unidade: mode === "ESTOQUE" && insumo ? getInsumoUnit(insumo) : "",
        formaPagamento: document.getElementById("expensePaymentMethod").value,
        parcelas: parseInt(document.getElementById("expenseInstallments")?.value, 10) || 1,
        vencimentoDia: document.getElementById("expenseDueDay")?.value || "",
        dataPagamento: today
    });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "DESPESAS",
        resumo: `Despesa registrada: ${payload.descricao} (${money(valorTotal)})`,
        detalhes: {
            id: transacaoId,
            data: payload.data_transacao,
            modalidade: mode,
            insumo: insumo ? insumo.nome : "-",
            descricao: payload.descricao,
            quantidade: qtd,
            valorUnitario: money(valorUnitario),
            valorTotal: money(valorTotal),
            formaPagamento: document.getElementById("expensePaymentMethod")?.value || ""
        }
    });
    e.target.reset();
    setDefaultDates();
    document.getElementById("expenseQty").value = "1";
    document.getElementById("expenseUnitValue").value = money(0);
    calculateExpenseTotal();
    updateExpenseInsumoFields();
    closeExpenseModal();
    toast(mode === "ESTOQUE" ? "Despesa registrada e estoque atualizado!" : "Despesa registrada!");
}

export async function deleteItem(collection, id) {
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem excluir registros.");
    const { db } = state;
    if (!Array.isArray(db[collection])) return;

    const itemParaExcluir = db[collection].find(item => item.id === id);
    if (!itemParaExcluir) return;

    if (!confirm("Excluir este item? O estoque será ajustado automaticamente.")) return toast("Operação cancelada.");

    if (supabaseClient) {
        const tableMap = {
            historico: 'transacoes',
            coletas: 'producao_diaria',
            clientes: 'clientes',
            produtos: 'produtos',
            insumos: 'insumos'
        };
        const table = tableMap[collection];
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) return toast("Erro ao excluir no banco: " + error.message);
    }

    if (collection === 'coletas') {
        const tipoOvo = itemParaExcluir.tipo;
        const qtdLiquida = Number(itemParaExcluir.liquido) || 0;

        if (db.estoque[tipoOvo] !== undefined) {
            db.estoque[tipoOvo] = (Number(db.estoque[tipoOvo]) || 0) - qtdLiquida;
            if (db.estoque[tipoOvo] < 0) db.estoque[tipoOvo] = 0;
        }
    }

    db[collection] = db[collection].filter(item => item.id !== id);
    save();
    const mapModulo = {
        historico: "VENDAS",
        coletas: "PRODUCAO",
        clientes: "CLIENTES",
        produtos: "PRODUTOS",
        insumos: "INSUMOS"
    };
    const nomeItem = itemParaExcluir.nome || itemParaExcluir.cliente || itemParaExcluir.descricao || `Coleta ${formatarDataBR(itemParaExcluir.data)} (${itemParaExcluir.tipo || ""})`;
    registrarLog({
        acao: "EXCLUSAO",
        modulo: mapModulo[collection] || "SISTEMA",
        resumo: `Registro excluído em ${collection}: ${nomeItem}`,
        detalhes: itemParaExcluir
    });
    toast("Item excluído e estoque atualizado.");
}

export function openEditModal(id) {
    if (!isCurrentUserAdmin()) {
        const item = state.db.historico.find(h => h.id === id);
        if (item && item.tipo === "VENDA" && typeof window.openSaleReceipt === "function") {
            return window.openSaleReceipt(id);
        }
        return toast("Apenas administradores podem editar ou excluir lançamentos.");
    }
    const item = state.db.historico.find(h => h.id === id);
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
    document.getElementById("editPaymentDate").value = item.dataPagamento || "";
    const btnReceipt = document.getElementById("btnEditModalReceipt");
    if (btnReceipt) {
        btnReceipt.style.display = item.tipo === "VENDA" ? "inline-flex" : "none";
    }
    togglePaymentDateField();
    document.getElementById("editModal").style.display = "flex";
}

export function closeEditModal() {
    document.getElementById("editModal").style.display = "none";
}

export function togglePaymentDateField() {
    const statusSelect = document.getElementById("editStatus");
    const paymentDateField = document.getElementById("editPaymentDate");
    if (!statusSelect || !paymentDateField) return;

    const field = paymentDateField.closest('.field');
    if (field) {
        field.style.display = statusSelect.value === "pago" ? "block" : "none";
    }
}

export function calcEditTotal() {
    const q = parseFloat(document.getElementById("editQty").value) || 0;
    const u = getValueFromMask("editUnit");
    const d = getValueFromMask("editDisc");
    document.getElementById("editTotal").value = money(Math.max(0, (q * u) - d));
}

export async function handleEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem editar lançamentos.");
    const id = parseFloat(document.getElementById("editId").value);
    const item = state.db.historico.find(h => h.id === id);
    if (!item) return;

    const today = getTodayISO();
    const newStatus = document.getElementById("editStatus").value;
    let newPaymentDate = document.getElementById("editPaymentDate").value;

    if (newStatus === "pago" && !newPaymentDate) newPaymentDate = today;
    else if (newStatus !== "pago") newPaymentDate = "";

    item.dataPagamento = newPaymentDate;
    item.data = document.getElementById("editDate").value;
    item.qtd = parseFloat(document.getElementById("editQty").value) || 0;
    item.valorUnitario = getValueFromMask("editUnit");
    item.desconto = getValueFromMask("editDisc");
    item.valor = getValueFromMask("editTotal");
    item.status = newStatus;
    item.descricao = document.getElementById("editObs").value;

    if (item.tipo === "VENDA") item.cliente = document.getElementById("editCliente").value;
    if (item.tipo === "SAIDA" && !item.insumo) item.descricao = document.getElementById("editCliente").value;

    if (supabaseClient) {
        await supabaseClient.from('transacoes').update({
            data_transacao: item.data,
            quantidade: item.qtd,
            valor_unitario: item.valorUnitario,
            desconto: item.desconto,
            valor_total: item.valor,
            status: item.status,
            descricao: item.descricao,
            data_pagamento: item.dataPagamento || null
        }).eq('id', id);
    }

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: item.tipo === "VENDA" ? "VENDAS" : "DESPESAS",
        resumo: `Lançamento #${id} editado (${item.cliente || item.descricao || item.produto} — ${money(item.valor)})`,
        detalhes: {
            id,
            tipo: item.tipo,
            data: item.data,
            clienteOuDescricao: item.cliente || item.descricao,
            quantidade: item.qtd,
            valorTotal: money(item.valor),
            status: item.status
        }
    });
    closeEditModal();
    toast("Alterações salvas!");
}

export async function deleteCurrentItem() {
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem excluir registros.");
    const { db } = state;
    const id = parseFloat(document.getElementById("editId").value);
    const item = db.historico.find(h => h.id === id);

    if (!item) return;

    if (!confirm("Excluir permanentemente este lançamento? O estoque de ovos e insumos será estornado.")) return;

    if (supabaseClient) {
        const { error } = await supabaseClient.from('transacoes').delete().eq('id', id);
        if (error) return toast("Erro ao excluir no banco!");
    }

    if (item.tipo === "VENDA") {
        const produto = db.produtos.find(p => p.nome === item.produto);

        if (produto) {
            const qtdVendida = Number(item.qtd) || 0;

            if (produto.tipoOvo && db.estoque[produto.tipoOvo] !== undefined) {
                const ovosParaDevolver = (Number(produto.ovosPorItem) || 0) * qtdVendida;
                db.estoque[produto.tipoOvo] += ovosParaDevolver;
            }

            if (Array.isArray(produto.composicao)) {
                produto.composicao.forEach(comp => {
                    const insumoNoBanco = db.insumos.find(i => String(i.id) === String(comp.insumoId));
                    if (insumoNoBanco) {
                        const qtdInsumoParaDevolver = (Number(comp.qtdNecessaria) || 0) * qtdVendida;
                        insumoNoBanco.qtd = (Number(insumoNoBanco.qtd) || 0) + qtdInsumoParaDevolver;
                        if (supabaseClient) supabaseClient.from('insumos').update({ qtd: insumoNoBanco.qtd }).eq('id', insumoNoBanco.id);
                    }
                });
            }
        }
    }

    if (item.tipo === "SAIDA" && item.categoria === "INSUMO" && item.insumoId) {
        const insumoNoBanco = db.insumos.find(i => String(i.id) === String(item.insumoId));
        if (insumoNoBanco) {
            insumoNoBanco.qtd = (Number(insumoNoBanco.qtd) || 0) - (Number(item.qtd) || 0);
            if (insumoNoBanco.qtd < 0) insumoNoBanco.qtd = 0;
        }
    }

    db.historico = db.historico.filter(h => h.id !== id);

    save();
    registrarLog({
        acao: "EXCLUSAO",
        modulo: item.tipo === "VENDA" ? "VENDAS" : "DESPESAS",
        resumo: `${item.tipo === "VENDA" ? "Venda" : "Despesa"} excluída: ${item.cliente || item.descricao || item.produto} (${money(item.valor)})`,
        detalhes: {
            id: item.id,
            tipo: item.tipo,
            data: item.data,
            cliente: item.cliente || "-",
            produto: item.produto || item.insumo || "-",
            quantidade: item.qtd,
            valorTotal: money(item.valor)
        }
    });
    closeEditModal();
    toast("Venda excluída e estoques estornados!");
}

