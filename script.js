/* script.js */
/* global Chart, jspdf, XLSX */
(() => {
    const { jsPDF } = window.jspdf || {};

    const LOCAL_CURRENCY_LABELS = {
        australia: "AUD",
        france: "EUR",
        italy: "EUR"
    };

    let LOCAL_PER_USD_DEFAULT = 1.5;
    let LOCAL_PER_USD = LOCAL_PER_USD_DEFAULT;

    // Mixed logit parameters by country and outbreak scenario (means or average)
    // Keys are "<country>_<scenario>"
    const DCE_PARAMS_MXL = {
        australia_mild: {
            label: "Australia – mild outbreak",
            asc_optout: -0.572,
            beta: {
                scope_all: -0.319,
                ex_medRelig: -0.157,
                ex_medReligPers: -0.267,
                cov70: 0.171,
                cov90: 0.158,
                lives: 0.072
            }
        },
        australia_severe: {
            label: "Australia – severe outbreak",
            asc_optout: -0.694,
            beta: {
                scope_all: 0.190,
                ex_medRelig: -0.181,
                ex_medReligPers: -0.305,
                cov70: 0.371,
                cov90: 0.398,
                lives: 0.079
            }
        },
        italy_mild: {
            label: "Italy – mild outbreak",
            asc_optout: -0.238,
            beta: {
                scope_all: -0.276,
                ex_medRelig: -0.176,
                ex_medReligPers: -0289,
                cov70: 0.185,
                cov90: 0.148,
                lives: 0.039
            }
        },
        italy_severe: {
            label: "Italy – severe outbreak",
            asc_optout: -0.463,
            beta: {
                scope_all: 0.174,
                ex_medRelig: -0.178,
                ex_medReligPers: -0.207,
                cov70: 0.305,
                cov90: 0.515,
                lives: 0.045
            }
        },
        france_mild: {
            label: "France – mild outbreak",
            asc_optout: 0.307,
            beta: {
                scope_all: -0.160,
                ex_medRelig: -0.121,
                ex_medReligPers: -0.124,
                cov70: 0.232,
                cov90: 0.264,
                lives: 0.049
            }
        },
        france_severe: {
            label: "France – severe outbreak",
            asc_optout: 0.083,
            beta: {
                scope_all: -0.019,
                ex_medRelig: -0.192,
                ex_medReligPers: -0.247,
                cov70: 0.267,
                cov90: 0.398,
                lives: 0.052
            }
        }
    };

    // Willingness-to-save-lives (WTS) in lives per 100,000
    const WTS_TABLE = {
        australia_mild: {
            scope_all: 4.421,
            ex_medRelig: 2.171,
            ex_medReligPers: 3.700,
            cov70: -2.365,
            cov90: -2.187
        },
        australia_severe: {
            scope_all: -2.418,
            ex_medRelig: 2.292,
            ex_medReligPers: 3.878,
            cov70: -4.708,
            cov90: -5.050
        },
        italy_mild: {
            scope_all: 7.103,
            ex_medRelig: 4.531,
            ex_medReligPers: 7.456,
            cov70: -4.766,
            cov90: -3.824
        },
        italy_severe: {
            scope_all: -3.853,
            ex_medRelig: 3.955,
            ex_medReligPers: 4.597,
            cov70: -6.773,
            cov90: -11.409
        },
        france_mild: {
            scope_all: 3.288,
            ex_medRelig: 2.490,
            ex_medReligPers: 2.545,
            cov70: -4.779,
            cov90: -5.434
        },
        france_severe: {
            scope_all: 0.373,
            ex_medRelig: 3.687,
            ex_medReligPers: 4.747,
            cov70: -5.117,
            cov90: -7.638
        }
    };

    // Placeholder for optional external configuration (not yet used in calculations)
    const EPI_CONFIG_URL = "epi_config.json";
    let epiConfig = null;

    const state = {
        tab: "intro",
        country: "australia",
        outbreak: "mild",
        scope: "high_risk",
        exemptions: "medical",
        coverage: "50",
        livesSaved: 25,
        populationMillions: 25,
        costPerPerson: 20,
        valuePerLife: 5000000,
        modelKey: "mxl", // retained for labelling, calculations always use mixed logit
        currency: "LOCAL", // 'LOCAL' or 'USD'
        scenarioName: "",
        scenarioNotes: "",
        latestOutputs: null,
        savedScenarios: [],
        charts: {
            uptake: null,
            lives: null,
            bcr: null
        }
    };

    let toastTimeout = null;

    // Utility helpers

    function logistic(x) {
        if (x > 30) return 1;
        if (x < -30) return 0;
        return 1 / (1 + Math.exp(-x));
    }

    function formatPercent(p) {
        if (!Number.isFinite(p)) return "-";
        return (p * 100).toFixed(1) + "%";
    }

    function getLocalCurrencyLabel() {
        return LOCAL_CURRENCY_LABELS[state.country] || "Local currency";
    }

    function formatCurrency(value) {
        if (!Number.isFinite(value)) return "-";
        const rounded = Math.round(value);
        if (state.currency === "USD") {
            const usd = rounded / LOCAL_PER_USD;
            return "USD " + Math.round(usd).toLocaleString("en-US");
        }
        const label = getLocalCurrencyLabel();
        return label + " " + rounded.toLocaleString("en-US");
    }

    function formatLivesPer100k(value) {
        if (!Number.isFinite(value)) return "-";
        return value.toFixed(1) + " per 100,000";
    }

    function formatLivesCount(value) {
        if (!Number.isFinite(value)) return "-";
        return Math.round(value).toLocaleString("en-US");
    }

    function formatCountry() {
        if (state.country === "australia") return "Australia";
        if (state.country === "france") return "France";
        if (state.country === "italy") return "Italy";
        return state.country;
    }

    function formatOutbreak() {
        return state.outbreak === "severe" ? "Severe outbreak" : "Mild outbreak";
    }

    function formatScope() {
        return state.scope === "all"
            ? "All occupations and public spaces"
            : "High-risk occupations only";
    }

    function formatExemptions() {
        if (state.exemptions === "med_relig") {
            return "Medical + religious";
        }
        if (state.exemptions === "med_rel_pers") {
            return "Medical + religious + personal belief";
        }
        return "Medical only";
    }

    function formatCoverage() {
        return state.coverage + "% of population";
    }

    function getDceKey() {
        return state.country + "_" + state.outbreak;
    }

    function getActiveParams() {
        const key = getDceKey();
        let params = DCE_PARAMS_MXL[key];
        if (!params) {
            const fallbackKey = state.country + "_mild";
            params = DCE_PARAMS_MXL[fallbackKey];
        }
        return params;
    }

    // Core calculations

    function computeSupport() {
        const params = getActiveParams();
        if (!params) {
            return { deltaV: NaN, support: NaN, optout: NaN };
        }

        const b = params.beta;
        let attrSum = 0;

        if (state.scope === "all") attrSum += b.scope_all;

        if (state.exemptions === "med_relig") attrSum += b.ex_medRelig;
        else if (state.exemptions === "med_rel_pers") attrSum += b.ex_medReligPers;

        if (state.coverage === "70") attrSum += b.cov70;
        else if (state.coverage === "90") attrSum += b.cov90;

        attrSum += b.lives * state.livesSaved;

        const baseline = -params.asc_optout;
        const deltaV = baseline + attrSum;
        const support = logistic(deltaV);
        const optout = 1 - support;

        return { deltaV, support, optout };
    }

    function computeEquivalentLives() {
        const key = getDceKey();
        const table = WTS_TABLE[key] || null;

        let adjustment = 0;

        if (table) {
            if (state.scope === "all" && Number.isFinite(table.scope_all)) {
                adjustment += table.scope_all;
            }
            if (state.exemptions === "med_relig" && Number.isFinite(table.ex_medRelig)) {
                adjustment += table.ex_medRelig;
            } else if (state.exemptions === "med_rel_pers" && Number.isFinite(table.ex_medReligPers)) {
                adjustment += table.ex_medReligPers;
            }
            if (state.coverage === "70" && Number.isFinite(table.cov70)) {
                adjustment += table.cov70;
            } else if (state.coverage === "90" && Number.isFinite(table.cov90)) {
                adjustment += table.cov90;
            }
        }

        const baseLives = state.livesSaved;
        const eqLivesPer100k = baseLives - adjustment;

        return { baseLives, adjustment, eqLivesPer100k };
    }

    function computeOutputs() {
        const { deltaV, support, optout } = computeSupport();
        const { baseLives, adjustment, eqLivesPer100k } = computeEquivalentLives();

        const pop = state.populationMillions * 1_000_000;
        const totalLives = eqLivesPer100k * (pop / 100_000);

        const valueLives = totalLives * state.valuePerLife;
        const cost = state.costPerPerson * pop;
        const netBenefit = valueLives - cost;
        const bcr = cost > 0 ? valueLives / cost : null;

        return {
            deltaV,
            support,
            optout,
            baseLives,
            adjustment,
            eqLivesPer100k,
            totalLives,
            valueLives,
            cost,
            netBenefit,
            bcr
        };
    }

    // UI updates

    function updateLivesDisplay() {
        const el = document.getElementById("lives-display");
        if (!el) return;
        el.textContent = state.livesSaved.toFixed(0) + " lives per 100,000";
    }

    function updateCurrencyLabels() {
        const label1 = document.getElementById("currency-label");
        const label2 = document.getElementById("currency-label-2");
        let label = getLocalCurrencyLabel();
        if (state.currency === "USD") {
            label = "USD";
        }
        if (label1) label1.textContent = label;
        if (label2) label2.textContent = label;
    }

    function updateConfigSummary() {
        const el = document.getElementById("config-summary");
        if (!el) return;

        const modelLabel = "Average mixed logit";

        el.innerHTML = `
            <div><span>Country</span><br><strong>${formatCountry()}</strong></div>
            <div><span>Outbreak scenario</span><br><strong>${formatOutbreak()}</strong></div>
            <div><span>Scope of mandate</span><br><strong>${formatScope()}</strong></div>
            <div><span>Exemption policy</span><br><strong>${formatExemptions()}</strong></div>
            <div><span>Coverage threshold</span><br><strong>${formatCoverage()}</strong></div>
            <div><span>Lives saved attribute</span><br><strong>${state.livesSaved.toFixed(
                0
            )} per 100,000</strong></div>
            <div><span>Population covered</span><br><strong>${state.populationMillions.toFixed(
                1
            )} million</strong></div>
            <div><span>Cost per person</span><br><strong>${formatCurrency(
                state.costPerPerson
            )}</strong></div>
            <div><span>Value per life saved</span><br><strong>${formatCurrency(
                state.valuePerLife
            )}</strong></div>
            <div><span>Preference model</span><br><strong>${modelLabel}</strong></div>
        `;
    }

    function updateConfigSupport(outputs) {
        const span = document.getElementById("config-endorsement-value");
        if (!span) return;
        if (!outputs || !Number.isFinite(outputs.support)) {
            span.textContent = "Apply configuration";
        } else {
            span.textContent = formatPercent(outputs.support);
        }
    }

    function updateHeadline(outputs) {
        const el = document.getElementById("headline-recommendation");
        if (!el || !outputs) return;

        const s = outputs.support;
        const b = outputs.bcr;

        if (!Number.isFinite(s)) {
            el.textContent = "Adjust the configuration to see a recommendation.";
            return;
        }

        if (!Number.isFinite(b)) {
            if (s < 0.5) {
                el.textContent =
                    "Support for this mandate is limited and costs are not well defined. Consider revisiting the design and cost inputs.";
            } else {
                el.textContent =
                    "This mandate is reasonably supported, but cost and valuation inputs are incomplete. Clarify cost and value assumptions for a clearer recommendation.";
            }
            return;
        }

        if (b < 1 && s < 0.5) {
            el.textContent =
                "At current settings, both support and net benefits are modest. Consider narrowing scope, tightening exemptions or increasing lives saved before recommending this mandate.";
        } else if (b < 1 && s >= 0.5) {
            el.textContent =
                "Public support is reasonable, but benefits do not clearly exceed costs. Lower implementation costs or test designs with stronger health gains.";
        } else if (b >= 1 && s < 0.5) {
            el.textContent =
                "Benefits exceed costs on current assumptions, but support for the mandate is limited. Explore less intrusive options or refine scope and exemptions.";
        } else {
            el.textContent =
                "This configuration appears attractive, combining strong support for a mandate with benefits that exceed costs. It is a good candidate for further detailed appraisal.";
        }
    }

    function updateResultCards(outputs) {
        if (!outputs) return;

        const supportEl = document.getElementById("support-rate");
        const optoutEl = document.getElementById("optout-rate");
        const directLivesEl = document.getElementById("direct-lives");
        const adjustEl = document.getElementById("wts-adjustment");
        const equivLivesEl = document.getElementById("equiv-lives");
        const natLivesEl = document.getElementById("national-lives");
        const valueLivesEl = document.getElementById("value-lives");
        const natCostEl = document.getElementById("national-cost");
        const netBenefitEl = document.getElementById("national-net-benefit");
        const bcrEl = document.getElementById("bcr");

        if (supportEl) supportEl.textContent = formatPercent(outputs.support);
        if (optoutEl) optoutEl.textContent = formatPercent(outputs.optout);
        if (directLivesEl) directLivesEl.textContent = outputs.baseLives.toFixed(1);
        if (adjustEl) adjustEl.textContent = outputs.adjustment.toFixed(1);
        if (equivLivesEl) equivLivesEl.textContent = outputs.eqLivesPer100k.toFixed(1);

        if (natLivesEl) natLivesEl.textContent = formatLivesCount(outputs.totalLives);
        if (valueLivesEl) valueLivesEl.textContent = formatCurrency(outputs.valueLives);
        if (natCostEl) natCostEl.textContent = formatCurrency(outputs.cost);
        if (netBenefitEl) netBenefitEl.textContent = formatCurrency(outputs.netBenefit);
        if (bcrEl) {
            bcrEl.textContent = Number.isFinite(outputs.bcr)
                ? outputs.bcr.toFixed(2)
                : "-";
        }

        // Impact tab mirrors some of these values
        const impactPop = document.getElementById("impact-population");
        const impactCpp = document.getElementById("impact-cost-per-person");
        const impactVpl = document.getElementById("impact-value-per-life");
        const impactTotalCost = document.getElementById("impact-total-cost");
        const impactTotalValue = document.getElementById("impact-total-value");

        if (impactPop)
            impactPop.textContent =
                state.populationMillions.toFixed(1) + " million";
        if (impactCpp) impactCpp.textContent = formatCurrency(state.costPerPerson);
        if (impactVpl) impactVpl.textContent = formatCurrency(state.valuePerLife);
        if (impactTotalCost) impactTotalCost.textContent = formatCurrency(outputs.cost);
        if (impactTotalValue)
            impactTotalValue.textContent = formatCurrency(outputs.valueLives);
    }

    function updateCharts(outputs) {
        const uptakeCanvas = document.getElementById("chart-uptake");
        const livesCanvas = document.getElementById("chart-lives");
        const bcrCanvas = document.getElementById("chart-bcr");

        if (state.charts.uptake) state.charts.uptake.destroy();
        if (state.charts.lives) state.charts.lives.destroy();
        if (state.charts.bcr) state.charts.bcr.destroy();

        if (uptakeCanvas) {
            const ctx = uptakeCanvas.getContext("2d");
            state.charts.uptake = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: ["Support mandate", "Prefer no mandate"],
                    datasets: [
                        {
                            data: [outputs.support * 100, outputs.optout * 100]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { callback: v => v + "%" }
                        }
                    }
                }
            });
        }

        if (livesCanvas) {
            const ctx = livesCanvas.getContext("2d");
            state.charts.lives = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: ["Direct lives saved", "Welfare-equivalent"],
                    datasets: [
                        {
                            data: [outputs.baseLives, outputs.eqLivesPer100k]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        if (bcrCanvas) {
            const ctx = bcrCanvas.getContext("2d");
            state.charts.bcr = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: ["Benefit cost ratio"],
                    datasets: [
                        {
                            data: [Number.isFinite(outputs.bcr) ? outputs.bcr : 0]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }
    }

    function updateNationalSimulation(outputs) {
        const simTotalValue = document.getElementById("sim-total-value");
        const simTotalCost = document.getElementById("sim-total-cost");
        const simNet = document.getElementById("sim-net-benefit");
        const simBcr = document.getElementById("sim-bcr");
        const simLives = document.getElementById("sim-total-lives");

        if (!outputs) return;

        if (simTotalValue) simTotalValue.textContent = formatCurrency(outputs.valueLives);
        if (simTotalCost) simTotalCost.textContent = formatCurrency(outputs.cost);
        if (simNet) simNet.textContent = formatCurrency(outputs.netBenefit);
        if (simBcr) {
            simBcr.textContent = Number.isFinite(outputs.bcr)
                ? outputs.bcr.toFixed(2)
                : "-";
        }
        if (simLives) simLives.textContent = formatLivesCount(outputs.totalLives);
    }

    function openSnapshotModal(outputs) {
        const modal = document.getElementById("results-modal");
        const body = document.getElementById("modal-body");
        if (!modal || !body || !outputs) return;

        const modelLabel = "Average mixed logit";

        body.innerHTML = `
            <p><strong>Scenario:</strong> ${
                state.scenarioName || "Untitled scenario"
            }</p>
            <p>
                <strong>Country:</strong> ${formatCountry()};
                <strong>Outbreak:</strong> ${formatOutbreak()};
                <strong>Scope:</strong> ${formatScope()};
                <strong>Exemptions:</strong> ${formatExemptions()};
                <strong>Coverage threshold:</strong> ${formatCoverage()}.
            </p>
            <p>
                <strong>Lives saved attribute:</strong> ${state.livesSaved.toFixed(
                    0
                )} per 100,000;
                <strong>welfare-equivalent lives saved:</strong> ${outputs.eqLivesPer100k.toFixed(
                    1
                )} per 100,000.
            </p>
            <p>
                <strong>Population covered:</strong> ${state.populationMillions.toFixed(
                    1
                )} million;
                <strong>Cost per person:</strong> ${formatCurrency(
                    state.costPerPerson
                )};
                <strong>Value per life saved:</strong> ${formatCurrency(
                    state.valuePerLife
                )}.
            </p>
            <p>
                <strong>Support mandate:</strong> ${formatPercent(
                    outputs.support
                )};
                <strong>BCR:</strong> ${
                    Number.isFinite(outputs.bcr)
                        ? outputs.bcr.toFixed(2)
                        : "not defined"
                };
                <strong>Net monetary benefit:</strong> ${formatCurrency(
                    outputs.netBenefit
                )}.
            </p>
            <p>
                <strong>Welfare-equivalent lives saved (national):</strong> ${formatLivesCount(
                    outputs.totalLives
                )}.
            </p>
            <p>
                <strong>Preference model:</strong> ${modelLabel}.
            </p>
            <p><strong>Scenario notes:</strong> ${
                state.scenarioNotes || "None"
            }</p>
        `;

        modal.classList.remove("hidden");
    }

    function closeSnapshotModal() {
        const modal = document.getElementById("results-modal");
        if (modal) modal.classList.add("hidden");
    }

    // Scenario saving

    function saveScenario(outputs) {
        if (!outputs) return;

        const modelLabel = "Average mixed logit";

        const row = {
            name:
                state.scenarioName ||
                `Scenario ${state.savedScenarios.length + 1}`,
            country: formatCountry(),
            outbreak: formatOutbreak(),
            scope: formatScope(),
            exemptions: formatExemptions(),
            coverage: formatCoverage(),
            livesPer100k: outputs.baseLives,
            equivLivesPer100k: outputs.eqLivesPer100k,
            modelLabel,
            support: outputs.support,
            bcr: outputs.bcr,
            netBenefit: outputs.netBenefit,
            notes: state.scenarioNotes || ""
        };

        state.savedScenarios.push(row);
        renderScenarioTable();
        refreshCopilotPanel();
    }

    function renderScenarioTable() {
        const tbody = document.querySelector("#scenario-table tbody");
        if (!tbody) return;

        tbody.innerHTML = "";
        state.savedScenarios.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${s.name}</td>
                <td>${s.country}</td>
                <td>${s.outbreak}</td>
                <td>${s.scope}</td>
                <td>${s.exemptions}</td>
                <td>${s.coverage}</td>
                <td>${s.livesPer100k.toFixed(1)}</td>
                <td>${s.equivLivesPer100k.toFixed(1)}</td>
                <td>${s.modelLabel}</td>
                <td>${formatPercent(s.support)}</td>
                <td>${
                    Number.isFinite(s.bcr) ? s.bcr.toFixed(2) : "-"
                }</td>
                <td>${formatCurrency(s.netBenefit)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Toast

    function showToast(message) {
        const toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove("hidden");
        toast.classList.add("visible");
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove("visible");
            toast.classList.add("hidden");
        }, 3000);
    }

    // Export helpers

    function exportScenariosToExcel() {
        if (state.savedScenarios.length === 0) {
            showToast("Save at least one scenario before exporting.");
            return;
        }

        const sheetData = [
            [
                "Name",
                "Country",
                "Outbreak",
                "Scope",
                "Exemptions",
                "Coverage",
                "Lives saved (per 100k)",
                "Equiv. lives (per 100k)",
                "Preference model",
                "Support mandate",
                "Benefit cost ratio",
                "Net benefit (local currency)",
                "Notes"
            ]
        ];

        state.savedScenarios.forEach(s => {
            sheetData.push([
                s.name,
                s.country,
                s.outbreak,
                s.scope,
                s.exemptions,
                s.coverage,
                s.livesPer100k,
                s.equivLivesPer100k,
                s.modelLabel,
                s.support,
                s.bcr,
                s.netBenefit,
                s.notes
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "MandEval scenarios");
        XLSX.writeFile(wb, "MandEval_vaccine_mandate_scenarios.xlsx");
        showToast("Excel file downloaded.");
    }

    function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
        const lines = doc.splitTextToSize(text, maxWidth);
        lines.forEach(line => {
            if (y > 280) {
                doc.addPage();
                y = 20;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
            }
            doc.text(line, x, y);
            y += lineHeight;
        });
        return y;
    }

    function exportPolicyBriefPDF() {
        if (!jsPDF || state.savedScenarios.length === 0) {
            showToast("Save at least one scenario before downloading the PDF.");
            return;
        }

        const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("MandEval vaccine mandate brief", 20, 20);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        let y = 28;

        y = addWrappedText(
            doc,
            "This brief summarises vaccine mandate configurations evaluated with MandEval. " +
                "Results link discrete choice experiment evidence on public support with simple " +
                "assumptions about lives saved and implementation costs.",
            20,
            y,
            170,
            5
        );

        y += 3;
        doc.setFont("helvetica", "italic");
        y = addWrappedText(
            doc,
            "Prepared by Mesfin Genie, PhD, Newcastle Business School, The University of Newcastle, Australia. " +
                "Contact: mesfin.genie@newcastle.edu.au.",
            20,
            y,
            170,
            5
        );
        doc.setFont("helvetica", "normal");

        state.savedScenarios.forEach((s, idx) => {
            y += 6;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            doc.text(`Scenario ${idx + 1}: ${s.name}`, 20, y);
            y += 5;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);

            const supportPct = (s.support * 100).toFixed(1);
            const bcrText = Number.isFinite(s.bcr)
                ? s.bcr.toFixed(2)
                : "not defined";

            const scenarioText =
                `Country: ${s.country}; outbreak: ${s.outbreak}. ` +
                `Scope: ${s.scope}; exemptions: ${s.exemptions}; coverage: ${s.coverage}.\n` +
                `Lives saved (per 100k): ${s.livesPer100k.toFixed(
                    1
                )}; welfare-equivalent (per 100k): ${s.equivLivesPer100k.toFixed(
                    1
                )}.\n` +
                `Support mandate: ${supportPct} percent; benefit cost ratio: ${bcrText}.\n` +
                `Net benefit (local currency): ${Math.round(
                    s.netBenefit
                ).toLocaleString("en-US")}.\n` +
                `Scenario notes: ${s.notes || "None."}`;

            y = addWrappedText(doc, scenarioText, 20, y, 170, 5);
        });

        doc.save("MandEval_vaccine_mandate_brief.pdf");
        showToast("Policy brief PDF downloaded.");
    }

    // Technical appendix

    function initTechnicalPreview() {
        const preview = document.getElementById("technical-preview");
        if (!preview) return;
        preview.innerHTML =
            "<p>This appendix sets out the mixed logit model, " +
            "the willingness-to-save-lives calculations and the simple cost–benefit " +
            "framework used in MandEval. Worked examples illustrate how support, " +
            "welfare-equivalent lives saved and benefit cost ratios are derived.</p>";
    }

    function openTechnicalWindow() {
        const tpl = document.getElementById("technical-appendix-template");
        if (!tpl) return;
        const html = tpl.textContent || tpl.innerText;
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // Advanced settings

    function populateAdvancedSettingsForm() {
        const input = document.getElementById("adv-local-per-usd");
        if (!input) return;
        input.value = LOCAL_PER_USD.toFixed(1);
    }

    function applyAdvancedSettings() {
        const input = document.getElementById("adv-local-per-usd");
        if (!input) return;
        const val = parseFloat(input.value);
        if (Number.isFinite(val) && val > 0) {
            LOCAL_PER_USD = val;
        }
        rerun();
        showToast("Advanced settings applied.");
    }

    function resetAdvancedSettings() {
        LOCAL_PER_USD = LOCAL_PER_USD_DEFAULT;
        populateAdvancedSettingsForm();
        rerun();
        showToast("Advanced settings reset to defaults.");
    }

    function loadExternalEpiConfig() {
        fetch(EPI_CONFIG_URL)
            .then(resp => {
                if (!resp.ok) throw new Error("No epi_config");
                return resp.json();
            })
            .then(json => {
                epiConfig = json;
                showToast("External epi_config.json loaded (reserved for future extensions).");
            })
            .catch(() => {
                epiConfig = null;
            });
    }

    // Copilot prompt

    function buildCopilotPrompt() {
        const outputs = state.latestOutputs || computeOutputs();

        const primaryConfiguration = {
            name: state.scenarioName || "Current configuration",
            country: formatCountry(),
            outbreak: formatOutbreak(),
            scope: formatScope(),
            exemptions: formatExemptions(),
            coverage_threshold_percent: Number(state.coverage),
            lives_saved_attribute_per_100k: state.livesSaved,
            welfare_equivalent_lives_saved_per_100k: outputs.eqLivesPer100k,
            support_mandate_fraction: outputs.support,
            prefer_no_mandate_fraction: outputs.optout,
            population_millions: state.populationMillions,
            cost_per_person_local_currency: state.costPerPerson,
            value_per_life_local_currency: state.valuePerLife,
            total_welfare_equivalent_lives_saved_national: outputs.totalLives,
            total_value_of_lives_saved_local_currency: outputs.valueLives,
            total_implementation_cost_local_currency: outputs.cost,
            net_monetary_benefit_local_currency: outputs.netBenefit,
            benefit_cost_ratio: outputs.bcr
        };

        const savedScenarios = state.savedScenarios.map((s, idx) => ({
            id: idx + 1,
            name: s.name,
            country: s.country,
            outbreak: s.outbreak,
            scope: s.scope,
            exemptions: s.exemptions,
            coverage: s.coverage,
            lives_saved_per_100k: s.livesPer100k,
            welfare_equivalent_lives_saved_per_100k: s.equivLivesPer100k,
            support_mandate_fraction: s.support,
            benefit_cost_ratio: s.bcr,
            net_monetary_benefit_local_currency: s.netBenefit,
            preference_model: s.modelLabel,
            notes: s.notes
        }));

        const payload = {
            tool_name: "MandEval vaccine mandate decision aid",
            purpose: "Use MandEval outputs to prepare a clear, non-technical policy brief on COVID-19 vaccine mandates.",
            instructions_for_copilot:
                "Using the configuration and scenarios below, write a structured 3–5 page policy brief for public health and government stakeholders. " +
                "Explain clearly: (1) context and objectives of vaccine mandates; (2) description of the main configuration and any comparator scenarios; " +
                "(3) predicted public support; (4) welfare-equivalent lives saved; (5) national costs, benefits, net monetary benefits and benefit cost ratios; " +
                "and (6) key trade-offs and recommendations. Use plain language and avoid technical econometric jargon.",
            primary_configuration: primaryConfiguration,
            saved_scenarios: savedScenarios,
            notes_from_user: state.scenarioNotes || ""
        };

        return JSON.stringify(payload, null, 2);
    }

    function refreshCopilotPanel() {
        const panel = document.getElementById("copilot-prompt-panel");
        if (!panel) return;
        const promptText = buildCopilotPrompt();
        panel.value = promptText;
    }

    function openCopilotAndCopy() {
        const promptText = buildCopilotPrompt();
        const panel = document.getElementById("copilot-prompt-panel");
        if (panel) {
            panel.value = promptText;
        }

        const copyFallback = () => {
            if (!panel) return;
            panel.focus();
            panel.select();
            try {
                document.execCommand("copy");
                showToast("Prompt copied. A new Copilot tab should now be open.");
            } catch (e) {
                showToast("Copy may have failed. You can copy the prompt manually.");
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(promptText)
                .then(() => {
                    showToast("Prompt copied. A new Copilot tab should now be open.");
                })
                .catch(copyFallback);
        } else {
            copyFallback();
        }

        window.open("https://copilot.microsoft.com", "_blank");
    }

    // Events

    function attachEvents() {
        // Tabs
        document.querySelectorAll(".tab-link").forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.getAttribute("data-tab");
                if (!tab) return;
                state.tab = tab;
                document.querySelectorAll(".tab-link").forEach(b =>
                    b.classList.remove("active")
                );
                btn.classList.add("active");
                document.querySelectorAll(".tab-panel").forEach(panel => {
                    panel.classList.toggle(
                        "active",
                        panel.id === "tab-" + tab
                    );
                });
            });
        });

        // Config inputs
        const countrySel = document.getElementById("country");
        const outbreakSel = document.getElementById("outbreak");
        const scopeSel = document.getElementById("scope");
        const exSel = document.getElementById("exemptions");
        const covSel = document.getElementById("coverage");
        const livesSlider = document.getElementById("lives-slider");
        const popInput = document.getElementById("population");
        const costInput = document.getElementById("cost-per-person");
        const vplInput = document.getElementById("value-per-life");
        const nameInput = document.getElementById("scenario-name");
        const notesInput = document.getElementById("scenario-notes");

        if (countrySel) {
            countrySel.addEventListener("change", e => {
                state.country = e.target.value;
                updateCurrencyLabels();
                rerun();
            });
        }

        if (outbreakSel) {
            outbreakSel.addEventListener("change", e => {
                state.outbreak = e.target.value;
                rerun();
            });
        }

        if (scopeSel) {
            scopeSel.addEventListener("change", e => {
                state.scope = e.target.value;
                rerun();
            });
        }

        if (exSel) {
            exSel.addEventListener("change", e => {
                state.exemptions = e.target.value;
                rerun();
            });
        }

        if (covSel) {
            covSel.addEventListener("change", e => {
                state.coverage = e.target.value;
                rerun();
            });
        }

        if (livesSlider) {
            livesSlider.addEventListener("input", e => {
                state.livesSaved = Number(e.target.value);
                updateLivesDisplay();
                rerun();
            });
        }

        if (popInput) {
            popInput.addEventListener("input", e => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val) && val > 0) {
                    state.populationMillions = val;
                    rerun();
                }
            });
        }

        if (costInput) {
            costInput.addEventListener("input", e => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val) && val >= 0) {
                    state.costPerPerson = val;
                    rerun();
                }
            });
        }

        if (vplInput) {
            vplInput.addEventListener("input", e => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val) && val >= 0) {
                    state.valuePerLife = val;
                    rerun();
                }
            });
        }

        if (nameInput) {
            nameInput.addEventListener("input", e => {
                state.scenarioName = e.target.value;
                refreshCopilotPanel();
            });
        }

        if (notesInput) {
            notesInput.addEventListener("input", e => {
                state.scenarioNotes = e.target.value;
                refreshCopilotPanel();
            });
        }

        // Currency toggle
        document.querySelectorAll(".pill-toggle[data-currency]").forEach(btn => {
            btn.addEventListener("click", () => {
                const currency = btn.getAttribute("data-currency");
                state.currency = currency;
                document
                    .querySelectorAll(".pill-toggle[data-currency]")
                    .forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                updateCurrencyLabels();
                rerun();
            });
        });

        // Main buttons
        const applyBtn = document.getElementById("update-results");
        const snapshotBtn = document.getElementById("open-snapshot");
        const saveBtn = document.getElementById("save-scenario");
        const exportExcelBtn = document.getElementById("export-excel");
        const exportPdfBtn = document.getElementById("export-pdf");
        const closeModalBtn = document.getElementById("close-modal");
        const modal = document.getElementById("results-modal");
        const techBtn = document.getElementById("open-technical-window");
        const advApplyBtn = document.getElementById("advanced-apply");
        const advResetBtn = document.getElementById("advanced-reset");
        const copilotBtn = document.getElementById("copilot-open-and-copy-btn");

        if (applyBtn) {
            applyBtn.addEventListener("click", () => {
                rerun();
                showToast(
                    "Configuration applied. Open View results or go to the Results tab."
                );
            });
        }

        if (snapshotBtn) {
            snapshotBtn.addEventListener("click", () => {
                if (state.latestOutputs) {
                    openSnapshotModal(state.latestOutputs);
                    document
                        .querySelectorAll(".tab-link")
                        .forEach(b => b.classList.remove("active"));
                    const btnRes = document.querySelector('[data-tab="results"]');
                    if (btnRes) btnRes.classList.add("active");
                    document.querySelectorAll(".tab-panel").forEach(panel => {
                        panel.classList.toggle(
                            "active",
                            panel.id === "tab-results"
                        );
                    });
                } else {
                    showToast("Apply a configuration first.");
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener("click", () => {
                if (state.latestOutputs) {
                    saveScenario(state.latestOutputs);
                    openSnapshotModal(state.latestOutputs);
                    showToast("Scenario saved for comparison and reporting.");
                } else {
                    showToast("Apply a configuration first.");
                }
            });
        }

        if (exportExcelBtn) {
            exportExcelBtn.addEventListener("click", exportScenariosToExcel);
        }

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener("click", exportPolicyBriefPDF);
        }

        if (closeModalBtn) {
            closeModalBtn.addEventListener("click", closeSnapshotModal);
        }

        if (modal) {
            modal.addEventListener("click", e => {
                if (e.target.id === "results-modal") closeSnapshotModal();
            });
        }

        if (techBtn) {
            techBtn.addEventListener("click", openTechnicalWindow);
        }

        if (advApplyBtn) {
            advApplyBtn.addEventListener("click", e => {
                e.preventDefault();
                applyAdvancedSettings();
            });
        }

        if (advResetBtn) {
            advResetBtn.addEventListener("click", e => {
                e.preventDefault();
                resetAdvancedSettings();
            });
        }

        if (copilotBtn) {
            copilotBtn.addEventListener("click", e => {
                e.preventDefault();
                openCopilotAndCopy();
            });
        }
    }

    // Main rerun

    function rerun() {
        const outputs = computeOutputs();
        state.latestOutputs = outputs;
        updateConfigSummary();
        updateConfigSupport(outputs);
        updateResultCards(outputs);
        updateCharts(outputs);
        updateHeadline(outputs);
        updateNationalSimulation(outputs);
        refreshCopilotPanel();
    }

    function init() {
        updateLivesDisplay();
        updateCurrencyLabels();
        updateConfigSummary();
        initTechnicalPreview();
        populateAdvancedSettingsForm();
        loadExternalEpiConfig();
        rerun();
    }

    document.addEventListener("DOMContentLoaded", () => {
        attachEvents();
        init();
    });
})();
