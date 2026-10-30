import './styles/main.css';

import { STORE_KEY } from './config/constants.js';
import { registerRenderCallback, loadDb, save } from './state/store.js';
import {
    toggleAuthMode,
    handleLogin,
    handleSignUp,
    handleLogout,
    closeLogoutModal,
    confirmLogout,
    checkAuthState,
    handlePhotoUpload,
    confirmCrop,
    cancelCrop,
    openUserEditModal,
    closeUserEditModal,
    handleUserEdit,
    renderUsers,
    handleDeleteUser,
    toggleUserDropdown,
    openUserCreateModal,
    closeUserCreateModal,
    handleCreateUser
} from './domain/auth.js';
import {
    renderStock,
    renderPlantel,
    saveGalinhas,
    processarConsumoRacao
} from './domain/estoque.js';
import {
    renderColetas,
    mudarPeriodoColeta,
    openProductionModal,
    closeProductionModal,
    handleProduction,
    handleModalProduction,
    openColetaEditModal,
    closeColetaEditModal,
    calcEditColetaLiquid,
    handleColetaEdit
} from './domain/producao.js';
import {
    renderSelects,
    renderLists,
    openCompositionModal,
    closeCompositionModal,
    updateCompositionSummary,
    openProductEditModal,
    closeProductEditModal,
    openClientEditModal,
    closeClientEditModal,
    openInsumoEditModal,
    closeInsumoEditModal,
    toggleUnitIndicator,
    toggleEditUnitIndicator,
    handleInsumo,
    handleInsumoEdit,
    handleClient,
    handleClientEdit,
    handleProduct,
    handleProductEdit
} from './domain/cadastros.js';
import {
    renderFinance,
    renderExtract,
    openSaleModal,
    closeSaleModal,
    openExpenseModal,
    closeExpenseModal,
    updateExpenseInsumoFields,
    calculateSaleTotal,
    updateProductPrice,
    calculateExpenseTotal,
    toggleExpenseInstallments,
    handleSale,
    handleExpense,
    deleteItem,
    openEditModal,
    closeEditModal,
    togglePaymentDateField,
    calcEditTotal,
    handleEdit,
    deleteCurrentItem
} from './domain/financeiro.js';
import {
    renderDashboard,
    mudarPeriodoDashboard,
    setupPeriodoPicker,
    setupExtratoPicker
} from './ui/dashboard.js';
import {
    exportarCSV,
    exportarPDF,
    showFinancialReport,
    closeReportModal,
    printReport,
    showProductionReport,
    closeProductionReportModal,
    printProductionReport,
    renderCompanyConfig,
    handleCompanyConfigSave,
    openSaleReceipt,
    openReceiptFromEditModal,
    closeReceiptModal,
    renderReceiptPreview,
    printSaleReceipt
} from './ui/reports.js';
import {
    buildTabs,
    showPage,
    switchSubCadastro,
    switchSubConfig,
    renderSubTabsIcons,
    decorateCardHeaders,
    setupPwaInstallButton
} from './ui/navigation.js';
import { setDefaultDates, setupCurrencyMasks, setupPhoneMasks } from './utils/formatters.js';
import { renderSystemLogs, exportarLogsCSV } from './services/logger.js';
import { toast } from './utils/icons.js';

export function render() {
    renderStock();
    renderSelects();
    renderLists();
    renderFinance();
    renderExtract();
    renderColetas();
    renderPlantel();
    renderDashboard();
    renderUsers();
    renderCompanyConfig();
    renderSystemLogs();
    renderSubTabsIcons();
    updateExpenseInsumoFields();
    toggleUnitIndicator();
}

registerRenderCallback(render);

export function resetApp() {
    if (!confirm("Zerar todos os dados locais?")) return;
    localStorage.removeItem(STORE_KEY);
    loadDb();
    save();
    setDefaultDates();
    toast("Dados locais zerados.");
}

