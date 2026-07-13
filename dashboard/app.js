/* astro-data jobs — lógica de filtros, charts e insights */
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

/* ---------------- Paleta oscura (validada, ref. DeFi) ---------------- */
const C = {
  blue: "#4C7FD0", green: "#71963B", orange: "#C05E2F", violet: "#A45B9B",
  teal: "#12A088", pink: "#C05E2F", gold: "#A8862E", gray: "#7C8276",
  ink: "#F2F3EE", ink2: "rgba(242,243,238,0.65)",
  ink3: "rgba(242,243,238,0.4)", grid: "rgba(255,255,255,0.07)",
};

/* Rampa secuencial (magnitud) para el mapa coroplético: salvia oscuro → brillante */
const MAP_RAMP = ["#242920", "#3A472E", "#55693C", "#7A9450", "#A9C46E"];

const ROLE_COLORS = {
  "Data Engineer": C.green,
  "Data Scientist": C.violet,
  "Data Analyst": C.blue,
  "ML/AI Engineer": C.orange,
  "Analytics Engineer": C.teal,
  "BI": C.gold,
  "Data Architect": C.gray,
  "Otro": C.gray,
};

const MODE_COLORS = { "Remoto": C.green, "Presencial": C.gold, "Híbrido": C.violet };
const SENIORITY_ORDER = ["Junior", "Mid", "Senior", "Lead+", "No especificado"];

/* ---------------- Estado de filtros ---------------- */
const state = {
  role: new Set(), seniority: new Set(), country: new Set(),
  mode: new Set(), city: new Set(), skill: new Set(),
  days: null, salaryOnly: false, salMin: null, salMax: null,
};

function anyFilterActive() {
  return (
    state.role.size || state.seniority.size || state.country.size ||
    state.mode.size || state.city.size || state.skill.size ||
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
    if (except !== "country" && state.country.size && !state.country.has(j.country)) return false;
    if (except !== "mode" && state.mode.size && !state.mode.has(j.work_mode)) return false;
    if (except !== "city" && state.city.size && !state.city.has(j.city)) return false;
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
  { key: "city", label: "Ciudad", values: () => sortedKeys(countBy(JOBS, "city")) },
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
  const prop = { role: "role_canonical", seniority: "seniority", country: "country", mode: "work_mode", city: "city" }[key];
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

    // Búsqueda dentro del dropdown para listas largas (Ciudad, País, Skills…)
    if (values.length > 8) {
      const search = document.createElement("input");
      search.type = "search";
      search.className = "search-input";
      search.placeholder = `Buscar ${def.label.toLowerCase()}…`;
      search.addEventListener("click", (e) => e.stopPropagation());
      search.addEventListener("input", () => {
        const q = normalize(search.value);
        dd.querySelectorAll("label.opt").forEach((opt) => {
          opt.style.display = !q || normalize(opt.textContent).includes(q) ? "" : "none";
        });
      });
      dd.appendChild(search);
    }

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
    for (const k of ["role", "seniority", "country", "mode", "city", "skill"]) state[k].clear();
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
  for (const key of ["role", "seniority", "country", "mode", "city", "skill"]) {
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

function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  backgroundColor: "#1B1E19",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: C.ink, fontSize: 12.5 },
  extraCssText: "border-radius: 14px; box-shadow: 0 14px 40px rgba(0,0,0,.5);",
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
    { offset: 0, color: hexA(hex, 0.55) },
    { offset: 1, color: hexA(hex, 0.95) },
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
      color: MODE_COLORS[m], borderColor: "#0B0C0A", borderWidth: 2,
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
          color: barGradient(C.green), borderRadius: [0, 4, 4, 0],
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

/* --- 5. Top ciudades --- */
function renderCityChart(jobs) {
  const withCity = jobs.filter((j) => j.city != null).length;
  const top = [...countBy(jobs, "city").entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).reverse();
  setEmpty("cityChart", top.length, "Ninguna oferta filtrada publica ciudad");
  charts.cityChart.setOption({
    tooltip: { ...TOOLTIP, formatter: (p) => cityTooltip(p.name, jobs) },
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
        itemStyle: dimIf(state.city.size && !state.city.has(k), {
          color: barGradient(C.teal), borderRadius: [0, 4, 4, 0],
        }),
      })),
      label: { show: true, position: "right", color: C.ink2, fontSize: 11.5, formatter: ({ value }) => fmtInt(value) },
    }],
  }, true);
  return withCity;
}

