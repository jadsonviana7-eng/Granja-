import { NOMES_MESES, COMPANY_STORE_KEY, DEFAULT_EMPRESA } from '../config/constants.js';
import { state, save, normalizeEmpresa, isCurrentUserAdmin } from '../state/store.js';
import { dbSalvarDadosEmpresa } from '../services/supabase.js';
import { registrarLog } from '../services/logger.js';
import { dateToISO, formatarDataBR, esc, money, formatNumber, getTodayISO, formatarCpfCnpj } from '../utils/formatters.js';
import { toast } from '../utils/icons.js';

let currentReceiptSaleId = null;

export function getEmpresaConfig() {
    const emp = normalizeEmpresa(state.db?.config?.empresa);
    if (state.db?.config) {
        state.db.config.empresa = emp;
    }
    return emp;
}

export function renderCompanyConfig() {
    const form = document.getElementById("companyConfigForm");
    if (!form) return;
    const emp = getEmpresaConfig();

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = val ?? "";
        }
    };

    setVal("companyName", emp.nome || DEFAULT_EMPRESA.nome);
    setVal("companySubtitle", emp.subtitulo || "");
    setVal("companyDoc", formatarCpfCnpj(emp.documento || ""));
    setVal("companyOwner", emp.responsavel || "");
    setVal("companyPhone", emp.telefone || "");
    setVal("companyAddress", emp.endereco || "");
    setVal("companyEmail", emp.email || "");
    setVal("companyPix", emp.chavePix || "");
    setVal("companyPixFavorecido", emp.favorecidoPix || "");
    setVal("companyFooter", emp.mensagemRodape || "");
}

export async function handleCompanyConfigSave(e) {
    if (e) e.preventDefault();
    if (!isCurrentUserAdmin()) {
        return toast("Acesso negado: apenas administradores podem alterar os dados da empresa.");
    }
    const docFormatado = formatarCpfCnpj(document.getElementById("companyDoc")?.value.trim() || "");
    const novaEmpresa = {
        nome: document.getElementById("companyName")?.value.trim() || DEFAULT_EMPRESA.nome,
        subtitulo: document.getElementById("companySubtitle")?.value.trim() || "",
        documento: docFormatado,
        responsavel: document.getElementById("companyOwner")?.value.trim() || "",
        telefone: document.getElementById("companyPhone")?.value.trim() || "",
        endereco: document.getElementById("companyAddress")?.value.trim() || "",
        email: document.getElementById("companyEmail")?.value.trim() || "",
        chavePix: document.getElementById("companyPix")?.value.trim() || "",
        favorecidoPix: document.getElementById("companyPixFavorecido")?.value.trim() || "",
        mensagemRodape: document.getElementById("companyFooter")?.value.trim() || DEFAULT_EMPRESA.mensagemRodape
    };

    if (!state.db.config) state.db.config = {};
    state.db.config.empresa = novaEmpresa;
    localStorage.setItem(COMPANY_STORE_KEY, JSON.stringify(novaEmpresa));
    save();

    const submitBtn = e?.target?.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando no banco...';
    }

    const res = await dbSalvarDadosEmpresa(novaEmpresa);

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }

    if (res.ok) {
        toast("Dados da empresa salvos no Supabase com sucesso!");
    } else {
        console.warn("Aviso ao salvar empresa no Supabase:", res.error);
        toast("Salvo localmente (verifique permissões do Supabase: " + (res.error?.message || "erro de rede") + ")");
    }

    registrarLog({
        acao: "CONFIGURACAO",
        modulo: "EMPRESA",
        resumo: `Dados da empresa atualizados (${novaEmpresa.nome})`,
        detalhes: {
            nome: novaEmpresa.nome,
            documento: novaEmpresa.documento || "-",
            responsavel: novaEmpresa.responsavel || "-",
            chavePix: novaEmpresa.chavePix || "-",
            favorecidoPix: novaEmpresa.favorecidoPix || "-"
        }
    });
}

