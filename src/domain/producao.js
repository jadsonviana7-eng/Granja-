import { NOMES_MESES } from '../config/constants.js';
import { state, save, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import { dateToISO, formatarDataBR, esc, getTodayISO, setDefaultDates } from '../utils/formatters.js';
import { iconSvg, deleteIcon, toast } from '../utils/icons.js';

export function renderColetas() {
    const lista = document.getElementById("coletaList");
    if (!lista) return;

    const { db, dataPeriodoColeta } = state;
    const anoFiltro = dataPeriodoColeta.getFullYear();
    const mesFiltro = dataPeriodoColeta.getMonth();

    const labelEl = document.getElementById("periodoColetaLabel");
    if (labelEl) {
        labelEl.textContent = `${NOMES_MESES[mesFiltro]} ${anoFiltro}`;
    }

    const coletasFiltradas = db.coletas
        .filter(coleta => {
            const iso = dateToISO(coleta.data);
            if (!iso) return false;
            const [ano, mes] = iso.split("-").map(Number);
            return ano === anoFiltro && mes === (mesFiltro + 1);
        })
        .sort((a, b) => dateToISO(b.data).localeCompare(dateToISO(a.data)));

    const totalProduzido = coletasFiltradas.reduce((acc, item) => acc + (item.liquido || 0), 0);
    const totalEl = document.getElementById("totalColetasMes");
    if (totalEl) totalEl.textContent = `${totalProduzido.toLocaleString('pt-BR')} ovos`;

    let html = "";
    if (coletasFiltradas.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:var(--muted);">Nenhuma coleta registrada neste mês.</div>';
    } else {
        coletasFiltradas.forEach(item => {
            html += `
                <div class="item">
                    <div style="display: flex; flex-direction: column; align-items: flex-start; cursor: pointer; flex: 1;" onclick="openColetaEditModal(${item.id})">
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
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="icon-btn blue" type="button" onclick="openColetaEditModal(${item.id})" title="Editar coleta">
                            ${iconSvg('editar')}
                        </button>
                        <button class="icon-btn danger" type="button" onclick="deleteItem('coletas', ${item.id})" title="Excluir coleta">
                            ${deleteIcon()}
                        </button>
                    </div>
                </div>`;
        });
    }
    lista.innerHTML = html;
}

export function mudarPeriodoColeta(delta) {
    state.dataPeriodoColeta.setMonth(state.dataPeriodoColeta.getMonth() + delta);
    renderColetas();
}

export function openProductionModal() {
    const modal = document.getElementById("productionModal");
    const dateInput = document.getElementById("modalProdDate");
    if (dateInput) dateInput.value = getTodayISO();
    const lossInput = document.getElementById("modalProdLoss");
    if (lossInput) lossInput.value = "0";
    const collInput = document.getElementById("modalProdCollected");
    if (collInput) collInput.value = "";
    if (modal) modal.style.display = "flex";
}

export function closeProductionModal() {
    const modal = document.getElementById("productionModal");
    if (modal) modal.style.display = "none";
}

async function salvarColetaBancoEAtualizarEstado({ type, data, coll, loss }) {
    const { db } = state;
    const liquido = coll - loss;
    let insertedId = Date.now();

    if (supabaseClient) {
        const { data: resData, error } = await supabaseClient.from('producao_diaria').insert({
            data_coleta: data,
            tipo_ovo: type,
            quantidade_ovos_bons: liquido,
            quantidade_ovos_quebrados: loss
        }).select();

        if (error) {
            console.error("Erro ao salvar coleta no banco:", error);
            if (error.message && (error.message.includes("tipo_ovo") || error.code === "PGRST204" || error.code === "42703")) {
                const { data: retryData, error: retryError } = await supabaseClient.from('producao_diaria').insert({
                    data_coleta: data,
                    quantidade_ovos_bons: liquido,
                    quantidade_ovos_quebrados: loss,
                    observacoes: `Tipo: ${type}`
                }).select();
                if (retryError) {
                    toast("Erro no banco: " + retryError.message);
                    return false;
                }
                if (retryData && retryData[0]) insertedId = retryData[0].id;
            } else {
                toast("Erro no banco: " + error.message);
                return false;
            }
        } else if (resData && resData[0]) {
            insertedId = resData[0].id;
        }
    }

    db.estoque[type] = (Number(db.estoque[type]) || 0) + liquido;
    db.coletas.push({
        id: insertedId,
        data,
        tipo: type,
        bruto: coll,
        perda: loss,
        liquido
    });

    save();
    registrarLog({
        acao: "INCLUSAO",
        modulo: "PRODUCAO",
        resumo: `Coleta registrada: ${liquido} ovos líquidos (${type})`,
        detalhes: {
            id: insertedId,
            data,
            tipoOvo: type,
            coletados: coll,
            perdas: loss,
            liquido
        }
    });
    return true;
}

export async function handleModalProduction(e) {
    e.preventDefault();
    const type = document.getElementById("modalProdType").value;
    const data = document.getElementById("modalProdDate").value || getTodayISO();
    const coll = parseInt(document.getElementById("modalProdCollected").value, 10) || 0;
    const loss = parseInt(document.getElementById("modalProdLoss").value, 10) || 0;

    const ok = await salvarColetaBancoEAtualizarEstado({ type, data, coll, loss });
    if (!ok) return;

    e.target.reset();
    setDefaultDates();
    closeProductionModal();
    toast("Coleta salva com sucesso!");
}

export async function handleProduction(e) {
    e.preventDefault();
    const type = document.getElementById("prodType").value;
    const data = document.getElementById("prodDate").value || getTodayISO();
    const coll = parseInt(document.getElementById("prodCollected").value, 10) || 0;
    const loss = parseInt(document.getElementById("prodLoss").value, 10) || 0;

    const ok = await salvarColetaBancoEAtualizarEstado({ type, data, coll, loss });
    if (!ok) return;

    e.target.reset();
    setDefaultDates();
    document.getElementById("prodLoss").value = "0";
    toast("Coleta salva!");
}

export function openColetaEditModal(id) {
    if (!isCurrentUserAdmin()) return toast("Apenas administradores podem editar registros de coleta.");
    const coleta = state.db.coletas.find(c => c.id === id);
    if (!coleta) return;

    document.getElementById("editColetaId").value = coleta.id;
    document.getElementById("editColetaDate").value = dateToISO(coleta.data);
    document.getElementById("editColetaType").value = coleta.tipo || "Grande";
    document.getElementById("editColetaCollected").value = coleta.bruto || 0;
    document.getElementById("editColetaLoss").value = coleta.perda || 0;
    document.getElementById("editColetaLiquid").value = coleta.liquido || 0;

    document.getElementById("coletaEditModal").style.display = "flex";
}

export function closeColetaEditModal() {
    document.getElementById("coletaEditModal").style.display = "none";
}

export function calcEditColetaLiquid() {
    const coll = parseInt(document.getElementById("editColetaCollected").value, 10) || 0;
    const loss = parseInt(document.getElementById("editColetaLoss").value, 10) || 0;
    const liquido = Math.max(0, coll - loss);
    document.getElementById("editColetaLiquid").value = liquido;
}

export async function handleColetaEdit(e) {
    e.preventDefault();
    if (!isCurrentUserAdmin()) return toast("Acesso restrito: apenas administradores podem editar registros.");
    const { db } = state;
    const id = parseFloat(document.getElementById("editColetaId").value);
    const coleta = db.coletas.find(c => c.id === id);
    if (!coleta) return;

    const data = document.getElementById("editColetaDate").value || getTodayISO();
    const type = document.getElementById("editColetaType").value || "Grande";
    const coll = parseInt(document.getElementById("editColetaCollected").value, 10) || 0;
    const loss = parseInt(document.getElementById("editColetaLoss").value, 10) || 0;
    const liquido = Math.max(0, coll - loss);

    const oldType = coleta.tipo || "Grande";
    const oldLiquido = Number(coleta.liquido) || 0;

    if (supabaseClient) {
        const { error } = await supabaseClient.from('producao_diaria').update({
            data_coleta: data,
            tipo_ovo: type,
            quantidade_ovos_bons: liquido,
            quantidade_ovos_quebrados: loss
        }).eq('id', id);

        if (error) {
            console.error("Erro ao atualizar coleta no Supabase:", error);
            if (error.message && (error.message.includes("tipo_ovo") || error.code === "PGRST204" || error.code === "42703")) {
                await supabaseClient.from('producao_diaria').update({
                    data_coleta: data,
                    quantidade_ovos_bons: liquido,
                    quantidade_ovos_quebrados: loss,
                    observacoes: `Tipo: ${type}`
                }).eq('id', id);
            }
        }
    }

    if (oldType === type) {
        const diff = liquido - oldLiquido;
        db.estoque[type] = (Number(db.estoque[type]) || 0) + diff;
    } else {
        db.estoque[oldType] = (Number(db.estoque[oldType]) || 0) - oldLiquido;
        db.estoque[type] = (Number(db.estoque[type]) || 0) + liquido;
        if (db.estoque[oldType] < 0) db.estoque[oldType] = 0;
    }
    if (db.estoque[type] < 0) db.estoque[type] = 0;

    coleta.data = data;
    coleta.tipo = type;
    coleta.bruto = coll;
    coleta.perda = loss;
    coleta.liquido = liquido;

    save();
    registrarLog({
        acao: "EDICAO",
        modulo: "PRODUCAO",
        resumo: `Coleta #${id} editada: ${liquido} ovos líquidos (${type})`,
        detalhes: {
            id,
            data,
            tipoAnterior: oldType,
            tipoNovo: type,
            liquidoAnterior: oldLiquido,
            coletados: coll,
            perdas: loss,
            liquidoNovo: liquido
        }
    });
    closeColetaEditModal();
    toast("Coleta atualizada e estoque recalculado!");
}

