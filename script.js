/******************************************************************************
 * Vaccine Mandate Decision-Aid (AUS/FR/IT)
 * - MXL + LC uptake engine
 * - Benefits (A..G), Costs, CEA/CBA
 * - Equity hooks, Deterministic & PSA sensitivity
 * - Chart rendering + PDF export
 ******************************************************************************/

// ---------- Tab Router ----------
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
    document.getElementById(b.dataset.tab).classList.add('show');
  }));

  // UI handlers
  document.getElementById('runCalc').addEventListener('click', runAll);
  document.getElementById('benefitMetric').addEventListener('change', runBenefits);
  document.getElementById('qalyPerLife').addEventListener('change', runBenefits);
  document.getElementById('valuePerQALY').addEventListener('input', runBenefits);
  document.getElementById('costBundle').addEventListener('change', runCosts);
  document.getElementById('discRate').addEventListener('input', () => { runCosts(); runEcon(); });
  document.getElementById('runPSA').addEventListener('click', runPSA);
  document.getElementById('exportPDF').addEventListener('click', exportPDF);

  // Seed descriptives table
  renderDescriptives('Australia','mild','all');

  // Default initial compute
  runAll();
});

// ---------- Data (populate/extend as needed) ----------
const DATA = {
  // Mixed Logit MEANS (by country & frame). Reference coding:
  // scope: highrisk(ref) vs all; exemptions: medical(ref), medRel, broad; coverage: 50(ref), 70, 90; lives per 100k
  mxl: {
    Australia: {
      mild:   { ascA: 0.464, ascOpt: -0.572, scope_all: -0.319, ex_medRel: -0.157, ex_broad: -0.267, cov70: 0.171, cov90: 0.158, lives: 0.072 },
      severe: { ascA: 0.535, ascOpt: -0.694, scope_all:  0.190, ex_medRel: -0.181, ex_broad: -0.305, cov70: 0.371, cov90: 0.398, lives: 0.079 },
    },
    Italy: {
      mild:   { ascA: 0.625, ascOpt: -0.238, scope_all: -0.276, ex_medRel: -0.176, ex_broad: -0.289, cov70: 0.185, cov90: 0.148, lives: 0.039 },
      severe: { ascA: 0.799, ascOpt: -0.463, scope_all:  0.174, ex_medRel: -0.178, ex_broad: -0.207, cov70: 0.305, cov90: 0.515, lives: 0.045 },
    },
    France: {
      mild:   { ascA: 0.899, ascOpt:  0.307, scope_all: -0.160, ex_medRel: -0.121, ex_broad: -0.124, cov70: 0.232, cov90: 0.264, lives: 0.049 },
      severe: { ascA: 0.884, ascOpt:  0.083, scope_all: -0.019, ex_medRel: -0.192, ex_broad: -0.247, cov70: 0.267, cov90: 0.398, lives: 0.052 },
    }
  },

  // Latent Class shares (supporters vs resisters) from your tables (mild/severe)
  lc: {
    Australia: { mild: { supporters: 0.7468, resisters: 0.2532 }, severe: { supporters: 0.7776, resisters: 0.2224 } },
    Italy:     { mild: { supporters: 0.7005, resisters: 0.2995 }, severe: { supporters: 0.7477, resisters: 0.2523 } },
    France:    { mild: { supporters: 0.7169, resisters: 0.2831 }, severe: { supporters: 0.7504, resisters: 0.2496 } }
  },

  // Descriptives (abbrev. — extend with more rows as needed)
  desc: {
    Australia: {
      N: 3416, female_pct: 51, age_mean: 47.4, deg_pct: 47, married_pct:57, children_pct:60,
      vax1plus:98, phys:3.4, mental:3.4, trust:3.42, vax_pos:4.50, vax_neg:3.57, pol:5.33, num:2.6
    },
    France: {
      N: 3353, female_pct: 51, age_mean: 46.2, deg_pct: 34, married_pct:57, children_pct:67,
      vax1plus:97, phys:3.3, mental:3.4, trust:3.21, vax_pos:4.17, vax_neg:3.81, pol:6.00, num:2.2
    },
    Italy: {
      N: 3380, female_pct: 52, age_mean: 47.0, deg_pct: 37, married_pct:60, children_pct:59,
      vax1plus:96, phys:3.3, mental:3.6, trust:3.27, vax_pos:4.21, vax_neg:3.71, pol:5.35, num:2.2
    }
  },

  // Risk tables & unit costs: placeholders with reasonable defaults; replace with your final catalog
  risks: {
    ageAdj: { // per infection; illustrative
      hosp: 0.03, icu: 0.008, death: 0.004
    },
    longCovid_prev: 0.07, // proportion among symptomatic
    qaly_loss_longCovid: 0.05 // per case, 1-year horizon
  },
  costs: {
    currency: { Australia: 'A$', France: '€', Italy: '€' },
    public_fixed_per100k: 200000,
    programme_per_vaccinated: 50,
    employer: {
      pto_vax: 60, pto_recovery: 60, admin_per_worker: 20
    },
    testing_per_test: 25,
    attrition_per_worker: 3500
  }
};

