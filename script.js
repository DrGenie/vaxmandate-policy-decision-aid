// Vaccine Mandate Policy Decision Aid Tool Script
// - Handles dynamic content: tab navigation, scenario calculation, charts, scenario saving, and PDF export.

document.addEventListener("DOMContentLoaded", () => {
  // Tab switching event listeners
  document.querySelectorAll(".tablink").forEach(button => {
    button.addEventListener("click", () => {
      openTab(button.getAttribute("data-tab"), button);
    });
  });
  // Open default tab (Introduction)
  openTab("introTab", document.querySelector(".tablink"));

  // Set default country and scenario selections
  document.getElementById("country_select").value = "Australia";
  document.getElementById("framing_select").value = "pooled";

  // Load configuration JSON (coefficients, parameters, etc.)
  fetch("decision_tree.json")
    .then(response => response.json())
    .then(data => {
      window.config = data;
      // Extract coefficient and WTS datasets
      window.coefficientSets = data.coefficientSets;
      window.wtsDataSets = data.wtsDataSets;
      // Extract parameters
      window.params = data.parameters;
    })
    .catch(err => console.error("Failed to load configuration:", err));
});

// Tab switching logic (auto-render charts on specific tab opens)
function openTab(tabId, btn) {
  document.querySelectorAll(".tabcontent").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".tablink").forEach(button => {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  });
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");

  if (tabId === "wtpTab") renderWTPChart();
  if (tabId === "costsTab") renderCostsBenefits();
  if (tabId === "probTab") renderProbChart();
}

// Update displayed lives saved value when slider moves
function updateLivesDisplay(val) {
  document.getElementById("livesLabel").textContent = val;
}

// Build scenario object from current inputs and compute outputs
function buildScenarioFromInputs() {
  const country = document.getElementById("country_select").value;
  const scenarioType = document.getElementById("framing_select").value;
  const lives_val = parseInt(document.getElementById("livesSlider").value, 10);

  // Optional attribute selections (if unchecked, defaults to reference)
  const scopeRadio = document.querySelector('input[name="scope"]:checked');
  const exemptionRadio = document.querySelector('input[name="exemption"]:checked');
  const coverageRadio = document.querySelector('input[name="coverage"]:checked');

  // Booleans indicating selection of non-reference levels
  const allCheck    = scopeRadio ? true : false;  // true if "All occupations" selected, false = high-risk only
  const medRelCheck = (exemptionRadio && exemptionRadio.value === "medRel");
  const broadCheck  = (exemptionRadio && exemptionRadio.value === "broad");
  const cov70Check  = (coverageRadio && coverageRadio.value === "70");
  const cov90Check  = (coverageRadio && coverageRadio.value === "90");

  // Retrieve coefficient set for the chosen country and scenario
  const coefKey = `${country}_${scenarioType}`;
  const coefs = window.coefficientSets ? window.coefficientSets[coefKey] : undefined;
  if (!coefs) {
    alert("Coefficients for the selected country/scenario not found.");
    return null;
  }

  // Compute predicted uptake probability using the DCE model
  const prob = computeProbability({ coefs, allCheck, medRelCheck, broadCheck, cov70Check, cov90Check, lives_val });
  const uptakePercent = prob * 100;

  // Determine base population and parameters from config (with defaults as fallback)
  const basePopulation = (window.params && window.params.basePopulation) ? window.params.basePopulation : 3000;
  const costPerPerson  = (window.params && window.params.costPerVaccinated) ? window.params.costPerVaccinated : 50;
  const fixedCostPer100k = (window.params && window.params.fixedCostPer100k) ? window.params.fixedCostPer100k : 200000;
  const valuePerQALY   = (window.params && window.params.valuePerQALY) ? window.params.valuePerQALY : 50000;
  const QALY_VALUES   = (window.params && window.params.QALY_per_life) ? window.params.QALY_per_life : { low: 5, moderate: 10, high: 20 };

  // Lives saved total adjusted by uptake (assuming lives_val is per 100k if full compliance)
  const livesSavedTotal = lives_val * (prob);  // since basePopulation cancels out if basePopulation/3000 = scaling factor

  // QALY gains for selected scenario (low/moderate/high)
  const qalyScenario = document.getElementById("qalySelect") ? document.getElementById("qalySelect").value : "moderate";
  const qalyPerLife = QALY_VALUES[qalyScenario] || QALY_VALUES["moderate"];
  const totalQALY = livesSavedTotal * qalyPerLife;

  // Cost calculations
  const fixedCost = (basePopulation / 3000) * fixedCostPer100k;   // fixed implementation cost scaled to population
  const participants = basePopulation * prob;                    // number of people complying (out of basePopulation)
  const totalInterventionCost = fixedCost + costPerPerson * participants;

  // Monetized benefits (using value per QALY) and net benefit
  const monetizedBenefits = totalQALY * valuePerQALY;
  const netBenefit = monetizedBenefits - totalInterventionCost;
  const currencySymbol = (country === "Australia") ? "A$" : "€";

  // Return assembled scenario object with key results
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
    netBenefit: `${currencySymbol}${netBenefit.toFixed(2)}`
  };
}

