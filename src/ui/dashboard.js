import Chart from 'chart.js/auto';
import flatpickr from 'flatpickr';
import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
import { NOMES_MESES } from '../config/constants.js';
import { state } from '../state/store.js';
import { renderFinance, renderExtract } from '../domain/financeiro.js';
import { dateToISO, formatarDataBR, padZero } from '../utils/formatters.js';

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

export function renderDashboard() {
    const ctxProd = document.getElementById('chartProducao')?.getContext('2d');
    const ctxClient = document.getElementById('chartVendasCliente')?.getContext('2d');
    const ctxCity = document.getElementById('chartVendasCidade')?.getContext('2d');

    if (!ctxProd || !ctxClient || !ctxCity) return;

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
                ? { top: 10, bottom: 10, left: 10, right: 10 }
                : { right: 110, left: 20, top: 10, bottom: 10 }
        },
        plugins: {
            legend: {
                position: isMobile ? 'bottom' : 'right',
                align: isMobile ? 'start' : 'center',
                labels: {
                    boxWidth: 12,
                    padding: isMobile ? 12 : 20,
                    font: {
                        size: isMobile ? 11 : 12,
                        weight: isMobile ? '600' : 'normal'
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

    const dataClient = groupData('cliente');
    activeCharts.client = new Chart(ctxClient, {
        type: 'doughnut',
        data: { labels: dataClient.labels, datasets: [{ data: dataClient.values, backgroundColor: coresExpandidas }] },
        options: pieOptions
    });

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

