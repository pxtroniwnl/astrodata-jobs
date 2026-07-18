/* astro-data jobs — Job Detail Modal logic */
"use strict";

/* Rutas relativas: en local el backend FastAPI sirve el dashboard en :8000,
   y en producción Vercel reescribe /api/* hacia el backend en Railway. */
const API_BASE = "";

let _currentJobId = null;
let _currentJob = null;

/* ---- Modal open/close ---- */
function openJobModal(jobId) {
  _currentJobId = jobId;
  const overlay = document.getElementById("job-modal-overlay");
  const panel = document.getElementById("job-modal-panel");
  overlay.classList.add("open");
  panel.classList.add("open");
  document.body.style.overflow = "hidden";
  loadJobDetail(jobId);
}

function closeJobModal() {
  const overlay = document.getElementById("job-modal-overlay");
  const panel = document.getElementById("job-modal-panel");
  overlay.classList.remove("open");
  panel.classList.remove("open");
  document.body.style.overflow = "";
  _currentJobId = null;
}

/* ---- Load job from API or local data ---- */
async function loadJobDetail(jobId) {
  const body = document.getElementById("modal-job-body");
  body.innerHTML = `<div class="modal-loading"><div class="spinner"></div><span class="loading-text">Cargando vacante...</span></div>`;

  // Try API first, fall back to local data
  let job = null;
  try {
    const res = await fetch(`${API_BASE}/api/job/${jobId}`);
    if (res.ok) job = await res.json();
  } catch (e) { /* fallback to local */ }

  if (!job) {
    const raw = window.JOBS_DATA || { jobs: [] };
    const local = raw.jobs.find((j) => j.id === jobId);
    if (local) {
      job = {
        ...local,
        description: "(La descripción completa solo está disponible con el backend activo. Inicia el servidor con: uvicorn backend.main:app --reload)",
      };
    }
  }

  if (!job) {
    body.innerHTML = `<p style="color:var(--ink-3);padding:20px;">Vacante no encontrada.</p>`;
    return;
  }

  renderJobInfo(job);
  resetModalTabs();
}

function renderJobInfo(job) {
  _currentJob = job;
  const body = document.getElementById("modal-job-body");
  const skills = (job.skills || []).map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("");
  const salary = job.salary_mid_usd
    ? `$${Math.round(job.salary_mid_usd / 1000)}k USD/año`
    : job.salary_min_usd
      ? `$${Math.round(job.salary_min_usd / 1000)}k – $${Math.round(job.salary_max_usd / 1000)}k USD/año`
      : "";

  body.innerHTML = `
    <div class="job-info">
      <h2 style="font-size:20px;font-weight:650;letter-spacing:-0.02em;">${esc(job.title)}</h2>
      <div class="company">${esc(job.company)}</div>
      <div class="meta-row">
        ${job.location ? `<span class="tag">${esc(job.location)}</span>` : ""}
        ${job.work_mode ? `<span class="tag">${esc(job.work_mode)}</span>` : ""}
        ${job.seniority ? `<span class="tag">${esc(job.seniority)}</span>` : ""}
        ${job.date_posted ? `<span class="tag">${esc(job.date_posted)}</span>` : ""}
      </div>
      ${salary ? `<div class="salary">${salary}</div>` : ""}
      ${skills ? `<div class="skills-row">${skills}</div>` : ""}
    </div>
    ${job.description ? `<div class="job-description">${esc(job.description)}</div>` : ""}

    <div class="modal-tabs">
      <button class="modal-tab active" data-tab="cv-tailor">Optimizar CV</button>
      <button class="modal-tab" data-tab="contacts">Encontrar contactos</button>
    </div>

    <div class="modal-tab-content active" id="tab-cv-tailor">
      <div class="cv-drop-zone" id="cv-drop-zone">
        <div class="icon">📄</div>
        <div class="label">Sube tu CV (PDF o DOCX)</div>
        <div class="hint">arrastra y suelta o haz clic para seleccionar</div>
        <input type="file" id="cv-file-input" accept=".pdf,.docx,.txt">
      </div>
      <div id="cv-tailor-result"></div>
    </div>

    <div class="modal-tab-content" id="tab-contacts">
      <div id="contacts-content">
        <button class="btn-contacts-search" id="btn-find-contacts" style="
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid var(--line, rgba(255,255,255,0.09));
          background: rgba(113, 150, 59, 0.08);
          color: var(--ink, #f2f3ee);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
        ">
          Buscar contactos en ${esc(job.company)}
        </button>
        <div id="contacts-result"></div>
      </div>
    </div>
  `;

  // Bind events
  body.querySelectorAll(".modal-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchModalTab(tab.dataset.tab));
  });

  const fileInput = document.getElementById("cv-file-input");
  const dropZone = document.getElementById("cv-drop-zone");

  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleCvUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleCvUpload(e.target.files[0]);
  });

  document.getElementById("btn-find-contacts").addEventListener("click", () => findContacts(job.company, job.title));
}

