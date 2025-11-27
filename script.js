// script.js
/****************************************************************************
 * Vaccine Mandate Online Policy Decision Aid Tool
 * - Dynamic content for tabs, scenario calculation, charts, and PDF export.
 * - Updated to use final mixed logit (MXL) and latent class (LC) results
 *   by country and outbreak framing (mild vs severe).
 ****************************************************************************/

document.addEventListener("DOMContentLoaded", function () {
  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach((button) => {
    button.addEventListener("click", function () {
      openTab(this.getAttribute("data-tab"), this);
    });
  });

  // Set default tab and selections
  openTab("introTab", document.querySelector(".tablink"));
  const countrySel = document.getElementById("country_select");
  const framingSel = document.getElementById("framing_select");
  const modelSel = document.getElementById("model_select");
  if (countrySel) countrySel.value = "Australia";
  if (framingSel) framingSel.value = "mild";
  if (modelSel) modelSel.value = "MXL";
});

/** Tab switching logic (and auto-render charts on tab open) */
function openTab(tabId, btn) {
  const tabs = document.querySelectorAll(".tabcontent");
  tabs.forEach((tab) => (tab.style.display = "none"));
  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  });
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.style.display = "block";
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
  }

  if (tabId === "wtpTab") renderWTPChart();
  if (tabId === "costsTab") renderCostsBenefits();
  if (tabId === "probTab") renderProbChart();
}

/** Slider display update for Lives Saved */
function updateLivesDisplay(val) {
  document.getElementById("livesLabel").textContent = val;
}

/***************************************************************************
 * Mixed Logit Mean Coefficient Sets (final MXL results, Table 3)
 * Keys: `${country}_${scenarioType}` with scenarioType in {mild, severe}
 ***************************************************************************/
const coefficientSets = {
  Australia_mild: {
    ASC_mean: 0.464,
    ASC_optout: -0.572,
    scope2: -0.319,
    exemption2: -0.157,
    exemption3: -0.267,
    coverage2: 0.171,
    coverage3: 0.158,
    lives: 0.072,
  },
  Australia_severe: {
    ASC_mean: 0.535,
    ASC_optout: -0.694,
    scope2: 0.19,
    exemption2: -0.181,
    exemption3: -0.305,
    coverage2: 0.371,
    coverage3: 0.398,
    lives: 0.079,
  },
  Italy_mild: {
    ASC_mean: 0.625,
    ASC_optout: -0.238,
    scope2: -0.276,
    exemption2: -0.176,
    exemption3: -0.289,
    coverage2: 0.185,
    coverage3: 0.148,
    lives: 0.039,
  },
  Italy_severe: {
    ASC_mean: 0.799,
    ASC_optout: -0.463,
    scope2: 0.174,
    exemption2: -0.178,
    exemption3: -0.207,
    coverage2: 0.305,
    coverage3: 0.515,
    lives: 0.045,
  },
  France_mild: {
    ASC_mean: 0.899,
    ASC_optout: 0.307,
    scope2: -0.16,
    exemption2: -0.121,
    exemption3: -0.124,
    coverage2: 0.232,
    coverage3: 0.264,
    lives: 0.049,
  },
  France_severe: {
    ASC_mean: 0.884,
    ASC_optout: 0.083,
    scope2: -0.019,
    exemption2: -0.192,
    exemption3: -0.247,
    coverage2: 0.267,
    coverage3: 0.398,
    lives: 0.052,
  },
};

/***************************************************************************
 * WTS Data from Mixed Logit (Table 4)
 * WTS = -β_attribute / β_lives_saved, in lives per 100k.
 * We store value, standard error, and significance level.
 ***************************************************************************/