function cityTooltip(city, jobs) {
  const sub = jobs.filter((j) => j.city === city);
  const sal = median(sub.map((j) => j.salary_mid_usd).filter((v) => v != null));
  const roles = [...countBy(sub, "role_canonical").entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([r, n]) => `${r} (${n})`).join(", ");
  const country = sub[0] ? sub[0].country : "";
  return `<b>${escapeHtml(city)}</b> · ${escapeHtml(country)}<br>${fmtInt(sub.length)} ofertas<br>Salario mediano: ${sal ? fmtMoney(sal) : "s/d"}` +
    `<br>Top roles: ${roles || "—"}<br><span style="color:${C.ink3}">clic para filtrar</span>`;
}

/* --- 5b. Mapa coroplético por país --- */

/* País (nombre en español, como viene en los datos) -> nombre en el GeoJSON */
const COUNTRY_GEO_NAMES = {
  "Colombia": "Colombia", "México": "Mexico", "Argentina": "Argentina",
  "Brasil": "Brazil", "Chile": "Chile", "Perú": "Peru", "Ecuador": "Ecuador",
  "Uruguay": "Uruguay", "Paraguay": "Paraguay", "Bolivia": "Bolivia",
  "Venezuela": "Venezuela", "Costa Rica": "Costa Rica", "Panamá": "Panama",
  "Guatemala": "Guatemala", "Honduras": "Honduras", "El Salvador": "El Salvador",
  "Nicaragua": "Nicaragua", "Rep. Dominicana": "Dominican Republic",
  "Puerto Rico": "Puerto Rico", "Estados Unidos": "United States of America",
  "Canadá": "Canada", "España": "Spain", "Reino Unido": "United Kingdom",
  "Alemania": "Germany", "India": "India",
};
const GEO_TO_ES = Object.fromEntries(Object.entries(COUNTRY_GEO_NAMES).map(([es, geo]) => [geo, es]));

