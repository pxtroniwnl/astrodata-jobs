/* Radar de Empleos Data — lógica de filtros, charts e insights */
"use strict";

/* ---------------- Datos ---------------- */
const RAW = window.JOBS_DATA || { jobs: [], generated_at: null, total: 0 };

const JOBS = RAW.jobs.map((j) => ({
  ...j,
  skills: j.skills || [],
  date: parseDate(j.date_posted) || parseDate(j.first_seen),
}));

function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T12:00:00");
  return isNaN(d) ? null : d;
}

/* ---------------- Paleta (validada, modo oscuro) ---------------- */
const C = {
  blue: "#0A84FF", green: "#22A044", orange: "#CC6E02", violet: "#BF5AF2",
  teal: "#1E9ECB", pink: "#FF375F", gold: "#B58800", gray: "#8E8E93",
  ink: "rgba(255,255,255,0.92)", ink2: "rgba(235,235,245,0.62)",
  ink3: "rgba(235,235,245,0.38)", grid: "rgba(255,255,255,0.07)",
};

const ROLE_COLORS = {
  "Data Engineer": C.blue,
  "Data Scientist": C.violet,
  "Data Analyst": C.green,
  "ML/AI Engineer": C.pink,
  "Analytics Engineer": C.teal,
  "BI": C.orange,
  "Data Architect": C.gold,
  "Otro": C.gray,
};

const MODE_COLORS = { "Remoto": C.blue, "Presencial": C.orange, "Híbrido": C.violet };
const SENIORITY_ORDER = ["Junior", "Mid", "Senior", "Lead+", "No especificado"];

/* ---------------- Estado de filtros ---------------- */
const state = {
  role: new Set(), seniority: new Set(), country: new Set(),
  mode: new Set(), region: new Set(), skill: new Set(),
  days: null, salaryOnly: false, salMin: null, salMax: null,
};

function anyFilterActive() {
  return (
    state.role.size || state.seniority.size || state.country.size ||
    state.mode.size || state.region.size || state.skill.size ||
    state.days || state.salaryOnly || state.salMin != null || state.salMax != null
  );
}

/* `except` permite a cada chart ignorar el filtro de su propia dimensión:
   así las barras no seleccionadas siguen visibles (atenuadas) y el clic
   puede alternar la selección. */
function filteredJobs(except = null) {
  const cutoff = state.days ? Date.now() - state.days * 864e5 : null;
  return JOBS.filter((j) => {
    if (except !== "role" && state.role.size && !state.role.has(j.role_canonical)) return false;
    if (except !== "seniority" && state.seniority.size && !state.seniority.has(j.seniority)) return false;
    if (state.country.size && !state.country.has(j.country)) return false;
    if (except !== "mode" && state.mode.size && !state.mode.has(j.work_mode)) return false;
    if (except !== "region" && state.region.size && !state.region.has(j.region_colombia)) return false;
    if (except !== "skill" && state.skill.size) {
      for (const s of state.skill) if (!j.skills.includes(s)) return false;
    }
    if (cutoff && (!j.date || j.date.getTime() < cutoff)) return false;
    const sal = j.salary_mid_usd;
    if (state.salaryOnly && sal == null) return false;
    if (state.salMin != null && (sal == null || sal < state.salMin)) return false;
    if (state.salMax != null && (sal == null || sal > state.salMax)) return false;
    return true;
  });
}

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);
const fmtInt = (n) => n.toLocaleString("es-CO");
const fmtPct = (n) => `${Math.round(n * 100)}%`;