const wtsDataSets = {
  Australia_mild: {
    scope2: { wts: 4.421, se: 0.816, sig: "***" },
    exemption2: { wts: 2.171, se: 0.671, sig: "***" },
    exemption3: { wts: 3.7, se: 0.845, sig: "***" },
    coverage2: { wts: -2.365, se: 0.719, sig: "***" },
    coverage3: { wts: -2.187, se: 0.831, sig: "***" },
  },
  Australia_severe: {
    scope2: { wts: -2.418, se: 0.714, sig: "***" },
    exemption2: { wts: 2.292, se: 0.619, sig: "***" },
    exemption3: { wts: 3.878, se: 0.744, sig: "***" },
    coverage2: { wts: -4.708, se: 0.66, sig: "***" },
    coverage3: { wts: -5.05, se: 0.757, sig: "***" },
  },
  Italy_mild: {
    scope2: { wts: 7.103, se: 1.545, sig: "***" },
    exemption2: { wts: 4.531, se: 1.4, sig: "***" },
    exemption3: { wts: 7.456, se: 1.691, sig: "***" },
    coverage2: { wts: -4.766, se: 1.315, sig: "***" },
    coverage3: { wts: -3.824, se: 1.418, sig: "***" },
  },
  Italy_severe: {
    scope2: { wts: -3.853, se: 1.181, sig: "***" },
    exemption2: { wts: 3.955, se: 1.117, sig: "***" },
    exemption3: { wts: 4.597, se: 1.266, sig: "***" },
    coverage2: { wts: -6.773, se: 1.102, sig: "***" },
    coverage3: { wts: -11.409, se: 1.333, sig: "***" },
  },
  France_mild: {
    scope2: { wts: 3.288, se: 1.014, sig: "***" },
    exemption2: { wts: 2.49, se: 1.01, sig: "**" },
    exemption3: { wts: 2.545, se: 1.169, sig: "**" },
    coverage2: { wts: -4.779, se: 0.994, sig: "***" },
    coverage3: { wts: -5.434, se: 1.082, sig: "***" },
  },
  France_severe: {
    scope2: { wts: 0.373, se: 0.949, sig: "ns" }, // p ≈ 0.694
    exemption2: { wts: 3.687, se: 0.958, sig: "***" },
    exemption3: { wts: 4.747, se: 1.087, sig: "***" },
    coverage2: { wts: -5.117, se: 0.944, sig: "***" },
    coverage3: { wts: -7.638, se: 1.061, sig: "***" },
  },
};

/***************************************************************************
 * Latent Class Logit Models (Tables 5 & 6)
 * Two classes per country/scenario: supporters vs resisters.
 * Uptake = sum_k share_k * P_k(mandate | class k).
 ***************************************************************************/
