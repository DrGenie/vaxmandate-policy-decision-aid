let mandevalConfig = null;
let supportChart = null;

let countrySelect;
let scenarioSelect;
let scopeSelect;
let exemptionsSelect;
let coverageSelect;
let livesSlider;
let livesValue;

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  initTabs();
  loadConfig();
});

function cacheDom() {
  countrySelect = document.getElementById("countrySelect");
  scenarioSelect = document.getElementById("scenarioSelect");
  scopeSelect = document.getElementById("scopeSelect");
  exemptionsSelect = document.getElementById("exemptionsSelect");
  coverageSelect = document.getElementById("coverageSelect");
  livesSlider = document.getElementById("livesSaved");
  livesValue = document.getElementById("livesSavedValue");

  if (scopeSelect) {
    scopeSelect.addEventListener("change", updateAllOutputs);
  }
  if (exemptionsSelect) {
    exemptionsSelect.addEventListener("change", updateAllOutputs);
  }
  if (coverageSelect) {
    coverageSelect.addEventListener("change", updateAllOutputs);
  }
  if (livesSlider) {
    livesSlider.addEventListener("input", () => {
      updateLivesLabel();
      updateAllOutputs();
    });
  }

  const resetButton = document.getElementById("resetPolicyButton");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      initPolicyControls();
      updateAllOutputs();
    });
  }
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tabTarget;
      if (!targetId) return;

      tabButtons.forEach((b) =>
        b.classList.toggle("tab-button--active", b === btn)
      );
      tabPanels.forEach((panel) =>
        panel.classList.toggle("tab-panel--active", panel.id === targetId)
      );
    });
  });
}

function loadConfig() {
  fetch("mandeval_config.json")
    .then((resp) => resp.json())
    .then((json) => {
      mandevalConfig = json;
      initCountryScenarioSelectors();
      initSupportChart();
      initPolicyControls();
      updateAllOutputs();
    })
    .catch((err) => {
      console.error("Error loading configuration:", err);
      showError(
        "The configuration file could not be loaded. Please check that 'mandeval_config.json' is present and valid."
      );
    });
}

