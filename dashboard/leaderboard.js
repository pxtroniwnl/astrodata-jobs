/* astro-data jobs — Leaderboard de empresas
   Reutiliza `esc`, `API_BASE`, `buildSearchUrls`, `getDefaultTips`,
   `getDefaultChecklist` y `openJobModal` de job-detail.js (cargado antes). */
"use strict";

const RAW_LB = window.JOBS_DATA || { jobs: [], generated_at: null, total: 0 };

const JOBS_LB = RAW_LB.jobs.map((j) => ({
  ...j,
  skills: j.skills || [],
  date: parseDateLb(j.date_posted) || parseDateLb(j.first_seen),
}));

function parseDateLb(s) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T12:00:00");
  return isNaN(d) ? null : d;
}

/* Países que produce `infer_country` en src/enrich.py para las ubicaciones
   de LATAM/Colombia — se preseleccionan por defecto. */
const LATAM_COUNTRIES = new Set([
  "Colombia", "LATAM (sin especificar)", "México", "Brasil", "Argentina",
  "Chile", "Perú", "Costa Rica", "Uruguay", "Guatemala", "Venezuela",
  "Ecuador", "Panamá", "Puerto Rico", "Rep. Dominicana", "Honduras",
]);

const state = {
  role: new Set(), seniority: new Set(), country: new Set(), mode: new Set(),
  days: 30, sort: "count",
};

/* Preseleccionar países LATAM que realmente aparecen en los datos */
for (const c of new Set(JOBS_LB.map((j) => j.country).filter(Boolean))) {
  if (LATAM_COUNTRIES.has(c)) state.country.add(c);
}

const $ = (sel) => document.querySelector(sel);
const fmtInt = (n) => n.toLocaleString("es-CO");