const lcModelSets = {
  // Mild outbreak
  Australia_mild: {
    supporters: {
      ASC_mean: 0.28,
      ASC_optout: -1.01,
      scope2: -0.19,
      exemption2: -0.18,
      exemption3: -0.21,
      coverage2: 0.1,
      coverage3: 0.17,
      lives: 0.04,
    },
    resisters: {
      ASC_mean: 0.11,
      ASC_optout: 2.96,
      scope2: -0.26,
      exemption2: 0.11,
      exemption3: 0.15,
      coverage2: -0.09,
      coverage3: -0.26,
      lives: 0.02,
    },
    shareSupporters: 0.7468,
    shareResisters: 0.2532,
  },
  Italy_mild: {
    supporters: {
      ASC_mean: 0.42,
      ASC_optout: -0.96,
      scope2: -0.18,
      exemption2: -0.14,
      exemption3: -0.24,
      coverage2: 0.13,
      coverage3: 0.18,
      lives: 0.03,
    },
    resisters: {
      ASC_mean: 0.1,
      ASC_optout: 2.7,
      scope2: -0.24,
      exemption2: -0.12,
      exemption3: 0.07,
      coverage2: -0.09,
      coverage3: -0.18,
      lives: 0.01,
    },
    shareSupporters: 0.7005,
    shareResisters: 0.2995,
  },
  France_mild: {
    supporters: {
      ASC_mean: 0.56,
      ASC_optout: -0.68,
      scope2: -0.11,
      exemption2: -0.16,
      exemption3: -0.15,
      coverage2: 0.12,
      coverage3: 0.19,
      lives: 0.03,
    },
    resisters: {
      ASC_mean: 0.45,
      ASC_optout: 2.75,
      scope2: -0.18,
      exemption2: 0.07,
      exemption3: 0.18,
      coverage2: -0.01,
      coverage3: -0.02,
      lives: 0.01,
    },
    shareSupporters: 0.7169,
    shareResisters: 0.2831,
  },

  // Severe outbreak
  Australia_severe: {
    supporters: {
      ASC_mean: 0.27,
      ASC_optout: -0.82,
      scope2: 0.12,
      exemption2: -0.15,
      exemption3: -0.23,
      coverage2: 0.16,
      coverage3: 0.24,
      lives: 0.04,
    },
    resisters: {
      ASC_mean: 0.15,
      ASC_optout: 2.68,
      scope2: -0.0,
      exemption2: -0.09,
      exemption3: 0.06,
      coverage2: 0.09,
      coverage3: 0.05,
      lives: 0.01,
    },
    shareSupporters: 0.7776,
    shareResisters: 0.2224,
  },
  Italy_severe: {
    supporters: {
      ASC_mean: 0.44,
      ASC_optout: -0.74,
      scope2: 0.17,
      exemption2: -0.12,
      exemption3: -0.23,
      coverage2: 0.2,
      coverage3: 0.36,
      lives: 0.03,
    },
    resisters: {
      ASC_mean: 0.34,
      ASC_optout: 2.6,
      scope2: -0.06,
      exemption2: -0.17,
      exemption3: 0.09,
      coverage2: -0.06,
      coverage3: -0.02,
      lives: 0.0,
    },
    shareSupporters: 0.7477,
    shareResisters: 0.2523,
  },
  France_severe: {
    supporters: {
      ASC_mean: 0.53,
      ASC_optout: -0.57,
      scope2: 0.06,
      exemption2: -0.12,
      exemption3: -0.18,
      coverage2: 0.15,
      coverage3: 0.27,
      lives: 0.04,
    },
    resisters: {
      ASC_mean: 0.41,
      ASC_optout: 2.4,
      scope2: -0.2,
      exemption2: -0.1,
      exemption3: -0.05,
      coverage2: 0.11,
      coverage3: 0.18,
      lives: 0.0,
    },
    shareSupporters: 0.7504,
    shareResisters: 0.2496,
  },
};

/***************************************************************************
 * Helper: current model selection
 ***************************************************************************/
function getCurrentModelChoice() {
  const sel = document.getElementById("model_select");
  return sel ? sel.value : "MXL";
}

/***************************************************************************
 * Build scenario from Inputs & Calculate core outputs (uptake, net benefit)
 ***************************************************************************/
function buildScenarioFromInputs() {
  const country = document.getElementById("country_select").value;
  const scenarioType = document.getElementById("framing_select").value;
  const lives_val = parseInt(document.getElementById("livesSlider").value, 10);

  const scopeRadio = document.querySelector('input[name="scope"]:checked');
  const exemptionRadio = document.querySelector('input[name="exemption"]:checked');
  const coverageRadio = document.querySelector('input[name="coverage"]:checked');

  const allCheck = !!scopeRadio; // true if "All occupations" selected
  const medRelCheck = exemptionRadio && exemptionRadio.value === "medRel";
  const broadCheck = exemptionRadio && exemptionRadio.value === "broad";
  const cov70Check = coverageRadio && coverageRadio.value === "70";
  const cov90Check = coverageRadio && coverageRadio.value === "90";

  const coefKey = `${country}_${scenarioType}`;
  if (!coefficientSets[coefKey]) {
    alert("Coefficients for the selected country/scenario not found.");
    return null;
  }

  const prob = getUptakeProbability({
    country,
    scenarioType,
    allCheck,
    medRelCheck,
    broadCheck,
    cov70Check,
    cov90Check,
    lives_val,
  });
  const uptakePercent = prob * 100;

  const basePopulation = 3000; // working base (scaled per 100k)
  const participants = basePopulation * prob;
  const livesSavedTotal = (lives_val / 3000) * (basePopulation * prob);

  const QALY_VALUES = { low: 5, moderate: 10, high: 20 };
  const qalyScenarioEl = document.getElementById("qalySelect");
  const qalyScenario = qalyScenarioEl ? qalyScenarioEl.value : "moderate";
  const qalyPerLife = QALY_VALUES[qalyScenario];
  const totalQALY = livesSavedTotal * qalyPerLife;

  const currencySymbol = country === "Australia" ? "A$" : "€";
  const valuePerQALY = 50000;
  const costPerPerson = 50;
  const fixedCost = (basePopulation / 3000) * 200000;
  const totalInterventionCost = fixedCost + costPerPerson * participants;
  const monetizedBenefits = totalQALY * valuePerQALY;
  const netBenefitValue = monetizedBenefits - totalInterventionCost;

  return {
    country,
    scenarioType,
    lives_val,
    allCheck,
    medRelCheck,
    broadCheck,
    cov70Check,
    cov90Check,
    predictedUptake: uptakePercent.toFixed(2),
    netBenefit: `${currencySymbol}${netBenefitValue.toFixed(2)}`,
  };
}

