/**
 * data.js — Sample business data for the InsightFlow BI Dashboard.
 * Data simulates a retail company across 24 months, 4 regions and product categories.
 */

const BI_DATA = {

    // Monthly records (oldest -> newest). Each entry:
    // { month: 'YYYY-MM', revenue, orders, customers, profit, region, category }
    monthly: (function generateData() {
        const records = [];
        const regions = ['north', 'south', 'east', 'west'];
        const categories = ['Electronics', 'Fashion', 'Home & Living', 'Sports'];

        const regionWeights = {
            north: { base: 1.15, season: [0.9, 0.95, 1.05, 1.0, 1.1, 1.15, 1.2, 1.1, 1.05, 1.15, 1.25, 1.3] },
            south: { base: 1.0, season: [0.85, 0.9, 1.0, 1.1, 1.15, 1.0, 0.95, 1.05, 1.1, 1.05, 1.1, 1.2] },
            east: { base: 0.85, season: [1.0, 0.9, 0.85, 0.95, 1.0, 1.1, 1.15, 1.2, 1.05, 0.95, 0.9, 1.0] },
            west: { base: 1.3, season: [1.1, 1.0, 1.05, 1.15, 1.2, 1.25, 1.15, 1.1, 1.2, 1.3, 1.35, 1.4] }
        };

        const categoryWeight = { 'Electronics': 0.3, 'Fashion': 0.25, 'Home & Living': 0.25, 'Sports': 0.2 };

        const startYear = 2023;
        const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
        let idx = 0;

        // 24 months from Jan 2023 to Dec 2024
        for (let y = 0; y < 2; y++) {
            const year = startYear + y;
            for (let m = 0; m < 12; m++) {
                const month = `${year}-${months[m]}`;

                // Overall growth trend (approx 22% YoY)
                const growth = 1 + (idx * 0.022);
                const noise = () => 0.92 + Math.random() * 0.16;

                for (const region of regions) {
                    const rw = regionWeights[region];
                    for (const category of categories) {
                        const catShare = categoryWeight[category];

                        const seasonFactor = rw.season[m];
                        const randomness = noise();

                        // revenue base
                        let revenue = 480000 * rw.base * catShare * seasonFactor * growth * randomness * 2.2;
                        revenue = Math.round(revenue / 100) * 100;

                        const marginRate = 0.18 + (category === 'Electronics' ? 0.05 : 0) + Math.random() * 0.06;
                        const profit = Math.round(revenue * marginRate);

                        const orders = Math.round(revenue / (120 + Math.random() * 140));
                        const customers = Math.round(orders * (0.65 + Math.random() * 0.2));

                        records.push({
                            month,
                            region,
                            category,
                            revenue,
                            profit,
                            orders,
                            customers
                        });
                    }
                }
                idx++;
            }
        }

        return records;
    })(),

    // Aggregate monthly view (computed later in app.js)
    get records() {
        return this.monthly;
    }
};

// Also expose a helper to filter records
function filterRecords(records, { period = 12, region = 'all', category = 'all' } = {}) {
    const latest = records[records.length - 1].month; // e.g. '2024-12'

    // Determine cutoff month
    const [ly, lm] = latest.split('-').map(Number);
    const cutoff = new Date(ly, lm - (period - 1), 1); // first month in window
    const cutoffStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0');

    return records.filter(r => {
        if (region !== 'all' && r.region !== region) return false;
        if (category !== 'all' && r.category !== category) return false;
        return r.month >= cutoffStr && r.month <= latest;
    });
}

// Formatting helpers
function fmtCurrency(v) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
}

function fmtNumber(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
}

function monthLabel(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}
