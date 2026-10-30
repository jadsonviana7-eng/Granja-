export const STORE_KEY = "granjaViana_supabase_cache";
export const COMPANY_STORE_KEY = "granjaViana_empresa_config";
export const LOGS_STORE_KEY = "granjaViana_system_logs";

export const LOW_SUPPLY_THRESHOLD = 15;
export const CRITICAL_SUPPLY_THRESHOLD = 5;

export const DEFAULT_EMPRESA = {
    nome: "Granja Rancho do Viana",
    subtitulo: "Criando com Qualidade · Produção e Comercialização de Ovos",
    documento: "",
    responsavel: "",
    telefone: "",
    email: "",
    endereco: "",
    chavePix: "",
    favorecidoPix: "",
    mensagemRodape: "Obrigado pela preferência! Produtos frescos e selecionados direto da granja."
};

export const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const FEED_PHASES = {
    inicial: { label: "Inicial", consumoKgDia: 0.04 },
    crescimento: { label: "Crescimento", consumoKgDia: 0.08 },
    prePostura: { label: "Pré-Postura", consumoKgDia: 0.10 },
    postura: { label: "Postura", consumoKgDia: 0.12 }
};

export const LEGACY_PHASES = {
    cria: "inicial",
    recria: "crescimento"
};

export const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

export const TABS = [
    ["page-visao-geral", "Início", "dashboard"],
    ["page-venda", "Vendas", "venda"],
    ["page-producao", "Produção", "producao"],
    ["page-cadastro", "Dados", "cadastro"],
    ["page-configuracoes", "Ajustes", "config"]
];