/***************************************************************************
 * Core Uptake Functions
 ***************************************************************************/

/** Mixed logit probability using mean coefficients */
function computeProbabilityMXL(params) {
  const key = `${params.country}_${params.scenarioType}`;
  const c = coefficientSets[key];
  if (!c) return null;

  const scope2 = params.allCheck ? 1 : 0;
  const exemption2 = params.medRelCheck ? 1 : 0;
  const exemption3 = params.broadCheck ? 1 : 0;
  const coverage2 = params.cov70Check ? 1 : 0;
  const coverage3 = params.cov90Check ? 1 : 0;
  const livesCount = params.lives_val;

  const U_alt =
    c.ASC_mean +
    c.scope2 * scope2 +
    c.exemption2 * exemption2 +
    c.exemption3 * exemption3 +
    c.coverage2 * coverage2 +
    c.coverage3 * coverage3 +
    c.lives * livesCount;
  const U_optout = c.ASC_optout;
  return Math.exp(U_alt) / (Math.exp(U_alt) + Math.exp(U_optout));
}

/** Latent class probability using class shares */
function computeProbabilityLC(params) {
  const key = `${params.country}_${params.scenarioType}`;
  const model = lcModelSets[key];
  if (!model) return null;

  const scope2 = params.allCheck ? 1 : 0;
  const exemption2 = params.medRelCheck ? 1 : 0;
  const exemption3 = params.broadCheck ? 1 : 0;
  const coverage2 = params.cov70Check ? 1 : 0;
  const coverage3 = params.cov90Check ? 1 : 0;
  const livesCount = params.lives_val;

  function probForClass(coefs) {
    const U_alt =
      coefs.ASC_mean +
      coefs.scope2 * scope2 +
      coefs.exemption2 * exemption2 +
      coefs.exemption3 * exemption3 +
      coefs.coverage2 * coverage2 +
      coefs.coverage3 * coverage3 +
      coefs.lives * livesCount;
    const U_optout = coefs.ASC_optout;
    return Math.exp(U_alt) / (Math.exp(U_alt) + Math.exp(U_optout));
  }

  const pSup = probForClass(model.supporters);
  const pRes = probForClass(model.resisters);
  return (
    model.shareSupporters * pSup +
    model.shareResisters * pRes
  );
}

/** Composite engine: choose model based on UI (MXL, LC, Hybrid) */
function getUptakeProbability(params) {
  const modelChoice = getCurrentModelChoice();
  const pMXL = computeProbabilityMXL(params);
  const pLC = computeProbabilityLC(params);

  if (modelChoice === "LC" && pLC !== null) return pLC;
  if (modelChoice === "Hybrid" && pMXL !== null && pLC !== null) {
    return 0.5 * pMXL + 0.5 * pLC;
  }
  // Default to MXL if available
  if (pMXL !== null) return pMXL;
  if (pLC !== null) return pLC;
  return 0.5; // fallback
}

/***************************************************************************
 * Render WTS Chart with Error Bars
 ***************************************************************************/
