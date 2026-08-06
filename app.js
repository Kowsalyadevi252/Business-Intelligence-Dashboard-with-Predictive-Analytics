/**
 * app.js — Full wiring logic for InsightFlow.
 * Handles: authentication, page navigation, KPI cards, charts, prediction engine,
 * insights, dropdowns, export, notifications, settings, and modals.
 */

(function () {

    const $ = (id) => document.getElementById(id);

    // ===== AUTH =====
const DEMO_USER = { username: 'admin', password: 'admin123', name: 'Kowsalya', role: 'Analytics Admin' };

    const loginScreen = $('loginScreen');
    const loginForm = $('loginForm');
    const loginUsername = $('loginUsername');
    const loginPassword = $('loginPassword');
    const loginError = $('loginError');
    const rememberMe = $('rememberMe');
    const togglePass = $('togglePass');
    const forgotLink = $('forgotLink');

    // ===== STATE =====
    const state = {
        period: 12,
        region: 'all',
        category: 'all',
        lastForecast: null,
        currentPage: 'dashboard',
        isLoggedIn: false,
        autoRefreshTimer: null
    };

    // ===== DOM REFS for dashboard =====
    const kpiGrid = $('kpiGrid');
    const periodFilter = $('periodFilter');
    const regionFilter = $('regionFilter');
    const forecastBtn = $('forecastBtn');
    const insightList = $('insightList');
    const refreshInsight = $('refreshInsight');
    const scoreRing = $('scoreRing');
    const scoreValue = $('scoreValue');
    const scoreDesc = $('scoreDesc');
    const menuBtn = $('menuBtn');
    const sidebar = $('sidebar');
    const overlay = $('overlay');
    const pageContent = $('pageContent');
    const pageTitle = $('pageTitle');
    const footerStatus = $('footerStatus');

    // ===== TOAST & MODAL =====
    const toastContainer = $('toastContainer');
    const modalOverlay = $('modalOverlay');
    const modalIcon = $('modalIcon');
    const modalTitle = $('modalTitle');
    const modalText = $('modalText');
    const modalCancel = $('modalCancel');
    const modalConfirm = $('modalConfirm');

    // ===== DATA HELPERS =====
    function getData() {
        const records = filterRecords(BI_DATA.records, {
            period: state.period,
            region: state.region,
            category: state.category
        });
        return {
            records,
            monthlyRevenue: PredictiveEngine.aggregateByMonth(records, 'revenue'),
            monthlyOrders: PredictiveEngine.aggregateByMonth(records, 'orders'),
            monthlyCustomers: PredictiveEngine.aggregateByMonth(records, 'customers'),
            monthlyProfit: PredictiveEngine.aggregateByMonth(records, 'profit')
        };
    }

    function computeKpis(data) {
        const { monthlyRevenue, monthlyOrders, monthlyCustomers, monthlyProfit } = data;
        const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.value, 0);
        const totalProfit = monthlyProfit.reduce((s, m) => s + m.value, 0);
        const totalOrders = monthlyOrders.reduce((s, m) => s + m.value, 0);
        const totalCustomers = monthlyCustomers.reduce((s, m) => s + m.value, 0);
        const customers = monthlyCustomers.map(m => m.value);

        const revForecast = PredictiveEngine.forecastSeries(monthlyRevenue.map(m => m.value), 6);
        const profitForecast = PredictiveEngine.forecastSeries(monthlyProfit.map(m => m.value), 6);
        const ordersForecast = PredictiveEngine.forecastSeries(monthlyOrders.map(m => m.value), 6);
        const customerForecast = PredictiveEngine.forecastSeries(customers, 6);

        const momChange = (arr) => {
            if (arr.length < 2) return 0;
            const last = arr[arr.length - 1];
            const prev = arr[arr.length - 2];
            return prev ? ((last - prev) / prev) * 100 : 0;
        };

        return {
            revenue: {
                label: 'Total Revenue', formatted: fmtCurrency(totalRevenue),
                change: momChange(monthlyRevenue.map(m => m.value)), forecast: revForecast
            },
            profit: {
                label: 'Profit Margin',
                formatted: ((totalProfit / (totalRevenue || 1)) * 100).toFixed(1) + '%',
                change: momChange(monthlyProfit.map(m => m.value)), forecast: profitForecast
            },
            orders: {
                label: 'Orders Placed', formatted: fmtNumber(totalOrders),
                change: momChange(monthlyOrders.map(m => m.value)), forecast: ordersForecast
            },
            customers: {
                label: 'Active Customers', formatted: fmtNumber(totalCustomers),
                change: momChange(customers), forecast: customerForecast
            },
            totalRevenue, totalProfit, totalOrders, totalCustomers
        };
    }

    // ===== RENDER KPI =====
    function renderKpis(kpis) {
        const cards = [
            { key: 'revenue', icon: 'fa-dollar-sign', iconClass: 'purple' },
            { key: 'profit', icon: 'fa-percent', iconClass: 'green' },
            { key: 'orders', icon: 'fa-cart-shopping', iconClass: 'cyan' },
            { key: 'customers', icon: 'fa-users', iconClass: 'amber' }
        ];
        kpiGrid.innerHTML = cards.map(c => {
            const kpi = kpis[c.key];
            const up = kpi.change >= 0;
            const lastForecast = kpi.forecast.forecast.length
                ? kpi.forecast.forecast[kpi.forecast.forecast.length - 1] : null;
            let forecastLabel = '—';
            if (lastForecast !== null) {
                if (c.key === 'profit') {
                    const revF = kpis.revenue.forecast.forecast[kpis.revenue.forecast.forecast.length - 1];
                    forecastLabel = (revF ? (lastForecast / revF) * 100 : 0).toFixed(1) + '%';
                } else {
                    forecastLabel = fmtCurrency(lastForecast);
                }
            }
            return `
                <div class="kpi-card">
                    <div class="kpi-top">
                        <div class="kpi-icon ${c.iconClass}"><i class="fa-solid ${c.icon}"></i></div>
                        <span class="kpi-trend ${up ? 'up' : 'down'}">
                            <i class="fa-solid ${up ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                            ${Math.abs(kpi.change).toFixed(1)}%
                        </span>
                    </div>
                    <div class="kpi-label">${kpi.label}</div>
                    <div class="kpi-value">${kpi.formatted}</div>
                    <div class="kpi-forecast">
                        <span class="forecast-label">Forecast (6m): </span>
                        <span class="forecast-value">${forecastLabel}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ===== RENDER CHARTS =====
    function renderCharts(data) {
        const { monthlyRevenue, monthlyOrders } = data;
        const revenueForecast = state.lastForecast ||
            PredictiveEngine.forecastSeries(monthlyRevenue.map(m => m.value), 6);
        ChartRenderer.revenueChart('revenueChart', monthlyRevenue, revenueForecast);

        const catTotals = {};
        data.records.forEach(r => catTotals[r.category] = (catTotals[r.category] || 0) + r.revenue);
        const catData = Object.entries(catTotals).map(([category, value]) => ({ category, value }))
            .sort((a, b) => b.value - a.value);
        ChartRenderer.categoryChart('categoryChart', catData);

        const regionTotals = {};
        data.records.forEach(r => regionTotals[r.region] = (regionTotals[r.region] || 0) + r.revenue);
        const regionData = Object.entries(regionTotals).map(([region, value]) => ({ region, value }));
        ChartRenderer.regionChart('regionChart', regionData);

        ChartRenderer.ordersChart('ordersChart', monthlyOrders);
        renderScore(revenueForecast);
    }

    function renderScore(forecast) {
        if (!forecast) return;
        const conf = forecast.confidence || 0;
        const deg = (conf / 100) * 360;
        scoreRing.style.background = `conic-gradient(var(--accent) ${deg}deg, var(--border) ${deg}deg)`;
        scoreValue.textContent = conf;
        if (conf >= 85) scoreDesc.textContent = 'High confidence — trend is very stable. Forecast is reliable.';
        else if (conf >= 70) scoreDesc.textContent = 'Good confidence — moderate volatility. Review seasonality.';
        else scoreDesc.textContent = 'Low confidence — high volatility. Consider more data.';
    }

    function renderInsights(data, kpis, forecast) {
        const insights = PredictiveEngine.generateInsights(data.monthlyRevenue, forecast, kpis);
        insightList.innerHTML = insights.map(ins =>
            `<div class="insight-item"><i class="fa-solid ${ins.icon}"></i><p>${ins.text}</p></div>`).join('');
    }

    // ===== REFRESH DASHBOARD =====
    function refresh() {
        const data = getData();
        const revenueSeries = data.monthlyRevenue.map(m => m.value);
        state.lastForecast = PredictiveEngine.forecastSeries(revenueSeries, 6);
        const kpis = computeKpis(data);
        renderKpis(kpis);
        renderCharts(data);
        renderInsights(data, kpis, state.lastForecast);
        footerStatus.textContent = 'Data refreshed ' + new Date().toLocaleTimeString();
    }

    // ===== TOAST =====
    function showToast(message, type = 'success') {
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ===== MODAL =====
    let modalCallback = null;
    function showModal({ title, text, icon = 'warning', confirmText = 'Confirm', onConfirm }) {
        modalTitle.textContent = title;
        modalText.textContent = text;
        modalIcon.className = `modal-icon ${icon}`;
        modalIcon.innerHTML = `<i class="fa-solid ${icon === 'warning' ? 'fa-triangle-exclamation' : icon === 'info' ? 'fa-circle-info' : 'fa-circle-check'}"></i>`;
        modalConfirm.textContent = confirmText;
        modalCallback = onConfirm;
        modalOverlay.classList.add('show');
    }
    function closeModal() {
        modalOverlay.classList.remove('show');
        modalCallback = null;
    }
    modalCancel.addEventListener('click', closeModal);
    modalConfirm.addEventListener('click', () => {
        if (modalCallback) modalCallback();
        closeModal();
    });

    // ===== AUTH FUNCTIONS =====
    function login() {
        const u = loginUsername.value.trim();
        const p = loginPassword.value;
        if (!u || !p) {
            loginError.textContent = 'Please enter both username and password.';
            loginError.classList.add('show');
            return;
        }
        if (u === DEMO_USER.username && p === DEMO_USER.password) {
            state.isLoggedIn = true;
            if (rememberMe.checked) {
                localStorage.setItem('insightflow_user', JSON.stringify({ username: u, name: DEMO_USER.name, role: DEMO_USER.role }));
                sessionStorage.removeItem('insightflow_session');
            } else {
                sessionStorage.setItem('insightflow_session', JSON.stringify({ username: u, name: DEMO_USER.name, role: DEMO_USER.role }));
                localStorage.removeItem('insightflow_user');
            }
            loginScreen.classList.add('hidden');
            document.body.classList.remove('login-active');
            showToast('Welcome back, ' + DEMO_USER.name + '!');
            refresh();
        } else {
            loginError.textContent = 'Invalid username or password. Try admin / admin123.';
            loginError.classList.add('show');
        }
    }

    function logout() {
        state.isLoggedIn = false;
        localStorage.removeItem('insightflow_user');
        sessionStorage.removeItem('insightflow_session');
        loginScreen.classList.remove('hidden');
        document.body.classList.add('login-active');
        loginPassword.value = '';
        loginError.classList.remove('show');
        closeSidebar();
        // stop auto refresh
        if (state.autoRefreshTimer) { clearInterval(state.autoRefreshTimer); state.autoRefreshTimer = null; }
    }

    function checkSession() {
        let session = sessionStorage.getItem('insightflow_session');
        if (!session) session = localStorage.getItem('insightflow_user');
        if (session) {
            try {
                const u = JSON.parse(session);
                state.isLoggedIn = true;
                loginScreen.classList.add('hidden');
                document.body.classList.remove('login-active');
                refresh();
                return true;
            } catch (e) { /* ignore */ }
        }
        return false;
    }

    loginForm.addEventListener('submit', (e) => { e.preventDefault(); login(); });
    togglePass.addEventListener('click', () => {
        const type = loginPassword.type === 'password' ? 'text' : 'password';
        loginPassword.type = type;
        togglePass.innerHTML = `<i class="fa-solid ${type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
    });
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        showModal({
            title: 'Reset Password', text: 'Password reset is not available in this demo. Use admin / admin123.',
            icon: 'info', confirmText: 'OK'
        });
    });

    // ===== SIDEBAR / NAVIGATION =====
    function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
    function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
    menuBtn.addEventListener('click', openSidebar);
    overlay.addEventListener('click', closeSidebar);

    const pageTitles = {
        dashboard: 'Business Intelligence Dashboard', analytics: 'Analytics',
        predictions: 'Predictive Analytics', reports: 'Reports',
        customers: 'Customers', settings: 'Settings'
    };

    function navigate(page) {
        state.currentPage = page;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');
        pageTitle.textContent = pageTitles[page] || 'Dashboard';

        // Dashboard shows the main content; others show templates
        const dashboardSections = document.querySelectorAll('.kpi-grid, .chart-grid, .insight-card, .page-head .filters');
        if (page === 'dashboard') {
            dashboardSections.forEach(s => s.style.display = '');
            pageContent.innerHTML = '';
            refresh();
        } else {
            dashboardSections.forEach(s => s.style.display = 'none');
            pageContent.innerHTML = '';
            loadDynamicPage(page);
        }
        closeSidebar();
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); navigate(link.dataset.page); });
    });

    // ===== DYNAMIC PAGES =====
    function loadDynamicPage(page) {
        const templateMap = {
            analytics: 'analyticsTemplate', predictions: 'predictionsTemplate',
            reports: 'reportsTemplate', customers: 'customersTemplate', settings: 'settingsTemplate'
        };
        const tpl = $(templateMap[page]);
        if (!tpl) return;
        pageContent.innerHTML = tpl.innerHTML;

        if (page === 'analytics') renderAnalytics();
        if (page === 'predictions') renderPredictions();
        if (page === 'reports') renderReports();
        if (page === 'customers') renderCustomers();
        if (page === 'settings') renderSettings();
    }

    function renderAnalytics() {
        const data = getData();
        // Profit by category
        const profitCat = {};
        data.records.forEach(r => profitCat[r.category] = (profitCat[r.category] || 0) + r.revenue * 0.2);
        const profitData = Object.entries(profitCat).map(([category, value]) => ({ category, value }));
        ChartRenderer.categoryChart('profitCatChart', profitData);

        // Customer growth
        const custSeries = data.monthlyCustomers;
        ChartRenderer.ordersChart('customerChart', custSeries.map(m => ({ month: m.month, value: m.value })));

        // KPI mini cards
        const totalRevenue = data.monthlyRevenue.reduce((s, m) => s + m.value, 0);
        const totalProfit = data.monthlyProfit.reduce((s, m) => s + m.value, 0);
        const avgOrder = data.monthlyOrders.length ? totalRevenue / data.monthlyOrders.reduce((s, m) => s + m.value, 0) : 0;
        const growth = data.monthlyRevenue.length >= 2
            ? ((data.monthlyRevenue[data.monthlyRevenue.length - 1].value / data.monthlyRevenue[0].value - 1) * 100) : 0;
        $('analyticsKpis').innerHTML = `
            <div class="pred-metric"><div class="pm-value">${fmtCurrency(totalRevenue)}</div><div class="pm-label">Total Revenue</div></div>
            <div class="pred-metric"><div class="pm-value">${fmtCurrency(totalProfit)}</div><div class="pm-label">Total Profit</div></div>
            <div class="pred-metric"><div class="pm-value">${fmtCurrency(avgOrder)}</div><div class="pm-label">Avg Order Value</div></div>
            <div class="pred-metric"><div class="pm-value">${growth.toFixed(1)}%</div><div class="pm-label">Period Growth</div></div>`;
    }

    function renderPredictions() {
        const data = getData();
        const revenueSeries = data.monthlyRevenue.map(m => m.value);
        const forecast = PredictiveEngine.forecastSeries(revenueSeries, 6);
        ChartRenderer.revenueChart('predRevenueChart', data.monthlyRevenue, forecast);

        const metrics = [
            { label: 'Confidence', value: forecast.confidence + '%' },
            { label: 'Projected Growth', value: forecast.slopePct.toFixed(1) + '%' },
            { label: 'Next Month Rev', value: fmtCurrency(forecast.forecast[0] || 0) },
            { label: '6-Month Rev', value: fmtCurrency(forecast.forecast[forecast.forecast.length - 1] || 0) }
        ];
        $('predictionMetrics').innerHTML = metrics.map(m =>
            `<div class="pred-metric"><div class="pm-value">${m.value}</div><div class="pm-label">${m.label}</div></div>`).join('');
    }

    function renderReports() {
        const data = getData();
        const totalRevenue = data.monthlyRevenue.reduce((s, m) => s + m.value, 0);
        const totalOrders = data.monthlyOrders.reduce((s, m) => s + m.value, 0);
        const regionCount = new Set(data.records.map(r => r.region)).size;
        $('reportSummary').innerHTML = `
            <h3>Available Reports</h3>
            <ul class="report-list">
                <li><span>Sales Summary</span><span>${fmtCurrency(totalRevenue)} · ${fmtNumber(totalOrders)} orders</span></li>
                <li><span>Customer Analysis</span><span>${fmtNumber(data.monthlyCustomers.reduce((s,m)=>s+m.value,0))} customers</span></li>
                <li><span>Forecast Report</span><span>Next 6 months · ${regionCount} regions</span></li>
            </ul>`;
        // Report buttons
        document.querySelectorAll('[data-report]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.report;
                exportCSV(type);
            });
        });
    }

    function renderCustomers() {
        const data = getData();
        const regionTotals = {};
        data.records.forEach(r => regionTotals[r.region] = (regionTotals[r.region] || 0) + r.customers);
        const rows = Object.entries(regionTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([region, customers], i) =>
                `<tr><td>${capitalize(region)}</td><td>${fmtNumber(customers)}</td><td>${fmtCurrency(customers * 340)}</td><td>${((i===0?34:18)+Math.random()*20).toFixed(1)}%</td></tr>`).join('');
        $('customersTable').innerHTML = `
            <table>
                <thead><tr><th>Region</th><th>Customers</th><th>LTV</th><th>Growth</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderSettings() {
        const settings = JSON.parse(localStorage.getItem('insightflow_settings') || '{}');
        if (settings.notif !== undefined) $('notifSetting').checked = settings.notif;
        if (settings.autorefresh !== undefined) $('autorefreshSetting').checked = settings.autorefresh;
        if (settings.darkmode !== undefined) $('darkmodeSetting').checked = settings.darkmode;

        $('saveSettings').addEventListener('click', () => {
            const notif = $('notifSetting').checked;
            const autorefresh = $('autorefreshSetting').checked;
            localStorage.setItem('insightflow_settings', JSON.stringify({ notif, autorefresh, darkmode: true }));
            // Apply auto-refresh
            if (state.autoRefreshTimer) { clearInterval(state.autoRefreshTimer); state.autoRefreshTimer = null; }
            if (autorefresh) {
                state.autoRefreshTimer = setInterval(() => { if (state.isLoggedIn) refresh(); }, 60000);
            }
            showToast('Settings saved successfully!');
        });
    }

    // ===== EXPORT CSV =====
    function exportCSV(type) {
        const data = getData();
        let csv = '', filename = 'export.csv';
        if (type === 'sales') {
            filename = 'sales_report.csv';
            csv = 'Month,Revenue,Orders\n' + data.monthlyRevenue.map((m, i) =>
                `${m.month},${m.value},${data.monthlyOrders[i] ? data.monthlyOrders[i].value : 0}`).join('\n');
        } else if (type === 'customers-report') {
            filename = 'customer_report.csv';
            csv = 'Month,Customers\n' + data.monthlyCustomers.map(m => `${m.month},${m.value}`).join('\n');
        } else if (type === 'forecast') {
            filename = 'forecast_report.csv';
            const f = state.lastForecast;
            csv = 'Period,Forecast,Lower,Upper\n' + f.forecast.map((v, i) =>
                `Month${i+1},${Math.round(v)},${Math.round(f.lower[i])},${Math.round(f.upper[i])}`).join('\n');
        } else {
            // default: full data
            filename = 'insightflow_data.csv';
            csv = 'Month,Region,Category,Revenue,Profit,Orders,Customers\n' + data.records.map(r =>
                `${r.month},${r.region},${r.category},${r.revenue},${r.profit},${r.orders},${r.customers}`).join('\n');
        }
        downloadCSV(csv, filename);
        showToast('Report exported: ' + filename);
    }

    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    $('exportBtn').addEventListener('click', () => exportCSV('all'));

    // ===== DROPDOWNS =====
    const notifBtn = $('notifBtn');
    const notifDropdown = $('notifDropdown');
    const profileBtn = $('profileBtn');
    const profileDropdown = $('profileDropdown');

    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = notifDropdown.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) notifDropdown.classList.add('show');
    });

    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = profileDropdown.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) profileDropdown.classList.add('show');
    });

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
    }
    document.addEventListener('click', closeAllDropdowns);

    // Mark all read
    $('markRead').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.notif-item').forEach(n => n.style.opacity = '0.5');
        const badge = notifBtn.querySelector('.badge');
        if (badge) badge.style.display = 'none';
        showToast('All notifications marked as read');
    });

    // Logout
    $('logoutBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showModal({
            title: 'Logout', text: 'Are you sure you want to log out?',
            icon: 'warning', confirmText: 'Logout', onConfirm: logout
        });
    });

    // Profile links
    document.querySelectorAll('.profile-link[data-action]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const action = link.dataset.action;
            const messages = {
                profile: 'Profile page is under construction.',
                preferences: 'Preferences panel is under construction.',
                help: 'Help & support documentation is under construction.'
            };
            showToast(messages[action], 'warning');
        });
    });

    // ===== FILTERS =====
    periodFilter.addEventListener('change', () => {
        state.period = parseInt(periodFilter.value, 10);
        if (state.currentPage === 'dashboard') refresh(); else loadDynamicPage(state.currentPage);
    });
    regionFilter.addEventListener('change', () => {
        state.region = regionFilter.value;
        if (state.currentPage === 'dashboard') refresh(); else loadDynamicPage(state.currentPage);
    });

    // ===== FORECAST BUTTON =====
    forecastBtn.addEventListener('click', () => {
        forecastBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Computing...';
        setTimeout(() => {
            refresh();
            forecastBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Run Forecast';
            showToast('Forecast recomputed successfully!');
        }, 600);
    });

    // ===== REFRESH INSIGHT =====
    refreshInsight.addEventListener('click', () => {
        refreshInsight.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        setTimeout(() => {
            refresh();
            refreshInsight.innerHTML = '<i class="fa-solid fa-rotate"></i>';
            showToast('Insights regenerated!');
        }, 300);
    });

    // ===== SEARCH =====
    $('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.kpi-card').forEach(card => {
            card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    // ===== HELPERS =====
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ===== INIT =====
    // Body starts with login overlay visible; check session
    document.body.classList.add('login-active');
    if (!checkSession()) {
        loginScreen.classList.remove('hidden');
    }

    // Apply saved auto-refresh setting
    const savedSettings = JSON.parse(localStorage.getItem('insightflow_settings') || '{}');
    if (savedSettings.autorefresh) {
        state.autoRefreshTimer = setInterval(() => { if (state.isLoggedIn) refresh(); }, 60000);
    }

})();