function buildSingleInvoiceHtml(sale, copyLabel = "", compact = false) {
    const emp = getEmpresaConfig();
    const { db } = state;

    const clienteNome = sale.cliente || "Consumidor Geral";
    const clienteCad = (db.clientes || []).find(
        c => String(c.nome || "").trim().toLowerCase() === String(clienteNome).trim().toLowerCase()
    );

    const produtoNome = sale.produto || "Ovos / Produto da Granja";
    const produtoCad = (db.produtos || []).find(
        p => String(p.id) === String(sale.produto_id) || String(p.nome || "").trim().toLowerCase() === String(produtoNome).trim().toLowerCase()
    );

    const qtd = Number(sale.qtd ?? sale.quantidade) || 1;
    const valorUnitario = Number(sale.valorUnitario ?? sale.valor_unitario) || (qtd > 0 ? (Number(sale.valor) || 0) / qtd : 0);
    const subtotalBruto = qtd * valorUnitario;
    const desconto = Number(sale.desconto) || 0;
    const valorTotal = Number(sale.valor ?? sale.valor_total) || Math.max(0, subtotalBruto - desconto);

    const ovosPorUn = Number(produtoCad?.ovosPorItem) || 0;
    const totalOvosVenda = ovosPorUn > 0 ? ovosPorUn * qtd : 0;
    const tipoOvoProd = produtoCad?.tipoOvo ? `Ovos ${produtoCad.tipoOvo}` : "";

    const statusAtual = String(sale.status || "pago").toLowerCase();
    const isPago = statusAtual === "pago";
    const dataVendaBR = formatarDataBR(sale.data || sale.data_transacao || getTodayISO());
    const dataPagBR = sale.dataPagamento ? formatarDataBR(sale.dataPagamento) : (isPago ? dataVendaBR : "");

    const numRecibo = String(sale.id || "").slice(-6).padStart(6, "0");
    const logoUrl = new URL('logo.png', window.location.href).href;

    const metaLines = [];
    if (emp.documento) {
        const digitosDoc = String(emp.documento).replace(/\D/g, "");
        const rotuloDoc = digitosDoc.length > 11 ? "CNPJ" : (digitosDoc.length === 11 ? "CPF" : "CPF/CNPJ");
        metaLines.push(`<span><strong>${rotuloDoc}:</strong> ${esc(formatarCpfCnpj(emp.documento))}</span>`);
    }
    if (emp.responsavel) metaLines.push(`<span><strong>Responsável:</strong> ${esc(emp.responsavel)}</span>`);
    if (emp.telefone) metaLines.push(`<span><strong>Tel / WhatsApp:</strong> ${esc(emp.telefone)}</span>`);
    if (emp.email) metaLines.push(`<span><strong>Contato:</strong> ${esc(emp.email)}</span>`);

    const textoDeclaracao = isPago
        ? `Declaramos que recebemos de <strong>${esc(clienteNome)}</strong> a importância líquida de <strong>${money(valorTotal)}</strong> referente aos produtos discriminados neste documento, dando plena e rasa quitação.`
        : `Fatura emitida para <strong>${esc(clienteNome)}</strong> no valor líquido de <strong>${money(valorTotal)}</strong>, encontrando-se <strong>PENDENTE DE PAGAMENTO</strong> até a presente data.`;

    return `
        <div class="a4-invoice-sheet ${compact ? 'is-compact' : ''}">
            <div class="inv-header">
                <div class="inv-brand">
                    <img src="${logoUrl}" alt="Logo" class="inv-logo" onerror="this.style.display='none'">
                    <div class="inv-company">
                        <h1 class="inv-company-name">${esc(emp.nome || DEFAULT_EMPRESA.nome)}</h1>
                        ${emp.subtitulo ? `<div class="inv-company-sub">${esc(emp.subtitulo)}</div>` : ""}
                        ${emp.endereco ? `<div class="inv-company-addr">${esc(emp.endereco)}</div>` : ""}
                        ${metaLines.length > 0 ? `<div class="inv-company-meta">${metaLines.join(" &bull; ")}</div>` : ""}
                    </div>
                </div>
                <div class="inv-doc-box">
                    <div class="inv-doc-type">RECIBO / FATURA DE VENDA</div>
                    <div class="inv-doc-number">Nº ${esc(numRecibo)}</div>
                    <div class="inv-doc-date">Emissão: <strong>${esc(dataVendaBR)}</strong></div>
                    <div class="inv-status-badge ${isPago ? 'paid' : 'pending'}">
                        ${isPago ? '✓ PAGO / QUITADO' : '⏳ PAGAMENTO PENDENTE'}
                    </div>
                    ${copyLabel ? `<div class="inv-copy-tag">${esc(copyLabel)}</div>` : ""}
                </div>
            </div>

            <div class="inv-parties-grid">
                <div class="inv-party-card">
                    <div class="inv-section-label">DADOS DO CLIENTE / DESTINATÁRIO</div>
                    <div class="inv-client-name">${esc(clienteNome)}</div>
                    <div class="inv-client-details">
                        <span><strong>Telefone:</strong> ${esc(clienteCad?.telefone || "Não informado")}</span>
                        <span><strong>Cidade / Localidade:</strong> ${esc(clienteCad?.cidade || "Não informada")}</span>
                    </div>
                </div>
                <div class="inv-party-card inv-payment-summary-top">
                    <div class="inv-section-label">CONDIÇÃO DE PAGAMENTO</div>
                    <div class="inv-pay-line">
                        <span>Situação:</span>
                        <strong>${isPago ? "Pago" : "A Prazo / Pendente"}</strong>
                    </div>
                    ${isPago && dataPagBR ? `
                    <div class="inv-pay-line">
                        <span>Data da Quitação:</span>
                        <strong>${esc(dataPagBR)}</strong>
                    </div>` : ""}
                    ${sale.descricao ? `
                    <div class="inv-pay-line">
                        <span>Forma / Obs:</span>
                        <strong>${esc(sale.descricao)}</strong>
                    </div>` : ""}
                </div>
            </div>

            <div class="inv-items-wrapper">
                <table class="inv-table">
                    <thead>
                        <tr>
                            <th class="col-item" style="width: 44px; text-align: center;">Item</th>
                            <th>Descrição do Produto</th>
                            <th class="col-qty" style="width: 85px; text-align: center;">Qtd</th>
                            <th class="col-unit" style="width: 110px; text-align: right;">V. Unit.</th>
                            <th class="col-sub" style="width: 120px; text-align: right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="col-item" style="text-align: center; font-weight: 700; color: #64748b;">01</td>
                            <td>
                                <div class="inv-prod-title">${esc(produtoNome)}</div>
                                <div class="inv-prod-sub">
                                    ${tipoOvoProd ? `<span>Classificação: <strong>${esc(tipoOvoProd)}</strong></span>` : ""}
                                    ${ovosPorUn > 0 ? `<span>Embalagem: <strong>${ovosPorUn} ovos/un</strong></span>` : ""}
                                    ${totalOvosVenda > 0 ? `<span>Total: <strong>${totalOvosVenda.toLocaleString('pt-BR')} ovos</strong></span>` : ""}
                                </div>
                            </td>
                            <td class="col-qty" style="text-align: center; font-weight: 700; white-space: nowrap;">${formatNumber(qtd)} ${esc(sale.unidade || "un")}</td>
                            <td class="col-unit" style="text-align: right; white-space: nowrap;">${money(valorUnitario)}</td>
                            <td class="col-sub" style="text-align: right; font-weight: 700; white-space: nowrap;">${money(subtotalBruto)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="inv-bottom-grid">
                <div class="inv-notes-box">
                    <div class="inv-declaration">
                        ${textoDeclaracao}
                    </div>
                    ${emp.chavePix ? `
                    <div class="inv-pix-box">
                        <span class="inv-pix-badge">PIX</span>
                        <div>
                            <strong>Chave Pix para Pagamento:</strong> ${esc(emp.chavePix)}
                            ${(emp.favorecidoPix || emp.responsavel || emp.nome) ? `<small style="display:block; color:#475569;">Favorecido: ${esc(emp.favorecidoPix || emp.responsavel || emp.nome)}</small>` : ""}
                        </div>
                    </div>
                    ` : ""}
                </div>

                <div class="inv-totals-box">
                    <div class="inv-total-row">
                        <span>Subtotal Bruto:</span>
                        <strong>${money(subtotalBruto)}</strong>
                    </div>
                    <div class="inv-total-row">
                        <span>Desconto Concedido:</span>
                        <strong style="color: ${desconto > 0 ? '#dc2626' : '#64748b'};">${desconto > 0 ? `- ${money(desconto)}` : money(0)}</strong>
                    </div>
                    <div class="inv-total-row grand-total">
                        <span>TOTAL A PAGAR:</span>
                        <strong>${money(valorTotal)}</strong>
                    </div>
                </div>
            </div>

            <div class="inv-signatures">
                <div class="inv-sig-block">
                    <div class="inv-sig-line"></div>
                    <div class="inv-sig-name">${esc(emp.responsavel || emp.nome || DEFAULT_EMPRESA.nome)}</div>
                    <div class="inv-sig-role">Assinatura do Emissor / Responsável</div>
                </div>
                <div class="inv-sig-block">
                    <div class="inv-sig-line"></div>
                    <div class="inv-sig-name">${esc(clienteNome)}</div>
                    <div class="inv-sig-role">Assinatura do Cliente / Recebedor</div>
                </div>
            </div>

            <div class="inv-footer">
                <span>${esc(emp.mensagemRodape || DEFAULT_EMPRESA.mensagemRodape)}</span>
                <span>Documento emitido em ${formatarDataBR(getTodayISO())} • ${esc(emp.nome || DEFAULT_EMPRESA.nome)}</span>
            </div>
        </div>
    `;
}