function fmtMoney(n) {
  if (n == null) return "—";
  return n >= 10000
    ? `$${Math.round(n / 1000)}k`
    : `$${Math.round(n).toLocaleString("es-CO")}`;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function countBy(jobs, key) {
  const m = new Map();
  for (const j of jobs) {
    const v = typeof key === "function" ? key(j) : j[key];
    if (v == null) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

function toggle(set, value) {
  set.has(value) ? set.delete(value) : set.add(value);
  refresh();
}

/* ---------------- Barra de filtros ---------------- */
const FILTER_DEFS = [
  { key: "role", label: "Rol", values: () => sortedKeys(countBy(JOBS, "role_canonical")) },
  { key: "seniority", label: "Seniority", values: () => SENIORITY_ORDER.filter((s) => countBy(JOBS, "seniority").has(s)) },
  { key: "country", label: "País", values: () => sortedKeys(countBy(JOBS, "country")) },
  { key: "mode", label: "Modalidad", values: () => ["Remoto", "Híbrido", "Presencial"] },
  { key: "region", label: "Región CO", values: () => sortedKeys(countBy(JOBS, "region_colombia")) },
  { key: "skill", label: "Skills", values: () => sortedKeys(skillCounts()).slice(0, 30) },
];

function skillCounts() {
  const m = new Map();
  for (const j of JOBS) for (const s of j.skills) m.set(s, (m.get(s) || 0) + 1);
  return m;
}

function sortedKeys(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

const fieldCount = (key) => {
  if (key === "skill") return skillCounts();
  const prop = { role: "role_canonical", seniority: "seniority", country: "country", mode: "work_mode", region: "region_colombia" }[key];
  return countBy(JOBS, prop);
};

function buildFilterBar() {
  const bar = $("#filterbar");
  for (const def of FILTER_DEFS) {
    const counts = fieldCount(def.key);
    const values = def.values();
    if (!values.length) continue;

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    const btn = document.createElement("button");
    btn.className = "pill";
    btn.dataset.key = def.key;
    btn.innerHTML = `${def.label} <span class="count" hidden></span><span class="caret">▼</span>`;

    const dd = document.createElement("div");
    dd.className = "dropdown";
    for (const v of values) {
      const opt = document.createElement("label");
      opt.className = "opt";
      opt.innerHTML = `<input type="checkbox" value="${escapeHtml(v)}"> ${escapeHtml(v)} <span class="n">${fmtInt(counts.get(v) || 0)}</span>`;
      opt.querySelector("input").addEventListener("change", () => toggle(state[def.key], v));
      dd.appendChild(opt);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = dd.classList.contains("open");
      closeDropdowns();
      if (!wasOpen) dd.classList.add("open");
    });
    wrap.append(btn, dd);
    bar.insertBefore(wrap, $("#salary-wrap"));
  }

  // Salario
  $("#salary-only").addEventListener("change", (e) => { state.salaryOnly = e.target.checked; refresh(); });
  $("#sal-min").addEventListener("change", (e) => { state.salMin = e.target.value ? +e.target.value : null; refresh(); });
  $("#sal-max").addEventListener("change", (e) => { state.salMax = e.target.value ? +e.target.value : null; refresh(); });
  $("#salary-pill").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = $("#salary-dd");
    const wasOpen = dd.classList.contains("open");
    closeDropdowns();
    if (!wasOpen) dd.classList.add("open");
  });
  $("#salary-dd").addEventListener("click", (e) => e.stopPropagation());

  // Fechas
  document.querySelectorAll(".seg button").forEach((b) => {
    b.addEventListener("click", () => {
      state.days = b.dataset.days ? +b.dataset.days : null;
      refresh();
    });
  });

  $("#clear").addEventListener("click", () => {
    for (const k of ["role", "seniority", "country", "mode", "region", "skill"]) state[k].clear();
    state.days = null; state.salaryOnly = false; state.salMin = null; state.salMax = null;
    $("#salary-only").checked = false; $("#sal-min").value = ""; $("#sal-max").value = "";
    refresh();
  });

  document.addEventListener("click", closeDropdowns);
}

function closeDropdowns() {
  document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
}

function syncFilterBar() {
  for (const def of FILTER_DEFS) {
    const btn = document.querySelector(`.pill[data-key="${def.key}"]`);
    if (!btn) continue;
    const n = state[def.key].size;
    btn.classList.toggle("active", n > 0);
    const badge = btn.querySelector(".count");
    badge.hidden = !n;
    badge.textContent = n;
    btn.parentElement.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = state[def.key].has(cb.value);
    });
  }
  const salActive = state.salaryOnly || state.salMin != null || state.salMax != null;
  $("#salary-pill").classList.toggle("active", salActive);
  document.querySelectorAll(".seg button").forEach((b) => {
    b.classList.toggle("on", (b.dataset.days ? +b.dataset.days : null) === state.days);
  });
  $("#clear").classList.toggle("show", !!anyFilterActive());

  // chips
  const chips = $("#chips");
  chips.innerHTML = "";
  const addChip = (label, onRemove) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.innerHTML = `${escapeHtml(label)} <span class="x">✕</span>`;
    c.addEventListener("click", onRemove);
    chips.appendChild(c);
  };
  for (const key of ["role", "seniority", "country", "mode", "region", "skill"]) {
    for (const v of state[key]) addChip(v, () => toggle(state[key], v));
  }
  if (state.days) addChip(`Últimos ${state.days} días`, () => { state.days = null; refresh(); });
  if (state.salaryOnly) addChip("Con salario publicado", () => { state.salaryOnly = false; $("#salary-only").checked = false; refresh(); });
  if (state.salMin != null) addChip(`Salario ≥ ${fmtMoney(state.salMin)}`, () => { state.salMin = null; $("#sal-min").value = ""; refresh(); });
  if (state.salMax != null) addChip(`Salario ≤ ${fmtMoney(state.salMax)}`, () => { state.salMax = null; $("#sal-max").value = ""; refresh(); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- KPIs ---------------- */
const kpiState = {};

function animateValue(el, target, format) {
  const key = el.id;
  const from = kpiState[key] ?? 0;
  kpiState[key] = target;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === target) {
    el.textContent = format(target);
    return;
  }
  const t0 = performance.now();
  const dur = 400;
  (function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

function renderKpis(jobs) {
  animateValue($("#kpi-total"), jobs.length, (v) => fmtInt(Math.round(v)));

  const sal = jobs.map((j) => j.salary_mid_usd).filter((v) => v != null);
  const med = median(sal);
  animateValue($("#kpi-salary"), med || 0, (v) => (med == null ? "—" : fmtMoney(v)));
  $("#kpi-salary-sub").textContent = med == null
    ? "ninguna oferta filtrada publica salario"
    : `USD/año · sobre ${fmtInt(sal.length)} ofertas con dato (${fmtPct(sal.length / jobs.length || 0)})`;

  const sk = new Map();
  for (const j of jobs) for (const s of j.skills) sk.set(s, (sk.get(s) || 0) + 1);
  const top = [...sk.entries()].sort((a, b) => b[1] - a[1])[0];
  $("#kpi-skill").textContent = top ? top[0] : "—";
  $("#kpi-skill-sub").textContent = top ? `presente en ${fmtPct(top[1] / jobs.length)} de las ofertas` : "sin datos";

  const remote = jobs.filter((j) => j.work_mode === "Remoto").length;
  animateValue($("#kpi-remote"), jobs.length ? remote / jobs.length : 0, (v) => fmtPct(v));
  $("#kpi-remote-sub").textContent = jobs.length ? `${fmtInt(remote)} ofertas remotas` : "sin datos";
}

/* ---------------- Charts ---------------- */
const charts = {};

const TOOLTIP = {
  backgroundColor: "rgba(28,30,48,0.92)",
  borderColor: "rgba(255,255,255,0.16)",
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: C.ink, fontSize: 12.5 },
  extraCssText: "backdrop-filter: blur(20px); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45);",
};

const AXIS_LABEL = { color: C.ink3, fontSize: 11.5 };
const SPLIT_LINE = { lineStyle: { color: C.grid } };

function initChart(id) {
  const el = document.getElementById(id);
  const chart = echarts.init(el, null, { renderer: "canvas" });
  charts[id] = chart;
  return chart;
}

function barGradient(hex, horizontal = true) {
  return new echarts.graphic.LinearGradient(...(horizontal ? [0, 0, 1, 0] : [0, 1, 0, 0]), [
    { offset: 0, color: hexA(hex, 0.35) },
    { offset: 1, color: hexA(hex, 0.9) },
  ]);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function dimIf(cond, style) {
  return cond ? { ...style, opacity: 0.3 } : style;
}

/* --- 1. Demanda por rol --- */
function renderRoleChart(jobs) {
  const counts = [...countBy(jobs, "role_canonical").entries()].sort((a, b) => a[1] - b[1]);
  charts.roleChart.setOption({
    tooltip: { ...TOOLTIP, formatter: (p) => roleTooltip(p.name, jobs) },
    grid: { left: 8, right: 44, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    yAxis: {
      type: "category", data: counts.map(([k]) => k),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, color: C.ink2, fontSize: 12 },
    },
    series: [{
      type: "bar", barWidth: 14, cursor: "pointer",
      data: counts.map(([k, v]) => ({
        name: k, value: v,
        itemStyle: dimIf(state.role.size && !state.role.has(k), {
          color: barGradient(ROLE_COLORS[k] || C.gray), borderRadius: [0, 4, 4, 0],
        }),
      })),
      label: { show: true, position: "right", color: C.ink2, fontSize: 11.5, formatter: ({ value }) => fmtInt(value) },
    }],
  }, true);
}

function roleTooltip(role, jobs) {
  const sub = jobs.filter((j) => j.role_canonical === role);
  const sal = median(sub.map((j) => j.salary_mid_usd).filter((v) => v != null));
  const rem = sub.filter((j) => j.work_mode === "Remoto").length;
  return `<b>${escapeHtml(role)}</b><br>${fmtInt(sub.length)} ofertas (${fmtPct(sub.length / jobs.length)})<br>` +
    `Salario mediano: ${sal ? fmtMoney(sal) : "s/d"}<br>Remotas: ${fmtPct(sub.length ? rem / sub.length : 0)}` +
    `<br><span style="color:${C.ink3}">clic para filtrar</span>`;
}

/* --- 2. Modalidad (dona) --- */
function renderModeChart(jobs) {
  const counts = countBy(jobs, "work_mode");
  const data = ["Remoto", "Híbrido", "Presencial"].filter((m) => counts.has(m)).map((m) => ({
    name: m, value: counts.get(m),
    itemStyle: dimIf(state.mode.size && !state.mode.has(m), {
      color: MODE_COLORS[m], borderColor: "#101226", borderWidth: 2,
    }),
  }));
  charts.modeChart.setOption({
    tooltip: { ...TOOLTIP, formatter: (p) => modeTooltip(p.name, jobs) },
    legend: { bottom: 0, textStyle: { color: C.ink2, fontSize: 12 }, icon: "circle", itemWidth: 9 },
    series: [{
      type: "pie", radius: ["52%", "76%"], center: ["50%", "44%"], cursor: "pointer",
      data,
      label: { color: C.ink2, fontSize: 12, formatter: ({ name, percent }) => `${name}\n${Math.round(percent)}%` },
      labelLine: { lineStyle: { color: C.ink3 } },
      emphasis: { scaleSize: 6 },
    }],
  }, true);
}

function modeTooltip(mode, jobs) {
  const sub = jobs.filter((j) => j.work_mode === mode);
  const sal = median(sub.map((j) => j.salary_mid_usd).filter((v) => v != null));
  return `<b>${mode}</b><br>${fmtInt(sub.length)} ofertas<br>Salario mediano: ${sal ? fmtMoney(sal) : "s/d"}` +
    `<br><span style="color:${C.ink3}">clic para filtrar</span>`;
}

/* --- 3. Top skills --- */
function renderSkillsChart(jobs) {
  const m = new Map();
  for (const j of jobs) for (const s of j.skills) m.set(s, (m.get(s) || 0) + 1);
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).reverse();
  charts.skillsChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => `<b>${escapeHtml(p.name)}</b><br>${fmtInt(p.value)} ofertas (${fmtPct(p.value / jobs.length)})` +
        `<br><span style="color:${C.ink3}">clic para filtrar</span>`,
    },
    grid: { left: 8, right: 40, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    yAxis: {
      type: "category", data: top.map(([k]) => k),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, color: C.ink2, fontSize: 12 },
    },
    series: [{
      type: "bar", barWidth: 11, cursor: "pointer",
      data: top.map(([k, v]) => ({
        name: k, value: v,
        itemStyle: dimIf(state.skill.size && !state.skill.has(k), {
          color: barGradient(C.blue), borderRadius: [0, 4, 4, 0],
        }),
      })),
    }],
  }, true);
}

