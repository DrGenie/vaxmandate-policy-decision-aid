/* ============================================================
   DISCRETE CHOICE DECISION AID – VACCINE MANDATE TOOL
   Clean Version (C1)
   ============================================================ */

/* -----------------------------
   1. INPUT STATE
----------------------------- */
const state = {
    country: "australia",
    scenario: "mild",
    scope: "highrisk",
    exemptions: [],
    coverage: 50,
    livesSaved: 20,

    showUptake: true,
    showWTS: true,
    showTable: true
};

/* -----------------------------
   2. COUNTRY–SCENARIO COEFFICIENTS
   (MXL mean coefficients only)
----------------------------- */
const coef = {
    australia: {
        mild: {
            lives: 0.072,
            scope_all: -0.319,
            ex_rel: -0.157,
            ex_pers: -0.267,
            cov70: 0.171,
            cov90: 0.158
        },
        severe: {
            lives: 0.079,
            scope_all: 0.190,
            ex_rel: -0.181,
            ex_pers: -0.305,
            cov70: 0.371,
            cov90: 0.398
        }
    },
    italy: {
        mild: {
            lives: 0.039,
            scope_all: -0.276,
            ex_rel: -0.176,
            ex_pers: -0.289,
            cov70: 0.185,
            cov90: 0.148
        },
        severe: {
            lives: 0.045,
            scope_all: 0.174,
            ex_rel: -0.178,
            ex_pers: -0.207,
            cov70: 0.305,
            cov90: 0.515
        }
    },
    france: {
        mild: {
            lives: 0.049,
            scope_all: -0.160,
            ex_rel: -0.121,
            ex_pers: -0.124,
            cov70: 0.232,
            cov90: 0.264
        },
        severe: {
            lives: 0.052,
            scope_all: -0.019,
            ex_rel: -0.192,
            ex_pers: -0.247,
            cov70: 0.267,
            cov90: 0.398
        }
    }
};

/* -----------------------------
   3. SIMPLE UTILITY FUNCTION
----------------------------- */
function calculateUtility() {
    const c = coef[state.country][state.scenario];
    let u = 0;

    /* Scope */
    if (state.scope === "all") u += c.scope_all;

    /* Exemptions */
    if (state.exemptions.includes("religious")) u += c.ex_rel;
    if (state.exemptions.includes("personal")) u += c.ex_pers;

    /* Coverage threshold */
    if (state.coverage === 70) u += c.cov70;
    if (state.coverage === 90) u += c.cov90;

    /* Lives saved */
    u += c.lives * state.livesSaved;

    return u;
}

/* -----------------------------
   4. Normalised Uptake Score
----------------------------- */
function calculateUptake(u) {
    const minU = -1;
    const maxU = 5;
    return Math.round(((u - minU) / (maxU - minU)) * 100);
}

/* -----------------------------
   5. WTS CALCULATIONS
----------------------------- */
function calculateWTS(attrCoef, lifeCoef) {
    return -(attrCoef / lifeCoef);
}

/* -----------------------------
   6. UPDATE CALCULATIONS
----------------------------- */
function updateResults() {
    const u = calculateUtility();
    const uptake = calculateUptake(u);

    document.getElementById("uptakeValue").innerText =
        state.showUptake ? uptake + "%" : "Hidden";

    /* Coverage WTS example */
    const selCoef =
        state.coverage === 70
            ? coef[state.country][state.scenario].cov70
            : state.coverage === 90
            ? coef[state.country][state.scenario].cov90
            : 0;

    const wts = calculateWTS(selCoef, coef[state.country][state.scenario].lives);

    document.getElementById("wtsValue").innerText =
        state.showWTS ? wts.toFixed(2) + " lives" : "Hidden";

    /* Update table */
    document.getElementById("resultsTable").classList.toggle("hidden", !state.showTable);

    updateChart();
}

/* -----------------------------
   7. CHART
----------------------------- */
let uptakeChart = null;

function updateChart() {
    const u = calculateUtility();
    const uptake = calculateUptake(u);

    const ctx = document.getElementById("uptakeChart").getContext("2d");

    if (uptakeChart) uptakeChart.destroy();

    uptakeChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Predicted Uptake (%)"],
            datasets: [
                {
                    label: "Uptake",
                    data: [uptake],
                    backgroundColor: "#1f6feb"
                }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

/* -----------------------------
   8. EVENT LISTENERS
----------------------------- */
document.getElementById("country").addEventListener("change", e => {
    state.country = e.target.value;
    updateResults();
});

document.getElementById("scenario").addEventListener("change", e => {
    state.scenario = e.target.value;
    updateResults();
});

document.getElementById("scope").addEventListener("change", e => {
    state.scope = e.target.value;
    updateResults();
});

/* Exemptions */
document.querySelectorAll(".exemption").forEach(chk => {
    chk.addEventListener("change", () => {
        state.exemptions = [...document.querySelectorAll(".exemption:checked")].map(x => x.value);
        updateResults();
    });
});

/* Coverage slider */
document.getElementById("coverage").addEventListener("input", e => {
    state.coverage = parseInt(e.target.value);
    document.getElementById("coverage-val").innerText = state.coverage + "%";
    updateResults();
});

/* Lives saved slider */
document.getElementById("livesSaved").addEventListener("input", e => {
    state.livesSaved = parseInt(e.target.value);
    document.getElementById("lives-val").innerText = state.livesSaved;
    updateResults();
});

/* Toggles */
document.getElementById("toggleUptake").addEventListener("change", e => {
    state.showUptake = e.target.checked;
    updateResults();
});

document.getElementById("toggleWTS").addEventListener("change", e => {
    state.showWTS = e.target.checked;
    updateResults();
});

document.getElementById("toggleTable").addEventListener("change", e => {
    state.showTable = e.target.checked;
    updateResults();
});

/* Reset */
document.getElementById("resetBtn").addEventListener("click", () => {
    location.reload();
});

/* -----------------------------
   INIT
----------------------------- */
updateResults();