// ---------- Helpers ----------
const el = id => document.getElementById(id);
const fmt = (x, cur='') => cur + Number(x).toLocaleString(undefined,{maximumFractionDigits:2});

// ---------- Descriptives ----------
function renderDescriptives(country, frame, segment){
  const d = DATA.desc[country];
  const html = `
  <table>
    <thead><tr><th>Variable</th><th>${country}</th></tr></thead>
    <tbody>
      <tr><td>Sample size</td><td>${d.N}</td></tr>
      <tr><td>Female (%)</td><td>${d.female_pct}</td></tr>
      <tr><td>Age, mean</td><td>${d.age_mean}</td></tr>
      <tr><td>University degree (%)</td><td>${d.deg_pct}</td></tr>
      <tr><td>Married/cohabiting (%)</td><td>${d.married_pct}</td></tr>
      <tr><td>Has children (%)</td><td>${d.children_pct}</td></tr>
      <tr><td>&ge;1 COVID-19 dose (%)</td><td>${d.vax1plus}</td></tr>
      <tr><td>Self-rated physical health (1–5)</td><td>${d.phys}</td></tr>
      <tr><td>Self-rated mental health (1–5)</td><td>${d.mental}</td></tr>
      <tr><td>Trust index (1–5)</td><td>${d.trust}</td></tr>
      <tr><td>Vaccine positive attitude (1–6)</td><td>${d.vax_pos}</td></tr>
      <tr><td>Vaccine negative attitude (1–6)</td><td>${d.vax_neg}</td></tr>
      <tr><td>Political orientation (0–10)</td><td>${d.pol}</td></tr>
      <tr><td>Numeracy (0–3)</td><td>${d.num}</td></tr>
    </tbody>
  </table>`;
  el('descTable').innerHTML = html;
}
el('descCountry').addEventListener('change', () =>
  renderDescriptives(el('descCountry').value, el('descFrame').value, el('descSegment').value));
el('descFrame').addEventListener('change', () =>
  renderDescriptives(el('descCountry').value, el('descFrame').value, el('descSegment').value));
el('descSegment').addEventListener('change', () =>
  renderDescriptives(el('descCountry').value, el('descFrame').value, el('descSegment').value));

// ---------- Scenario builder ----------
function scenarioFromUI(){
  const country = el('country').value;
  const frame   = el('frame').value; // mild|severe
  const scope   = el('scope').value; // highrisk|all
  const exempt  = el('exempt').value; // medical|medRel|broad
  const cov     = el('coverage').value; // 50|70|90
  const lives   = Number(el('lives').value); // per 100k
  return { country, frame, scope, exempt, cov, lives };
}