// Logistic model: compute uptake probability given scenario booleans and coefficients
function computeProbability(sc) {
  const c = sc.coefs;
  // Map booleans to dummy variables (1 if attribute non-reference selected, else 0)
  const scope2     = sc.allCheck ? 1 : 0;
  const exemption2 = sc.medRelCheck ? 1 : 0;
  const exemption3 = sc.broadCheck ? 1 : 0;
  const coverage2  = sc.cov70Check ? 1 : 0;
  const coverage3  = sc.cov90Check ? 1 : 0;
  const livesCount = sc.lives_val;
  // Utility calculations for mandate (alternative) vs opt-out
  const U_alt   = c.ASC_mean
                + c.scope2 * scope2
                + c.exemption2 * exemption2
                + c.exemption3 * exemption3
                + c.coverage2 * coverage2
                + c.coverage3 * coverage3
                + c.lives    * livesCount;
  const U_optout = c.ASC_optout;
  // Logit choice probability for choosing the mandate option
  return Math.exp(U_alt) / (Math.exp(U_alt) + Math.exp(U_optout));
}

// Render WTS (Willingness-to-Save) bar chart with error bars
let wtpChartInstance = null;
function renderWTPChart() {
  const country = document.getElementById("country_select").value;
  const scenarioType = document.getElementById("framing_select").value;
  const key = `${country}_${scenarioType}`;
  const dataSet = window.wtsDataSets ? window.wtsDataSets[key] : undefined;
  if (!dataSet) {
    alert("WTS data not available for this scenario.");
    return;
  }
  const ctx = document.getElementById("wtpChartMain").getContext("2d");
  if (wtpChartInstance) wtpChartInstance.destroy();

  // Prepare data arrays for chart
  const labels = ["All occupations", "Med+religious exc.", "Broad exc.", "70% coverage", "90% coverage"];
  const values = [
    dataSet.scope2.wts, dataSet.exemption2.wts, dataSet.exemption3.wts,
    dataSet.coverage2.wts, dataSet.coverage3.wts
  ];
  const errors = [
    dataSet.scope2.se, dataSet.exemption2.se, dataSet.exemption3.se,
    dataSet.coverage2.se, dataSet.coverage3.se
  ];
  const pVals = [
    dataSet.scope2.p, dataSet.exemption2.p, dataSet.exemption3.p,
    dataSet.coverage2.p, dataSet.coverage3.p
  ];
  const barColors = values.map(v => v >= 0 ? 'rgba(231, 76, 60, 0.6)' : 'rgba(46, 204, 113, 0.6)');
  const borderColors = values.map(v => v >= 0 ? 'rgba(192, 57, 43, 1)' : 'rgba(39, 174, 96, 1)');

  // Chart.js dataset configuration
  const dataConfig = {
    labels,
    datasets: [{
      label: "WTS (lives per 100k)",
      data: values,
      backgroundColor: barColors,
      borderColor: borderColors,
      borderWidth: 1,
      // Custom properties to hold errors and p-values for tooltip
      error: errors,
      pVals: pVals
    }]
  };

  // Create bar chart with error bars
  wtpChartInstance = new Chart(ctx, {
    type: 'bar',
    data: dataConfig,
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: `WTS by Attribute (${country}, ${scenarioType})`, font: { size: 16 } },
        tooltip: {
          callbacks: {
            afterBody: function(context) {
              const i = context[0].dataIndex;
              const ds = context[0].dataset;
              const se = ds.error[i].toFixed(3);
              let p = ds.pVals[i];
              p = (p < 0.001) ? "<0.001" : p.toFixed(3);
              return `SE: ${se}, p-value: ${p}`;
            }
          }
        }
      }
    },
    plugins: [{
      // Custom plugin to draw error bars on the chart
      id: 'errorbars',
      afterDraw: chart => {
        const { ctx, scales: { x, y } } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const error = errors[i];
          if (typeof error === 'number') {
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            // Draw vertical error line
            const value = values[i];
            const topY = y.getPixelForValue(value + error);
            const bottomY = y.getPixelForValue(value - error);
            const xPos = bar.x;
            ctx.beginPath();
            ctx.moveTo(xPos, topY);
            ctx.lineTo(xPos, bottomY);
            ctx.stroke();
            // Draw top and bottom caps
            ctx.beginPath();
            ctx.moveTo(xPos - 5, topY);
            ctx.lineTo(xPos + 5, topY);
            ctx.moveTo(xPos - 5, bottomY);
            ctx.lineTo(xPos + 5, bottomY);
            ctx.stroke();
            ctx.restore();
          }
        });
      }
    }]
  });
}