export function getInvoiceStyles(mode = "single") {
    const padPreview = mode === "double" ? "14mm 16mm" : "18mm 20mm";
    const padPrint = mode === "double" ? "6mm 8mm" : "10mm 12mm";

    return `
        .a4-page-sheet {
            background: #ffffff;
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: ${padPreview};
            box-sizing: border-box;
            border-radius: 6px;
            box-shadow: 0 8px 26px rgba(15, 23, 42, 0.14);
        }
        @media print {
            .a4-page-sheet {
                box-shadow: none !important;
                border-radius: 0 !important;
                max-width: none !important;
                width: 100% !important;
                padding: ${padPrint} !important;
            }
        }
        .a4-invoice-sheet {
            font-family: 'Plus Jakarta Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            line-height: 1.45;
            font-size: 13px;
        }
        .a4-invoice-sheet.is-compact {
            font-size: 11.5px;
            line-height: 1.32;
        }
        .inv-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            padding-bottom: 16px;
            border-bottom: 2.5px solid #1b7a43;
            margin-bottom: 16px;
        }
        .a4-invoice-sheet.is-compact .inv-header {
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .inv-brand {
            display: flex;
            align-items: center;
            gap: 14px;
            flex: 1;
        }
        .inv-logo {
            width: 68px;
            height: 68px;
            object-fit: contain;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            padding: 4px;
            background: #ffffff;
        }
        .a4-invoice-sheet.is-compact .inv-logo {
            width: 50px;
            height: 50px;
        }
        .inv-company-name {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
            color: #132a1c;
            letter-spacing: -0.02em;
        }
        .a4-invoice-sheet.is-compact .inv-company-name {
            font-size: 16px;
        }
        .inv-company-sub {
            font-size: 12px;
            font-weight: 600;
            color: #1b7a43;
            margin-top: 2px;
        }
        .inv-company-addr {
            font-size: 11.5px;
            color: #475569;
            margin-top: 3px;
        }
        .inv-company-meta {
            font-size: 11.5px;
            color: #334155;
            margin-top: 4px;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .inv-doc-box {
            text-align: right;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 10px 14px;
            min-width: 210px;
        }
        .a4-invoice-sheet.is-compact .inv-doc-box {
            padding: 7px 12px;
            min-width: 190px;
        }
        .inv-doc-type {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
        }
        .inv-doc-number {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            margin: 2px 0;
        }
        .a4-invoice-sheet.is-compact .inv-doc-number {
            font-size: 15px;
        }
        .inv-doc-date {
            font-size: 11.5px;
            color: #475569;
            margin-bottom: 6px;
        }
        .inv-status-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 10.5px;
            font-weight: 800;
            letter-spacing: 0.03em;
        }
        .inv-status-badge.paid {
            background: #dcfce7;
            color: #15803d;
            border: 1px solid #86efac;
        }
        .inv-status-badge.pending {
            background: #fef3c7;
            color: #b45309;
            border: 1px solid #fde68a;
        }
        .inv-copy-tag {
            margin-top: 5px;
            font-size: 10px;
            font-weight: 700;
            color: #1e40af;
            text-transform: uppercase;
        }
        .inv-parties-grid {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 14px;
            margin-bottom: 16px;
        }
        .a4-invoice-sheet.is-compact .inv-parties-grid {
            gap: 10px;
            margin-bottom: 10px;
        }
        .inv-party-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 14px;
        }
        .a4-invoice-sheet.is-compact .inv-party-card {
            padding: 8px 12px;
        }
        .inv-section-label {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #1b7a43;
            margin-bottom: 5px;
        }
        .inv-client-name {
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 4px;
        }
        .a4-invoice-sheet.is-compact .inv-client-name {
            font-size: 13.5px;
        }
        .inv-client-details {
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            font-size: 12px;
            color: #475569;
        }
        .inv-pay-line {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            padding: 2px 0;
            color: #334155;
        }
        .inv-items-wrapper {
            margin-bottom: 16px;
        }
        .a4-invoice-sheet.is-compact .inv-items-wrapper {
            margin-bottom: 10px;
        }
        .inv-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            overflow: hidden;
        }
        .inv-table th {
            background: #132a1c;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            padding: 9px 12px;
            text-align: left;
        }
        .a4-invoice-sheet.is-compact .inv-table th {
            padding: 6px 10px;
            font-size: 10px;
        }
        .inv-table td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
        }
        .a4-invoice-sheet.is-compact .inv-table td {
            padding: 8px 10px;
        }
        .inv-prod-title {
            font-weight: 800;
            font-size: 13.5px;
            color: #0f172a;
        }
        .a4-invoice-sheet.is-compact .inv-prod-title {
            font-size: 12.5px;
        }
        .inv-prod-sub {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 11.5px;
            color: #64748b;
            margin-top: 3px;
        }
        .inv-bottom-grid {
            display: grid;
            grid-template-columns: 1.35fr 1fr;
            gap: 16px;
            align-items: stretch;
            margin-bottom: 24px;
        }
        .a4-invoice-sheet.is-compact .inv-bottom-grid {
            gap: 12px;
            margin-bottom: 14px;
        }
        .inv-notes-box {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 14px;
        }
        .a4-invoice-sheet.is-compact .inv-notes-box {
            padding: 8px 12px;
        }
        .inv-declaration {
            font-size: 12px;
            color: #334155;
            line-height: 1.5;
        }
        .a4-invoice-sheet.is-compact .inv-declaration {
            font-size: 11px;
            line-height: 1.35;
        }
        .inv-pix-box {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #ecfdf5;
            border: 1px dashed #10b981;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            color: #065f46;
        }
        .inv-pix-badge {
            background: #059669;
            color: #ffffff;
            font-weight: 800;
            font-size: 10px;
            padding: 3px 7px;
            border-radius: 5px;
            letter-spacing: 0.05em;
        }
        .inv-totals-box {
            background: #f8fafc;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 6px;
        }
        .a4-invoice-sheet.is-compact .inv-totals-box {
            padding: 8px 12px;
            gap: 4px;
        }
        .inv-total-row {
            display: flex;
            justify-content: space-between;
            font-size: 12.5px;
            color: #475569;
        }
        .inv-total-row.grand-total {
            margin-top: 6px;
            padding-top: 8px;
            border-top: 2px solid #1b7a43;
            font-size: 16px;
            font-weight: 800;
            color: #132a1c;
        }
        .a4-invoice-sheet.is-compact .inv-total-row.grand-total {
            font-size: 14px;
            margin-top: 3px;
            padding-top: 5px;
        }
        .inv-signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 28px;
            margin-bottom: 14px;
            padding: 0 20px;
        }
        .a4-invoice-sheet.is-compact .inv-signatures {
            margin-top: 16px;
            margin-bottom: 8px;
        }
        .inv-sig-block {
            text-align: center;
        }
        .inv-sig-line {
            border-bottom: 1px solid #475569;
            height: 22px;
            margin-bottom: 6px;
        }
        .a4-invoice-sheet.is-compact .inv-sig-line {
            height: 14px;
            margin-bottom: 4px;
        }
        .inv-sig-name {
            font-weight: 700;
            font-size: 12px;
            color: #0f172a;
        }
        .inv-sig-role {
            font-size: 10.5px;
            color: #64748b;
        }
        .inv-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-size: 10.5px;
            color: #64748b;
        }
        .inv-cut-divider {
            margin: 18px 0;
            border-top: 1.5px dashed #94a3b8;
            position: relative;
            text-align: center;
        }
        .inv-cut-divider span {
            background: #ffffff;
            padding: 0 12px;
            font-size: 10px;
            color: #64748b;
            position: relative;
            top: -8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        @media screen and (max-width: 640px) {
            .a4-page-sheet {
                padding: 16px 14px !important;
                border-radius: 10px;
            }
            .a4-invoice-sheet {
                font-size: 12px;
            }
            .inv-header {
                flex-direction: column;
                gap: 12px;
                padding-bottom: 12px;
                margin-bottom: 12px;
            }
            .inv-brand {
                align-items: flex-start;
                gap: 10px;
                width: 100%;
            }
            .inv-logo {
                width: 52px;
                height: 52px;
                flex-shrink: 0;
            }
            .inv-company-name {
                font-size: 16px;
                line-height: 1.25;
            }
            .inv-company-sub {
                font-size: 11px;
            }
            .inv-company-addr,
            .inv-company-meta {
                font-size: 10.5px;
            }
            .inv-doc-box {
                width: 100%;
                min-width: 0;
                text-align: left;
                padding: 10px 12px;
                display: grid;
                grid-template-columns: 1fr auto;
                align-items: center;
                gap: 4px 8px;
            }
            .inv-doc-type {
                grid-column: 1 / -1;
            }
            .inv-doc-number {
                font-size: 15px;
                margin: 0;
            }
            .inv-doc-date {
                margin: 0;
                font-size: 11px;
                grid-column: 1 / 2;
            }
            .inv-status-badge {
                grid-column: 2 / 3;
                grid-row: 2 / 4;
                justify-self: end;
                font-size: 9.5px;
                padding: 3px 8px;
            }
            .inv-copy-tag {
                grid-column: 1 / -1;
                margin-top: 2px;
            }
            .inv-parties-grid {
                grid-template-columns: 1fr;
                gap: 10px;
                margin-bottom: 12px;
            }
            .inv-party-card {
                padding: 10px 12px;
            }
            .inv-client-name {
                font-size: 13.5px;
            }
            .inv-client-details {
                flex-direction: column;
                gap: 3px;
                font-size: 11px;
            }
            .inv-pay-line {
                font-size: 11px;
            }
            .inv-table .col-item {
                display: none;
            }
            .inv-table th {
                padding: 7px 6px;
                font-size: 9.5px;
            }
            .inv-table td {
                padding: 8px 6px;
                font-size: 11px;
            }
            .inv-table .col-qty {
                width: auto !important;
            }
            .inv-table .col-unit,
            .inv-table .col-sub {
                width: auto !important;
            }
            .inv-prod-title {
                font-size: 12px;
            }
            .inv-prod-sub {
                flex-direction: column;
                gap: 2px;
                font-size: 10px;
            }
            .inv-bottom-grid {
                grid-template-columns: 1fr;
                gap: 10px;
                margin-bottom: 16px;
            }
            .inv-totals-box {
                order: -1;
                padding: 10px 12px;
            }
            .inv-total-row {
                font-size: 11.5px;
            }
            .inv-total-row.grand-total {
                font-size: 14.5px;
            }
            .inv-notes-box {
                padding: 10px 12px;
            }
            .inv-declaration {
                font-size: 11px;
            }
            .inv-pix-box {
                padding: 8px 10px;
                font-size: 11px;
                word-break: break-word;
            }
            .inv-signatures {
                grid-template-columns: 1fr 1fr;
                gap: 14px;
                padding: 0;
                margin-top: 18px;
                margin-bottom: 12px;
            }
            .inv-sig-name {
                font-size: 11px;
            }
            .inv-sig-role {
                font-size: 9.5px;
            }
            .inv-footer {
                flex-direction: column;
                text-align: center;
                gap: 4px;
                font-size: 9.5px;
            }
        }
    `;
}

