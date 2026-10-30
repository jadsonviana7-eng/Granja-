import { LOGS_STORE_KEY } from '../config/constants.js';
import { state, save, isCurrentUserAdmin } from '../state/store.js';
import { supabaseClient } from './supabase.js';
import { esc, getTodayISO } from '../utils/formatters.js';
import { toast } from '../utils/icons.js';

const MAX_LOGS = 500;

export function formatDateTimeBR(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function getLoggedUserInfo() {
    const user = state.currentUser;
    if (!user) {
        return {
            id: null,
            nome: "Sistema / Local",
            email: "",
            perfil: "sistema"
        };
    }

    const dbUser = (state.db?.usuarios || []).find(u => u.id === user.id);
    const nome = dbUser?.full_name || user.user_metadata?.full_name || user.email || "Usuário";
    const email = dbUser?.email || user.email || "";
    const perfil = isCurrentUserAdmin() ? "admin" : "common";

    return {
        id: user.id,
        nome,
        email,
        perfil
    };
}

export function loadLocalLogs() {
    try {
        const raw = localStorage.getItem(LOGS_STORE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
        // ignore
    }
    return [];
}

export async function registrarLog({ acao, modulo, resumo, detalhes = {} }) {
    if (!state.db) return;
    if (!Array.isArray(state.db.logs)) {
        state.db.logs = loadLocalLogs();
    }

    const userInfo = getLoggedUserInfo();
    const novoLog = {
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        data_hora: new Date().toISOString(),
        usuario_id: userInfo.id,
        usuario_nome: userInfo.nome,
        usuario_email: userInfo.email,
        usuario_perfil: userInfo.perfil,
        acao: String(acao || "INFO").toUpperCase(),
        modulo: String(modulo || "SISTEMA").toUpperCase(),
        resumo: String(resumo || ""),
        detalhes: detalhes && typeof detalhes === 'object' ? detalhes : { info: String(detalhes) }
    };

    state.db.logs.unshift(novoLog);
    if (state.db.logs.length > MAX_LOGS) {
        state.db.logs = state.db.logs.slice(0, MAX_LOGS);
    }

    try {
        localStorage.setItem(LOGS_STORE_KEY, JSON.stringify(state.db.logs));
    } catch {
        // ignore storage quota errors
    }

    save();

    // Sincroniza em background com o Supabase (tabela `logs_sistema` se existir, ou `granja_data`)
    if (supabaseClient) {
        try {
            const { error: errTable } = await supabaseClient.from('logs_sistema').insert({
                id: novoLog.id,
                data_hora: novoLog.data_hora,
                usuario_id: novoLog.usuario_id,
                usuario_nome: novoLog.usuario_nome,
                usuario_email: novoLog.usuario_email,
                usuario_perfil: novoLog.usuario_perfil,
                acao: novoLog.acao,
                modulo: novoLog.modulo,
                resumo: novoLog.resumo,
                detalhes: novoLog.detalhes
            });

            if (errTable) {
                // Fallback automático na tabela `granja_data`
                const { data: existingRow } = await supabaseClient
                    .from('granja_data')
                    .select('id, db_content')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const currentContent = (existingRow?.db_content && typeof existingRow.db_content === 'object')
                    ? existingRow.db_content
                    : {};
                const logsAtuais = Array.isArray(currentContent.logs) ? currentContent.logs : [];
                const logsAtualizados = [novoLog, ...logsAtuais].slice(0, 250);

                if (existingRow?.id) {
                    await supabaseClient
                        .from('granja_data')
                        .update({
                            db_content: { ...currentContent, logs: logsAtualizados },
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingRow.id);
                }
            }
        } catch (err) {
            console.warn("Aviso ao sincronizar log na nuvem:", err);
        }
    }
}

function formatDetailsHtml(detalhes) {
    if (!detalhes || typeof detalhes !== 'object') return "";
    const entries = Object.entries(detalhes).filter(([, v]) => v !== undefined && v !== null && v !== "");
    if (entries.length === 0) return "";

    const rows = entries.map(([chave, valor]) => {
        const label = chave
            .replace(/_/g, " ")
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, s => s.toUpperCase());

        let formattedVal = "";
        if (typeof valor === 'object') {
            formattedVal = `<code>${esc(JSON.stringify(valor))}</code>`;
        } else {
            formattedVal = esc(String(valor));
        }

        return `
            <div class="log-detail-pair">
                <span class="log-detail-key">${esc(label)}:</span>
                <span class="log-detail-val">${formattedVal}</span>
            </div>
        `;
    }).join("");

    return `
        <details class="log-details-box">
            <summary><i class="fas fa-code-branch"></i> Ver detalhes do registro</summary>
            <div class="log-details-grid">
                ${rows}
            </div>
        </details>
    `;
}

export function renderSystemLogs() {
    const listEl = document.getElementById("systemLogsList");
    if (!listEl) return;

    const logs = Array.isArray(state.db?.logs) ? state.db.logs : loadLocalLogs();

    const search = (document.getElementById("logFilterSearch")?.value || "").trim().toLowerCase();
    const acaoFilter = document.getElementById("logFilterAction")?.value || "TODAS";
    const moduloFilter = document.getElementById("logFilterModule")?.value || "TODOS";

    // Contadores gerais
    const countTotal = logs.length;
    const countInc = logs.filter(l => l.acao === "INCLUSAO").length;
    const countEdit = logs.filter(l => l.acao === "EDICAO" || l.acao === "CONFIGURACAO").length;
    const countDel = logs.filter(l => l.acao === "EXCLUSAO").length;

    const setKpi = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setKpi("logKpiTotal", countTotal);
    setKpi("logKpiInclusoes", countInc);
    setKpi("logKpiEdicoes", countEdit);
    setKpi("logKpiExclusoes", countDel);

    const filtrados = logs.filter(log => {
        if (acaoFilter !== "TODAS" && log.acao !== acaoFilter) return false;
        if (moduloFilter !== "TODOS" && log.modulo !== moduloFilter) return false;
        if (search) {
            const haystack = [
                log.resumo,
                log.usuario_nome,
                log.usuario_email,
                log.modulo,
                log.acao,
                JSON.stringify(log.detalhes || {})
            ].join(" ").toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const countLabel = document.getElementById("systemLogsCount");
    if (countLabel) {
        countLabel.textContent = `${filtrados.length} evento(s) exibido(s)`;
    }

    if (filtrados.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 32px 16px; color: var(--muted); background: var(--surface-2); border-radius: 12px; border: 1px dashed var(--line);">
                <i class="fas fa-clipboard-list" style="font-size: 1.8rem; opacity: 0.4; margin-bottom: 8px; display: block;"></i>
                <b>Nenhum registro de auditoria encontrado para os filtros selecionados.</b>
                <small style="display: block; margin-top: 4px;">Todas as novas inclusões, edições, exclusões e logins aparecerão detalhadamente aqui.</small>
            </div>
        `;
        return;
    }

    const actionMeta = {
        INCLUSAO: { label: "INCLUSÃO", badgeClass: "green", border: "var(--green)", icon: "fa-plus-circle" },
        EDICAO: { label: "EDIÇÃO", badgeClass: "blue", border: "var(--blue)", icon: "fa-pen" },
        EXCLUSAO: { label: "EXCLUSÃO", badgeClass: "red", border: "var(--red)", icon: "fa-trash-alt" },
        CONFIGURACAO: { label: "AJUSTE", badgeClass: "amber", border: "var(--amber)", icon: "fa-cog" },
        AUTENTICACAO: { label: "ACESSO", badgeClass: "blue", border: "#6366f1", icon: "fa-user-shield" }
    };

    listEl.innerHTML = filtrados.map(log => {
        const meta = actionMeta[log.acao] || { label: log.acao, badgeClass: "blue", border: "var(--muted)", icon: "fa-info-circle" };
        const roleTag = log.usuario_perfil === "admin" ? "ADMIN" : (log.usuario_perfil === "common" ? "USUÁRIO" : "SISTEMA");

        return `
            <div class="log-item-card" style="border-left-color: ${meta.border};">
                <div class="log-item-top">
                    <div class="log-badges-wrap">
                        <span class="badge ${meta.badgeClass}" style="font-size: 0.65rem; padding: 2px 8px;">
                            <i class="fas ${meta.icon}" style="margin-right: 4px;"></i>${esc(meta.label)}
                        </span>
                        <span class="log-module-pill">${esc(log.modulo)}</span>
                    </div>
                    <span class="log-timestamp">
                        <i class="far fa-clock"></i> ${esc(formatDateTimeBR(log.data_hora))}
                    </span>
                </div>

                <div class="log-summary-text">${esc(log.resumo)}</div>

                <div class="log-user-line">
                    <span>
                        <i class="fas fa-user-circle" style="color: var(--primary);"></i>
                        <strong>${esc(log.usuario_nome || "Usuário")}</strong>
                        ${log.usuario_email ? `<small style="color: var(--muted);">(${esc(log.usuario_email)})</small>` : ""}
                    </span>
                    <span class="log-role-chip ${log.usuario_perfil === 'admin' ? 'is-admin' : ''}">${roleTag}</span>
                </div>

                ${formatDetailsHtml(log.detalhes)}
            </div>
        `;
    }).join("");
}

export function exportarLogsCSV() {
    const logs = Array.isArray(state.db?.logs) ? state.db.logs : loadLocalLogs();
    if (!logs.length) return toast("Não há logs registrados para exportar.");

    const headers = ["Data/Hora", "Acao", "Modulo", "Usuario", "Email", "Perfil", "Resumo", "Detalhes"];
    const rows = logs.map(l => [
        `"${formatDateTimeBR(l.data_hora)}"`,
        `"${l.acao || ""}"`,
        `"${l.modulo || ""}"`,
        `"${(l.usuario_nome || "").replace(/"/g, '""')}"`,
        `"${(l.usuario_email || "").replace(/"/g, '""')}"`,
        `"${l.usuario_perfil || ""}"`,
        `"${(l.resumo || "").replace(/"/g, '""')}"`,
        `"${JSON.stringify(l.detalhes || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `logs_auditoria_granja_${getTodayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Log de auditoria exportado em CSV!");
}