// ---------- Uptake engine (MXL mean as representative; LC used for segmentation display) ----------
function uptakeProbability(sc){
  const b = DATA.mxl[sc.country][sc.frame];
  const x_scope = (sc.scope === 'all') ? 1 : 0;
  const x_medRel = (sc.exempt === 'medRel') ? 1 : 0;
  const x_broad  = (sc.exempt === 'broad') ? 1 : 0;
  const x_cov70  = (sc.cov === '70') ? 1 : 0;
  const x_cov90  = (sc.cov === '90') ? 1 : 0;

  const U_mand = b.ascA
    + b.scope_all * x_scope
    + b.ex_medRel * x_medRel
    + b.ex_broad  * x_broad
    + b.cov70     * x_cov70
    + b.cov90     * x_cov90
    + b.lives     * sc.lives;

  const U_opt  = b.ascOpt;
  const p = Math.exp(U_mand) / (Math.exp(U_mand) + Math.exp(U_opt));
  return Math.max(0, Math.min(1, p));
}

// WTS from MXL means (delta-SEs omitted here; plug in if you add variance)
function wtsFromMXL(sc){
  const b = DATA.mxl[sc.country][sc.frame];
  const denom = b.lives || 1e-9;
  return [
    { label:'All occupations', wts: -(b.scope_all)/denom },
    { label:'Med+religious exc.', wts: -(b.ex_medRel)/denom },
    { label:'Broad exc.', wts: -(b.ex_broad)/denom },
    { label:'70% coverage', wts: -(b.cov70)/denom },
    { label:'90% coverage', wts: -(b.cov90)/denom },
  ];
}

// ---------- Benefits (modular) ----------
function computeBenefits(sc, popBase=100000){
  const p = uptakeProbability(sc);
  // ΔV = N*(p_m - p0); here p0 set to 0 as baseline (replace with your baseline if needed)
  const addVaccinated = popBase * p;

  // Static cases averted (illustrative): cases = AR * (1 - VE*coverage)
  const VE = Number(el('VE')?.value || 70)/100;
  const baseAttackRate = (sc.frame==='severe') ? 0.25 : 0.10; // crude; replace with calibrated
  const cases_noMandate = popBase * baseAttackRate;
  const cases_withMand  = popBase * baseAttackRate * (1 - VE * p);
  const casesAverted_static = Math.max(0, cases_noMandate - cases_withMand);

  // Events averted
  const r = DATA.risks;
  const hospAverted = casesAverted_static * r.ageAdj.hosp;
  const icuAverted  = casesAverted_static * r.ageAdj.icu;
  const deathAverted= casesAverted_static * r.ageAdj.death;

  // QALYs / DALYs (simple): lives saved proxy via deaths averted; long-COVID morbidity
  const qalyLife = Number(el('qalyPerLife').value);
  const valuePerQALY = Number(el('valuePerQALY').value);
  const qalys_mort = deathAverted * qalyLife;
  const qalys_long = casesAverted_static * r.longCovid_prev * r.qaly_loss_longCovid;
  const totalQALY  = qalys_mort + qalys_long;
  const dalysAverted = totalQALY; // if you want YLL+YLD separately, split here

  // Monetised benefits
  const monetised = totalQALY * valuePerQALY;

  return {
    p, addVaccinated, casesAverted_static, hospAverted, icuAverted, deathAverted,
    totalQALY, dalysAverted, monetised
  };
}

// ---------- Costs ----------
function computeCosts(sc, popBase=100000){
  const cur = DATA.costs.currency[sc.country] || '';
  const participants = popBase * uptakeProbability(sc);
  const fixed = (DATA.costs.public_fixed_per100k) * (popBase/100000); // scale
  const programme = DATA.costs.programme_per_vaccinated * participants;

  // Optional bundles
  const sels = Array.from(el('costBundle').selectedOptions).map(o=>o.value);
  const employer = sels.includes('employer') ? (DATA.costs.employer.pto_vax + DATA.costs.employer.pto_recovery + DATA.costs.employer.admin_per_worker) * (participants*0.6) : 0;
  const testing  = (sc.exempt==='broad' || sc.exempt==='medRel') && sels.includes('testing') ? DATA.costs.testing_per_test * (participants*0.3) : 0;
  const attrit   = sels.includes('attrition') ? DATA.costs.attrition_per_worker * (participants*0.02) : 0;
  const social   = sels.includes('social') ? 0 /* placeholder if you quantify */ : 0;

  const total = fixed + programme + employer + testing + attrit + social;
  return { cur, fixed, programme, employer, testing, attrit, social, total };
}