let wtpChartInstance = null;
function renderWTPChart() {
  const country = document.getElementById("country_select").value;
  const scenarioType = document.getElementById("framing_select").value;
  const key = `${country}_${scenarioType}`;
  const dataSet = wtsDataSets[key];
  if (!dataSet) {
    alert("WTS data not available for this scenario.");
    return;
  }

  const ctx = document.getElementById("wtpChartMain").getContext("2d");
  if (wtpChartInstance) wtpChartInstance.destroy();

  const labels = [
    "All occupations",
    "Med+religious exc.",
    "Broad exc.",
    "70% coverage",
    "90% coverage",
  ];
  const values = [
    dataSet.scope2.wts,
    dataSet.exemption2.wts,
    dataSet.exemption3.wts,
    dataSet.coverage2.wts,
    dataSet.coverage3.wts,
  ];
  const errors = [
    dataSet.scope2.se,
    dataSet.exemption2.se,
    dataSet.exemption3.se,
    dataSet.coverage2.se,
    dataSet.coverage3.se,
  ];
  const sigs = [
    dataSet.scope2.sig,
    dataSet.exemption2.sig,
    dataSet.exemption3.sig,
    dataSet.coverage2.sig,
    dataSet.coverage3.sig,
  ];

  const barColors = values.map((v) =>
    v >= 0 ? "rgba(231, 76, 60, 0.6)" : "rgba(46, 204, 113, 0.6)"
  );
  const borderColors = values.map((v) =>
    v >= 0 ? "rgba(192, 57, 43, 1)" : "rgba(39, 174, 96, 1)"
  );

  const dataConfig = {
    labels,
    datasets: [
      {
        label: "WTS (lives per 100k)",
        data: values,
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1,
        error: errors,
        sigs: sigs,
      },
    ],
  };

  const scenarioLabel =
    scenarioType === "mild" ? "Mild outbreak" : "Severe outbreak";

  wtpChartInstance = new Chart(ctx, {
    type: "bar",
    data: dataConfig,
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true },
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `WTS by Attribute (${country}, ${scenarioLabel})`,
          font: { size: 16 },
        },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const i = context[0].dataIndex;
              const ds = context[0].dataset;
              const se = ds.error[i].toFixed(3);
              const sig = ds.sigs[i];
              return `SE: ${se}, significance: ${sig}`;
            },
          },
        },
      },
    },
    plugins: [
      {
        id: "errorbars",
        afterDraw: (chart) => {
          const {
            ctx,
            scales: { x, y },
          } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const error = errors[i];
            if (typeof error === "number") {
              ctx.save();
              ctx.strokeStyle = "#000";
              ctx.lineWidth = 1;
              const value = values[i];
              const topY = y.getPixelForValue(value + error);
              const bottomY = y.getPixelForValue(value - error);
              const xPos = bar.x;
              ctx.beginPath();
              ctx.moveTo(xPos, topY);
              ctx.lineTo(xPos, bottomY);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(xPos - 5, topY);
              ctx.lineTo(xPos + 5, topY);
              ctx.moveTo(xPos - 5, bottomY);
              ctx.lineTo(xPos + 5, bottomY);
              ctx.stroke();
              ctx.restore();
            }
          });
        },
      },
    ],
  });
}

/***************************************************************************
 * Predicted Uptake Chart (Doughnut) with Recommendation
 ***************************************************************************/
let uptakeChartInstance = null;
function renderProbChart() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const uptakeVal = parseFloat(scenario.predictedUptake);
  drawUptakeChart(uptakeVal);
  const recommendation = getRecommendation(scenario, uptakeVal);
  const modalDiv = document.getElementById("modalResults");
  if (modalDiv) {
    modalDiv.innerHTML = `<h4>Calculation Results</h4>
      <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
      <p>${recommendation}</p>`;
  }
}