/* --- 4. Salario por skill --- */
function renderSkillSalaryChart(jobs) {
  const groups = new Map();
  for (const j of jobs) {
    if (j.salary_mid_usd == null) continue;
    for (const s of j.skills) {
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(j.salary_mid_usd);
    }
  }
  const rows = [...groups.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([k, v]) => [k, median(v), v.length])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .reverse();
  setEmpty("skillSalaryChart", rows.length, "No hay suficientes ofertas con salario publicado en esta selección");
  charts.skillSalaryChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        const [, , n] = rows[p.dataIndex];
        return `<b>${escapeHtml(p.name)}</b><br>Salario mediano: ${fmtMoney(p.value)} USD/año<br>sobre ${n} ofertas con dato`;
      },
    },
    grid: { left: 8, right: 56, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: { ...AXIS_LABEL, formatter: (v) => fmtMoney(v) } },
    yAxis: {
      type: "category", data: rows.map(([k]) => k),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, color: C.ink2, fontSize: 12 },
    },
    series: [{
      type: "bar", barWidth: 11,
      data: rows.map(([k, v]) => ({ name: k, value: Math.round(v), itemStyle: { color: barGradient(C.green), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: "right", color: C.ink2, fontSize: 11, formatter: ({ value }) => fmtMoney(value) },
    }],
  }, true);
}