// ---------- Economic evaluation ----------
function econOutputs(sc){
  const B = computeBenefits(sc);
  const C = computeCosts(sc);
  const disc = Number(el('discRate').value)/100;

  // Simple 1-period outputs; if multi-year, discount stream here
  const totalBenefitsMonetised = B.monetised;
  const totalCosts = C.total;
  const NPV = totalBenefitsMonetised - totalCosts;
  const BCR = totalCosts>0 ? totalBenefitsMonetised/totalCosts : Infinity;

  // CEA denominators
  const cPerVacc = (B.addVaccinated>0) ? totalCosts / B.addVaccinated : NaN;
  const cPerCase = (B.casesAverted_static>0) ? totalCosts / B.casesAverted_static : NaN;
  const cPerHosp = (B.hospAverted>0) ? totalCosts / B.hospAverted : NaN;
  const cPerDeath= (B.deathAverted>0) ? totalCosts / B.deathAverted : NaN;
  const cPerQALY = (B.totalQALY>0) ? totalCosts / B.totalQALY : NaN;

  // Net Monetary Benefit (at valuePerQALY)
  const vq = Number(el('valuePerQALY').value);
  const NMB = (B.totalQALY * vq) - totalCosts;

  return { B, C, NPV, BCR, cPerVacc, cPerCase, cPerHosp, cPerDeath, cPerQALY, NMB };
}

// ---------- Equity (placeholder; plug in subgroup arrays + CI) ----------
function equityModule(sc){
  // Provide subgroup QALYs by SES/age and compute concentration index, equity-adjusted NMB
  return { ci: 0.0, eqNMB: econOutputs(sc).NMB }; // placeholder
}

// ---------- Charts ----------
let CH = {};
function renderUptake(sc){
  const p = uptakeProbability(sc);
  const ctx = el('uptakeChart').getContext('2d');
  CH.uptake && CH.uptake.destroy();
  CH.uptake = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:['Uptake','Non-uptake'],
      datasets:[{data:[p*100, 100-p*100]}]
    },
    options:{plugins:{title:{display:true,text:`Predicted uptake: ${(p*100).toFixed(1)}%`}}}
  });
  const lc = DATA.lc[sc.country][sc.frame];
  el('uptakeSummary').innerHTML = `
    <h3>Summary</h3>
    <p><strong>Country:</strong> ${sc.country} &nbsp; <strong>Frame:</strong> ${sc.frame}</p>
    <p><strong>Policy:</strong> scope=${sc.scope}, exemptions=${sc.exempt}, coverage=${sc.cov}, lives=${sc.lives}/100k</p>
    <p><strong>LC segmentation:</strong> supporters ${(lc.supporters*100).toFixed(1)}% • resisters ${(lc.resisters*100).toFixed(1)}%</p>
  `;
}

function renderWTS(sc){
  const arr = wtsFromMXL(sc);
  const ctx = el('wtsChart').getContext('2d');
  CH.wts && CH.wts.destroy();
  CH.wts = new Chart(ctx, {
    type:'bar',
    data:{ labels: arr.map(d=>d.label),
      datasets:[{ label:'Lives per 100k', data: arr.map(d=>d.wts) }]},
    options:{ scales:{ y:{ beginAtZero:false } } }
  });
}