function renderMapChart(jobs) {
  const counts = countBy(jobs, "country");
  const data = [];
  const unmappable = [];
  for (const [es, n] of counts) {
    const geo = COUNTRY_GEO_NAMES[es];
    if (geo) data.push({ name: geo, value: n });
    else unmappable.push([es, n]);
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  charts.mapChart.setOption({
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        const es = GEO_TO_ES[p.name];
        if (!es || isNaN(p.value)) return null;
        const sub = jobs.filter((j) => j.country === es);
        const sal = median(sub.map((j) => j.salary_mid_usd).filter((v) => v != null));
        const rem = sub.filter((j) => j.work_mode === "Remoto").length;
        return `<b>${escapeHtml(es)}</b><br>${fmtInt(sub.length)} ofertas<br>` +
          `Salario mediano: ${sal ? fmtMoney(sal) : "s/d"}<br>Remotas: ${fmtPct(sub.length ? rem / sub.length : 0)}` +
          `<br><span style="color:${C.ink3}">clic para filtrar</span>`;
      },
    },
    visualMap: {
      min: 0, max, calculable: false,
      orient: "horizontal", left: 10, bottom: 6,
      inRange: { color: MAP_RAMP },
      text: [fmtInt(max), "0"],
      textStyle: { color: C.ink2, fontSize: 11 },
    },
    series: [{
      type: "map", map: "world", roam: false, cursor: "pointer",
      top: 10, bottom: 40,
      itemStyle: { areaColor: "#1B1E19", borderColor: "#0B0C0A", borderWidth: 0.6 },
      emphasis: { label: { show: false }, itemStyle: { areaColor: "#C3D695" } },
      select: { disabled: true },
      data,
    }],
  }, true);

  const note = $("#map-note");
  const dimmed = state.country.size
    ? " · filtro de país activo: el mapa muestra el resto de filtros" : "";
  note.textContent = unmappable.length
    ? `Sin país mapeable: ${unmappable.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${fmtInt(n)})`).join(" · ")}${dimmed}`
    : dimmed.replace(" · ", "");
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
      axisPointer: { type: "line", lineStyle: { color: "rgba(242,243,238,0.25)" } },
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
      lineStyle: { width: 2, color: C.green },
      itemStyle: { color: C.green, borderColor: "#0B0C0A", borderWidth: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexA(C.green, 0.28) },
          { offset: 1, color: hexA(C.green, 0.02) },
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
      ph.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(242,243,238,.4);font-size:13px;text-align:center;padding:0 30px;";
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

    const geoCountries = [...countBy(jobs, "country").entries()]
      .filter(([k]) => !k.includes("sin especificar"))
      .sort((a, b) => b[1] - a[1]);
    if (geoCountries.length >= 2) {
      const [[c1, n1], [c2, n2]] = geoCountries;
      out.push({
        accent: C.violet,
        html: `<b>${escapeHtml(c1)}</b> concentra la oferta con <span class="num">${fmtInt(n1)}</span> ofertas, seguido de ${escapeHtml(c2)} (${fmtInt(n2)}).`,
      });
    }

    const cities = [...countBy(jobs, "city").entries()].sort((a, b) => b[1] - a[1]);
    const withCity = cities.reduce((a, [, n]) => a + n, 0);
    if (cities.length >= 2 && withCity >= 10) {
      const [c1, n1] = cities[0];
      out.push({
        accent: C.teal,
        html: `Entre las ofertas con ubicación, <b>${escapeHtml(c1)}</b> es la ciudad líder (<span class="num">${fmtInt(n1)}</span> de ${fmtInt(withCity)}). El ${fmtPct(1 - withCity / N)} de la selección no publica ciudad — típico de roles remotos.`,
      });
    }

    if (salaried.length >= 10) {
      let bestC = null;
      for (const [es] of geoCountries) {
        const vals = salaried.filter((j) => j.country === es).map((j) => j.salary_mid_usd);
        if (vals.length >= 3) {
          const m = median(vals);
          if (!bestC || m > bestC.m) bestC = { es, m, n: vals.length };
        }
      }
      if (bestC) {
        out.push({
          accent: C.orange,
          html: `El país que mejor paga (con dato) es <b>${escapeHtml(bestC.es)}</b>: mediana de <span class="num">${fmtMoney(bestC.m)}</span> sobre ${bestC.n} ofertas.`,
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
    tr.style.cursor = "pointer";
    tr.dataset.jobId = j.id;
    tr.innerHTML = `
      <td><a href="${escapeHtml(j.job_url || "#")}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(j.title || "—")}</a></td>
      <td>${escapeHtml(j.company || "—")}</td>
      <td>${escapeHtml(j.city ? `${j.city}, ${j.country}` : j.country || "—")}</td>
      <td><span class="tag">${escapeHtml(j.work_mode || "—")}</span></td>
      <td>${escapeHtml(j.seniority || "—")}</td>
      <td>${j.salary_mid_usd != null ? fmtMoney(j.salary_mid_usd) : "—"}</td>
      <td>${escapeHtml((j.date_posted || j.first_seen || "").slice(0, 10))}</td>`;
    tr.addEventListener("click", () => {
      if (typeof openJobModal === "function") openJobModal(j.id);
    });
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
  renderCityChart(filteredJobs("city"));
  renderMapChart(filteredJobs("country"));
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
    ["cityChart", (name) => toggle(state.city, name)],
    ["seniorityChart", (name) => toggle(state.seniority, name)],
  ];
  for (const [id, fn] of map) {
    charts[id].on("click", (p) => fn(p.name));
  }
  // El mapa entrega el nombre del GeoJSON; se traduce de vuelta al español
  charts.mapChart.on("click", (p) => {
    const es = GEO_TO_ES[p.name];
    if (es) toggle(state.country, es);
  });
}

function init() {
  $("#meta").textContent = RAW.generated_at
    ? `Vacantes reales de LinkedIn para roles de data — filtra, compara y decide. Actualizado ${RAW.generated_at.slice(0, 10)}.`
    : "sin datos: corre el pipeline";

  const nCountries = countBy(JOBS, "country").size;
  const nCities = countBy(JOBS, "city").size;
  $("#hero-stats").innerHTML = [
    [JOBS.length, "vacantes"], [nCountries, "países"], [nCities, "ciudades"],
  ].map(([n, l]) => `<span class="stat"><b>${fmtInt(n)}</b>${l}</span>`).join("");

  if (window.WORLD_GEOJSON) echarts.registerMap("world", window.WORLD_GEOJSON);

  for (const id of ["roleChart", "modeChart", "skillsChart", "skillSalaryChart",
    "cityChart", "mapChart", "seniorityChart", "expChart", "trendChart", "comboChart"]) {
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

  // Scroll-reveal for cards, insights, table
  const revealEls = document.querySelectorAll(".card, .insights, .jobs-table");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          // Stagger delay per card
          const siblings = [...e.target.parentElement.children].filter(c => c.classList.contains("card"));
          const idx = siblings.indexOf(e.target);
          e.target.style.transitionDelay = `${idx * 60}ms`;
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }
  );
  revealEls.forEach((el) => observer.observe(el));
}

init();
