import { createClient } from '@supabase/supabase-js';
import { STORE_KEY, COMPANY_STORE_KEY, LOGS_STORE_KEY } from '../config/constants.js';
import {
    state,
    normalizeDatabase,
    normalizeProduto,
    normalizeInsumo,
    normalizeHistorico,
    normalizeColeta,
    normalizeEmpresa,
    triggerRender
} from '../state/store.js';
import { getInsumoUnit, getPhaseLabel } from '../utils/formatters.js';
import { toast } from '../utils/icons.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://kbmvwzzdisvefkseztua.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibXZ3enpkaXN2ZWZrc2V6dHVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDg1NzEsImV4cCI6MjA5NjcyNDU3MX0.9PQuzAC_oxsjM5MnWw_f9a_9B-WpgfWe2IPhogiRGnQ";

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

export function createCloudPayload() {
    const banco = normalizeDatabase(JSON.parse(JSON.stringify(state.db)));

    const produtosParaNuvem = banco.produtos.map(p => ({
        ...p,
        composicao: Array.isArray(p.composicao) ? JSON.stringify(p.composicao) : p.composicao
    }));

    const estoqueInsumos = banco.insumos.map(i => ({
        item: i.nome,
        grupo: i.tipoConsumo === "GERAL" ? "Insumo geral" : `Ração ${getPhaseLabel(i.tipoConsumo)}`,
        quantidade: i.qtd,
        unidade: i.unidade || getInsumoUnit(i)
    }));

    const estoqueOvos = Object.keys(banco.estoque).map(tipo => ({
        item: `Ovo ${tipo}`,
        grupo: "Ovos",
        quantidade: banco.estoque[tipo],
        unidade: "un"
    }));

    return {
        schemaVersion: 3,
        app: "granja-rancho-do-viana",
        updatedAt: new Date().toISOString(),
        ...banco,
        produtos: produtosParaNuvem,
        backupCompleto: banco,
        organizado: {
            estoque_geral: [...estoqueOvos, ...estoqueInsumos],
            producao: banco.coletas,
            extrato: banco.historico,
            plantel: banco.config.plantel,
            cadastros: {
                clientes: banco.clientes,
                produtos: produtosParaNuvem,
                insumos: banco.insumos
            }
        }
    };
}

export async function syncToSupabase() {
    console.log("Sincronização individual direta habilitada.");
}