/** Draw the doughnut chart for uptake vs non-uptake */
function drawUptakeChart(uptakeVal) {
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  if (uptakeChartInstance) uptakeChartInstance.destroy();
  uptakeChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake", "Non-uptake"],
      datasets: [
        {
          data: [uptakeVal, 100 - uptakeVal],
          backgroundColor: ["#27ae60", "#c0392b"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Predicted Uptake: ${uptakeVal.toFixed(1)}%`,
          font: { size: 16 },
        },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.label}: ${context.parsed.toFixed(1)}%`,
          },
        },
      },
    },
  });
}

/** Recommendation text based on attributes and uptake */
function getRecommendation(scenario, uptake) {
  let rec = "Recommendation: ";
  const modelChoice = getCurrentModelChoice();

  if (scenario.allCheck && uptake < 50) {
    rec +=
      "A mandate covering all occupations may face resistance; consider limiting the mandate to high-risk groups or increasing effectiveness (lives saved) to justify broader scope. ";
  }
  if (scenario.broadCheck && uptake < 50) {
    rec +=
      "Broad personal exemptions can undermine effectiveness; tightening exemptions to medical or medical + religious only could increase support. ";
  } else if (scenario.medRelCheck && uptake < 50) {
    rec +=
      "Allowing religious exemptions may reduce confidence; consider restricting exemptions to medical reasons if political feasibility permits. ";
  }
  if (scenario.cov90Check && uptake < 50) {
    rec +=
      "A 90% coverage target is stringent; ensure clear communication on why such a high threshold is necessary to protect the health system. ";
  }
  if (scenario.scenarioType === "mild" && uptake < 50) {
    rec +=
      "In a mild outbreak frame, willingness to accept mandates is lower; focussing on targeted mandates or voluntary strategies may be preferable unless risk increases. ";
  } else if (scenario.scenarioType === "severe" && uptake >= 50) {
    rec +=
      "In a severe outbreak, mandates with this configuration are likely to be acceptable, especially if communication emphasises hospital pressure and lives saved. ";
  }
  if (uptake >= 70) {
    rec =
      "Uptake is high. The current configuration is likely to be well-accepted and effective, particularly under the selected outbreak scenario.";
  }

  if (modelChoice === "LC") {
    rec +=
      " Estimates reflect a mixture of mandate-supporters and mandate-resisters; targeted communication to low-trust and vaccine-sceptical groups may further increase uptake.";
  }

  return rec;
}

/***************************************************************************
 * Modal helpers
 ***************************************************************************/
function openSingleScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  renderCostsBenefits();
  const uptakeVal = parseFloat(scenario.predictedUptake);
  const recommendation = getRecommendation(scenario, uptakeVal);
  const modalDiv = document.getElementById("modalResults");
  if (modalDiv) {
    modalDiv.innerHTML = `<h4>Calculation Results</h4>
      <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
      <p>${recommendation}</p>`;
  }
  openModal();
  renderProbChart();
}

function openModal() {
  const modal = document.getElementById("resultModal");
  if (modal) modal.style.display = "block";
}

function closeModal() {
  const modal = document.getElementById("resultModal");
  if (modal) modal.style.display = "none";
}

/***************************************************************************
 * Costs & Benefits Calculations and Chart
 ***************************************************************************/