/* --- 5. Colombia por región --- */
function renderRegionChart(jobs) {
  const counts = [...countBy(jobs, "region_colombia").entries()].sort((a, b) => b[1] - a[1]);
  setEmpty("regionChart", counts.length, "No hay ofertas de Colombia en esta selección");
  charts.regionChart.setOption({
    tooltip: { ...TOOLTIP, formatter: (p) => regionTooltip(p.name, jobs) },
    grid: { left: 8, right: 10, top: 14, bottom: 4, containLabel: true },
    xAxis: {
      type: "category", data: counts.map(([k]) => k),
      axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, interval: 0, rotate: counts.length > 4 ? 24 : 0 },
    },
    yAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [{
      type: "bar", barWidth: 22, cursor: "pointer",
      data: counts.map(([k, v]) => ({
        name: k, value: v,
        itemStyle: dimIf(state.region.size && !state.region.has(k), {
          color: barGradient(C.teal, false), borderRadius: [4, 4, 0, 0],
        }),
      })),
      label: { show: true, position: "top", color: C.ink2, fontSize: 11.5, formatter: ({ value }) => fmtInt(value) },
    }],
  }, true);
}

function regionTooltip(region, jobs) {
  const sub = jobs.filter((j) => j.region_colombia === region);
  const sal = median(sub.map((j) => j.salary_mid_usd).filter((v) => v != null));
  const roles = [...countBy(sub, "role_canonical").entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([r, n]) => `${r} (${n})`).join(", ");
  return `<b>${escapeHtml(region)}</b><br>${fmtInt(sub.length)} ofertas<br>Salario mediano: ${sal ? fmtMoney(sal) : "s/d"}` +
    `<br>Top roles: ${roles || "—"}<br><span style="color:${C.ink3}">clic para filtrar</span>`;
}