export async function loadFromSupabase() {
    if (!supabaseClient) return;
    const { db } = state;

    try {
        const [resTrans, resProd, resCli, resColetas, resInsumos, resUsers, resPlantel, resGranjaData, resEmpresaTable, resLogsTable] = await Promise.all([
            supabaseClient.from('transacoes').select('*'),
            supabaseClient.from('produtos').select('*'),
            supabaseClient.from('clientes').select('*'),
            supabaseClient.from('producao_diaria').select('*'),
            supabaseClient.from('insumos').select('*'),
            supabaseClient.from('usuarios').select('*'),
            supabaseClient.from('plantel').select('*'),
            supabaseClient.from('granja_data').select('id, db_content, updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
            supabaseClient.from('empresa').select('*').eq('id', 1).maybeSingle(),
            supabaseClient.from('logs_sistema').select('*').order('data_hora', { ascending: false }).limit(250)
        ]);

        if (resTrans.error) console.warn("Erro Transações:", resTrans.error);
        if (resProd.error) console.warn("Erro Produtos:", resProd.error);
        if (resCli.error) console.warn("Erro Clientes:", resCli.error);
        if (resUsers.error) console.error("Erro ao carregar usuários:", resUsers.error);
        if (resPlantel.error) console.warn("Erro Plantel:", resPlantel.error);

        // Dados da Empresa (Cabeçalho de Recibos) - lê da tabela `empresa` (se existir) ou de `granja_data.db_content`
        let empresaRemota = null;
        if (!resEmpresaTable.error && resEmpresaTable.data) {
            const d = resEmpresaTable.data;
            empresaRemota = {
                nome: d.nome,
                subtitulo: d.subtitulo,
                documento: d.documento,
                responsavel: d.responsavel,
                telefone: d.telefone,
                endereco: d.endereco,
                email: d.email,
                chavePix: d.chave_pix,
                favorecidoPix: d.favorecido_pix || "",
                mensagemRodape: d.mensagem_rodape
            };
        } else if (!resGranjaData.error && resGranjaData.data?.db_content) {
            const content = resGranjaData.data.db_content;
            empresaRemota = content.empresa || content.config?.empresa || null;
        }

        if (empresaRemota) {
            db.config.empresa = normalizeEmpresa(empresaRemota);
            localStorage.setItem(COMPANY_STORE_KEY, JSON.stringify(db.config.empresa));
        }

        // Logs de Auditoria do Sistema - lê da tabela `logs_sistema` (se existir) ou `granja_data.db_content.logs`
        if (!resLogsTable.error && Array.isArray(resLogsTable.data) && resLogsTable.data.length > 0) {
            db.logs = resLogsTable.data;
            localStorage.setItem(LOGS_STORE_KEY, JSON.stringify(db.logs));
        } else if (!resGranjaData.error && Array.isArray(resGranjaData.data?.db_content?.logs)) {
            db.logs = resGranjaData.data.db_content.logs;
            localStorage.setItem(LOGS_STORE_KEY, JSON.stringify(db.logs));
        }

        // Plantel
        db.config.plantel = { inicial: 0, crescimento: 0, prePostura: 0, postura: 0 };
        (resPlantel.data || []).forEach(p => {
            const faseVindaDoBanco = String(p.fase || "");
            const quantidade = Number(p.quantidade_aves) || 0;
            const chaveCorreta = Object.keys(db.config.plantel).find(k => k.toLowerCase() === faseVindaDoBanco.toLowerCase());
            if (chaveCorreta) {
                db.config.plantel[chaveCorreta] = quantidade;
            }
        });

        // Usuários
        db.usuarios = (resUsers.data || []).map(u => ({
            id: u.id,
            full_name: u.full_name || 'Sem nome',
            email: u.email,
            phone: u.phone || '',
            role: u.role || 'common',
            avatar_url: u.avatar_url
        }));

        // Clientes
        db.clientes = (resCli.data || []).map(c => ({
            id: c.id,
            nome: c.nome,
            telefone: c.telefone || '',
            cidade: c.cidade || ''
        }));

        // Produtos
        db.produtos = (resProd.data || []).map(p => normalizeProduto({
            id: p.id,
            nome: p.nome,
            preco: Number(p.preco_padrao) || 0,
            tipoOvo: p.tipo_ovo || 'Grande',
            ovosPorItem: p.ovos_por_item || 0,
            composicao: p.composicao || []
        }));

        // Insumos
        if (!resInsumos.error && resInsumos.data?.length > 0) {
            db.insumos = resInsumos.data.map(i => normalizeInsumo({
                id: i.id,
                nome: i.nome,
                tipoConsumo: i.tipo_consumo,
                qtd: Number(i.qtd) || 0,
                unidade: i.unidade || 'un'
            }));
        }

        // Histórico de transações
        db.historico = (resTrans.data || []).map(t => {
            const cliente = (resCli.data || []).find(c => c.id === t.cliente_id);
            const produto = (resProd.data || []).find(p => p.id === t.produto_id);
            return normalizeHistorico({
                id: t.id,
                data: t.data_transacao,
                tipo: t.tipo,
                cliente: cliente?.nome || '',
                produto: produto?.nome || '',
                cliente_id: t.cliente_id,
                produto_id: t.produto_id,
                qtd: t.quantidade,
                valorUnitario: Number(t.valor_unitario) || 0,
                desconto: Number(t.desconto) || 0,
                valor: Number(t.valor_total) || 0,
                descricao: t.descricao || '',
                status: t.status || 'pago',
                dataPagamento: t.data_pagamento || ''
            });
        });

        // Coletas de produção
        if (!resColetas.error && resColetas.data) {
            db.coletas = resColetas.data.map(c => {
                let tipo = c.tipo_ovo;
                if (!tipo && c.observacoes && c.observacoes.includes("Tipo:")) {
                    const match = c.observacoes.match(/Tipo:\s*([A-Za-zÀ-ÿ]+)/);
                    if (match) tipo = match[1];
                }
                return normalizeColeta({
                    id: c.id,
                    data: c.data_coleta,
                    tipo: tipo || 'Grande',
                    bruto: (c.quantidade_ovos_bons || 0) + (c.quantidade_ovos_quebrados || 0),
                    perda: c.quantidade_ovos_quebrados || 0,
                    liquido: c.quantidade_ovos_bons || 0
                });
            });
        }

        // Reconstrução do Estoque de Ovos
        db.estoque = { Grande: 0, Medio: 0, Pequeno: 0 };
        db.coletas.forEach(c => {
            if (db.estoque[c.tipo] !== undefined) db.estoque[c.tipo] += c.liquido;
        });
        db.historico.forEach(h => {
            if (h.tipo === "VENDA") {
                const prod = db.produtos.find(p => p.nome === h.produto);
                if (prod && prod.tipoOvo && db.estoque[prod.tipoOvo] !== undefined) {
                    db.estoque[prod.tipoOvo] -= (prod.ovosPorItem * h.qtd);
                }
            }
        });

        localStorage.setItem(STORE_KEY, JSON.stringify(db));
        triggerRender();
    } catch (error) {
        console.error("Erro ao carregar dados do Supabase:", error);
        toast("Supabase indisponível. Usando dados locais.");
    }
}

export async function dbSalvarTransacao(novaTransacao) {
    if (!supabaseClient) return;

    try {
        let clienteId = null;
        let produtoId = null;

        if (novaTransacao.tipo === 'VENDA' && novaTransacao.cliente) {
            const { data: cli } = await supabaseClient.from('clientes')
                .select('id').eq('nome', novaTransacao.cliente).maybeSingle();

            if (cli) {
                clienteId = cli.id;
            } else {
                const { data: novoCli } = await supabaseClient.from('clientes')
                    .insert({ nome: novaTransacao.cliente }).select().single();
                clienteId = novoCli?.id || null;
            }
        }

        if (novaTransacao.produto) {
            const { data: prod } = await supabaseClient.from('produtos')
                .select('id').eq('nome', novaTransacao.produto).maybeSingle();

            if (prod) {
                produtoId = prod.id;
            } else {
                const { data: novoProd } = await supabaseClient.from('produtos')
                    .insert({ nome: novaTransacao.produto }).select().single();
                produtoId = novoProd?.id || null;
            }
        }

        const objetoBanco = {
            id: novaTransacao.id,
            data_transacao: novaTransacao.data,
            tipo: novaTransacao.tipo,
            cliente_id: clienteId,
            produto_id: produtoId,
            quantidade: novaTransacao.qtd,
            valor_unitario: novaTransacao.valorUnitario,
            desconto: novaTransacao.desconto,
            valor_total: novaTransacao.valor,
            descricao: novaTransacao.descricao,
            status: novaTransacao.status,
            data_pagamento: novaTransacao.dataPagamento || null
        };

        const { error } = await supabaseClient.from('transacoes').upsert(objetoBanco);
        if (error) throw error;
    } catch (error) {
        console.error("Erro ao salvar transação no banco:", error);
        toast("Erro ao salvar no servidor");
    }
}

export async function dbSalvarColeta(novaColeta) {
    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient.from('producao_diaria').upsert({
            data_coleta: novaColeta.data,
            tipo_ovo: novaColeta.tipo || 'Grande',
            quantidade_ovos_bons: novaColeta.bons,
            quantidade_ovos_quebrados: novaColeta.quebrados,
            observacoes: novaColeta.obs
        });

        if (error) throw error;
    } catch (error) {
        console.error("Erro ao salvar produção no banco:", error);
    }
}

