// Practice page controller (v2)
// =============================
// Vanilla JS, no framework. Runs after topic-normalizer.js has
// decorated window.QUESTION_DATA, and after Firebase has loaded.
//
// Reads pathway + modular unit from localStorage (set by the gate
// at /).  All filtering happens through the normaliser's display
// fields (question.unit, question.topic).

(() => {
  const STORAGE_PATHWAY = "elitePathway";
  const STORAGE_UNIT = "modularUnit";
  const STORAGE_BANK = "activeQuestionBank";
  const STORAGE_SELECTED = "elitePracticeSelected";
  const STORAGE_SOLVED = "elitePracticeSolved";
  const STORAGE_MISTAKES = "elitePracticeMistakes";
  const STORAGE_LAYOUT = "elitePracticeLayout";

  const allQuestions = window.QUESTION_DATA || [];
  const solutionData = window.SOLUTION_DATA || {};
  const meta = window.SITE_META || {};

  const state = {
    pathway: localStorage.getItem(STORAGE_PATHWAY) || "linear",
    modularUnit: localStorage.getItem(STORAGE_UNIT) || "Unit 1",
    activeBank: localStorage.getItem(STORAGE_BANK) || "all",
    layout: localStorage.getItem(STORAGE_LAYOUT) || "grid",
    search: "",
    topicFilter: "",
    paperFilter: "",
    viewFilter: "",
    minMarks: 0,
    selected: new Set(parseJSON(STORAGE_SELECTED) || []),
    solved: new Set(parseJSON(STORAGE_SOLVED) || []),
    mistakes: new Set(parseJSON(STORAGE_MISTAKES) || []),
  };

  function parseJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return []; }
  }

  function saveSets() {
    localStorage.setItem(STORAGE_SELECTED, JSON.stringify([...state.selected]));
    localStorage.setItem(STORAGE_SOLVED, JSON.stringify([...state.solved]));
    localStorage.setItem(STORAGE_MISTAKES, JSON.stringify([...state.mistakes]));
  }

  // ---- ELEMENT REFS -------------------------------------------------
  const els = {
    pathwayBadge: q("[data-pathway-badge]"),
    unitBadge: q("[data-unit-badge]"),
    countBadge: q("[data-count-badge]"),
    solvedBadge: q("[data-solved-badge]"),
    selectedBadge: q("[data-selected-badge]"),
    grid: q("[data-question-grid]"),
    emptyState: q("[data-empty-state]"),
    searchInput: q("[data-search]"),
    topicSelect: q("[data-topic-filter]"),
    paperSelect: q("[data-paper-filter]"),
    viewSelect: q("[data-view-filter]"),
    minMarksInput: q("[data-min-marks]"),
    resetBtn: q("[data-reset-filters]"),
    bankButtons: qa("[data-bank]"),
    pillButtons: qa("[data-view-pill]"),
    layoutButtons: qa("[data-layout]"),
    resumeBanner: q("[data-resume-banner]"),
    resumeText: q("[data-resume-text]"),
    resumeChange: q("[data-resume-change]"),
    viewerDialog: q("#viewerDialog"),
    viewerTitle: q("#viewerTitle"),
    viewerMeta: q("#viewerMeta"),
    viewerImage: q("#viewerImage"),
    viewerClose: q("[data-viewer-close]"),
    solutionDialog: q("#solutionDialog"),
    solutionTitle: q("#solutionTitle"),
    solutionMeta: q("#solutionMeta"),
    solutionBody: q("#solutionBody"),
    solutionClose: q("[data-solution-close]"),
  };

  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.from(document.querySelectorAll(s)); }
  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  // ---- PATHWAY APPLICATION ----------------------------------------
  // Use the normalizer's pathway-aware fields (question.unit / question.topic
  // are rewritten by topic-normalizer.js to reflect the active mode).
  function setPathwayInWindow() {
    window.ELITE_PATHWAY = {
      mode: state.pathway,
      isModular: state.pathway === "modular",
      label: (kind) => {
        if (state.pathway === "modular") {
          return { unit: "Unit", unitLowerPlural: "units" }[kind] || "Unit";
        }
        return { unit: "Chapter", unitLowerPlural: "chapters" }[kind] || "Chapter";
      },
    };
    document.body.dataset.pathway = state.pathway;
  }

  // ---- SCOPED QUESTIONS -------------------------------------------
  function scopedQuestions() {
    let pool = allQuestions.filter((qq) => qq.bank === state.activeBank);
    if (state.pathway === "modular") {
      pool = pool.filter((qq) => qq.unit === state.modularUnit);
    }
    return pool;
  }

  // ---- FILTERS -----------------------------------------------------
  function applyFilters(pool) {
    const search = state.search.trim().toLowerCase();
    const minMarks = Number(state.minMarks) || 0;
    return pool.filter((qq) => {
      if (state.topicFilter && qq.topic !== state.topicFilter) return false;
      if (state.paperFilter && qq.paper !== state.paperFilter) return false;
      if (state.viewFilter === "selected" && !state.selected.has(qq.id)) return false;
      if (state.viewFilter === "solved" && !state.solved.has(qq.id)) return false;
      if (state.viewFilter === "unsolved" && state.solved.has(qq.id)) return false;
      if (state.viewFilter === "mistakes" && !state.mistakes.has(qq.id)) return false;
      if (minMarks && Number(qq.marks) < minMarks) return false;
      if (search) {
        const blob = `${qq.paper} ${qq.topic} ${qq.unit} ${qq.question_text}`.toLowerCase();
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }

  // ---- RENDER ------------------------------------------------------
  function renderCard(qq) {
    const isSelected = state.selected.has(qq.id);
    const isSolved = state.solved.has(qq.id);
    const isMistake = state.mistakes.has(qq.id);
    const hasSolution = Boolean(solutionData[qq.id]?.source);

    const cls = [
      "q-card",
      isSelected ? "is-selected" : "",
      isSolved ? "is-solved" : "",
      isMistake ? "is-mistake" : "",
    ].filter(Boolean).join(" ");

    return `<article class="${cls}" data-id="${escapeHtml(qq.id)}">
      <button class="q-thumb" type="button" data-action="zoom" aria-label="Zoom question">
        <img loading="lazy" src="${escapeHtml(qq.image)}" alt="${escapeHtml(qq.paper)} Q${qq.question}" />
      </button>
      <div class="q-body">
        <div class="q-meta">
          <span class="meta">${escapeHtml(qq.paper)} · Q${qq.question}</span>
          <span class="badge">${qq.marks}m</span>
        </div>
        <h3 class="q-topic">${escapeHtml(qq.topic)}</h3>
        <div class="q-tags">
          <span class="meta">${escapeHtml(qq.unit)}</span>
          ${isSolved ? '<span class="badge badge-navy">Solved</span>' : ""}
          ${isSelected ? '<span class="badge badge-gold">Selected</span>' : ""}
          ${isMistake ? '<span class="badge badge-muted">In Mistake Box</span>' : ""}
        </div>
        <div class="q-actions">
          <button class="btn btn-primary btn-sm" type="button" data-action="zoom">Practice</button>
          <details class="q-more">
            <summary class="btn btn-ghost btn-sm" aria-label="More actions">⋯</summary>
            <div class="q-more-menu">
              <button type="button" data-action="select">${isSelected ? "Unselect" : "Add to set"}</button>
              <button type="button" data-action="solve">${isSolved ? "Mark unsolved" : "Mark solved"}</button>
              <button type="button" data-action="mistake">${isMistake ? "Remove from Mistake Box" : "Add to Mistake Box"}</button>
              ${hasSolution ? '<button type="button" data-action="solution">Show solution</button>' : ""}
            </div>
          </details>
        </div>
      </div>
    </article>`;
  }

  function render() {
    setPathwayInWindow();
    const pool = scopedQuestions();
    const visible = applyFilters(pool);

    // badges
    if (els.pathwayBadge) els.pathwayBadge.textContent = state.pathway === "modular" ? "Modular" : "Linear";
    if (els.unitBadge) {
      els.unitBadge.textContent = state.pathway === "modular" ? state.modularUnit : "All chapters";
    }
    if (els.countBadge) els.countBadge.textContent = `${visible.length} of ${pool.length}`;
    if (els.solvedBadge) els.solvedBadge.textContent = countIn(pool, state.solved);
    if (els.selectedBadge) els.selectedBadge.textContent = countIn(pool, state.selected);

    // bank buttons
    els.bankButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.bank === state.activeBank));

    // pill buttons
    els.pillButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewPill === (state.viewFilter || "all"))));

    // dropdowns
    populateDropdowns(pool);

    // grid
    if (visible.length === 0) {
      els.grid.innerHTML = "";
      if (els.emptyState) els.emptyState.hidden = false;
    } else {
      if (els.emptyState) els.emptyState.hidden = true;
      els.grid.innerHTML = visible.map(renderCard).join("");
    }
    els.grid.dataset.layout = state.layout;

    // resume banner
    renderResumeBanner();
  }

  function countIn(pool, set) {
    let n = 0;
    for (const qq of pool) if (set.has(qq.id)) n++;
    return n;
  }

  function populateDropdowns(pool) {
    if (els.topicSelect) {
      const cur = state.topicFilter;
      const topics = uniqueSorted(pool.map((qq) => qq.topic));
      els.topicSelect.innerHTML = `<option value="">All topics</option>` +
        topics.map((t) => `<option value="${escapeHtml(t)}"${t === cur ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
    }
    if (els.paperSelect) {
      const cur = state.paperFilter;
      const papers = uniqueSorted(pool.map((qq) => qq.paper));
      els.paperSelect.innerHTML = `<option value="">All papers</option>` +
        papers.map((p) => `<option value="${escapeHtml(p)}"${p === cur ? " selected" : ""}>${escapeHtml(p)}</option>`).join("");
    }
  }

  function renderResumeBanner() {
    if (!els.resumeBanner || !els.resumeText) return;
    const isModular = state.pathway === "modular";
    const text = isModular
      ? `Practising the Modular Pathway, ${state.modularUnit}.`
      : `Practising the Linear Pathway.`;
    els.resumeText.textContent = text;
  }

  // ---- HANDLERS ----------------------------------------------------
  function bind() {
    els.searchInput?.addEventListener("input", (e) => { state.search = e.target.value; render(); });
    els.topicSelect?.addEventListener("change", (e) => { state.topicFilter = e.target.value; render(); });
    els.paperSelect?.addEventListener("change", (e) => { state.paperFilter = e.target.value; render(); });
    els.viewSelect?.addEventListener("change", (e) => { state.viewFilter = e.target.value; render(); });
    els.minMarksInput?.addEventListener("input", (e) => { state.minMarks = e.target.value; render(); });

    els.resetBtn?.addEventListener("click", () => {
      state.search = ""; state.topicFilter = ""; state.paperFilter = ""; state.viewFilter = ""; state.minMarks = 0;
      if (els.searchInput) els.searchInput.value = "";
      if (els.minMarksInput) els.minMarksInput.value = "";
      render();
    });

    els.bankButtons.forEach((b) => b.addEventListener("click", () => {
      state.activeBank = b.dataset.bank;
      localStorage.setItem(STORAGE_BANK, state.activeBank);
      render();
    }));

    els.pillButtons.forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.viewPill;
      state.viewFilter = v === "all" ? "" : v;
      if (els.viewSelect) els.viewSelect.value = state.viewFilter;
      render();
    }));

    els.layoutButtons.forEach((b) => b.addEventListener("click", () => {
      state.layout = b.dataset.layout;
      localStorage.setItem(STORAGE_LAYOUT, state.layout);
      els.layoutButtons.forEach((x) => x.classList.toggle("is-active", x.dataset.layout === state.layout));
      render();
    }));

    els.grid?.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      const card = e.target.closest("[data-id]");
      if (!card) return;
      const id = card.dataset.id;
      if (action === "zoom") openViewer(id);
      else if (action === "solve") toggleSolved(id);
      else if (action === "select") toggleSelected(id);
      else if (action === "mistake") toggleMistake(id);
      else if (action === "solution") openSolution(id);
    });

    els.viewerClose?.addEventListener("click", () => els.viewerDialog?.close());
    els.solutionClose?.addEventListener("click", () => els.solutionDialog?.close());

    els.resumeChange?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_PATHWAY);
      localStorage.removeItem(STORAGE_UNIT);
      window.location.href = "/";
    });
  }

  function toggleSelected(id) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    saveSets(); render();
  }
  function toggleSolved(id) {
    state.solved.has(id) ? state.solved.delete(id) : state.solved.add(id);
    saveSets(); render();
  }
  function toggleMistake(id) {
    state.mistakes.has(id) ? state.mistakes.delete(id) : state.mistakes.add(id);
    saveSets(); render();
  }

  function questionById(id) {
    return allQuestions.find((qq) => qq.id === id);
  }

  function openViewer(id) {
    const qq = questionById(id);
    if (!qq || !els.viewerDialog) return;
    els.viewerTitle.textContent = `${qq.paper} · Q${qq.question}`;
    els.viewerMeta.textContent = `${qq.topic} · ${qq.unit} · ${qq.marks} marks`;
    els.viewerImage.src = qq.image;
    els.viewerImage.alt = `${qq.paper} Q${qq.question}`;
    els.viewerDialog.showModal();
  }

  function openSolution(id) {
    const qq = questionById(id);
    const sol = solutionData[id];
    if (!qq || !sol || !els.solutionDialog) return;
    els.solutionTitle.textContent = `${qq.paper} · Q${qq.question} — Worked Solution`;
    els.solutionMeta.textContent = `${qq.topic} · ${qq.marks} marks`;
    els.solutionBody.innerHTML = renderMarkdown(sol.source || "");
    els.solutionDialog.showModal();
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([els.solutionBody]).catch(() => {});
    }
  }

  // Tiny markdown renderer (paragraph, bold, inline-code only).
  // MathJax handles the LaTeX delimiters inside.
  function renderMarkdown(src) {
    const esc = escapeHtml(src);
    return esc
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split(/\n/);
        if (lines.length > 1 && lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
          return `<ul>${lines.map((l) => `<li>${formatInline(l.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
        }
        return `<p>${formatInline(block).replace(/\n/g, "<br>")}</p>`;
      }).join("");
  }
  function formatInline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  // ---- INIT --------------------------------------------------------
  function init() {
    if (!els.grid) return;
    bind();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