function runBenefits(){
  const sc = scenarioFromUI();
  const e = econOutputs(sc);
  const cur = DATA.costs.currency[sc.country] || '';
  const ctx = el('benefitBars').getContext('2d');
  const b = e.B;
  const metric = el('benefitMetric').value;

  const rows = [
    ['Additional Vaccinated', b.addVaccinated],
    ['Cases Averted (static)', b.casesAverted_static],
    ['Hospitalisations Averted', b.hospAverted],
    ['ICU Averted', b.icuAverted],
    ['Deaths Averted', b.deathAverted],
    ['QALYs Gained', b.totalQALY],
    ['DALYs Averted', b.dalysAverted],
    ['Monetised Benefits', b.monetised]
  ];
  el('benefitText').innerHTML = `
    <h3>Key Benefits</h3>
    <ul>${rows.map(r=>`<li><strong>${r[0]}:</strong> ${r[0]==='Monetised Benefits'?fmt(r[1],cur):fmt(r[1])}</li>`).join('')}</ul>
  `;

  CH.benefits && CH.benefits.destroy();
  CH.benefits = new Chart(ctx, {
    type:'bar',
    data:{ labels: rows.map(r=>r[0]), datasets:[{label:'Value', data: rows.map(r=>r[1])}]},
    options:{ indexAxis:'y' }
  });
}

function runCosts(){
  const sc = scenarioFromUI();
  const c = computeCosts(sc);
  const ctx = el('costWaterfall').getContext('2d');
  const items = [
    ['Public fixed', c.fixed],
    ['Programme', c.programme],
    ['Employer', c.employer],
    ['Testing', c.testing],
    ['Attrition', c.attrit],
    ['Social/political', c.social],
  ];
  el('costText').innerHTML = `
    <h3>Cost Breakdown</h3>
    <ul>${items.map(r=>`<li><strong>${r[0]}:</strong> ${fmt(r[1], c.cur)}</li>`).join('')}
        <li><strong>Total:</strong> ${fmt(c.total, c.cur)}</li></ul>
  `;
  CH.costs && CH.costs.destroy();
  CH.costs = new Chart(ctx, {
    type:'bar',
    data:{ labels: items.map(x=>x[0]), datasets:[{label:'Cost', data: items.map(x=>x[1])}]},
    options:{ indexAxis:'y' }
  });
}

function runEcon(){
  const sc = scenarioFromUI();
  const e = econOutputs(sc);
  const cur = computeCosts(sc).cur;
  const ctx = el('econBars').getContext('2d');
  const rows = [
    ['Total Costs', e.C.total],
    ['Monetised Benefits', e.B.monetised],
    ['NPV', e.NPV],
    ['B/C ratio', e.BCR],
    ['Cost per QALY', e.cPerQALY],
    ['NMB', e.NMB]
  ];
  el('econText').innerHTML = `
    <h3>CEA/CBA</h3>
    <ul>
      <li><strong>NPV:</strong> ${fmt(e.NPV, cur)}</li>
      <li><strong>B/C ratio:</strong> ${Number(e.BCR).toFixed(2)}</li>
      <li><strong>Cost per QALY:</strong> ${isFinite(e.cPerQALY)?fmt(e.cPerQALY,cur):'—'}</li>
      <li><strong>NMB (@ ${fmt(el('valuePerQALY').value,cur)}):</strong> ${fmt(e.NMB,cur)}</li>
    </ul>
  `;
  CH.econ && CH.econ.destroy();
  CH.econ = new Chart(ctx, {
    type:'bar',
    data:{ labels: rows.map(r=>r[0]), datasets:[{label:'Value', data: rows.map(r=>r[1])}]},
    options:{ indexAxis:'y' }
  });
}

function runAll(){
  const sc = scenarioFromUI();
  renderUptake(sc);
  renderWTS(sc);
  runBenefits();
  runCosts();
  runEcon();
  buildMethods(sc);
}

