/* astro-data jobs — Roadmaps logic */
"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; };

let ROADMAPS = [];
let activeRole = null;

/* ---- Load roadmaps data ---- */
async function loadRoadmaps() {
  try {
    const res = await fetch("roadmaps-data.json");
    const data = await res.json();
    ROADMAPS = data.roles || [];
  } catch (e) {
    // Inline fallback
    ROADMAPS = [];
    console.error("Failed to load roadmaps:", e);
  }
  renderRoleSelector();
  if (ROADMAPS.length) selectRole(ROADMAPS[0].id);
  renderDemandGrid();
}

/* ---- Role selector ---- */
function renderRoleSelector() {
  const el = $("#role-selector");
  el.innerHTML = ROADMAPS.map((r) => `
    <button class="role-card" data-role="${r.id}" style="--rc: ${r.color}">
      <span class="dot" style="background:${r.color}"></span>
      <span>${esc(r.title)}</span>
      <span class="duration">${esc(r.duration)}</span>
    </button>
  `).join("");

  el.querySelectorAll(".role-card").forEach((btn) => {
    btn.addEventListener("click", () => selectRole(btn.dataset.role));
  });
}

function selectRole(roleId) {
  activeRole = roleId;
  document.querySelectorAll(".role-card").forEach((c) =>
    c.classList.toggle("active", c.dataset.role === roleId)
  );
  renderRoadmap(ROADMAPS.find((r) => r.id === roleId));
}

/* ---- Render roadmap timeline ---- */
function renderRoadmap(role) {
  if (!role) return;
  const container = $("#roadmap-container");

  const phasesHtml = role.phases.map((phase, i) => {
    const skillsHtml = phase.skills.map((s) => `<span class="skill-chip">${esc(s)}</span>`).join("");
    const resourcesHtml = phase.resources.map((r) => `
      <a class="resource-item" href="${esc(r.url)}" target="_blank" rel="noopener">
        <span class="resource-name">${esc(r.name)}</span>
        <span class="resource-type">${esc(r.type)}</span>
      </a>
    `).join("");

    return `
      <div class="phase" data-phase="${i}">
        <div class="phase-dot" style="border-color:${role.color};${i === 0 ? `background:${role.color}` : ""}"></div>
        <div class="phase-card">
          <div class="phase-header" onclick="togglePhase(${i})">
            <div class="phase-title-area">
              <span class="phase-num">Fase ${String(i + 1).padStart(2, "0")}</span>
              <span class="phase-name">${esc(phase.name)}</span>
            </div>
            <div class="phase-meta">
              <span class="phase-duration">${esc(phase.duration)}</span>
              <span class="phase-chevron">▼</span>
            </div>
          </div>
          <div class="phase-skills">${skillsHtml}</div>
          <div class="phase-body">
            <div class="resources-section">
              <h4>Recursos gratuitos</h4>
              <div class="resource-list">${resourcesHtml}</div>
            </div>
            ${phase.project ? `
              <div class="project-box">
                <h4>Proyecto practico</h4>
                <p>${esc(phase.project)}</p>
              </div>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="roadmap-header">
      <span class="role-dot" style="background:${role.color}"></span>
      <h2>${esc(role.title)}</h2>
      <span class="demand">${esc(role.demand_tag)}</span>
    </div>
    <div class="roadmap-duration">
      Duracion estimada: <strong>${esc(role.duration)}</strong> · ${role.phases.length} fases
    </div>
    <div class="timeline">${phasesHtml}</div>
  `;

  // Animate phases in with stagger
  requestAnimationFrame(() => {
    const phases = container.querySelectorAll(".phase");
    phases.forEach((p, i) => {
      setTimeout(() => p.classList.add("visible"), i * 80);
    });
  });
}

function togglePhase(index) {
  const phase = document.querySelector(`.phase[data-phase="${index}"]`);
  if (!phase) return;
  const wasExpanded = phase.classList.contains("expanded");

  // Close others in same roadmap
  document.querySelectorAll(".phase.expanded").forEach((p) => p.classList.remove("expanded"));

  if (!wasExpanded) {
    phase.classList.add("expanded");
    // Update dot color
    const role = ROADMAPS.find((r) => r.id === activeRole);
    if (role) {
      phase.querySelector(".phase-dot").style.background = role.color;
    }
  } else {
    const role = ROADMAPS.find((r) => r.id === activeRole);
    if (role) {
      phase.querySelector(".phase-dot").style.background = "var(--bg)";
    }
  }
}

/* ---- Skills demand grid from pipeline data ---- */
function renderDemandGrid() {
  const raw = window.JOBS_DATA || { jobs: [] };
  const jobs = raw.jobs || [];
  if (!jobs.length) return;

  const skillCounts = new Map();
  for (const j of jobs) {
    for (const s of (j.skills || [])) {
      skillCounts.set(s, (skillCounts.get(s) || 0) + 1);
    }
  }

  const top = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const maxCount = top.length ? top[0][1] : 1;
  const grid = $("#demand-grid");

  grid.innerHTML = top.map(([skill, count]) => {
    const pct = Math.round((count / maxCount) * 100);
    // Find which roles need this skill
    const rolesForSkill = ROADMAPS
      .filter((r) => r.phases.some((p) => p.skills.some((s) => s.toLowerCase() === skill.toLowerCase())))
      .map((r) => r.title);

    return `
      <div class="demand-skill" title="${rolesForSkill.length ? "Roles: " + rolesForSkill.join(", ") : ""}">
        <div class="name">${esc(skill)}</div>
        <div class="count">${count.toLocaleString("es-CO")} vacantes</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join("");

  // Animate bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      grid.querySelectorAll(".bar-fill").forEach((bar) => {
        const w = bar.style.width;
        bar.style.width = "0%";
        requestAnimationFrame(() => { bar.style.width = w; });
      });
    }, 400);
  });
}

/* ---- Init ---- */
document.addEventListener("DOMContentLoaded", loadRoadmaps);