/* --- 6. Seniority --- */
function renderSeniorityChart(jobs) {
  const counts = countBy(jobs, "seniority");
  const cats = SENIORITY_ORDER.filter((s) => counts.has(s));
  charts.seniorityChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => `<b>${p.name}</b><br>${fmtInt(p.value)} ofertas (${fmtPct(p.value / jobs.length)})` +
        `<br><span style="color:${C.ink3}">clic para filtrar</span>`,
    },
    grid: { left: 8, right: 10, top: 14, bottom: 4, containLabel: true },
    xAxis: {
      type: "category", data: cats,
      axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, interval: 0 },
    },
    yAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [{
      type: "bar", barWidth: 26, cursor: "pointer",
      data: cats.map((k) => ({
        name: k, value: counts.get(k),
        itemStyle: dimIf(state.seniority.size && !state.seniority.has(k), {
          color: barGradient(C.violet, false), borderRadius: [4, 4, 0, 0],
        }),
      })),
      label: { show: true, position: "top", color: C.ink2, fontSize: 11.5, formatter: ({ value }) => fmtInt(value) },
    }],
  }, true);
}

/* --- 7. Años de experiencia --- */
function renderExpChart(jobs) {
  const buckets = [["0–1", 0, 1], ["2–3", 2, 3], ["4–5", 4, 5], ["6–8", 6, 8], ["9+", 9, 99]];
  const withYears = jobs.filter((j) => j.years_experience != null);
  const data = buckets.map(([label, lo, hi]) => [label, withYears.filter((j) => j.years_experience >= lo && j.years_experience <= hi).length]);
  setEmpty("expChart", withYears.length, "Ninguna oferta filtrada especifica años de experiencia");
  charts.expChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => `<b>${p.name} años</b><br>${fmtInt(p.value)} ofertas (${fmtPct(withYears.length ? p.value / withYears.length : 0)} de las que especifican)`,
    },
    grid: { left: 8, right: 10, top: 14, bottom: 4, containLabel: true },
    xAxis: {
      type: "category", data: data.map(([k]) => k),
      axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false }, axisLabel: AXIS_LABEL,
      name: "años requeridos", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: C.ink3, fontSize: 11 },
    },
    yAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [{
      type: "bar", barWidth: 26,
      data: data.map(([, v]) => ({ value: v, itemStyle: { color: barGradient(C.orange, false), borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: "top", color: C.ink2, fontSize: 11.5, formatter: ({ value }) => (value ? fmtInt(value) : "") },
    }],
  }, true);
}

