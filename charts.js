/**
 * charts.js — Chart.js renderers for the InsightFlow dashboard.
 */

const ChartRenderer = (function () {

    // Global Chart.js defaults for dark theme
    Chart.defaults.color = '#8b92a5';
    Chart.defaults.borderColor = '#2a3040';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;

    let charts = {};

    function destroy(id) {
        if (charts[id]) {
            charts[id].destroy();
            delete charts[id];
        }
    }

    function destroyAll() {
        Object.keys(charts).forEach(destroy);
    }

    /**
     * Revenue trend with historical + forecast overlay.
     * historical: [{month, value}]
     * forecastData: { forecast: [], lower: [], upper: [] }
     */
    function revenueChart(canvasId, historical, forecastData) {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);

        const labels = historical.map(m => m.month);
        const histValues = historical.map(m => m.value);

        // Extend labels with forecast months
        const forecastLabels = [];
        if (forecastData && forecastData.forecast.length) {
            const lastMonth = historical[historical.length - 1].month;
            const [ly, lm] = lastMonth.split('-').map(Number);
            for (let i = 1; i <= forecastData.forecast.length; i++) {
                const d = new Date(ly, lm - 1 + i, 1);
                forecastLabels.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
            }
        }

        const allLabels = [...labels, ...forecastLabels];

        // Historical + forecast values in one line (forecast portion dotted)
        const histLine = [...histValues, ...forecastData.forecast];
        const histOnly = [...histValues, ...Array(forecastData.forecast.length).fill(null)];

        charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Historical',
                        data: histOnly,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99,102,241,0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointBackgroundColor: '#6366f1'
                    },
                    {
                        label: 'Forecast',
                        data: [...Array(historical.length).fill(null), ...forecastData.forecast],
                        borderColor: '#22d3ee',
                        backgroundColor: 'rgba(34,211,238,0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        borderDash: [6, 4],
                        pointRadius: 3,
                        pointBackgroundColor: '#22d3ee'
                    },
                    {
                        label: 'Confidence Band (upper)',
                        data: [...Array(historical.length).fill(null), ...forecastData.upper],
                        borderColor: 'rgba(34,211,238,0.2)',
                        backgroundColor: 'rgba(34,211,238,0.08)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'Confidence Band (lower)',
                        data: [...Array(historical.length).fill(null), ...forecastData.lower],
                        borderColor: 'transparent',
                        backgroundColor: 'rgba(34,211,238,0.08)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: '-1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.parsed.y === null) return null;
                                return ` ${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxTicksLimit: 8,
                            callback: (val, idx) => {
                                const lbl = allLabels[idx];
                                return lbl ? monthLabel(lbl) : '';
                            }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(42,48,64,0.5)' },
                        ticks: { callback: (v) => fmtCurrency(v) }
                    }
                }
            }
        });
    }

    /**
     * Sales by category — doughnut.
     */
    function categoryChart(canvasId, data) {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        const labels = data.map(d => d.category);
        const values = data.map(d => d.value);

        charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f87171'],
                    borderColor: '#1b1f2b',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 16, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${fmtCurrency(ctx.parsed)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Regional performance — doughnut.
     */
    function regionChart(canvasId, data) {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        const labels = data.map(d => capitalize(d.region));
        const values = data.map(d => d.value);

        charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#6366f1', '#22d3ee', '#34d399', '#fbbf24'],
                    borderColor: '#1b1f2b',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 16, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${fmtCurrency(ctx.parsed)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Monthly orders — bar chart.
     */
    function ordersChart(canvasId, data) {
        destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        const labels = data.map(m => m.month);
        const values = data.map(m => m.value);

        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, 'rgba(99,102,241,0.9)');
        gradient.addColorStop(1, 'rgba(99,102,241,0.2)');

        charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Orders',
                    data: values,
                    backgroundColor: gradient,
                    borderRadius: 6,
                    maxBarThickness: 32
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${fmtNumber(ctx.parsed.y)} orders`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxTicksLimit: 6,
                            callback: (val, idx) => monthLabel(labels[idx])
                        }
                    },
                    y: {
                        grid: { color: 'rgba(42,48,64,0.5)' },
                        ticks: { callback: (v) => fmtNumber(v) }
                    }
                }
            }
        });
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    return {
        revenueChart,
        categoryChart,
        regionChart,
        ordersChart,
        destroyAll
    };
})();
