import { TABS } from '../config/constants.js';
import { isCurrentUserAdmin } from '../state/store.js';
import { renderInsumosNoProduto } from '../domain/cadastros.js';
import { renderPlantel } from '../domain/estoque.js';
import { esc } from '../utils/formatters.js';
import { iconSvg, makeHeaderIcon, toast } from '../utils/icons.js';

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installSection = document.getElementById("pwa-install-section");
    if (installSection) installSection.style.display = "block";
});

export function setupPwaInstallButton() {
    const installButton = document.getElementById("installAppBtn");
    const installSection = document.getElementById("pwa-install-section");
    if (!installButton) return;

    installButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        if (installSection) installSection.style.display = "none";
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
    });

    if (deferredInstallPrompt && installSection) {
        installSection.style.display = "block";
    }

    window.addEventListener("appinstalled", () => {
        if (installSection) installSection.style.display = "none";
        deferredInstallPrompt = null;
        toast("App instalado com sucesso!");
    });
}

export function switchSubCadastro(id, btn) {
    document.querySelectorAll('.sub-page-cadastro').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));

    document.getElementById(id)?.classList.add('active');
    btn?.classList.add('active');
}

export function switchSubConfig(id, btn) {
    document.querySelectorAll('.sub-page-config').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.config-sub-tab').forEach(b => b.classList.remove('active'));

    document.getElementById(id)?.classList.add('active');
    if (btn) {
        btn.classList.add('active');
    } else {
        document.querySelector(`.config-sub-tab[data-target="${id}"]`)?.classList.add('active');
    }
}

export function renderSubTabsIcons() {
    document.querySelectorAll('.sub-tab').forEach(btn => {
        const iconName = btn.dataset.icon;
        if (iconName) {
            const label = btn.textContent.trim();
            btn.innerHTML = `${iconSvg(iconName)}<span>${esc(label)}</span>`;
        }
    });
}

export function decorateCardHeaders() {
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
        ["Editar Usuário", "usuarios"],
        ["Editar Insumo", "insumo"],
        ["Editar Coleta", "producao"],
        ["Nova Coleta", "producao"]
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

export function buildTabs() {
    const html = TABS.map(([id, label, icon]) => (
        `<button class="tab-btn" data-page="${id}" onclick="showPage('${id}')">${iconSvg(icon)}<span>${esc(label)}</span></button>`
    )).join("");

    const top = document.getElementById("topTabs");
    const bottom = document.getElementById("bottomTabs");
    if (top) top.innerHTML = html;
    if (bottom) bottom.innerHTML = html;
}

export function showPage(id) {
    if (id === "page-configuracoes" && !isCurrentUserAdmin()) {
        toast("Acesso restrito a administradores.");
        return;
    }
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    document.getElementById(id)?.classList.add("active");
    document.querySelectorAll(`[data-page="${id}"]`).forEach(btn => btn.classList.add("active"));

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