/* --- 8. Tendencia temporal --- */
function renderTrendChart(jobs) {
  const withDate = jobs.filter((j) => j.date);
  const byDay = new Map();
  for (const j of withDate) {
    const k = j.date.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const days = [...byDay.keys()].sort();
  const data = days.map((d) => [d, byDay.get(d)]);
  setEmpty("trendChart", data.length, "Sin fechas de publicación en esta selección");
  charts.trendChart.setOption({
    tooltip: {
      ...TOOLTIP, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "rgba(255,255,255,0.25)" } },
      formatter: (ps) => `<b>${ps[0].axisValue}</b><br>${fmtInt(ps[0].value[1])} ofertas publicadas`,
    },
    grid: { left: 8, right: 16, top: 14, bottom: 4, containLabel: true },
    xAxis: {
      type: "category", data: days, boundaryGap: false,
      axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, formatter: (v) => v.slice(5) },
    },
    yAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL, minInterval: 1 },
    series: [{
      type: "line", smooth: 0.35, symbol: "circle", symbolSize: 8,
      data,
      lineStyle: { width: 2, color: C.blue },
      itemStyle: { color: C.blue, borderColor: "#101226", borderWidth: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexA(C.blue, 0.28) },
          { offset: 1, color: hexA(C.blue, 0.02) },
        ]),
      },
    }],
  }, true);
}

/* --- 9. Combos de skills mejor pagados --- */
function renderComboChart(jobs) {
  const combos = new Map();
  for (const j of jobs) {
    if (j.salary_mid_usd == null || j.skills.length < 2) continue;
    const top = j.skills.slice(0, 8);
    for (let a = 0; a < top.length; a++) {
      for (let b = a + 1; b < top.length; b++) {
        const key = [top[a], top[b]].sort().join(" + ");
        if (!combos.has(key)) combos.set(key, []);
        combos.get(key).push(j.salary_mid_usd);
      }
    }
  }
  const rows = [...combos.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([k, v]) => [k, median(v), v.length])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse();
  setEmpty("comboChart", rows.length, "No hay suficientes ofertas con salario para calcular combinaciones");
  charts.comboChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        const [, , n] = rows[p.dataIndex];
        return `<b>${escapeHtml(p.name)}</b><br>Salario mediano: ${fmtMoney(p.value)} USD/año<br>sobre ${n} ofertas con dato`;
      },
    },
    grid: { left: 8, right: 60, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", splitLine: SPLIT_LINE, axisLabel: { ...AXIS_LABEL, formatter: (v) => fmtMoney(v) } },
    yAxis: {
      type: "category", data: rows.map(([k]) => k),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, color: C.ink2, fontSize: 12 },
    },
    series: [{
      type: "bar", barWidth: 12,
      data: rows.map(([k, v]) => ({ name: k, value: Math.round(v), itemStyle: { color: barGradient(C.violet), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: "right", color: C.ink2, fontSize: 11, formatter: ({ value }) => fmtMoney(value) },
    }],
  }, true);
}

/* Placeholder de "sin datos" por chart */
function setEmpty(id, hasData, msg) {
  const el = document.getElementById(id);
  let ph = el.parentElement.querySelector(".empty-msg");
  if (!hasData) {
    if (!ph) {
      ph = document.createElement("div");
      ph.className = "empty-msg";
      ph.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(235,235,245,.35);font-size:13px;text-align:center;padding:0 30px;";
      el.parentElement.style.position = "relative";
      el.parentElement.appendChild(ph);
    }
    ph.textContent = msg;
    ph.style.display = "flex";
  } else if (ph) {
    ph.style.display = "none";
  }
}

