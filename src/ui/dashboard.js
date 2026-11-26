import Chart from 'chart.js/auto';
import flatpickr from 'flatpickr';
import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
import { NOMES_MESES } from '../config/constants.js';
import { state } from '../state/store.js';
import { renderFinance, renderExtract } from '../domain/financeiro.js';
import { dateToISO, formatarDataBR, padZero, esc, money } from '../utils/formatters.js';

const activeCharts = {};
let extratoPickerInstance = null;

function generateMonthDaysISO(periodoInicio, periodoFim) {
    const [anoIni, mesIni] = periodoInicio.split('-').map(Number);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === anoIni && (now.getMonth() + 1) === mesIni;

    const endDay = isCurrentMonth
        ? now.getDate()
        : Number(periodoFim.split('-')[2]);

    const days = [];
    for (let d = 1; d <= endDay; d++) {
        days.push(`${anoIni}-${padZero(mesIni)}-${padZero(d)}`);
    }
    return days;
}

function renderClientRanking(vendasMes, clientes) {
    const container = document.getElementById('clientRankingList');
    const badgeEl = document.getElementById('rankingClientsBadge');
    if (!container) return;

    const map = {};
    vendasMes.forEach(v => {
        const nome = String(v.cliente || "Consumidor Geral").trim() || "Consumidor Geral";
        const key = nome.toLowerCase();
        if (!map[key]) {
            const clienteCad = (clientes || []).find(
                c => String(c.nome || "").trim().toLowerCase() === key
            );
            map[key] = {
                nome,
                cidade: clienteCad?.cidade || "",
                totalValor: 0,
                qtdCompras: 0,
                qtdItens: 0
            };
        }
        map[key].totalValor += Number(v.valor) || 0;
        map[key].qtdCompras += 1;
        map[key].qtdItens += Number(v.qtd ?? v.quantidade) || 0;
    });

    const ranking = Object.values(map).sort((a, b) => b.totalValor - a.totalValor);

    if (badgeEl) {
        badgeEl.textContent = ranking.length > 0
            ? `${ranking.length} ${ranking.length === 1 ? 'cliente' : 'clientes'}`
            : 'Sem vendas';
    }

    if (ranking.length === 0) {
        container.innerHTML = `
            <div class="ranking-empty-state">
                <i class="fas fa-medal"></i>
                <span>Nenhuma venda registrada neste período.</span>
            </div>
        `;
        return;
    }

    const totalPeriodo = ranking.reduce((acc, item) => acc + item.totalValor, 0);
    const maxValor = ranking[0]?.totalValor || 1;

    container.innerHTML = ranking.map((item, idx) => {
        const pos = idx + 1;
        const pctBar = Math.max(4, Math.round((item.totalValor / maxValor) * 100));
        const pctShare = totalPeriodo > 0 ? ((item.totalValor / totalPeriodo) * 100).toFixed(1).replace('.', ',') : '0,0';

        let posClass = 'rank-other';
        let posContent = `${pos}º`;
        if (pos === 1) {
            posClass = 'rank-gold';
            posContent = '<i class="fas fa-crown"></i>';
        } else if (pos === 2) {
            posClass = 'rank-silver';
            posContent = '2º';
        } else if (pos === 3) {
            posClass = 'rank-bronze';
            posContent = '3º';
        }

        const comprasLabel = `${item.qtdCompras} ${item.qtdCompras === 1 ? 'compra' : 'compras'}`;
        const cidadeBadge = item.cidade ? ` · ${esc(item.cidade)}` : '';

        return `
            <div class="ranking-item ${pos <= 3 ? 'is-top3' : ''} ${pos === 1 ? 'is-first' : ''}">
                <div class="ranking-rank-badge ${posClass}" title="${pos}º lugar">
                    ${posContent}
                </div>
                <div class="ranking-info">
                    <div class="ranking-top-row">
                        <div class="ranking-name-wrap">
                            <span class="ranking-client-name" title="${esc(item.nome)}">${esc(item.nome)}</span>
                            <span class="ranking-meta">${comprasLabel}${cidadeBadge}</span>
                        </div>
                        <div class="ranking-value-wrap">
                            <b class="ranking-value">${money(item.totalValor)}</b>
                            <span class="ranking-share">${pctShare}%</span>
                        </div>
                    </div>
                    <div class="ranking-bar-track">
                        <div class="ranking-bar-fill ${posClass}" style="width: ${pctBar}%;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function renderDashboard() {
    const ctxProd = document.getElementById('chartProducao')?.getContext('2d');
    const ctxCity = document.getElementById('chartVendasCidade')?.getContext('2d');

    if (!ctxProd || !ctxCity) return;

    Object.values(activeCharts).forEach(chart => chart.destroy());

    const { db, periodoInicio, periodoFim } = state;
    const diasDoMesAtual = generateMonthDaysISO(periodoInicio, periodoFim);

    const dadosProducao = diasDoMesAtual.map(dia => {
        return db.coletas.filter(c => dateToISO(c.data) === dia).reduce((acc, c) => acc + c.liquido, 0);
    });
    const maxProducao = Math.max(...dadosProducao, 0);

    activeCharts.prod = new Chart(ctxProd, {
        type: 'line',
        data: {
            labels: diasDoMesAtual.map(d => formatarDataBR(d).slice(0, 5)),
            datasets: [{
                label: 'Produção Total (Ovos)',
                data: dadosProducao,
                borderColor: '#1b7a43',
                backgroundColor: 'rgba(27, 122, 67, 0.12)',
                fill: true,
                tension: 0.38,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#1b7a43',
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, max: maxProducao + 200, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });

    const vendasMes = db.historico.filter(h => {
        const d = dateToISO(h.data);
        return h.tipo === 'VENDA' && d >= periodoInicio && d <= periodoFim;
    });

    renderClientRanking(vendasMes, db.clientes);

    const groupData = (key) => {
        const map = {};
        vendasMes.forEach(v => {
            let label = v[key] || "Outros";
            if (key === 'cidade') {
                const cliente = db.clientes.find(c => c.nome === v.cliente);
                label = cliente?.cidade || "Não Informada";
            }
            map[label] = (map[label] || 0) + v.valor;
        });
        return { labels: Object.keys(map), values: Object.values(map) };
    };

    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const isMobile = window.innerWidth <= 768;

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: isMobile
                ? { top: 8, bottom: 8, left: 8, right: 8 }
                : { top: 8, bottom: 8, left: 6, right: 6 }
        },
        plugins: {
            legend: {
                position: isMobile ? 'bottom' : 'right',
                align: isMobile ? 'start' : 'center',
                maxWidth: isMobile ? 600 : 380,
                labels: {
                    boxWidth: 12,
                    padding: isMobile ? 10 : 14,
                    font: {
                        size: isMobile ? 11 : 11.5,
                        weight: '600'
                    },
                    generateLabels: (chart) => {
                        const data = chart.data;
                        return data.labels.map((label, i) => ({
                            text: `${label.toUpperCase()}: ${currencyFormatter.format(data.datasets[0].data[i])}`,
                            fillStyle: data.datasets[0].backgroundColor[i],
                            strokeStyle: data.datasets[0].backgroundColor[i],
                            lineWidth: 0,
                            hidden: !chart.getDataVisibility(i),
                            index: i
                        }));
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => ` Total: ${currencyFormatter.format(context.parsed)}`
                }
            }
        }
    };

    const coresExpandidas = ['#1b7a43', '#d97706', '#0f766e', '#0284c7', '#65a30d', '#b45309', '#4f46e5', '#dc2626', '#059669', '#ca8a04', '#0d9488'];

    const dataCity = groupData('cidade');
    activeCharts.city = new Chart(ctxCity, {
        type: 'doughnut',
        data: { labels: dataCity.labels, datasets: [{ data: dataCity.values, backgroundColor: coresExpandidas.slice().reverse() }] },
        options: pieOptions
    });
}

export function atualizarPeriodoDashboard() {
    const ano = state.dataPeriodoDashboard.getFullYear();
    const mes = state.dataPeriodoDashboard.getMonth();

    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    state.periodoInicio = `${ano}-${padZero(mes + 1)}-01`;
    state.periodoFim = `${ano}-${padZero(mes + 1)}-${padZero(ultimoDia)}`;

    const labelEl = document.getElementById("periodoDashboardLabel");
    if (labelEl) {
        labelEl.textContent = `${NOMES_MESES[mes]} ${ano}`;
    }

    renderFinance();
    renderDashboard();
}

export function mudarPeriodoDashboard(delta) {
    state.dataPeriodoDashboard.setMonth(state.dataPeriodoDashboard.getMonth() + delta);
    atualizarPeriodoDashboard();
}

export function setupPeriodoPicker() {
    atualizarPeriodoDashboard();
}

export function setupExtratoPicker() {
    const container = document.getElementById('reportrange-extrato');
    if (!container) return;

    const spanEl = container.querySelector('span');
    const updateLabel = (iniISO, fimISO) => {
        if (spanEl) {
            spanEl.textContent = `${formatarDataBR(iniISO)} - ${formatarDataBR(fimISO)}`;
        }
    };

    updateLabel(state.extratoInicio, state.extratoFim);

    if (extratoPickerInstance) {
        extratoPickerInstance.destroy();
    }

    extratoPickerInstance = flatpickr(container, {
        mode: 'range',
        locale: Portuguese,
        dateFormat: 'Y-m-d',
        defaultDate: [state.extratoInicio, state.extratoFim],
        onClose(selectedDates) {
            if (selectedDates.length === 2) {
                const formatISO = (d) => `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
                state.extratoInicio = formatISO(selectedDates[0]);
                state.extratoFim = formatISO(selectedDates[1]);
                updateLabel(state.extratoInicio, state.extratoFim);
                renderExtract();
            } else if (selectedDates.length === 1) {
                const formatISO = (d) => `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
                state.extratoInicio = formatISO(selectedDates[0]);
                state.extratoFim = state.extratoInicio;
                updateLabel(state.extratoInicio, state.extratoFim);
                renderExtract();
            }
        }
    });
}