/* ---- Tab switching ---- */
function switchModalTab(tabId) {
  document.querySelectorAll(".modal-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".modal-tab-content").forEach((c) => c.classList.toggle("active", c.id === `tab-${tabId}`));
}

function resetModalTabs() {
  switchModalTab("cv-tailor");
}

/* ---- CV Upload & Tailoring ---- */
async function handleCvUpload(file) {
  const result = document.getElementById("cv-tailor-result");
  result.innerHTML = `<div class="modal-loading"><div class="spinner"></div><span class="loading-text">Analizando tu CV contra la vacante... esto puede tomar 15-30 segundos</span></div>`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("job_id", _currentJobId);

  let res;
  try {
    res = await fetch(`${API_BASE}/api/tailor-cv`, { method: "POST", body: formData });
  } catch (e) {
    // Fallo de red: el backend no está corriendo / no es alcanzable / se cortó la conexión
    result.innerHTML = renderBackendUnavailable();
    return;
  }

  try {
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err.detail || "";
      } catch (_) {
        detail = (await res.text().catch(() => "")).slice(0, 200);
      }
      throw new Error(detail || `El servidor respondió con un error (HTTP ${res.status}). Intenta de nuevo.`);
    }
    const data = await res.json();
    renderTailorResult(data);
  } catch (e) {
    result.innerHTML = `<div style="padding:20px;color:var(--rust, #c05e2f);font-size:13px;">
      <strong>Error:</strong> ${esc(e.message)}
    </div>`;
  }
}

function renderBackendUnavailable() {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  if (isLocal) {
    return `
      <div style="padding:20px;text-align:center;color:var(--ink-3, #757a6e);font-size:13px;">
        <p style="margin-bottom:10px;color:var(--ink-2, #a9aea2);font-weight:600;">Backend no disponible</p>
        <p>Para usar el tailoring de CV, inicia el servidor backend:</p>
        <code style="display:block;margin-top:10px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:12px;color:var(--sage, #71963b);">
          uvicorn backend.main:app --reload
        </code>
        <p style="margin-top:10px;">Y asegúrate de tener la variable GEMINI_API_KEY configurada.</p>
      </div>`;
  }
  return `
    <div style="padding:20px;text-align:center;color:var(--ink-3, #757a6e);font-size:13px;">
      <p style="margin-bottom:10px;color:var(--ink-2, #a9aea2);font-weight:600;">No se pudo conectar con el servidor</p>
      <p>Puede ser un problema temporal de conexión o el análisis tardó demasiado.</p>
      <p style="margin-top:10px;">Vuelve a subir tu CV para intentarlo de nuevo.</p>
    </div>`;
}