/* ---------------- Insights ---------------- */
function renderInsights(jobs) {
  const box = $("#insights-list");
  const out = [];
  const N = jobs.length;

  if (N >= 5) {
    const roles = [...countBy(jobs, "role_canonical").entries()].filter(([k]) => k !== "Otro").sort((a, b) => b[1] - a[1]);
    if (roles.length >= 2 && roles[1][1] > 0) {
      const ratio = (roles[0][1] / roles[1][1]).toFixed(1);
      out.push({
        accent: C.blue,
        html: `<b>${roles[0][0]}</b> lidera la demanda con <span class="num">${fmtInt(roles[0][1])}</span> ofertas — ${ratio}× más que ${roles[1][0]}.`,
      });
    }

    const sk = new Map();
    for (const j of jobs) for (const s of j.skills) sk.set(s, (sk.get(s) || 0) + 1);
    const topSk = [...sk.entries()].sort((a, b) => b[1] - a[1]);
    if (topSk.length) {
      const [name, n] = topSk[0];
      out.push({
        accent: C.green,
        html: `<b>${name}</b> aparece en <span class="num">${fmtPct(n / N)}</span> de las ofertas filtradas: es el requisito más transversal.`,
      });
    }

    const salaried = jobs.filter((j) => j.salary_mid_usd != null);
    const medAll = median(salaried.map((j) => j.salary_mid_usd));
    if (salaried.length >= 5 && medAll) {
      const freq = topSk.slice(0, 12).map(([s]) => s);
      let best = null;
      for (const s of freq) {
        const vals = salaried.filter((j) => j.skills.includes(s)).map((j) => j.salary_mid_usd);
        if (vals.length >= 3) {
          const m = median(vals);
          if (!best || m > best.m) best = { s, m, n: vals.length };
        }
      }
      if (best && best.m > medAll * 1.05) {
        out.push({
          accent: C.orange,
          html: `Entre las skills frecuentes, <b>${best.s}</b> paga mejor: mediana de <span class="num">${fmtMoney(best.m)}</span>, ${fmtPct(best.m / medAll - 1)} sobre la mediana general (${fmtMoney(medAll)}).`,
        });
      }
      const rem = salaried.filter((j) => j.work_mode === "Remoto").map((j) => j.salary_mid_usd);
      const pres = salaried.filter((j) => j.work_mode !== "Remoto").map((j) => j.salary_mid_usd);
      if (rem.length >= 3 && pres.length >= 3) {
        const mr = median(rem), mp = median(pres);
        const diff = mr / mp - 1;
        out.push({
          accent: C.teal,
          html: `Lo remoto paga ${diff >= 0 ? "más" : "menos"}: mediana remota <span class="num">${fmtMoney(mr)}</span> vs ${fmtMoney(mp)} presencial/híbrido (${diff >= 0 ? "+" : ""}${fmtPct(diff)}).`,
        });
      }
      out.push({
        accent: C.gray,
        html: `Solo <span class="num">${fmtPct(salaried.length / N)}</span> de las ofertas publica salario — toma las cifras como referencia, no como censo.`,
      });
    }

    const co = countBy(jobs, "region_colombia");
    const coTotal = [...co.values()].reduce((a, b) => a + b, 0);
    if (coTotal >= 10) {
      const bog = co.get("Bogotá") || 0;
      const med2 = co.get("Medellín / Antioquia") || 0;
      const costa = co.get("Costa Caribe") || 0;
      if (bog && costa) {
        out.push({
          accent: C.violet,
          html: `En Colombia, <b>Bogotá</b> concentra <span class="num">${fmtInt(bog)}</span> ofertas vs ${fmtInt(med2)} en Medellín y ${fmtInt(costa)} en la Costa Caribe (${(bog / costa).toFixed(1)}× la Costa).`,
        });
      } else if (bog || med2) {
        out.push({
          accent: C.violet,
          html: `En Colombia la oferta se concentra en <b>${bog >= med2 ? "Bogotá" : "Medellín"}</b> (<span class="num">${fmtInt(Math.max(bog, med2))}</span> ofertas de ${fmtInt(coTotal)}).`,
        });
      }
    }

    const junior = jobs.filter((j) => j.seniority === "Junior" || (j.years_experience != null && j.years_experience <= 1)).length;
    const withExp = jobs.filter((j) => j.years_experience != null);
    const medYears = median(withExp.map((j) => j.years_experience));
    if (junior || withExp.length >= 5) {
      const parts = [];
      if (jobs.length) parts.push(`<span class="num">${fmtPct(junior / N)}</span> de las ofertas son aptas para perfil junior`);
      if (medYears != null) parts.push(`la experiencia típica pedida es <b>${medYears} años</b>`);
      out.push({ accent: C.pink, html: parts.join(" y ") + "." });
    }

    const rem = jobs.filter((j) => j.work_mode === "Remoto").length;
    out.push({
      accent: C.blue,
      html: `El <span class="num">${fmtPct(rem / N)}</span> de la selección es remota — ${rem / N >= 0.5 ? "puedes competir sin mudarte" : "buena parte del mercado sigue atado a una ciudad"}.`,
    });
  }

  box.innerHTML = "";
  if (!out.length) {
    box.innerHTML = `<div class="insight empty">Aún no hay suficientes datos filtrados para generar conclusiones. Amplía los filtros o espera a que el pipeline acumule más corridas.</div>`;
    return;
  }
  for (const ins of out) {
    const d = document.createElement("div");
    d.className = "insight";
    d.style.setProperty("--in-accent", ins.accent);
    d.innerHTML = ins.html;
    box.appendChild(d);
  }
}