function fmtMoney(n) {
  if (n == null) return "—";
  return n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString("es-CO")}`;
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
    const v = j[key];
    if (v == null || v === "") continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

function sortedKeys(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function anyFilterActive() {
  return state.role.size || state.seniority.size || state.country.size || state.mode.size || state.days != null;
}

function filteredJobs() {
  const cutoff = state.days ? Date.now() - state.days * 864e5 : null;
  return JOBS_LB.filter((j) => {
    if (state.role.size && !state.role.has(j.role_canonical)) return false;
    if (state.seniority.size && !state.seniority.has(j.seniority)) return false;
    if (state.country.size && !state.country.has(j.country)) return false;
    if (state.mode.size && !state.mode.has(j.work_mode)) return false;
    if (cutoff && (!j.date || j.date.getTime() < cutoff)) return false;
    return true;
  });
}

/* ---------------- Barra de filtros ---------------- */
const SENIORITY_ORDER = ["Junior", "Mid", "Senior", "Lead+", "No especificado"];

const FILTER_DEFS = [
  { key: "role", label: "Rol", values: () => sortedKeys(countBy(JOBS_LB, "role_canonical")) },
  { key: "seniority", label: "Seniority", values: () => SENIORITY_ORDER.filter((s) => countBy(JOBS_LB, "seniority").has(s)) },
  { key: "country", label: "País", values: () => sortedKeys(countBy(JOBS_LB, "country")) },
  { key: "mode", label: "Modalidad", values: () => ["Remoto", "Híbrido", "Presencial"] },
];

const fieldCount = (key) => {
  const prop = { role: "role_canonical", seniority: "seniority", country: "country", mode: "work_mode" }[key];
  return countBy(JOBS_LB, prop);
};

function toggle(set, value) {
  set.has(value) ? set.delete(value) : set.add(value);
  refresh();
}

function buildFilterBar() {
  const bar = $("#filterbar");
  const anchor = $("#days-seg");
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
      const checked = state[def.key].has(v) ? "checked" : "";
      opt.innerHTML = `<input type="checkbox" value="${esc(v)}" ${checked}> ${esc(v)} <span class="n">${fmtInt(counts.get(v) || 0)}</span>`;
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
    bar.insertBefore(wrap, anchor);
  }

  document.querySelectorAll("#days-seg button").forEach((b) => {
    b.addEventListener("click", () => {
      state.days = b.dataset.days ? +b.dataset.days : null;
      refresh();
    });
  });

  document.querySelectorAll("#sort-seg button").forEach((b) => {
    b.addEventListener("click", () => {
      state.sort = b.dataset.sort;
      refresh();
    });
  });

  $("#clear").addEventListener("click", () => {
    for (const k of ["role", "seniority", "country", "mode"]) state[k].clear();
    state.days = null;
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
  document.querySelectorAll("#days-seg button").forEach((b) => {
    b.classList.toggle("on", (b.dataset.days ? +b.dataset.days : null) === state.days);
  });
  document.querySelectorAll("#sort-seg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.sort === state.sort);
  });
  $("#clear").classList.toggle("show", !!anyFilterActive());

  const chips = $("#chips");
  chips.innerHTML = "";
  const addChip = (label, onRemove) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.innerHTML = `${esc(label)} <span class="x">✕</span>`;
    c.addEventListener("click", onRemove);
    chips.appendChild(c);
  };
  for (const key of ["role", "seniority", "country", "mode"]) {
    for (const v of state[key]) addChip(v, () => toggle(state[key], v));
  }
}

/* ---------------- Agregación por empresa ---------------- */
const ROLE_LABEL = { "Data Engineer": "DE", "Data Scientist": "DS", "Data Analyst": "DA", "ML/AI Engineer": "ML", "Analytics Engineer": "AE", "BI": "BI", "Data Architect": "DArch" };
const MAX_JOBS_SHOWN = 8;
const MAX_ROWS_SHOWN = 100;

function aggregateByCompany(jobs) {
  const byCompany = new Map();
  for (const j of jobs) {
    if (!j.company) continue;
    if (!byCompany.has(j.company)) {
      byCompany.set(j.company, { company: j.company, jobs: [], countries: new Set(), roles: new Map(), remoteCount: 0, salaries: [] });
    }
    const c = byCompany.get(j.company);
    c.jobs.push(j);
    if (j.country) c.countries.add(j.country);
    if (j.role_canonical) c.roles.set(j.role_canonical, (c.roles.get(j.role_canonical) || 0) + 1);
    if (j.work_mode === "Remoto") c.remoteCount += 1;
    if (j.salary_mid_usd != null) c.salaries.push(j.salary_mid_usd);
  }

  return [...byCompany.values()].map((c) => ({
    ...c,
    count: c.jobs.length,
    topRole: [...c.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    medianSalary: median(c.salaries),
    remotePct: c.jobs.length ? c.remoteCount / c.jobs.length : 0,
  }));
}

function sortCompanies(companies, sort) {
  const by = {
    count: (a, b) => b.count - a.count,
    salary: (a, b) => (b.medianSalary ?? -1) - (a.medianSalary ?? -1),
    remote: (a, b) => b.remotePct - a.remotePct || b.count - a.count,
  }[sort];
  return [...companies].sort(by);
}

/* ---------------- Render ---------------- */
function refresh() {
  syncFilterBar();
  const jobs = filteredJobs();
  const companies = sortCompanies(aggregateByCompany(jobs), state.sort);

  $("#lb-count").textContent = companies.length
    ? `${fmtInt(companies.length)} empresas · ${fmtInt(jobs.length)} vacantes en la selección`
    : "";
  $("#lb-empty").hidden = companies.length > 0;

  const rows = $("#lb-rows");
  rows.innerHTML = "";
  companies.slice(0, MAX_ROWS_SHOWN).forEach((c, i) => rows.appendChild(renderRow(c, i + 1)));
}

function renderRow(c, rank) {
  const row = document.createElement("div");
  row.className = "lb-row";

  const countryList = [...c.countries];
  const countryText = countryList.length > 3
    ? `${countryList.slice(0, 3).join(" · ")} · +${countryList.length - 3}`
    : countryList.join(" · ");

  row.innerHTML = `
    <button class="lb-row-main" type="button" aria-expanded="false">
      <span class="lb-rank">#${rank}</span>
      <span class="lb-company-info">
        <span class="lb-company-name">${esc(c.company)}</span>
        <span class="lb-countries">${esc(countryText || "—")}</span>
      </span>
      <span class="lb-badges">
        <span class="lb-badge count">${fmtInt(c.count)} vacante${c.count === 1 ? "" : "s"}</span>
        ${c.medianSalary != null ? `<span class="lb-badge salary">${fmtMoney(c.medianSalary)}/año</span>` : ""}
        <span class="lb-badge remote">${Math.round(c.remotePct * 100)}% remoto</span>
      </span>
      <span class="lb-caret">▾</span>
    </button>
    <div class="lb-row-detail" hidden></div>
  `;

  const mainBtn = row.querySelector(".lb-row-main");
  const detail = row.querySelector(".lb-row-detail");
  let built = false;
  mainBtn.addEventListener("click", () => {
    const open = !detail.hidden;
    detail.hidden = open;
    mainBtn.setAttribute("aria-expanded", String(!open));
    row.classList.toggle("open", !open);
    if (!open && !built) {
      detail.appendChild(renderRowDetail(c));
      built = true;
    }
  });

  return row;
}

function renderRowDetail(c) {
  const wrap = document.createElement("div");

  const jobsSorted = [...c.jobs].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  const shown = jobsSorted.slice(0, MAX_JOBS_SHOWN);
  const extra = jobsSorted.length - shown.length;

  const jobsHtml = shown.map((j) => `
    <div class="lb-job-item">
      <div class="lb-job-main">
        <span class="lb-job-title">${esc(j.title)}</span>
        ${j.seniority ? `<span class="tag">${esc(j.seniority)}</span>` : ""}
        ${j.work_mode ? `<span class="tag">${esc(j.work_mode)}</span>` : ""}
        ${j.salary_mid_usd != null ? `<span class="tag salary">${fmtMoney(j.salary_mid_usd)}/año</span>` : ""}
      </div>
      <div class="lb-job-actions">
        ${j.job_url ? `<a class="lb-job-link" href="${esc(j.job_url)}" target="_blank" rel="noopener">Ver vacante ↗</a>` : ""}
        <button class="lb-job-cv-btn" data-job-id="${esc(j.id)}">Optimizar CV</button>
      </div>
    </div>
  `).join("");

  wrap.innerHTML = `
    <div class="lb-jobs-list">
      ${jobsHtml}
      ${extra > 0 ? `<div class="lb-jobs-more">+${fmtInt(extra)} vacante${extra === 1 ? "" : "s"} más de ${esc(c.company)}</div>` : ""}
    </div>
    <div class="lb-contacts">
      <button class="lb-contacts-btn" type="button">Buscar contactos en ${esc(c.company)}</button>
      <div class="lb-contacts-result"></div>
    </div>
  `;

  wrap.querySelectorAll(".lb-job-cv-btn").forEach((btn) => {
    btn.addEventListener("click", () => openJobModal(btn.dataset.jobId));
  });

  wrap.querySelector(".lb-contacts-btn").addEventListener("click", (e) => {
    loadCompanyContacts(c.company, c.topRole || "Data", wrap.querySelector(".lb-contacts-result"));
    e.target.disabled = true;
  });

  return wrap;
}

/* ---- Contactos (misma API que job-detail.js, contenedor propio por fila) ---- */
async function loadCompanyContacts(company, jobTitle, container) {
  container.innerHTML = `<div class="modal-loading"><div class="spinner"></div><span class="loading-text">Buscando contactos...</span></div>`;
  try {
    const res = await fetch(`${API_BASE}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, job_title: jobTitle }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderCompanyContacts(await res.json(), container);
  } catch (e) {
    renderCompanyContacts({
      company,
      search_urls: buildSearchUrls(company),
      outreach_tips: getDefaultTips(company, jobTitle),
      networking_checklist: getDefaultChecklist(),
    }, container);
  }
}