export function openSaleReceipt(saleId, event) {
    if (event) event.stopPropagation();
    const sale = state.db.historico.find(h => Number(h.id) === Number(saleId));
    if (!sale) return toast("Venda não encontrada.");

    currentReceiptSaleId = sale.id;
    renderReceiptPreview();
    const modal = document.getElementById("receiptModal");
    if (modal) modal.style.display = "flex";
}

export function openReceiptFromEditModal() {
    const id = parseFloat(document.getElementById("editId")?.value);
    if (!id) return;
    const editModal = document.getElementById("editModal");
    if (editModal) editModal.style.display = "none";
    openSaleReceipt(id);
}

export function closeReceiptModal() {
    const modal = document.getElementById("receiptModal");
    if (modal) modal.style.display = "none";
}

export function renderReceiptPreview() {
    const container = document.getElementById("receiptPreviewContainer");
    if (!container || !currentReceiptSaleId) return;

    const sale = state.db.historico.find(h => Number(h.id) === Number(currentReceiptSaleId));
    if (!sale) return;

    const mode = document.getElementById("receiptCopyMode")?.value || "single";

    let contentHtml = "";
    if (mode === "double") {
        contentHtml = `
            ${buildSingleInvoiceHtml(sale, "1ª Via — Cliente", true)}
            <div class="inv-cut-divider"><span>✂ Corte Aqui • 2ª Via Controle da Granja</span></div>
            ${buildSingleInvoiceHtml(sale, "2ª Via — Controle da Granja", true)}
        `;
    } else {
        contentHtml = buildSingleInvoiceHtml(sale, "Via do Cliente", false);
    }

    container.innerHTML = `<style>${getInvoiceStyles(mode)}</style><div class="a4-page-sheet">${contentHtml}</div>`;
}