function bindForms() {
    document.getElementById("login-form")?.addEventListener("submit", handleLogin);
    document.getElementById("signup-form")?.addEventListener("submit", handleSignUp);

    document.getElementById("saleForm")?.addEventListener("submit", handleSale);
    document.getElementById("productionForm")?.addEventListener("submit", handleProduction);
    document.getElementById("modalProductionForm")?.addEventListener("submit", handleModalProduction);
    document.getElementById("expenseForm")?.addEventListener("submit", handleExpense);
    document.getElementById("insumoForm")?.addEventListener("submit", handleInsumo);
    document.getElementById("insumoEditForm")?.addEventListener("submit", handleInsumoEdit);
    document.getElementById("clientForm")?.addEventListener("submit", handleClient);
    document.getElementById("clientEditForm")?.addEventListener("submit", handleClientEdit);
    document.getElementById("productForm")?.addEventListener("submit", handleProduct);
    document.getElementById("productEditForm")?.addEventListener("submit", handleProductEdit);
    document.getElementById("editForm")?.addEventListener("submit", handleEdit);
    document.getElementById("coletaEditForm")?.addEventListener("submit", handleColetaEdit);
    document.getElementById("userEditForm")?.addEventListener("submit", handleUserEdit);
    document.getElementById("profile-edit-form")?.addEventListener("submit", handleCreateUser);
    document.getElementById("companyConfigForm")?.addEventListener("submit", handleCompanyConfigSave);

    document.getElementById("filterType")?.addEventListener("change", renderExtract);
    document.getElementById("editStatus")?.addEventListener("change", togglePaymentDateField);

    window.addEventListener("click", () => {
        document.getElementById("user-dropdown")?.classList.remove("show");
    });

    const panel = document.getElementById("stockPanel");
    if (panel) {
        panel.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                panel.classList.toggle("is-hidden");
            }
        });
    }
}

// Expõe handlers chamados por atributos HTML (retrocompatibilidade limpa)
Object.assign(window, {
    toggleAuthMode,
    handleLogout,
    closeLogoutModal,
    confirmLogout,
    toggleUserDropdown,
    showPage,
    switchSubCadastro,
    switchSubConfig,
    mudarPeriodoDashboard,
    mudarPeriodoColeta,
    openSaleModal,
    closeSaleModal,
    openExpenseModal,
    closeExpenseModal,
    openProductionModal,
    closeProductionModal,
    handleModalProduction,
    openColetaEditModal,
    closeColetaEditModal,
    calcEditColetaLiquid,
    handleColetaEdit,
    openCompositionModal,
    closeCompositionModal,
    updateCompositionSummary,
    openProductEditModal,
    closeProductEditModal,
    openClientEditModal,
    closeClientEditModal,
    openInsumoEditModal,
    closeInsumoEditModal,
    openUserEditModal,
    closeUserEditModal,
    handleUserEdit,
    handleDeleteUser,
    openUserCreateModal,
    closeUserCreateModal,
    handleCreateUser,
    handlePhotoUpload,
    confirmCrop,
    cancelCrop,
    saveGalinhas,
    toggleUnitIndicator,
    toggleEditUnitIndicator,
    updateProductPrice,
    calculateSaleTotal,
    updateExpenseInsumoFields,
    calculateExpenseTotal,
    toggleExpenseInstallments,
    openEditModal,
    closeEditModal,
    calcEditTotal,
    togglePaymentDateField,
    deleteCurrentItem,
    deleteItem,
    exportarCSV,
    exportarPDF,
    showFinancialReport,
    closeReportModal,
    printReport,
    showProductionReport,
    closeProductionReportModal,
    printProductionReport,
    openSaleReceipt,
    openReceiptFromEditModal,
    closeReceiptModal,
    renderReceiptPreview,
    printSaleReceipt,
    renderSystemLogs,
    exportarLogsCSV,
    resetApp
});

async function init() {
    checkAuthState();
    buildTabs();
    decorateCardHeaders();
    bindForms();
    setupPwaInstallButton();
    setDefaultDates();
    await processarConsumoRacao();
    render();
    setupPeriodoPicker();
    setupExtratoPicker();
    setupCurrencyMasks();
    setupPhoneMasks();
    showPage("page-visao-geral");
}

document.addEventListener("DOMContentLoaded", init);