function renderTailorResult(data) {
  const result = document.getElementById("cv-tailor-result");
  const scoreColor = data.match_score >= 70 ? "#71963b" : data.match_score >= 40 ? "#a8862e" : "#c05e2f";
  const dashOffset = 226 - (226 * data.match_score) / 100;

  const missingHtml = (data.missing_skills || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const strengthsHtml = (data.strengths || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const recsHtml = (data.recommendations || []).map((r, i) =>
    `<div class="recommendation-item"><span class="num">${i + 1}</span><span>${esc(r)}</span></div>`
  ).join("");
  const kwHtml = (data.keywords_to_add || []).map((k) => `<span class="keyword-pill">${esc(k)}</span>`).join("");

  result.innerHTML = `
    <div class="score-section">
      <div class="score-gauge">
        <svg viewBox="0 0 80 80">
          <circle class="bg" cx="40" cy="40" r="36"/>
          <circle class="fg" cx="40" cy="40" r="36" style="stroke:${scoreColor};stroke-dashoffset:${dashOffset};"/>
        </svg>
        <div class="score-text" style="color:${scoreColor}">${data.match_score}%</div>
      </div>
      <div class="score-info">
        <div class="summary">${esc(data.summary)}</div>
      </div>
    </div>

    <div class="gaps-grid">
      <div class="gap-box missing">
        <h4>Skills faltantes</h4>
        <ul>${missingHtml || "<li style='color:var(--ink-3)'>Ninguna — ¡buen match!</li>"}</ul>
      </div>
      <div class="gap-box strengths">
        <h4>Tu fortaleza</h4>
        <ul>${strengthsHtml || "<li style='color:var(--ink-3)'>—</li>"}</ul>
      </div>
    </div>

    ${recsHtml ? `<h4 style="font-size:13px;font-weight:650;margin:16px 0 8px;color:var(--ink, #f2f3ee);">Recomendaciones</h4><div class="recommendations">${recsHtml}</div>` : ""}

    ${kwHtml ? `<h4 style="font-size:13px;font-weight:650;margin:16px 0 8px;color:var(--ink, #f2f3ee);">Keywords ATS sugeridas</h4><div class="keywords-row">${kwHtml}</div>` : ""}

    ${data.tailored_cv ? `
      <h4 style="font-size:13px;font-weight:650;margin:20px 0 8px;color:var(--ink, #f2f3ee);">CV Optimizado</h4>
      <div class="tailored-cv-box">${esc(data.tailored_cv)}</div>
    ` : ""}

    ${data.cv_struct ? `
      <button id="btn-download-cv" style="width:100%;margin-top:12px;padding:13px;border-radius:12px;border:1px solid var(--line, rgba(255,255,255,0.09));background:rgba(113,150,59,0.12);color:var(--sage, #71963b);font:inherit;font-size:14px;font-weight:600;cursor:pointer;">
        ⬇ Descargar CV Optimizado (PDF)
      </button>
      <div id="cv-download-error"></div>
    ` : ""}
  `;

  // Animate gauge
  requestAnimationFrame(() => {
    const fg = result.querySelector(".fg");
    if (fg) fg.style.strokeDashoffset = dashOffset;
  });

  const dlBtn = result.querySelector("#btn-download-cv");
  if (dlBtn) dlBtn.addEventListener("click", () => downloadTailoredPdf(data.cv_struct, dlBtn));
}

async function downloadTailoredPdf(cvStruct, btn) {
  const errBox = document.getElementById("cv-download-error");
  errBox.innerHTML = "";
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando PDF...";
  const company = (_currentJob && _currentJob.company) || "vacante";
  try {
    const res = await fetch(`${API_BASE}/api/cv-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_struct: cvStruct, company }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CV_Optimizado_${company.replace(/[^\w]+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    errBox.innerHTML = `<div style="padding:10px;color:var(--rust, #c05e2f);font-size:13px;"><strong>Error:</strong> ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---- Contacts ---- */
async function findContacts(company, jobTitle) {
  const result = document.getElementById("contacts-result");
  result.innerHTML = `<div class="modal-loading"><div class="spinner"></div><span class="loading-text">Buscando contactos...</span></div>`;

  try {
    const res = await fetch(`${API_BASE}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, job_title: jobTitle }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderContactsResult(data);
  } catch (e) {
    // Fallback to client-side
    const urls = buildSearchUrls(company);
    renderContactsResult({ company, search_urls: urls, outreach_tips: getDefaultTips(company, jobTitle), networking_checklist: getDefaultChecklist() });
  }
}

function buildSearchUrls(company) {
  const e = encodeURIComponent(company);
  return {
    talent_acquisition: `https://www.linkedin.com/search/results/people/?keywords=Talent%20Acquisition%20${e}`,
    recruiter: `https://www.linkedin.com/search/results/people/?keywords=Recruiter%20${e}`,
    hr_manager: `https://www.linkedin.com/search/results/people/?keywords=HR%20Manager%20${e}`,
    people_ops: `https://www.linkedin.com/search/results/people/?keywords=People%20Operations%20${e}`,
    hiring_manager: `https://www.linkedin.com/search/results/people/?keywords=Hiring%20Manager%20Data%20${e}`,
  };
}

function getDefaultTips(company, title) {
  return [
    {
      title: "Conexion directa",
      template: `Hola [Nombre], vi la posicion de ${title} en ${company} y me encantaria conectar. Tengo experiencia en [tu experiencia relevante] y me parece muy interesante el equipo que estan armando. ¿Podriamos conversar brevemente sobre el rol?`,
      tip: "Mantene el mensaje corto (3-4 lineas). Personaliza mencionando algo especifico de la empresa.",
    },
    {
      title: "Referido por contacto mutuo",
      template: `Hola [Nombre], [Contacto mutuo] me recomendo contactarte. Estoy muy interesado en las oportunidades de datos en ${company} y me gustaria aprender sobre la cultura del equipo. ¿Tienes 15 minutos para una charla rapida?`,
      tip: "Los referrals aumentan las probabilidades de respuesta hasta 10x.",
    },
    {
      title: "Valor primero",
      template: `Hola [Nombre], note que ${company} es [algo que la empresa hizo recientemente]. Como especialista en datos, tengo algunas ideas sobre [area relevante]. Me encantaria compartir mi perspectiva. ¿Te gustaria conversar?`,
      tip: "Ofrece valor antes de pedir algo. Menciona un logro reciente de la empresa.",
    },
  ];
}

function getDefaultChecklist() {
  return [
    { step: "Optimizar tu perfil de LinkedIn", description: "Foto profesional, headline con keywords, resumen actualizado" },
    { step: "Identificar la empresa objetivo", description: "Investiga tamano, stack tecnologico, cultura" },
    { step: "Encontrar hiring manager", description: "Busca al manager del equipo donde quieres entrar" },
    { step: "Conectar con empleados actuales", description: "Personas en roles similares al que buscan" },
    { step: "Personalizar cada mensaje", description: "Nada de mensajes genericos" },
    { step: "Seguimiento a los 5 dias", description: "Un follow-up corto y educado" },
    { step: "Preparar tu pitch", description: "30 segundos sobre quien eres y por que esta empresa" },
  ];
}

function renderContactsResult(data) {
  const result = document.getElementById("contacts-result");
  const roleLabels = {
    talent_acquisition: "Talent Acquisition",
    recruiter: "Recruiter",
    hr_manager: "HR Manager",
    people_ops: "People Operations",
    hiring_manager: "Hiring Manager (Data)",
    company_page: "Pagina de la empresa",
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

  result.innerHTML = `
    <div class="contacts-section" style="margin-top:20px;">
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

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

/* ---- Wire up table clicks ---- */
document.addEventListener("DOMContentLoaded", () => {
  // Close modal on overlay click or close button
  document.addEventListener("click", (e) => {
    if (e.target.id === "job-modal-overlay") closeJobModal();
    if (e.target.closest(".modal-close")) closeJobModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeJobModal();
  });
});