export function printSaleReceipt() {
    const sale = state.db.historico.find(h => Number(h.id) === Number(currentReceiptSaleId));
    if (!sale) return toast("Selecione uma venda para imprimir.");

    const emp = getEmpresaConfig();
    const mode = document.getElementById("receiptCopyMode")?.value || "single";
    const numRecibo = String(sale.id || "").slice(-6).padStart(6, "0");
    const docTitle = `Recibo_${numRecibo}_${(sale.cliente || "Cliente").replace(/\s+/g, "_")}`;

    let bodyHtml = "";
    if (mode === "double") {
        bodyHtml = `
            ${buildSingleInvoiceHtml(sale, "1ª Via — Cliente", true)}
            <div class="inv-cut-divider"><span>✂ Corte Aqui • 2ª Via Controle da Granja</span></div>
            ${buildSingleInvoiceHtml(sale, "2ª Via — Controle da Granja", true)}
        `;
    } else {
        bodyHtml = buildSingleInvoiceHtml(sale, "Via do Cliente", false);
    }

    const win = window.open("", "_blank");
    if (!win) return toast("Permita pop-ups no navegador para imprimir o recibo.");

    win.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>${esc(docTitle)} - ${esc(emp.nome || DEFAULT_EMPRESA.nome)}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                @page {
                    size: A4 portrait;
                    margin: ${mode === "double" ? "10mm 12mm" : "14mm 15mm"};
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body {
                    margin: 0;
                    padding: 0;
                    background: #ffffff;
                    color: #0f172a;
                }
                ${getInvoiceStyles(mode)}
            </style>
        </head>
        <body>
            <div class="a4-page-sheet">
                ${bodyHtml}
            </div>
        </body>
        </html>
    `);
    win.document.close();
    win.onload = () => {
        setTimeout(() => {
            win.focus();
            win.print();
        }, 200);
    };
}


export function exportarCSV() {
    const { db } = state;
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
    link.download = `extrato_granja_${getTodayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("CSV exportado!");
}

export function exportarPDF() {
    const { db } = state;
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
        @page { size: A4 portrait; margin: 15mm 16mm; }
        body{font-family:Arial,sans-serif;padding:8mm 10mm;margin:0;color:#172033;box-sizing:border-box;}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}
        th{background:#f1f5f9}
        </style></head><body>
        <h2>Relatório de Vendas e Despesas - Granja Rancho do Viana</h2>
        <p>Emitido em: ${formatarDataBR(getTodayISO())}</p>
        <table><thead><tr><th>Data</th><th>Tipo</th><th>Cliente/Insumo</th><th>Qtd</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
        </body></html>
    `);
    win.document.close();
    win.onload = () => win.print();
}

export function showFinancialReport() {
    const { db, extratoInicio: start, extratoFim: end } = state;

    const periodLabel = document.getElementById("reportPeriodText");
    if (periodLabel) periodLabel.textContent = `Período: ${formatarDataBR(start)} até ${formatarDataBR(end)}`;

    const filtrado = db.historico.filter(item => {
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

export function closeReportModal() {
    document.getElementById("reportModal").style.display = "none";
}

export function printReport() {
    const title = "Relatório Financeiro - Granja Rancho do Viana";
    const period = document.getElementById("reportPeriodText").textContent;
    const table = document.querySelector("#reportModal table").outerHTML;
    const summary = document.getElementById("reportSummaryContent").innerHTML;

    const win = window.open("", "_blank");
    win.document.write(`
        <html><head><title>${title}</title>
        <style>
            @page { size: A4 portrait; margin: 15mm 16mm; }
            body { font-family: sans-serif; padding: 8mm 10mm; margin: 0; color: #172033; line-height: 1.6; box-sizing: border-box; }
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

export function showProductionReport() {
    const { db, dataPeriodoColeta } = state;
    const anoFiltro = dataPeriodoColeta.getFullYear();
    const mesFiltro = dataPeriodoColeta.getMonth();
    const nomeMes = NOMES_MESES[mesFiltro];

    const coletasMes = db.coletas
        .filter(c => {
            const iso = dateToISO(c.data);
            if (!iso) return false;
            const [ano, mes] = iso.split("-").map(Number);
            return ano === anoFiltro && mes === (mesFiltro + 1);
        })
        .sort((a, b) => dateToISO(a.data).localeCompare(dateToISO(b.data)));

    const totalBruto = coletasMes.reduce((acc, c) => acc + (c.bruto || 0), 0);
    const totalPerda = coletasMes.reduce((acc, c) => acc + (c.perda || 0), 0);
    const totalLiquido = coletasMes.reduce((acc, c) => acc + (c.liquido || 0), 0);
    const taxaPerda = totalBruto > 0 ? ((totalPerda / totalBruto) * 100).toFixed(1) : "0.0";

    const diasUnicos = new Set(coletasMes.map(c => dateToISO(c.data)));
    const diasComColeta = diasUnicos.size;
    const mediaDiaria = diasComColeta > 0 ? (totalLiquido / diasComColeta).toFixed(1) : "0";

    const periodLabel = document.getElementById("prodReportPeriodText");
    if (periodLabel) periodLabel.textContent = `Mês de Referência: ${nomeMes} de ${anoFiltro}`;

    const kpisHtml = `
        <div class="card" style="margin: 0; padding: 12px; background: var(--surface-2); text-align: center; border: 1px solid var(--line);">
            <small style="color: var(--muted); font-weight: bold; text-transform: uppercase; font-size: 0.7rem;">Total Coletado</small>
            <b style="font-size: 1.3rem; color: var(--ink); display: block; margin-top: 4px;">${totalBruto.toLocaleString('pt-BR')}</b>
            <span style="font-size: 0.72rem; color: var(--muted);">ovos brutos</span>
        </div>
        <div class="card" style="margin: 0; padding: 12px; background: #ecfdf5; text-align: center; border: 1px solid #a7f3d0;">
            <small style="color: var(--green); font-weight: bold; text-transform: uppercase; font-size: 0.7rem;">Ovos Líquidos</small>
            <b style="font-size: 1.3rem; color: var(--green); display: block; margin-top: 4px;">${totalLiquido.toLocaleString('pt-BR')}</b>
            <span style="font-size: 0.72rem; color: #059669;">aptos para venda</span>
        </div>
        <div class="card" style="margin: 0; padding: 12px; background: #fef2f2; text-align: center; border: 1px solid #fecaca;">
            <small style="color: var(--red); font-weight: bold; text-transform: uppercase; font-size: 0.7rem;">Perdas / Quebras</small>
            <b style="font-size: 1.3rem; color: var(--red); display: block; margin-top: 4px;">${totalPerda.toLocaleString('pt-BR')}</b>
            <span style="font-size: 0.72rem; color: var(--red);">${taxaPerda}% de descarte</span>
        </div>
        <div class="card" style="margin: 0; padding: 12px; background: #eff6ff; text-align: center; border: 1px solid #bfdbfe;">
            <small style="color: var(--blue); font-weight: bold; text-transform: uppercase; font-size: 0.7rem;">Média Diária</small>
            <b style="font-size: 1.3rem; color: var(--blue); display: block; margin-top: 4px;">${mediaDiaria}</b>
            <span style="font-size: 0.72rem; color: var(--blue);">ovos / dia (${diasComColeta} dias)</span>
        </div>
    `;
    const kpisEl = document.getElementById("prodReportKPIs");
    if (kpisEl) kpisEl.innerHTML = kpisHtml;

    const prods30 = db.produtos.filter(p => Number(p.ovosPorItem) === 30);
    const prods12 = db.produtos.filter(p => Number(p.ovosPorItem) === 12);

    const preco30 = prods30.length > 0 ? prods30[0].preco : 0;
    const preco12 = prods12.length > 0 ? prods12[0].preco : 0;
    const nomeProd30 = prods30.length > 0 ? prods30[0].nome : "Bandeja 30 Ovos";
    const nomeProd12 = prods12.length > 0 ? prods12[0].nome : "Bandeja 12 Ovos";

    const qtd30Decimal = (totalLiquido / 30);
    const qtd30Int = Math.floor(totalLiquido / 30);
    const sobra30 = totalLiquido % 30;
    const valorTotal30 = qtd30Decimal * preco30;

    const qtd12Decimal = (totalLiquido / 12);
    const qtd12Int = Math.floor(totalLiquido / 12);
    const sobra12 = totalLiquido % 12;
    const valorTotal12 = qtd12Decimal * preco12;

    const packagingHtml = `
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; padding: 16px; border-radius: 12px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase;">Embalagem 30 Ovos</span>
                    <h4 style="margin: 8px 0 2px; font-size: 1.25rem;">${esc(nomeProd30)}</h4>
                    <small style="opacity: 0.85; font-size: 0.8rem;">Unitário cadastrado: <b>${money(preco30)}</b></small>
                </div>
                <div style="font-size: 1.8rem; opacity: 0.3;"><i class="fas fa-layer-group"></i></div>
            </div>
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="font-size: 0.75rem; opacity: 0.85;">Total de Bandejas:</div>
                    <b style="font-size: 1.4rem;">${qtd30Int} <span style="font-size: 0.85rem; font-weight: normal;">(+${sobra30} ovos)</span></b>
                    <div style="font-size: 0.72rem; opacity: 0.8;">(${qtd30Decimal.toFixed(1)} bandejas exatas)</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; opacity: 0.85;">Faturamento Est.:</div>
                    <b style="font-size: 1.4rem; color: #6ee7b7;">${money(valorTotal30)}</b>
                </div>
            </div>
        </div>

        <div style="background: linear-gradient(135deg, #065f46, #059669); color: white; padding: 16px; border-radius: 12px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase;">Embalagem 12 Ovos (Dúzia)</span>
                    <h4 style="margin: 8px 0 2px; font-size: 1.25rem;">${esc(nomeProd12)}</h4>
                    <small style="opacity: 0.85; font-size: 0.8rem;">Unitário cadastrado: <b>${money(preco12)}</b></small>
                </div>
                <div style="font-size: 1.8rem; opacity: 0.3;"><i class="fas fa-egg"></i></div>
            </div>
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="font-size: 0.75rem; opacity: 0.85;">Total de Estojos/Dúzias:</div>
                    <b style="font-size: 1.4rem;">${qtd12Int} <span style="font-size: 0.85rem; font-weight: normal;">(+${sobra12} ovos)</span></b>
                    <div style="font-size: 0.72rem; opacity: 0.8;">(${qtd12Decimal.toFixed(1)} estojos exatos)</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; opacity: 0.85;">Faturamento Est.:</div>
                    <b style="font-size: 1.4rem; color: #a7f3d0;">${money(valorTotal12)}</b>
                </div>
            </div>
        </div>
    `;
    const packEl = document.getElementById("prodReportPackagingCards");
    if (packEl) packEl.innerHTML = packagingHtml;

    const prodsTableBody = document.getElementById("prodReportProductsBody");
    if (prodsTableBody) {
        if (db.produtos.length === 0) {
            prodsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--muted);">Nenhum produto cadastrado na aba Dados.</td></tr>';
        } else {
            prodsTableBody.innerHTML = db.produtos.map((p, idx) => {
                const ovosItem = Number(p.ovosPorItem) || 0;
                const qtdEquiv = ovosItem > 0 ? (totalLiquido / ovosItem) : 0;
                const qtdInt = ovosItem > 0 ? Math.floor(totalLiquido / ovosItem) : 0;
                const sobra = ovosItem > 0 ? (totalLiquido % ovosItem) : 0;
                const valorEst = qtdEquiv * (Number(p.preco) || 0);
                const rowBg = idx % 2 === 1 ? "#f9fafb" : "#ffffff";

                return `
                    <tr style="background: ${rowBg};">
                        <td style="padding: 10px; border: 1px solid var(--line); font-weight: 600;">${esc(p.nome)}</td>
                        <td style="padding: 10px; border: 1px solid var(--line); text-align: center;"><span class="badge blue" style="font-size:0.7rem;">${esc(p.tipoOvo || "Geral")}</span></td>
                        <td style="padding: 10px; border: 1px solid var(--line); text-align: center;">${ovosItem} ovos</td>
                        <td style="padding: 10px; border: 1px solid var(--line); text-align: right; font-weight: 600;">${money(p.preco)}</td>
                        <td style="padding: 10px; border: 1px solid var(--line); text-align: center;">
                            <b>${qtdInt} un</b> <small style="color:var(--muted)">(${qtdEquiv.toFixed(1)} / +${sobra} ovos)</small>
                        </td>
                        <td style="padding: 10px; border: 1px solid var(--line); text-align: right; font-weight: bold; color: var(--green);">
                            ${money(valorEst)}
                        </td>
                    </tr>
                `;
            }).join("");
        }
    }

    const tiposMap = {};
    coletasMes.forEach(c => {
        const tipo = c.tipo || "Grande";
        if (!tiposMap[tipo]) {
            tiposMap[tipo] = { bruto: 0, perda: 0, liquido: 0 };
        }
        tiposMap[tipo].bruto += (c.bruto || 0);
        tiposMap[tipo].perda += (c.perda || 0);
        tiposMap[tipo].liquido += (c.liquido || 0);
    });

    const tiposKeys = Object.keys(tiposMap);
    const typeSection = document.getElementById("prodReportTypeSection");
    const typeContent = document.getElementById("prodReportTypeContent");

    if (typeSection && typeContent) {
        if (tiposKeys.length > 0) {
            typeSection.style.display = "block";
            typeContent.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    ${tiposKeys.map(tipo => {
                        const dadosTipo = tiposMap[tipo];
                        const band30 = (dadosTipo.liquido / 30).toFixed(1);
                        const band12 = (dadosTipo.liquido / 12).toFixed(1);
                        return `
                            <div class="card" style="margin:0; padding: 12px; background: var(--surface-2); border: 1px solid var(--line);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                                    <b style="color: var(--ink); font-size: 1rem;">Ovos ${esc(tipo)}</b>
                                    <span class="badge blue" style="font-size:0.7rem;">${dadosTipo.liquido.toLocaleString('pt-BR')} ovos</span>
                                </div>
                                <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 6px;">
                                    Coletados: ${dadosTipo.bruto} · Perdas: ${dadosTipo.perda}
                                </div>
                                <div style="font-size: 0.8rem; border-top: 1px dashed var(--line); padding-top: 6px; display: flex; justify-content: space-between;">
                                    <span>Bandejas 30: <b>${band30}</b></span>
                                    <span>Bandejas 12: <b>${band12}</b></span>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
        } else {
            typeSection.style.display = "none";
        }
    }

    const dailyBody = document.getElementById("prodReportDailyBody");
    const daysCountEl = document.getElementById("prodReportDaysCount");
    if (daysCountEl) daysCountEl.textContent = `${coletasMes.length} registros (${diasComColeta} dias)`;

    if (dailyBody) {
        if (coletasMes.length === 0) {
            dailyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--muted);">Nenhuma coleta registrada neste mês.</td></tr>';
        } else {
            dailyBody.innerHTML = coletasMes.map((c, idx) => {
                const percPerda = c.bruto > 0 ? ((c.perda / c.bruto) * 100).toFixed(0) : "0";
                const rowBg = idx % 2 === 1 ? "#f9fafb" : "#ffffff";
                return `
                    <tr style="background: ${rowBg};">
                        <td style="padding: 8px 10px; border-bottom: 1px solid var(--line); font-weight: 500;">${formatarDataBR(c.data)}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid var(--line);">${esc(c.tipo)}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right;">${c.bruto}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right; color: ${c.perda > 0 ? 'var(--red)' : 'var(--muted)'};">
                            ${c.perda} ${c.perda > 0 ? `<small style="font-size:0.65rem">(${percPerda}%)</small>` : ''}
                        </td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right; font-weight: bold; color: var(--green);">${c.liquido}</td>
                    </tr>
                `;
            }).join("");
        }
    }

    document.getElementById("productionReportModal").style.display = "flex";
}

export function closeProductionReportModal() {
    document.getElementById("productionReportModal").style.display = "none";
}

export function printProductionReport() {
    const { dataPeriodoColeta } = state;
    const anoFiltro = dataPeriodoColeta.getFullYear();
    const mesFiltro = dataPeriodoColeta.getMonth();
    const nomeMes = NOMES_MESES[mesFiltro];
    const title = `Relatório de Produção - ${nomeMes} de ${anoFiltro} - Granja Rancho do Viana`;

    const kpisHtml = document.getElementById("prodReportKPIs")?.innerHTML || "";
    const tables = document.querySelectorAll("#productionReportModal table");
    const productsTable = tables[0]?.outerHTML || "";
    const dailyTable = tables[1]?.outerHTML || "";

    const win = window.open("", "_blank");
    win.document.write(`
        <html>
        <head>
            <title>${title}</title>
            <style>
                @page { size: A4; margin: 15mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #172033; padding: 20px; line-height: 1.4; font-size: 12px; }
                .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
                .header h1 { margin: 0; font-size: 22px; color: #172033; text-transform: uppercase; }
                .header p { margin: 4px 0 0; color: #2563eb; font-weight: bold; font-size: 14px; }
                .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
                .kpi-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; background: #f8fafc; }
                .section-title { font-size: 13px; font-weight: bold; color: #172033; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
                th, td { border: 1px solid #dfe7ef; padding: 6px 8px; text-align: left; }
                th { background: #f1f5f9; font-weight: bold; }
                tr:nth-child(even) { background: #fafafa; }
                .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Granja Rancho do Viana</h1>
                <p>Relatório de Produção Mensal - ${nomeMes} / ${anoFiltro}</p>
                <small style="color: #64748b;">Emitido em: ${formatarDataBR(getTodayISO())}</small>
            </div>

            <div class="section-title">Indicadores de Produção</div>
            <div class="kpis">
                ${kpisHtml}
            </div>

            <div class="section-title">Projeção por Produtos Cadastrados (Aba Dados)</div>
            ${productsTable}

            <div class="section-title">Histórico de Coletas Diárias</div>
            ${dailyTable}

            <div class="footer">
                Granja Rancho do Viana • Sistema de Gestão Avícola
            </div>
        </body>
        </html>
    `);
    win.document.close();
    win.onload = () => win.print();
}