function showError(message) {
  const el = document.getElementById("errorMessage");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function initCountryScenarioSelectors() {
  if (!mandevalConfig) return;

  const countries = mandevalConfig.countries || {};
  countrySelect.innerHTML = "";

  Object.entries(countries).forEach(([key, cfg]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cfg.label || key;
    countrySelect.appendChild(opt);
  });

  const defaultCountry =
    (mandevalConfig.default_country &&
      countries[mandevalConfig.default_country] &&
      mandevalConfig.default_country) ||
    Object.keys(countries)[0];

  if (defaultCountry) {
    countrySelect.value = defaultCountry;
  }

  updateScenarioOptions();

  countrySelect.addEventListener("change", () => {
    updateScenarioOptions();
    initPolicyControls();
    updateAllOutputs();
  });

  scenarioSelect.addEventListener("change", () => {
    initPolicyControls();
    updateAllOutputs();
  });
}

function updateScenarioOptions() {
  const countryKey = countrySelect.value;
  const countryCfg = mandevalConfig.countries[countryKey];
  if (!countryCfg) return;

  const scenarios = countryCfg.scenarios || {};
  scenarioSelect.innerHTML = "";

  Object.entries(scenarios).forEach(([key, cfg]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cfg.label || key;
    scenarioSelect.appendChild(opt);
  });

  const defaultScenario =
    (countryCfg.default_scenario && scenarios[countryCfg.default_scenario]) ||
    Object.keys(scenarios)[0];

  if (defaultScenario) {
    scenarioSelect.value = defaultScenario;
  }
}

function getCurrentScenarioConfig() {
  if (!mandevalConfig) return null;
  const countryKey = countrySelect.value;
  const scenarioKey = scenarioSelect.value;
  const countryCfg = mandevalConfig.countries[countryKey];
  if (!countryCfg) return null;
  return countryCfg.scenarios[scenarioKey] || null;
}

function initPolicyControls() {
  const scenarioCfg = getCurrentScenarioConfig();
  if (!scenarioCfg) return;
  const attrs = scenarioCfg.attributes;

  populateSelect(scopeSelect, attrs.scope.levels, attrs.scope.reference);
  populateSelect(
    exemptionsSelect,
    attrs.exemptions.levels,
    attrs.exemptions.reference
  );
  populateSelect(
    coverageSelect,
    attrs.coverage.levels,
    attrs.coverage.reference
  );

  const livesCfg = attrs.lives_saved;
  livesSlider.min = livesCfg.min;
  livesSlider.max = livesCfg.max;
  livesSlider.step = livesCfg.step;
  livesSlider.value = livesCfg.reference;
  updateLivesLabel();
}

function populateSelect(selectEl, levelsObj, referenceKey) {
  if (!selectEl || !levelsObj) return;
  selectEl.innerHTML = "";
  Object.entries(levelsObj).forEach(([key, level]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = level.label || key;
    selectEl.appendChild(opt);
  });

  if (referenceKey && levelsObj[referenceKey]) {
    selectEl.value = referenceKey;
  } else {
    const firstKey = Object.keys(levelsObj)[0];
    if (firstKey) {
      selectEl.value = firstKey;
    }
  }
}

function updateLivesLabel() {
  if (!livesSlider || !livesValue) return;
  livesValue.textContent = `${livesSlider.value} per 100,000 people`;
}

function updateAllOutputs() {
  if (!mandevalConfig) return;
  const scenarioCfg = getCurrentScenarioConfig();
  if (!scenarioCfg) return;

  clearError();
  updateSampleInfo(scenarioCfg);
  updateSegmentSummaries(scenarioCfg);
  updateSupportOutputs(scenarioCfg);
  updateTradeOffTable(scenarioCfg);
}

function clearError() {
  const el = document.getElementById("errorMessage");
  if (el) {
    el.textContent = "";
    el.style.display = "none";
  }
}

function updateSampleInfo(scenarioCfg) {
  const sample = scenarioCfg.sample || {};
  const n = sample.respondents || sample.n || null;
  const tasks = sample.tasks_per_respondent || sample.tasks || null;
  const totalChoices =
    sample.total_choices || (n && tasks ? n * tasks : null);

  assignText(
    "sampleSizeOverview",
    n ? n.toLocaleString("en-US") : "—"
  );
  assignText(
    "tasksPerPersonOverview",
    tasks ? String(tasks) : "—"
  );
  assignText(
    "totalChoicesOverview",
    totalChoices ? totalChoices.toLocaleString("en-US") : "—"
  );
  assignText(
    "sampleSize",
    n ? n.toLocaleString("en-US") : "—"
  );

  const diag = (scenarioCfg.mxl && scenarioCfg.mxl.diagnostics) || {};
  assignText(
    "modelNameOverview",
    diag.name || "Mixed logit (preference space)"
  );
  assignText(
    "logLikOverview",
    typeof diag.log_likelihood === "number"
      ? diag.log_likelihood.toFixed(0)
      : "—"
  );
  assignText(
    "aicOverview",
    typeof diag.aic === "number" ? diag.aic.toFixed(0) : "—"
  );
}

function assignText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function updateSegmentSummaries(scenarioCfg) {
  const lc = scenarioCfg.lc_segments;
  const overviewList = document.getElementById("segmentOverviewList");
  const resultsList = document.getElementById("segmentResultsList");

  [overviewList, resultsList].forEach((list) => {
    if (!list) return;
    list.innerHTML = "";
    if (!lc) {
      const li = document.createElement("li");
      li.textContent =
        "Latent class results are not available for this scenario.";
      list.appendChild(li);
      return;
    }
    Object.values(lc).forEach((seg) => {
      const li = document.createElement("li");
      const label = seg.label || seg.name || "Segment";
      const shareText =
        typeof seg.share === "number"
          ? `${(seg.share * 100).toFixed(0)}% of respondents`
          : "";
      const desc = seg.description || "";
      li.innerHTML = `<strong>${label}</strong><span>${shareText}${
        desc ? " – " + desc : ""
      }</span>`;
      list.appendChild(li);
    });
  });
}

function getCurrentPolicyState(scenarioCfg) {
  return {
    scope: scopeSelect ? scopeSelect.value : null,
    exemptions: exemptionsSelect ? exemptionsSelect.value : null,
    coverage: coverageSelect ? coverageSelect.value : null,
    lives_saved: livesSlider ? Number(livesSlider.value) : null,
  };
}

function computeUtilities(scenarioCfg, beta, policy) {
  let V_mandate = 0;

  const attrs = scenarioCfg.attributes;

  // Scope
  const scopeCfg = attrs.scope;
  const scopeLevel =
    scopeCfg.levels && policy.scope
      ? scopeCfg.levels[policy.scope]
      : null;
  if (scopeLevel && scopeLevel.coef_key) {
    const c = beta[scopeLevel.coef_key];
    if (c && typeof c.mean === "number") {
      V_mandate += c.mean;
    }
  }

  // Exemptions
  const exCfg = attrs.exemptions;
  const exLevel =
    exCfg.levels && policy.exemptions
      ? exCfg.levels[policy.exemptions]
      : null;
  if (exLevel && exLevel.coef_key) {
    const c = beta[exLevel.coef_key];
    if (c && typeof c.mean === "number") {
      V_mandate += c.mean;
    }
  }

  // Coverage
  const covCfg = attrs.coverage;
  const covLevel =
    covCfg.levels && policy.coverage
      ? covCfg.levels[policy.coverage]
      : null;
  if (covLevel && covLevel.coef_key) {
    const c = beta[covLevel.coef_key];
    if (c && typeof c.mean === "number") {
      V_mandate += c.mean;
    }
  }

  // Lives saved (difference relative to reference, per 10 lives)
  const livesCfg = attrs.lives_saved;
  const livesCoef = beta[livesCfg.coef_key];
  if (
    livesCoef &&
    typeof livesCoef.mean === "number" &&
    policy.lives_saved != null
  ) {
    const ref = livesCfg.reference;
    const delta = (policy.lives_saved - ref) / ref; // e.g. (25-10)/10 = 1.5
    V_mandate += livesCoef.mean * delta;
  }

  const V_no =
    beta.asc_optout && typeof beta.asc_optout.mean === "number"
      ? beta.asc_optout.mean
      : 0;

  return { V_mandate, V_noMandate: V_no };
}

function computeSupportFromUtilities(V_mandate, V_no) {
  const maxV = Math.max(V_mandate, V_no, 0);
  const eMand = Math.exp(V_mandate - maxV);
  const eNo = Math.exp(V_no - maxV);
  const denom = eMand + eNo;
  if (!isFinite(denom) || denom === 0) return 0.5;
  return eMand / denom;
}

function updateSupportOutputs(scenarioCfg) {
  const beta = scenarioCfg.mxl && scenarioCfg.mxl.coefficients;
  if (!beta) return;

  const policy = getCurrentPolicyState(scenarioCfg);
  const { V_mandate, V_noMandate } = computeUtilities(
    scenarioCfg,
    beta,
    policy
  );
  const pSupport = computeSupportFromUtilities(V_mandate, V_noMandate);
  const pNo = 1 - pSupport;

  assignText("supportRate", `${(pSupport * 100).toFixed(1)}%`);
  assignText("noMandateRate", `${(pNo * 100).toFixed(1)}%`);

  const odds = pNo > 0 ? pSupport / pNo : null;
  assignText("supportOdds", odds ? odds.toFixed(2) : "—");

  const summary = document.getElementById("supportSummaryText");
  if (summary) {
    summary.textContent = `For this configuration, approximately ${(pSupport *
      100).toFixed(
      0
    )}% of respondents are predicted to support having some mandate in place, while ${(pNo *
      100).toFixed(0)}% would prefer no mandate.`;
  }

  if (supportChart) {
    supportChart.data.datasets[0].data = [
      pSupport * 100,
      pNo * 100,
    ];
    supportChart.update();
  }
}

function initSupportChart() {
  const canvas = document.getElementById("supportChart");
  if (!canvas || !window.Chart || !mandevalConfig) return;
  const ctx = canvas.getContext("2d");

  const labels = [
    mandevalConfig.support_outcome.label_support,
    mandevalConfig.support_outcome.label_no_mandate,
  ];

  supportChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Predicted share of respondents",
          data: [50, 50],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function (value) {
              return value + "%";
            },
          },
          title: {
            display: true,
            text: "Share of respondents (%)",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.parsed.y.toFixed(1)}%`;
            },
          },
        },
      },
    },
  });
}

function updateTradeOffTable(scenarioCfg) {
  const tbody = document.getElementById("equivalenceTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const beta = scenarioCfg.mxl && scenarioCfg.mxl.coefficients;
  if (!beta) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="3">No mixed logit coefficients are defined for this scenario.</td>';
    tbody.appendChild(row);
    return;
  }

  const livesCfg = scenarioCfg.attributes.lives_saved;
  const livesCoef = beta[livesCfg.coef_key];
  if (!livesCoef || !livesCoef.mean) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="3">Lives-saved coefficient is missing; trade-off calculations are not available.</td>';
    tbody.appendChild(row);
    return;
  }

  const betaL = livesCoef.mean;
  const seL = livesCoef.se;

  const makeRow = (attributeLabel, levelLabel, coefKey) => {
    const coef = beta[coefKey];
    if (!coef || !coef.mean) return;

    const b = coef.mean;
    const seB = coef.se;
    let eq = (b / betaL) * livesCfg.reference;
    let ciLow = null;
    let ciHigh = null;

    if (seB && seL && b !== 0 && betaL !== 0) {
      const varRatio =
        Math.pow(seB / b, 2) + Math.pow(seL / betaL, 2); // ignore covariance
      const seRatio = Math.abs(b / betaL) * Math.sqrt(varRatio);
      const ratio = b / betaL;
      const lowRatio = ratio - 1.96 * seRatio;
      const highRatio = ratio + 1.96 * seRatio;
      ciLow = lowRatio * livesCfg.reference;
      ciHigh = highRatio * livesCfg.reference;
    }

    const row = document.createElement("tr");

    const attrCell = document.createElement("td");
    attrCell.textContent = attributeLabel;

    const levelCell = document.createElement("td");
    levelCell.textContent = levelLabel;

    const tradeCell = document.createElement("td");
    if (!isFinite(eq)) {
      tradeCell.textContent = "Not identified";
    } else {
      let text = `${eq.toFixed(1)} lives per 100,000`;
      if (
        ciLow != null &&
        ciHigh != null &&
        isFinite(ciLow) &&
        isFinite(ciHigh)
      ) {
        text += ` (95% CI: ${ciLow.toFixed(1)}, ${ciHigh.toFixed(1)})`;
      }
      tradeCell.textContent = text;
    }

    row.appendChild(attrCell);
    row.appendChild(levelCell);
    row.appendChild(tradeCell);
    tbody.appendChild(row);
  };

  ["scope", "exemptions", "coverage"].forEach((attrKey) => {
    const attrCfg = scenarioCfg.attributes[attrKey];
    if (!attrCfg || !attrCfg.levels) return;
    const attrLabel = attrCfg.label;
    Object.entries(attrCfg.levels).forEach(([levelKey, level]) => {
      if (!level.coef_key) return;
      makeRow(attrLabel, level.label, level.coef_key);
    });
  });

  if (!tbody.hasChildNodes()) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="3">No attribute-level trade-offs are defined for this scenario.</td>';
    tbody.appendChild(row);
  }
}