function renderCompanyContacts(data, container) {
  const roleLabels = {
    talent_acquisition: "Talent Acquisition",
    recruiter: "Recruiter",
    hr_manager: "HR Manager",
    people_ops: "People Operations",
    hiring_manager: "Hiring Manager (Data)",
    company_page: "Página de la empresa",
  };

  const linksHtml = Object.entries(data.search_urls || {}).map(([key, url]) => `
    <a class="contact-link" href="${esc(url)}" target="_blank" rel="noopener">
      <span class="role-name">${roleLabels[key] || key}</span>
      <span class="arrow">↗</span>
    </a>
  `).join("");

  const tipsHtml = (data.outreach_tips || []).map((t) => `
    <div class="outreach-tip">
      <h5>${esc(t.title)}</h5>
      <div class="template-text">${esc(t.template)}</div>
      <div class="tip-text">💡 ${esc(t.tip)}</div>
    </div>
  `).join("");

  const checklistHtml = (data.networking_checklist || []).map((c, i) => `
    <li>
      <span class="step-num">${String(i + 1).padStart(2, "0")}</span>
      <div>
        <div>${esc(c.step)}</div>
        <div class="step-desc">${esc(c.description)}</div>
      </div>
    </li>
  `).join("");

  container.innerHTML = `
    <div class="contacts-section" style="margin-top:16px;">
      <h4>🔍 Buscar personas de HR en ${esc(data.company)}</h4>
      <div class="contact-links">${linksHtml}</div>
    </div>
    <div class="contacts-section">
      <h4>💬 Plantillas de mensaje</h4>
      ${tipsHtml}
    </div>
    <div class="contacts-section">
      <h4>✅ Checklist de networking</h4>
      <ul class="checklist">${checklistHtml}</ul>
    </div>
  `;
}

/* ---- Init ---- */
document.addEventListener("DOMContentLoaded", () => {
  buildFilterBar();
  refresh();
});