// ---------- Tornado + PSA (lightweight placeholders) ----------
function runPSA(){
  const sc = scenarioFromUI();
  const N = Number(el('mcN').value);
  const draws = [];
  for(let i=0;i<N;i++){
    // simple uncertainty on VE and value per QALY
    const VE = clamp(norm(0.7, 0.07), 0.2, 0.95);
    const vq = Math.max(20000, norm(Number(el('valuePerQALY').value), 10000));
    const sc2 = {...sc};
    const veSave = el('VE').value;
    const vSave  = el('valuePerQALY').value;
    el('VE').value = Math.round(VE*100);
    el('valuePerQALY').value = Math.round(vq/1000)*1000;
    const e = econOutputs(sc2);
    draws.push({ NMB: e.NMB });
    // restore
    el('VE').value = veSave;
    el('valuePerQALY').value = vSave;
  }
  // CEAC: P(NMB>0)
  const lambda = Number(el('valuePerQALY').value);
  const pCE = draws.filter(d=>d.NMB>0).length / N;
  const ctx = el('ceac').getContext('2d');
  CH.ceac && CH.ceac.destroy();
  CH.ceac = new Chart(ctx, {
    type:'line',
    data:{ labels:[`@WTP=${fmt(lambda)}`], datasets:[{label:'CEAC (P(NMB>0))', data:[pCE]}] },
    options:{ scales:{ y:{ min:0, max:1 } } }
  });
}

function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function norm(mu,sd){ // Box–Muller
  let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return mu + sd*Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

// ---------- Methods (auto-summary) ----------
function buildMethods(sc){
  const text = `
  <p><strong>DCE → Uptake:</strong> Mixed logit means by country/frame map mandate attributes
  (scope, exemptions, coverage, “lives saved” per 100k) to logit utilities; uptake is
  Pr(mandate) = exp(U_mand)/[exp(U_mand)+exp(U_opt)]. Latent-class shares
  (supporters/resisters) are displayed for context.</p>
  <p><strong>Benefits:</strong> Toggle definitions: ΔV, static cases averted, long-COVID morbidity,
  events averted (hosp/ICU/death), QALYs/DALYs, monetised (value per QALY/VSLY adjustable).</p>
  <p><strong>Costs:</strong> Public fixed + programme per vaccinated, with optional employer, testing,
  attrition, and social costs. Discount rate adjustable.</p>
  <p><strong>CEA/CBA:</strong> Outputs include NPV, B/C, cost per outcome, and NMB.</p>
  <p><strong>Equity:</strong> Hooks for subgroup outcome distribution and concentration index with
  Cookson-type weights.</p>
  <p><strong>Sensitivity:</strong> Deterministic sliders (R₀, VE, WTP) and PSA (N draws) for CEAC.</p>`;
  el('methodsText').innerHTML = text;
}

// ---------- Export ----------
async function exportPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt',format:'a4'});
  const sc = scenarioFromUI();
  const e = econOutputs(sc);
  const cur = computeCosts(sc).cur;

  doc.setFontSize(16);
  doc.text('Vaccine Mandate Policy Decision-Aid — Policy Brief', 40, 40);
  doc.setFontSize(11);
  doc.text(`Country: ${sc.country} | Frame: ${sc.frame}`, 40, 62);
  doc.text(`Policy: scope=${sc.scope}, exemptions=${sc.exempt}, coverage=${sc.cov}, lives=${sc.lives}/100k`, 40, 78);
  doc.text(`Uptake: ${(uptakeProbability(sc)*100).toFixed(1)}%`, 40, 94);
  doc.text(`NPV: ${fmt(e.NPV,cur)} | B/C: ${e.BCR.toFixed(2)} | Cost/QALY: ${isFinite(e.cPerQALY)?fmt(e.cPerQALY,cur):'—'} | NMB: ${fmt(e.NMB,cur)}`, 40, 110);
  doc.text('Methods (abridged):', 40, 140);
  doc.text(el('methodsText').innerText, 40, 160, {maxWidth: 520});
  doc.save('Policy_Brief.pdf');
}
