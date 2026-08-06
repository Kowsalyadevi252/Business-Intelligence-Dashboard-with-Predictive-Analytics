/**
 * predictive.js — Predictive analytics engine.
 * Implements:
 *  - Simple Linear Regression for trend forecasting
 *  - Exponential smoothing for refinement
 *  - Confidence scoring based on fit quality (R²)
 */

const PredictiveEngine = (function () {

    /**
     * Linear regression on a series of values.
     * Returns { slope, intercept, r2, predict(x), forecast(nextN) }
     */
    function linearRegression(data) {
        const n = data.length;
        if (n < 2) return { slope: 0, intercept: data[0] || 0, r2: 0, predict: () => data[0] || 0, forecast: () => [] };

        const xMean = data.reduce((s, _, i) => s + i, 0) / n;
        const yMean = data.reduce((s, v) => s + v, 0) / n;

        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
            num += (i - xMean) * (data[i] - yMean);
            den += (i - xMean) * (i - xMean);
        }

        const slope = den === 0 ? 0 : num / den;
        const intercept = yMean - slope * xMean;

        // R² — coefficient of determination
        let ssRes = 0, ssTot = 0;
        for (let i = 0; i < n; i++) {
            const pred = slope * i + intercept;
            ssRes += (data[i] - pred) ** 2;
            ssTot += (data[i] - yMean) ** 2;
        }
        const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

        const predict = (x) => slope * x + intercept;
        const forecast = (steps) => {
            const out = [];
            for (let i = 1; i <= steps; i++) {
                out.push(predict(n - 1 + i));
            }
            return out;
        };

        return { slope, intercept, r2, predict, forecast, lastX: n - 1 };
    }

    /**
     * Exponential smoothing (single/linear) to blend with regression.
     * Returns forecast values for next n steps.
     */
    function exponentialSmoothing(data, steps, alpha = 0.6) {
        if (data.length === 0) return [];
        let last = data[0];
        let trend = data.length > 1 ? data[1] - data[0] : 0;
        const out = [];

        // Holt's linear smoothing
        let level = data[0];
        let b = data.length > 1 ? (data[data.length - 1] - data[0]) / (data.length - 1) : 0;

        // Run through actual points to settle
        for (let i = 1; i < data.length; i++) {
            const newLevel = alpha * data[i] + (1 - alpha) * (level + b);
            b = alpha * (newLevel - level) + (1 - alpha) * b;
            level = newLevel;
        }

        for (let i = 0; i < steps; i++) {
            last = level + b * (i + 1);
            out.push(last);
        }
        return out;
    }

    /**
     * Generate a forecast for a series.
     * Returns { forecast: number[], lower: number[], upper: number[], confidence, slopePct }
     * Combines regression + smoothing, adds confidence band using residual std dev.
     */
    function forecastSeries(data, steps = 6) {
        if (!data || data.length < 3) {
            return { forecast: [], lower: [], upper: [], confidence: 0, slopePct: 0 };
        }

        const reg = linearRegression(data);

        // Blend regression forecast with exponential smoothing forecast
        const regForecast = reg.forecast(steps);
        const smoothForecast = exponentialSmoothing(data, steps);

        const blend = regForecast.map((v, i) => v * 0.6 + smoothForecast[i] * 0.4);

        // Residual standard deviation for confidence band
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
            const diff = data[i] - reg.predict(i);
            sumSq += diff * diff;
        }
        const residStd = Math.sqrt(sumSq / Math.max(1, data.length - 2));

        const lower = blend.map(v => v - 1.5 * residStd);
        const upper = blend.map(v => v + 1.5 * residStd);

        // Confidence = clamp of R² mapped to 50-98 range, adjusted by sample size
        const r2Score = Math.max(0, Math.min(1, reg.r2)) * 40;
        const sizeScore = Math.min(12, data.length) / 12 * 10;
        const confidence = Math.round(Math.min(98, Math.max(50, 50 + r2Score + sizeScore)));

        // Slope as % growth over the forecast window
        const lastActual = data[data.length - 1];
        const lastForecast = blend[blend.length - 1];
        const slopePct = lastActual ? ((lastForecast - lastActual) / lastActual) * 100 : 0;

        return { forecast: blend, lower, upper, confidence, slopePct, r2: reg.r2 };
    }

    /**
     * Aggregate a series of records (already filtered) by month for a given metric.
     */
    function aggregateByMonth(records, metric) {
        const map = new Map();
        for (const r of records) {
            map.set(r.month, (map.get(r.month) || 0) + r[metric]);
        }
        // Sort by month
        const months = Array.from(map.keys()).sort();
        return months.map(m => ({ month: m, value: map.get(m) }));
    }

    /**
     * Generate AI-style insights from historical + forecast data.
     */
    function generateInsights(monthlyData, forecastData, kpis) {
        const insights = [];

        if (monthlyData.length >= 2) {
            const last = monthlyData[monthlyData.length - 1].value;
            const prev = monthlyData[monthlyData.length - 2].value;
            const mom = prev ? ((last - prev) / prev) * 100 : 0;

            if (mom > 0) {
                insights.push({
                    icon: 'fa-arrow-trend-up',
                    text: `Revenue grew <strong>${mom.toFixed(1)}%</strong> month-over-month, reaching <strong>${fmtCurrency(last)}</strong>.`
                });
            } else {
                insights.push({
                    icon: 'fa-arrow-trend-down',
                    text: `Revenue declined <strong>${Math.abs(mom).toFixed(1)}%</strong> MoM. Consider reviewing pricing or promotions.`
                });
            }
        }

        if (forecastData && forecastData.slopePct !== undefined) {
            const dir = forecastData.slopePct >= 0 ? 'upward' : 'downward';
            insights.push({
                icon: 'fa-brain',
                text: `Predictive model projects a <strong>${dir}</strong> trend of <strong>${Math.abs(forecastData.slopePct).toFixed(1)}%</strong> over the next quarter.`
            });
        }

        // Best region
        const regionTotals = {};
        for (const r of BI_DATA.records) {
            regionTotals[r.region] = (regionTotals[r.region] || 0) + r.revenue;
        }
        const bestRegion = Object.entries(regionTotals)
            .sort((a, b) => b[1] - a[1])[0];
        if (bestRegion) {
            insights.push({
                icon: 'fa-trophy',
                text: `<strong>${capitalize(bestRegion[0])}</strong> region leads with <strong>${fmtCurrency(bestRegion[1])}</strong> in total revenue.`
            });
        }

        // Best category
        const catTotals = {};
        for (const r of BI_DATA.records) {
            catTotals[r.category] = (catTotals[r.category] || 0) + r.revenue;
        }
        const bestCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
        if (bestCat) {
            insights.push({
                icon: 'fa-cube',
                text: `<strong>${bestCat[0]}</strong> is the top-performing category with <strong>${fmtCurrency(bestCat[1])}</strong> revenue.`
            });
        }

        // Profit margin
        const totalRevenue = monthlyData.reduce((s, m) => s + m.value, 0);
        const totalProfit = kpis && kpis.totalProfit ? kpis.totalProfit
            : monthlyData.reduce((s, m) => s + m.value, 0) * 0.25;
        const margin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
        insights.push({
            icon: 'fa-percent',
            text: `Overall profit margin is <strong>${margin.toFixed(1)}%</strong>. ${margin >= 25 ? 'Healthy and above target.' : 'Slightly below the 25% target.'}`
        });

        return insights;
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    return {
        linearRegression,
        exponentialSmoothing,
        forecastSeries,
        aggregateByMonth,
        generateInsights
    };
})();
