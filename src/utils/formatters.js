import { FEED_PHASES } from '../config/constants.js';

export const padZero = (n) => String(n).padStart(2, '0');

export function getTodayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function esc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function money(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value) || 0);
}

export function formatNumber(value, decimals = 2) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(decimals);
}

export function dateToISO(dataStr) {
    if (!dataStr) return "";
    const clean = String(dataStr).split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.split("/");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return clean;
}

export function formatarDataBR(dataStr) {
    const iso = dateToISO(dataStr);
    if (!iso || !iso.includes("-")) return dataStr || "";
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
}

export function getInsumoUnit(insumo) {
    return insumo && insumo.tipoConsumo !== "GERAL" ? "kg" : "un";
}

export function isRacao(insumo) {
    return insumo && insumo.tipoConsumo !== "GERAL";
}

export function getPhaseLabel(fase) {
    return FEED_PHASES[fase]?.label || "Geral";
}

export function normalizeEggType(tipo) {
    return tipo === "Médio" ? "Medio" : (tipo || "Grande");
}

export function formatarCampoMoeda(e) {
    let value = e.target.value.replace(/\D/g, "");
    value = (value / 100).toFixed(2).replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    e.target.value = "R$ " + value;
}

export function formatarCampoTelefone(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 11) v = v.substring(0, 11);

    if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (v.length > 6) {
        v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
    } else if (v.length > 0) {
        v = v.replace(/^(\d{0,2})/, "($1");
    }
    e.target.value = v;
}

export function formatarCpfCnpj(valor) {
    let v = String(valor || "").replace(/\D/g, "");
    if (v.length > 14) v = v.substring(0, 14);

    if (v.length <= 11) {
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    return v;
}

export function formatarCampoCpfCnpj(e) {
    e.target.value = formatarCpfCnpj(e.target.value);
}

export function getValueFromMask(idOrElement) {
    const el = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
    if (!el) return 0;
    const digits = el.value.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(digits) / 100;
}

export function setupCurrencyMasks() {
    const inputs = [
        "productPrice", "saleUnitValue", "saleDiscount",
        "expenseUnitValue", "editProdPrice", "editUnit", "editDisc"
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (!el.value || el.value === "0") el.value = money(0);
            el.addEventListener("input", formatarCampoMoeda);
        }
    });
}

export function setupPhoneMasks() {
    const inputs = ["clientPhone", "editClientPhone", "profile-edit-phone", "companyPhone"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", formatarCampoTelefone);
        }
    });

    const docInputs = ["companyDoc"];
    docInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", formatarCampoCpfCnpj);
        }
    });
}

export function setDefaultDates() {
    const today = getTodayISO();
    const saleDate = document.getElementById("saleDate");
    const prodDate = document.getElementById("prodDate");
    const modalProdDate = document.getElementById("modalProdDate");
    const expenseDate = document.getElementById("expenseDate");

    if (saleDate) saleDate.value = today;
    if (prodDate) prodDate.value = today;
    if (modalProdDate) modalProdDate.value = today;
    if (expenseDate) expenseDate.value = today;
}