let combinedChartInstance = null;
function renderCostsBenefits() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;

  const country = scenario.country;
  const scenarioType = scenario.scenarioType;
  const currencySymbol = country === "Australia" ? "A$" : "€";

  const prob = getUptakeProbability({
    country,
    scenarioType,
    allCheck: scenario.allCheck,
    medRelCheck: scenario.medRelCheck,
    broadCheck: scenario.broadCheck,
    cov70Check: scenario.cov70Check,
    cov90Check: scenario.cov90Check,
    lives_val: scenario.lives_val,
  });

  const basePop = 3000;
  const participants = basePop * prob;
  const uptakePercentage = prob * 100;
  const livesSavedTotal = (scenario.lives_val / 3000) * (basePop * prob);

  const qalyScenario = document.getElementById("qalySelect").value;
  const QALY_SCENARIO_VALUES = { low: 5, moderate: 10, high: 20 };
  const qalyPerLife = QALY_SCENARIO_VALUES[qalyScenario];
  const totalQALY = livesSavedTotal * qalyPerLife;

  const valuePerQALY = 50000;
  const monetizedBenefits = totalQALY * valuePerQALY;

  const costPerPerson = 50;
  const fixedCost = (basePop / 3000) * 200000;
  const totalCost = fixedCost + costPerPerson * participants;
  const netBenefitValue = monetizedBenefits - totalCost;

  scenario.predictedUptake = uptakePercentage.toFixed(2);
  scenario.netBenefit = `${currencySymbol}${netBenefitValue.toFixed(2)}`;

  const resultDiv = document.getElementById("costsBenefitsResults");
  resultDiv.innerHTML = "";
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "calculation-info";
  summaryDiv.innerHTML = `
    <h4>Cost &amp; Benefit Summary</h4>
    <p><strong>Predicted Uptake:</strong> ${uptakePercentage.toFixed(2)}%</p>
    <p><strong>Population (analysed):</strong> ${basePop.toLocaleString()}</p>
    <p><strong>Complying Individuals:</strong> ${participants.toFixed(0)}</p>
    <p><strong>Total Lives Saved:</strong> ${livesSavedTotal.toFixed(2)}</p>
    <p><strong>Total QALYs Gained:</strong> ${totalQALY.toFixed(2)}</p>
    <p><strong>Total Intervention Cost:</strong> ${currencySymbol}${totalCost.toFixed(2)}</p>
    <p><strong>Monetized Benefits:</strong> ${currencySymbol}${monetizedBenefits.toFixed(2)}</p>
    <p><strong>Net Benefit:</strong> ${currencySymbol}${netBenefitValue.toFixed(2)}</p>
    <p>The above assumes ${scenario.lives_val} lives saved per 100k with the mandate. Costs include a fixed setup cost and approximately ${currencySymbol}50 per person vaccinated. Benefits are valued at about ${currencySymbol}50,000 per QALY. Net Benefit = Monetized Benefits – Total Cost.</p>
  `;
  resultDiv.appendChild(summaryDiv);

  const chartContainer = document.createElement("div");
  chartContainer.id = "combinedChartContainer";
  chartContainer.innerHTML = `<canvas id="combinedChart"></canvas>`;
  resultDiv.appendChild(chartContainer);

  const ctx = document.getElementById("combinedChart").getContext("2d");
  if (combinedChartInstance) combinedChartInstance.destroy();
  combinedChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Total Cost", "Monetized Benefits", "Net Benefit"],
      datasets: [
        {
          label: `${currencySymbol}`,
          data: [totalCost, monetizedBenefits, netBenefitValue],
          backgroundColor: [
            "rgba(230, 126, 34, 0.6)",
            "rgba(41, 128, 185, 0.6)",
            "rgba(39, 174, 96, 0.6)",
          ],
          borderColor: [
            "rgba(211, 84, 0, 1)",
            "rgba(31, 97, 141, 1)",
            "rgba(30, 132, 73, 1)",
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true },
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Cost-Benefit Analysis",
          font: { size: 16 },
        },
      },
    },
  });
}

/** Toggle display of cost breakdown cards */
function toggleCostBreakdown() {
  const breakdownDiv = document.getElementById("detailedCostBreakdown");
  if (breakdownDiv.style.display === "none" || breakdownDiv.style.display === "") {
    if (breakdownDiv.innerHTML.trim() === "") {
      populateCostBreakdown();
    }
    breakdownDiv.style.display = "flex";
  } else {
    breakdownDiv.style.display = "none";
  }
}

/** Toggle display of benefits analysis */
function toggleBenefitsAnalysis() {
  const benefitsDiv = document.getElementById("detailedBenefitsAnalysis");
  benefitsDiv.style.display =
    benefitsDiv.style.display === "none" || benefitsDiv.style.display === ""
      ? "flex"
      : "none";
}