// Render predicted uptake chart (doughnut) and show recommendation
let uptakeChartInstance = null;
function renderProbChart() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const uptakeVal = parseFloat(scenario.predictedUptake);
  drawUptakeChart(uptakeVal);
  const recommendation = getRecommendation(scenario, uptakeVal);
  // Update modal results with uptake and recommendation
  document.getElementById("modalResults").innerHTML = 
    `<h4>Calculation Results</h4>
     <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
     <p>${recommendation}</p>`;
}

// Draw uptake vs non-uptake doughnut chart
function drawUptakeChart(uptakeVal) {
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  if (uptakeChartInstance) uptakeChartInstance.destroy();
  uptakeChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake", "Non-uptake"],
      datasets: [{
        data: [uptakeVal, 100 - uptakeVal],
        backgroundColor: ["#27ae60", "#c0392b"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Predicted Uptake: ${uptakeVal.toFixed(1)}%`,
          font: { size: 16 }
        },
        tooltip: {
          callbacks: {
            label: context => `${context.label}: ${context.parsed.toFixed(1)}%`
          }
        }
      }
    }
  });
}

// Generate recommendation text based on selected scenario and uptake level
function getRecommendation(scenario, uptake) {
  let rec = "Recommendation: ";
  // Warn if broad scope and uptake is low
  if (scenario.allCheck && uptake < 50) {
    rec += "A mandate covering all occupations may face resistance; consider limiting the mandate to high-risk groups to improve acceptance. ";
  }
  // Warn if broad exemptions and low uptake
  if (scenario.broadCheck && uptake < 50) {
    rec += "Broad personal exemptions can undermine the mandate’s effectiveness; tightening exemptions (e.g. to medical only) could increase public support. ";
  } else if (scenario.medRelCheck && uptake < 50) {
    rec += "Allowing religious exemptions might reduce public confidence; consider restricting exemptions to medical reasons only. ";
  }
  // Warn if very high coverage target and low uptake
  if (scenario.cov90Check && uptake < 50) {
    rec += "Requiring 90% coverage is ambitious and could cause pushback if uptake is low; a more attainable coverage target (e.g. 70%) might be prudent. ";
  }
  // If uptake is very high, provide positive note
  if (uptake >= 70) {
    rec = "Uptake is high. The current configuration is likely to be well-accepted and effective.";
  }
  return rec;
}

// Handle the Calculate button: open modal with result and charts
function openSingleScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  renderCostsBenefits();  // update cost/benefit panel for current scenario
  const uptakeVal = parseFloat(scenario.predictedUptake);
  const recommendation = getRecommendation(scenario, uptakeVal);
  document.getElementById("modalResults").innerHTML = 
    `<h4>Calculation Results</h4>
     <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
     <p>${recommendation}</p>`;
  openModal();
  renderProbChart();
}

// Modal controls for result popup
function openModal() {
  document.getElementById("resultModal").style.display = "block";
}
function closeModal() {
  document.getElementById("resultModal").style.display = "none";
}

// Compute and render costs & benefits summary and chart
let combinedChartInstance = null;
function renderCostsBenefits() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const country = scenario.country;
  const coefKey = `${country}_${scenario.scenarioType}`;
  const coefs = window.coefficientSets ? window.coefficientSets[coefKey] : undefined;
  if (!coefs) return;

  // Recompute probability and participants for consistency
  const prob = computeProbability({ 
    coefs: coefs,
    allCheck: scenario.allCheck,
    medRelCheck: scenario.medRelCheck,
    broadCheck: scenario.broadCheck,
    cov70Check: scenario.cov70Check,
    cov90Check: scenario.cov90Check,
    lives_val: scenario.lives_val 
  });
  const basePop = (window.params && window.params.basePopulation) ? window.params.basePopulation : 3000;
  const participants = basePop * prob;
  const uptakePercentage = prob * 100;
  const livesSavedTotal = (scenario.lives_val / 3000) * (basePop * prob);

  const qalyScenario = document.getElementById("qalySelect").value;
  const QALY_SCENARIO_VALUES = window.params ? window.params.QALY_per_life : { low: 5, moderate: 10, high: 20 };
  const qalyPerLife = QALY_SCENARIO_VALUES[qalyScenario];
  const totalQALY = livesSavedTotal * qalyPerLife;
  const valuePerQALY = (window.params && window.params.valuePerQALY) ? window.params.valuePerQALY : 50000;
  const monetizedBenefits = totalQALY * valuePerQALY;

  const costPerPerson = (window.params && window.params.costPerVaccinated) ? window.params.costPerVaccinated : 50;
  const fixedCost = (basePop / 3000) * ((window.params && window.params.fixedCostPer100k) ? window.params.fixedCostPer100k : 200000);
  const totalCost = fixedCost + costPerPerson * participants;
  const netBenefitValue = monetizedBenefits - totalCost;
  const currencySymbol = (country === "Australia") ? "A$" : "€";

  // Update scenario object with formatted results (for saving/export)
  scenario.predictedUptake = uptakePercentage.toFixed(2);
  scenario.netBenefit = `${currencySymbol}${netBenefitValue.toFixed(2)}`;

  // Display summary results
  const resultDiv = document.getElementById("costsBenefitsResults");
  resultDiv.innerHTML = "";
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "calculation-info";
  summaryDiv.innerHTML = `
    <h4>Cost &amp; Benefit Summary</h4>
    <p><strong>Predicted Uptake:</strong> ${uptakePercentage.toFixed(2)}%</p>
    <p><strong>Population (analyzed):</strong> ${basePop.toLocaleString()}</p>
    <p><strong>Complying Individuals:</strong> ${participants.toFixed(0)}</p>
    <p><strong>Total Lives Saved:</strong> ${livesSavedTotal.toFixed(2)}</p>
    <p><strong>Total QALYs Gained:</strong> ${totalQALY.toFixed(2)}</p>
    <p><strong>Total Intervention Cost:</strong> ${currencySymbol}${totalCost.toFixed(2)}</p>
    <p><strong>Monetized Benefits:</strong> ${currencySymbol}${monetizedBenefits.toFixed(2)}</p>
    <p><strong>Net Benefit:</strong> ${currencySymbol}${netBenefitValue.toFixed(2)}</p>
    <p>The above assumes ${scenario.lives_val} lives saved per 100k with the mandate. Costs include a fixed setup cost and ~$50 per person vaccinated. Benefits are valued at ~${currencySymbol}50k per QALY. Net Benefit = Monetized Benefits – Total Cost.</p>
  `;
  resultDiv.appendChild(summaryDiv);

  // Render combined bar chart for cost, benefit, net benefit
  const chartContainer = document.createElement("div");
  chartContainer.id = "combinedChartContainer";
  chartContainer.innerHTML = `<canvas id="combinedChart"></canvas>`;
  resultDiv.appendChild(chartContainer);
  const ctx = document.getElementById("combinedChart").getContext("2d");
  if (combinedChartInstance) combinedChartInstance.destroy();
  combinedChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["Total Cost", "Monetized Benefits", "Net Benefit"],
      datasets: [{
        label: `${currencySymbol}`,
        data: [totalCost, monetizedBenefits, netBenefitValue],
        backgroundColor: ['rgba(230, 126, 34, 0.6)', 'rgba(41, 128, 185, 0.6)', 'rgba(39, 174, 96, 0.6)'],
        borderColor: ['rgba(211, 84, 0, 1)', 'rgba(31, 97, 141, 1)', 'rgba(30, 132, 73, 1)'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Cost-Benefit Analysis", font: { size: 16 } }
      }
    }
  });
}

// Toggle display of detailed cost breakdown cards
function toggleCostBreakdown() {
  const breakdownDiv = document.getElementById("detailedCostBreakdown");
  if (breakdownDiv.style.display === "none" || breakdownDiv.style.display === "") {
    // Populate breakdown content if not already done
    if (breakdownDiv.innerHTML.trim() === "") {
      populateCostBreakdown();
    }
    breakdownDiv.style.display = "flex";
  } else {
    breakdownDiv.style.display = "none";
  }
}

// Toggle display of benefits analysis section
function toggleBenefitsAnalysis() {
  const benefitsDiv = document.getElementById("detailedBenefitsAnalysis");
  benefitsDiv.style.display = (benefitsDiv.style.display === "none" || benefitsDiv.style.display === "") ? "flex" : "none";
}

// Populate cost breakdown cards dynamically based on current scenario
function populateCostBreakdown() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const country = scenario.country;
  const currencySymbol = (country === "Australia") ? "A$" : "€";
  const prob = parseFloat(scenario.predictedUptake) / 100;
  const basePop = (window.params && window.params.basePopulation) ? window.params.basePopulation : 3000;
  const participants = basePop * prob;
  // Define key cost components for breakdown
  const costItems = [
    {
      icon: "fa-building",
      name: "Digital Verification System",
      unitCost: 1000000,
      quantity: 1,
      description: "IT platform & legal setup (fixed cost)"
    },
    {
      icon: "fa-syringe",
      name: "Vaccines & Administration",
      unitCost: 141.06,
      quantity: (participants * 2).toFixed(0),  // two doses per person
      description: "Vaccine doses and administration (per dose cost)"
    },
    {
      icon: "fa-clock",
      name: "Productivity Loss (Side Effects)",
      unitCost: 60.00,
      quantity: participants.toFixed(0),
      description: "Work hours lost due to post-shot recovery"
    }
  ];
  const breakdownDiv = document.getElementById("detailedCostBreakdown");
  breakdownDiv.innerHTML = "";
  costItems.forEach(item => {
    const total = item.unitCost * parseFloat(item.quantity);
    const card = document.createElement("div");
    card.className = "cost-card";
    card.innerHTML = `
      <h4><i class="fa-solid ${item.icon}"></i> ${item.name}</h4>
      <p><strong>Value:</strong> ${currencySymbol}${item.unitCost.toFixed(2)}</p>
      <p><strong>Quantity:</strong> ${item.quantity}</p>
      <p><strong>Total Cost:</strong> ${currencySymbol}${total.toFixed(2)}</p>
      <p><em>${item.description}</em></p>
    `;
    breakdownDiv.appendChild(card);
  });
}

// Scenario saving and PDF export
let savedScenarios = [];
function saveScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenario.name = `Scenario ${savedScenarios.length + 1}`;
  savedScenarios.push(scenario);

  // Append new scenario as a row in the comparison table
  const tableBody = document.querySelector("#scenarioTable tbody");
  const row = document.createElement("tr");
  const cols = ["name", "country", "scenarioType", "lives_val",
                "allCheck", "medRelCheck", "broadCheck", "cov70Check", "cov90Check",
                "predictedUptake", "netBenefit"];
  cols.forEach(col => {
    const cell = document.createElement("td");
    if (typeof scenario[col] === 'boolean') {
      cell.textContent = scenario[col] ? 'Yes' : 'No';
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
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setFontSize(14);
  doc.text("VaxMandate Policy Simulator - Scenarios Comparison", 310, 30, { align: 'center' });
  let startY = 60;
  savedScenarios.forEach((scen, idx) => {
    if (startY > 700) { doc.addPage(); startY = 30; }
    doc.setFontSize(12);
    doc.text(`${scen.name}: ${scen.country}, ${scen.scenarioType} scenario`, 40, startY);
    startY += 14;
    const details = [
      `Lives Saved per 100k: ${scen.lives_val}`,
      `Scope (All occ): ${scen.allCheck ? 'Yes' : 'No'}`,
      `Med+Rel Exemption: ${scen.medRelCheck ? 'Yes' : 'No'}`,
      `Broad Exemption: ${scen.broadCheck ? 'Yes' : 'No'}`,
      `Coverage 70%: ${scen.cov70Check ? 'Yes' : 'No'}`,
      `Coverage 90%: ${scen.cov90Check ? 'Yes' : 'No'}`,
      `Predicted Uptake: ${parseFloat(scen.predictedUptake).toFixed(1)}%`,
      `Net Benefit: ${scen.netBenefit}`
    ];
    doc.setFontSize(11);
    details.forEach(line => {
      doc.text(line, 60, startY);
      startY += 12;
    });
    startY += 10;
  });
  doc.save("Mandate_Scenarios_Comparison.pdf");
}