/* ---------------- Tabla de ofertas ---------------- */
function renderTable(jobs) {
  const rows = [...jobs].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 50);
  $("#table-hint").textContent = `${fmtInt(Math.min(50, rows.length))} de ${fmtInt(jobs.length)} ofertas (las más recientes)`;
  const tbody = $("#jobs-tbody");
  tbody.innerHTML = "";
  for (const j of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a href="${escapeHtml(j.job_url || "#")}" target="_blank" rel="noopener">${escapeHtml(j.title || "—")}</a></td>
      <td>${escapeHtml(j.company || "—")}</td>
      <td>${escapeHtml(j.region_colombia || j.country || "—")}</td>
      <td><span class="tag">${escapeHtml(j.work_mode || "—")}</span></td>
      <td>${escapeHtml(j.seniority || "—")}</td>
      <td>${j.salary_mid_usd != null ? fmtMoney(j.salary_mid_usd) : "—"}</td>
      <td>${escapeHtml((j.date_posted || j.first_seen || "").slice(0, 10))}</td>`;
    tbody.appendChild(tr);
  }
}

/* ---------------- Orquestación ---------------- */
function refresh() {
  const jobs = filteredJobs();
  syncFilterBar();
  renderKpis(jobs);
  renderRoleChart(filteredJobs("role"));
  renderModeChart(filteredJobs("mode"));
  renderSkillsChart(filteredJobs("skill"));
  renderSkillSalaryChart(jobs);
  renderRegionChart(filteredJobs("region"));
  renderSeniorityChart(filteredJobs("seniority"));
  renderExpChart(jobs);
  renderTrendChart(jobs);
  renderComboChart(jobs);
  renderInsights(jobs);
  renderTable(jobs);
}

function bindCrossFilter() {
  const map = [
    ["roleChart", (name) => toggle(state.role, name)],
    ["modeChart", (name) => toggle(state.mode, name)],
    ["skillsChart", (name) => toggle(state.skill, name)],
    ["regionChart", (name) => toggle(state.region, name)],
    ["seniorityChart", (name) => toggle(state.seniority, name)],
  ];
  for (const [id, fn] of map) {
    charts[id].on("click", (p) => fn(p.name));
  }
}

function init() {
  $("#meta").textContent = RAW.generated_at
    ? `${fmtInt(JOBS.length)} vacantes acumuladas · actualizado ${RAW.generated_at.slice(0, 10)}`
    : "sin datos: corre el pipeline";

  for (const id of ["roleChart", "modeChart", "skillsChart", "skillSalaryChart",
    "regionChart", "seniorityChart", "expChart", "trendChart", "comboChart"]) {
    initChart(id);
  }
  buildFilterBar();
  bindCrossFilter();
  refresh();

  let t;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => Object.values(charts).forEach((c) => c.resize()), 150);
  });
}

init();