/** Populate cost breakdown cards based on current scenario */
function populateCostBreakdown() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const country = scenario.country;
  const currencySymbol = country === "Australia" ? "A$" : "€";
  const prob = parseFloat(scenario.predictedUptake) / 100;
  const basePop = 3000;
  const participants = basePop * prob;

  const costItems = [
    {
      icon: "fa-building",
      name: "Digital Verification System",
      unitCost: 1000000,
      quantity: 1,
      description: "IT platform, legal drafting, and regulatory setup (fixed cost).",
    },
    {
      icon: "fa-syringe",
      name: "Vaccines & Administration",
      unitCost: 141.06,
      quantity: (participants * 2).toFixed(0),
      description: "Vaccine doses plus administration per dose.",
    },
    {
      icon: "fa-clock",
      name: "Productivity Loss (Side Effects)",
      unitCost: 60.0,
      quantity: participants.toFixed(0),
      description: "Work hours lost due to post-vaccination recovery.",
    },
  ];

  const breakdownDiv = document.getElementById("detailedCostBreakdown");
  breakdownDiv.innerHTML = "";
  costItems.forEach((item) => {
    const total = item.unitCost * parseFloat(item.quantity);
    const card = document.createElement("div");
    card.className = "cost-card";
    card.innerHTML = `
      <h4><i class="fa-solid ${item.icon}"></i> ${item.name}</h4>
      <p><strong>Unit Cost:</strong> ${currencySymbol}${item.unitCost.toFixed(2)}</p>
      <p><strong>Quantity:</strong> ${item.quantity}</p>
      <p><strong>Total Cost:</strong> ${currencySymbol}${total.toFixed(2)}</p>
      <p><em>${item.description}</em></p>
    `;
    breakdownDiv.appendChild(card);
  });
}

/***************************************************************************
 * Scenario Saving & PDF Export
 ***************************************************************************/
let savedScenarios = [];

function saveScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenario.name = `Scenario ${savedScenarios.length + 1}`;
  savedScenarios.push(scenario);

  const tableBody = document.querySelector("#scenarioTable tbody");
  const row = document.createElement("tr");
  const cols = [
    "name",
    "country",
    "scenarioType",
    "lives_val",
    "allCheck",
    "medRelCheck",
    "broadCheck",
    "cov70Check",
    "cov90Check",
    "predictedUptake",
    "netBenefit",
  ];
  cols.forEach((col) => {
    const cell = document.createElement("td");
    if (typeof scenario[col] === "boolean") {
      cell.textContent = scenario[col] ? "Yes" : "No";
    } else {
      cell.textContent = scenario[col];
    }
    if (col === "netBenefit") cell.style.fontWeight = "600";
    row.appendChild(cell);
  });
  tableBody.appendChild(row);
  alert(`Scenario "${scenario.name}" saved successfully.`);
}

function openComparison() {
  if (savedScenarios.length < 1) {
    alert("Save at least one scenario to export.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(
    "VaxMandate Policy Simulator - Scenarios Comparison",
    310,
    30,
    { align: "center" }
  );
  let startY = 60;
  savedScenarios.forEach((scen) => {
    if (startY > 700) {
      doc.addPage();
      startY = 30;
    }
    doc.setFontSize(12);
    doc.text(
      `${scen.name}: ${scen.country}, ${scen.scenarioType} outbreak`,
      40,
      startY
    );
    startY += 14;
    const details = [
      `Lives Saved per 100k: ${scen.lives_val}`,
      `Scope (All occupations): ${scen.allCheck ? "Yes" : "No"}`,
      `Med+Rel Exemption: ${scen.medRelCheck ? "Yes" : "No"}`,
      `Broad Exemption: ${scen.broadCheck ? "Yes" : "No"}`,
      `Coverage 70%: ${scen.cov70Check ? "Yes" : "No"}`,
      `Coverage 90%: ${scen.cov90Check ? "Yes" : "No"}`,
      `Predicted Uptake: ${parseFloat(scen.predictedUptake).toFixed(1)}%`,
      `Net Benefit: ${scen.netBenefit}`,
    ];
    doc.setFontSize(11);
    details.forEach((line) => {
      doc.text(line, 60, startY);
      startY += 12;
    });
    startY += 10;
  });
  doc.save("Mandate_Scenarios_Comparison.pdf");
}