export async function dbSalvarDadosEmpresa(novaEmpresa) {
    if (!supabaseClient) return { ok: false, error: new Error("Cliente Supabase não inicializado.") };

    let savedInDedicatedTable = false;
    let savedInGranjaData = false;
    let lastError = null;

    // 1. Tenta salvar na tabela dedicada `empresa` (caso tenha sido criada no banco)
    try {
        const payloadTabela = {
            id: 1,
            nome: novaEmpresa.nome || "",
            subtitulo: novaEmpresa.subtitulo || "",
            documento: novaEmpresa.documento || "",
            responsavel: novaEmpresa.responsavel || "",
            telefone: novaEmpresa.telefone || "",
            endereco: novaEmpresa.endereco || "",
            email: novaEmpresa.email || "",
            chave_pix: novaEmpresa.chavePix || "",
            favorecido_pix: novaEmpresa.favorecidoPix || "",
            mensagem_rodape: novaEmpresa.mensagemRodape || "",
            updated_at: new Date().toISOString()
        };
        const { error: errEmpresa } = await supabaseClient
            .from('empresa')
            .upsert(payloadTabela, { onConflict: 'id' });

        if (!errEmpresa) {
            savedInDedicatedTable = true;
        } else {
            lastError = errEmpresa;
        }
    } catch (err) {
        lastError = err;
    }

    // 2. Salva também na tabela existente `granja_data` (coluna JSONB `db_content`)
    try {
        const { data: existingRow, error: selErr } = await supabaseClient
            .from('granja_data')
            .select('id, db_content')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!selErr) {
            const currentContent = (existingRow?.db_content && typeof existingRow.db_content === 'object')
                ? existingRow.db_content
                : {};

            const updatedContent = {
                ...currentContent,
                empresa: novaEmpresa,
                config: {
                    ...(currentContent.config || {}),
                    empresa: novaEmpresa
                }
            };

            if (existingRow?.id) {
                const { error: updErr } = await supabaseClient
                    .from('granja_data')
                    .update({
                        db_content: updatedContent,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingRow.id);

                if (!updErr) savedInGranjaData = true;
                else lastError = updErr;
            } else {
                const { error: insErr } = await supabaseClient
                    .from('granja_data')
                    .insert({
                        db_content: updatedContent,
                        updated_at: new Date().toISOString()
                    });

                if (!insErr) savedInGranjaData = true;
                else lastError = insErr;
            }
        } else {
            lastError = selErr;
        }
    } catch (err) {
        lastError = err;
    }

    return {
        ok: savedInDedicatedTable || savedInGranjaData,
        savedInDedicatedTable,
        savedInGranjaData,
        error: lastError
    };
}


