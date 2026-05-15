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
  const STORAGE_CORRECTIONS = "eliteTopicCorrections";
  const REVIEW_INTERVALS = [1, 3, 7, 14];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ADMIN_EMAIL_PATTERN = /eslam/i;

  const allQuestions = window.QUESTION_DATA || [];
  const solutionData = window.SOLUTION_DATA || {};
  const meta = window.SITE_META || {};
  let cloudUser = null;
  let hasRendered = false;
  let lastPool = [];
  let lastVisible = [];

  const state = {
    pathway: localStorage.getItem(STORAGE_PATHWAY) || "linear",
    modularUnit: localStorage.getItem(STORAGE_UNIT) || "Unit 1",
    activeBank: localStorage.getItem(STORAGE_BANK) || "all",
    layout: localStorage.getItem(STORAGE_LAYOUT) || "grid",
    search: "",
    topicFilter: "",
    unitFilter: "",
    paperFilter: "",
    viewFilter: "",
    difficultyFilter: "",
    minMarks: 0,
    maxMarks: 0,
    minQuestion: 0,
    maxQuestion: 0,
    sortMode: "topic",
    selected: readIdSet(STORAGE_SELECTED),
    solved: readIdSet(STORAGE_SOLVED),
    mistakes: readMistakeItems(),
  };

  function parseJSON(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readIdSet(key) {
    const value = parseJSON(key, []);
    if (Array.isArray(value)) return new Set(value.filter(Boolean));
    if (value && typeof value === "object") return new Set(Object.keys(value));
    return new Set();
  }

  function dateNumber(value, fallback) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeMistakeItems(value) {
    const now = Date.now();
    const normalized = {};
    const add = (id, raw = {}) => {
      if (!id) return;
      const key = String(id);
      const level = Math.max(0, Math.min(3, Number(raw.level || 0)));
      const updatedAt = dateNumber(raw.updatedAt, now);
      const addedAt = dateNumber(raw.addedAt, updatedAt);
      const dueAt = dateNumber(raw.dueAt, now);
      normalized[key] = {
        id: key,
        reason: typeof raw.reason === "string" ? raw.reason : "manual",
        level,
        attempts: Math.max(1, Number(raw.attempts || 1)),
        addedAt,
        updatedAt,
        dueAt,
        masteredAt: raw.masteredAt ? dateNumber(raw.masteredAt, updatedAt) : null,
      };
    };

    if (Array.isArray(value)) {
      value.forEach((id) => add(id));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([id, raw]) => {
        const source = raw && typeof raw === "object" ? raw : {};
        add(source.id || id, source);
      });
    }
    return normalized;
  }

  function readMistakeItems() {
    return normalizeMistakeItems(parseJSON(STORAGE_MISTAKES, {}));
  }

  function saveSets() {
    localStorage.setItem(STORAGE_SELECTED, JSON.stringify([...state.selected]));
    localStorage.setItem(STORAGE_SOLVED, JSON.stringify([...state.solved]));
    localStorage.setItem(STORAGE_MISTAKES, JSON.stringify(state.mistakes));
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
    unitSelect: q("[data-unit-filter]"),
    paperSelect: q("[data-paper-filter]"),
    viewSelect: q("[data-view-filter]"),
    difficultySelect: q("[data-difficulty-filter]"),
    minMarksInput: q("[data-min-marks]"),
    maxMarksInput: q("[data-max-marks]"),
    minQuestionInput: q("[data-min-question]"),
    maxQuestionInput: q("[data-max-question]"),
    sortSelect: q("[data-sort-mode]"),
    resetBtn: q("[data-reset-filters]"),
    bankButtons: qa("[data-bank]"),
    pillButtons: qa("[data-view-pill]"),
    quickButtons: qa("[data-practice-mode]"),
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
    // Sidebar tools
    timerDisplay: q("[data-timer-display]"),
    timerStartBtn: q("[data-timer-start]"),
    timerResetBtn: q("[data-timer-reset]"),
    timerPresetButtons: qa("[data-timer-preset]"),
    masteryList: q("[data-mastery-list]"),
    mistakeSummary: q("[data-mistake-summary]"),
    mistakeReviewBtn: q("[data-mistake-review]"),
    mistakeAllBtn: q("[data-mistake-all]"),
    mistakeMasteredBtn: q("[data-mistake-mastered]"),
    worksheetTopic: q("[data-worksheet-topic]"),
    worksheetCount: q("[data-worksheet-count]"),
    worksheetMode: q("[data-worksheet-mode]"),
    worksheetBuild: q("[data-worksheet-build]"),
    worksheetPrint: q("[data-worksheet-print]"),
    clearSelectedBtn: q("[data-clear-selected]"),
    worksheetStatus: q("[data-worksheet-status]"),
    printScope: q("[data-print-scope]"),
    printBuildBtn: q("[data-print-build]"),
    randomVisibleBtn: q("[data-random-visible]"),
    printArea: q("[data-print-area]"),
    fixDialog: q("#fixTopicDialog"),
    fixTitle: q("#fixTopicTitle"),
    fixCurrentTopic: q("[data-fix-current-topic]"),
    fixSelect: q("[data-fix-topic-select]"),
    fixSave: q("[data-fix-save]"),
    fixClear: q("[data-fix-clear]"),
    fixClose: q("[data-fix-close]"),
    fixImage: q("[data-fix-image]"),
  };

  // ---- ADMIN CORRECTIONS -------------------------------------------
  function loadCorrections() {
    try { return JSON.parse(localStorage.getItem(STORAGE_CORRECTIONS) || "{}"); } catch (_) { return {}; }
  }
  function saveCorrections(map) {
    localStorage.setItem(STORAGE_CORRECTIONS, JSON.stringify(map));
  }
  function isAdmin() {
    const cloudState = window.EliteCloud?.state?.() || window.CLOUD_SYNC?.state || {};
    const email = cloudUser?.email || cloudState.user?.email || "";
    return ADMIN_EMAIL_PATTERN.test(email);
  }
  let corrections = loadCorrections();
  // Apply corrections to in-memory questions on load.
  function applyCorrections() {
    let touched = 0;
    for (const qq of allQuestions) {
      if (qq._origTopic !== undefined) {
        qq.topic = qq._origTopic;
        qq.original_topic = qq._origTopic;
        qq.corrected = false;
      }
      if (qq._origUnit !== undefined) {
        qq.unit = qq._origUnit;
      }
      delete qq.modular_force_unit;

      const fix = corrections[qq.id];
      if (!fix) continue;
      // Stash original once
      if (qq._origTopic === undefined) qq._origTopic = qq.topic;
      if (qq._origUnit === undefined) qq._origUnit = qq.unit;
      qq.topic = fix.topic || qq._origTopic;
      qq.original_topic = qq._origTopic;
      // Tag for the normalizer to honour
      qq.corrected = true;
      // If correction also forces modular unit, propagate
      if (fix.modularUnit) qq.modular_force_unit = fix.modularUnit;
      if (typeof window.normalizeEliteQuestion === "function") window.normalizeEliteQuestion(qq);
      touched++;
    }
    return touched;
  }
  applyCorrections();

  function refreshCloudUser() {
    const cloudState = window.EliteCloud?.state?.() || window.CLOUD_SYNC?.state || {};
    cloudUser = cloudState.user || null;
  }

  function refreshProgressFromStorage() {
    state.selected = readIdSet(STORAGE_SELECTED);
    state.solved = readIdSet(STORAGE_SOLVED);
    state.mistakes = readMistakeItems();
    corrections = loadCorrections();
    applyCorrections();
  }

  // ---- TIMER --------------------------------------------------------
  const timer = {
    duration: 25 * 60,
    remaining: 25 * 60,
    interval: null,
    running: false,
  };

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function updateTimerDisplay() {
    if (els.timerDisplay) els.timerDisplay.textContent = fmtTime(timer.remaining);
    if (els.timerStartBtn) els.timerStartBtn.textContent = timer.running ? "Pause" : "Start";
  }

  function startTimer() {
    if (timer.running) {
      pauseTimer();
      return;
    }
    timer.running = true;
    timer.interval = setInterval(() => {
      timer.remaining -= 1;
      if (timer.remaining <= 0) {
        timer.remaining = 0;
        pauseTimer();
      }
      updateTimerDisplay();
    }, 1000);
    updateTimerDisplay();
  }
  function pauseTimer() {
    timer.running = false;
    if (timer.interval) clearInterval(timer.interval);
    timer.interval = null;
    updateTimerDisplay();
  }
  function resetTimer() {
    pauseTimer();
    timer.remaining = timer.duration;
    updateTimerDisplay();
  }
  function setTimerMinutes(mins) {
    pauseTimer();
    timer.duration = Math.max(1, Number(mins) || 25) * 60;
    timer.remaining = timer.duration;
    updateTimerDisplay();
  }

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

  // ---- MISTAKE REVIEW ---------------------------------------------
  function mistakeState(id) {
    return state.mistakes[id] || null;
  }

  function isMistakeDue(id) {
    const item = mistakeState(id);
    return Boolean(item && !item.masteredAt && Number(item.dueAt || 0) <= Date.now());
  }

  function isMistakeMastered(id) {
    return Boolean(mistakeState(id)?.masteredAt);
  }

  function mistakeLabel(id) {
    const item = mistakeState(id);
    if (!item) return "";
    if (item.masteredAt) return "Mastered";
    if (Number(item.dueAt || 0) <= Date.now()) return "Due today";
    const due = new Date(Number(item.dueAt || Date.now()));
    return `Due ${due.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  }

  function addMistake(id, reason = "manual") {
    const now = Date.now();
    const current = mistakeState(id);
    state.mistakes[id] = {
      id,
      reason,
      level: 0,
      attempts: Number(current?.attempts || 0) + 1,
      addedAt: Number(current?.addedAt || now),
      updatedAt: now,
      dueAt: now,
      masteredAt: null,
    };
  }

  function advanceMistake(id) {
    const item = mistakeState(id);
    if (!item) return;
    const level = Math.min(3, Number(item.level || 0) + 1);
    const now = Date.now();
    state.mistakes[id] = {
      ...item,
      level,
      updatedAt: now,
      masteredAt: level >= 3 ? now : null,
      dueAt: level >= 3 ? now + 365 * DAY_MS : now + REVIEW_INTERVALS[level] * DAY_MS,
    };
  }

  // ---- FILTERS -----------------------------------------------------
  function applyFilters(pool) {
    const search = state.search.trim().toLowerCase();
    const minMarks = Number(state.minMarks) || 0;
    const maxMarks = Number(state.maxMarks) || 0;
    const minQuestion = Number(state.minQuestion) || 0;
    const maxQuestion = Number(state.maxQuestion) || 0;
    return pool.filter((qq) => {
      if (state.topicFilter && qq.topic !== state.topicFilter) return false;
      if (state.unitFilter && qq.unit !== state.unitFilter) return false;
      if (state.paperFilter && qq.paper !== state.paperFilter) return false;
      if (state.viewFilter === "selected" && !state.selected.has(qq.id)) return false;
      if (state.viewFilter === "solved" && !state.solved.has(qq.id)) return false;
      if (state.viewFilter === "unsolved" && state.solved.has(qq.id)) return false;
      if (state.viewFilter === "mistakes" && !mistakeState(qq.id)) return false;
      if (state.viewFilter === "mistakes-due" && !isMistakeDue(qq.id)) return false;
      if (state.viewFilter === "mistakes-mastered" && !isMistakeMastered(qq.id)) return false;
      if (state.difficultyFilter === "quick" && Number(qq.marks) > 3) return false;
      if (state.difficultyFilter === "standard" && (Number(qq.marks) < 4 || Number(qq.marks) > 6)) return false;
      if (state.difficultyFilter === "long" && Number(qq.marks) < 7) return false;
      if (state.difficultyFilter === "q20" && Number(qq.question) < 20) return false;
      if (minMarks && Number(qq.marks) < minMarks) return false;
      if (maxMarks && Number(qq.marks) > maxMarks) return false;
      if (minQuestion && Number(qq.question) < minQuestion) return false;
      if (maxQuestion && Number(qq.question) > maxQuestion) return false;
      if (search) {
        const blob = `${qq.paper} ${qq.topic} ${qq.unit} ${qq.question_text}`.toLowerCase();
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }

  function sortQuestions(items) {
    return [...items].sort((a, b) => {
      if (state.sortMode === "paper") return a.paper.localeCompare(b.paper) || Number(a.question) - Number(b.question);
      if (state.sortMode === "marks_desc") return Number(b.marks) - Number(a.marks) || Number(a.topic_order) - Number(b.topic_order);
      if (state.sortMode === "marks_asc") return Number(a.marks) - Number(b.marks) || Number(a.topic_order) - Number(b.topic_order);
      if (state.sortMode === "question_desc") return Number(b.question) - Number(a.question) || Number(b.marks) - Number(a.marks);
      return Number(a.topic_order) - Number(b.topic_order) || a.paper.localeCompare(b.paper) || Number(a.question) - Number(b.question);
    });
  }

  // ---- RENDER ------------------------------------------------------
  function renderCard(qq) {
    const isSelected = state.selected.has(qq.id);
    const isSolved = state.solved.has(qq.id);
    const review = mistakeState(qq.id);
    const isMistake = Boolean(review);
    const reviewText = mistakeLabel(qq.id);
    const hasSolution = Boolean(solutionData[qq.id]?.source);
    const corrected = Boolean(corrections[qq.id]);
    const admin = isAdmin();

    const cls = [
      "q-card",
      isSelected ? "is-selected" : "",
      isSolved ? "is-solved" : "",
      isMistake ? "is-mistake" : "",
      corrected ? "is-corrected" : "",
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
        <h3 class="q-topic">${escapeHtml(qq.topic)}${corrected ? ' <span class="badge badge-gold" title="Topic corrected">edited</span>' : ""}</h3>
        <div class="q-tags">
          <span class="meta">${escapeHtml(qq.unit)}</span>
          ${isSolved ? '<span class="badge badge-navy">Solved</span>' : ""}
          ${isSelected ? '<span class="badge badge-gold">Selected</span>' : ""}
          ${isMistake ? `<span class="badge badge-muted">${escapeHtml(reviewText)}</span>` : ""}
        </div>
        <div class="q-actions">
          <div class="q-primary-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="zoom">Practice</button>
            ${hasSolution ? '<button class="btn btn-ghost btn-sm" type="button" data-action="solution">Show solution</button>' : ""}
          </div>
          <details class="q-more">
            <summary class="btn btn-ghost btn-sm" aria-label="More actions">⋯</summary>
            <div class="q-more-menu">
              <button type="button" data-action="select">${isSelected ? "Unselect" : "Add to set"}</button>
              <button type="button" data-action="solve">${isSolved ? "Mark unsolved" : "Mark solved"}</button>
              <button type="button" data-action="mistake">${isMistake ? "Remove from Mistake Box" : "Add to Mistake Box"}</button>
              ${isMistake ? '<button type="button" data-action="mistake-done">Review done</button>' : ""}
              ${admin ? '<button type="button" data-action="fix-topic">Fix topic</button>' : ""}
            </div>
          </details>
        </div>
      </div>
    </article>`;
  }

  function render() {
    hasRendered = true;
    setPathwayInWindow();
    const pool = scopedQuestions();
    const visible = sortQuestions(applyFilters(pool));
    lastPool = pool;
    lastVisible = visible;

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
    const activePill = state.viewFilter.startsWith("mistakes") ? "mistakes" : (state.viewFilter || "all");
    els.pillButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewPill === activePill)));

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
    // sidebar tools
    renderMastery(pool);
    renderMistakeSummary(pool);
    updateTimerDisplay();
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
    if (els.unitSelect) {
      const cur = state.unitFilter;
      const units = uniqueSorted(pool.map((qq) => qq.unit));
      els.unitSelect.innerHTML = `<option value="">All chapters / units</option>` +
        units.map((unit) => `<option value="${escapeHtml(unit)}"${unit === cur ? " selected" : ""}>${escapeHtml(unit)}</option>`).join("");
    }
    if (els.paperSelect) {
      const cur = state.paperFilter;
      const papers = uniqueSorted(pool.map((qq) => qq.paper));
      els.paperSelect.innerHTML = `<option value="">All papers</option>` +
        papers.map((p) => `<option value="${escapeHtml(p)}"${p === cur ? " selected" : ""}>${escapeHtml(p)}</option>`).join("");
    }
    if (els.worksheetTopic) {
      const cur = els.worksheetTopic.value;
      const topics = uniqueSorted(pool.map((qq) => qq.topic));
      els.worksheetTopic.innerHTML = `<option value="">Use current filters</option>` +
        topics.map((t) => `<option value="${escapeHtml(t)}"${t === cur ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
    }
  }

  function renderMastery(pool) {
    if (!els.masteryList) return;
    const byTopic = new Map();
    for (const qq of pool) {
      const entry = byTopic.get(qq.topic) || { total: 0, solved: 0 };
      entry.total += 1;
      if (state.solved.has(qq.id)) entry.solved += 1;
      byTopic.set(qq.topic, entry);
    }
    const rows = [...byTopic.entries()]
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .slice(0, 8);
    if (rows.length === 0) {
      els.masteryList.innerHTML = '<p class="meta">No topics in this view yet.</p>';
      return;
    }
    els.masteryList.innerHTML = rows.map(([topic, c]) => {
      const pct = c.total ? Math.round((c.solved / c.total) * 100) : 0;
      return `<div class="mastery-row">
        <div class="mastery-head"><strong>${escapeHtml(topic)}</strong><span class="meta">${c.solved}/${c.total}</span></div>
        <div class="mastery-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join("");
  }

  function renderMistakeSummary(pool) {
    if (!els.mistakeSummary) return;
    const poolIds = new Set(pool.map((qq) => qq.id));
    const mine = Object.values(state.mistakes).filter((item) => poolIds.has(item.id));
    const due = mine.filter((item) => isMistakeDue(item.id));
    const mastered = mine.filter((item) => item.masteredAt);
    if (els.mistakeReviewBtn) els.mistakeReviewBtn.disabled = due.length === 0;
    if (els.mistakeAllBtn) els.mistakeAllBtn.disabled = mine.length === 0;
    if (els.mistakeMasteredBtn) els.mistakeMasteredBtn.disabled = mastered.length === 0;
    if (mine.length === 0) {
      els.mistakeSummary.innerHTML = '<p class="meta">No mistakes saved yet. Use the kebab menu on a question to add it.</p>';
      return;
    }
    const byTopic = new Map();
    for (const item of mine) {
      const qq = allQuestions.find((x) => x.id === item.id);
      if (!qq) continue;
      byTopic.set(qq.topic, (byTopic.get(qq.topic) || 0) + 1);
    }
    const rows = [...byTopic.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    els.mistakeSummary.innerHTML = `
      <div class="review-stats">
        <span><strong>${due.length}</strong> due</span>
        <span><strong>${mine.length}</strong> saved</span>
        <span><strong>${mastered.length}</strong> mastered</span>
      </div>
      <p class="meta">${due.length ? "Start with the due questions today." : "Nothing due right now; the box is up to date."}</p>
      <ul class="mistake-list">
        ${rows.map(([t, n]) => `<li><span>${escapeHtml(t)}</span><span class="badge badge-muted">${n}</span></li>`).join("")}
      </ul>`;
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
  function setViewFilter(value) {
    state.viewFilter = value || "";
    if (els.viewSelect) els.viewSelect.value = state.viewFilter;
    render();
  }

  function setQuickMode(mode) {
    els.quickButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.practiceMode === mode));
  }

  function resetFilterState() {
    state.search = "";
    state.topicFilter = "";
    state.unitFilter = "";
    state.paperFilter = "";
    state.viewFilter = "";
    state.difficultyFilter = "";
    state.minMarks = 0;
    state.maxMarks = 0;
    state.minQuestion = 0;
    state.maxQuestion = 0;
    state.sortMode = "topic";
    if (els.searchInput) els.searchInput.value = "";
    if (els.topicSelect) els.topicSelect.value = "";
    if (els.unitSelect) els.unitSelect.value = "";
    if (els.paperSelect) els.paperSelect.value = "";
    if (els.viewSelect) els.viewSelect.value = "";
    if (els.difficultySelect) els.difficultySelect.value = "";
    if (els.minMarksInput) els.minMarksInput.value = "";
    if (els.maxMarksInput) els.maxMarksInput.value = "";
    if (els.minQuestionInput) els.minQuestionInput.value = "";
    if (els.maxQuestionInput) els.maxQuestionInput.value = "";
    if (els.sortSelect) els.sortSelect.value = "topic";
  }

  function chooseWeakTopic() {
    const byTopic = new Map();
    for (const question of scopedQuestions()) {
      const row = byTopic.get(question.topic) || { topic: question.topic, total: 0, solved: 0 };
      row.total += 1;
      if (state.solved.has(question.id)) row.solved += 1;
      byTopic.set(question.topic, row);
    }
    return [...byTopic.values()]
      .filter((row) => row.solved < row.total)
      .sort((a, b) => (a.solved / a.total) - (b.solved / b.total) || b.total - a.total)[0]?.topic || "";
  }

  function runQuickMode(mode) {
    setQuickMode(mode);
    if (mode === "all") {
      resetFilterState();
      render();
      return;
    }
    if (mode === "topic") {
      els.topicSelect?.focus();
      return;
    }
    if (mode === "mixed") {
      randomVisible(10);
      return;
    }
    if (mode === "unsolved") {
      setViewFilter("unsolved");
      return;
    }
    if (mode === "weak") {
      const topic = chooseWeakTopic();
      if (topic) {
        state.topicFilter = topic;
        state.viewFilter = "unsolved";
        if (els.topicSelect) els.topicSelect.value = topic;
        if (els.viewSelect) els.viewSelect.value = "unsolved";
        render();
      }
      return;
    }
    if (mode === "mistakes") {
      setViewFilter("mistakes-due");
      return;
    }
    if (mode === "print") {
      els.printScope?.focus();
    }
  }

  function applyInitialParams() {
    const params = new URLSearchParams(window.location.search);
    const bank = params.get("bank");
    const unit = params.get("unit");
    const topic = params.get("topic");
    const view = params.get("view");
    const difficulty = params.get("difficulty");
    const mode = params.get("mode");

    if (bank && window.BANK_META?.[bank]) {
      state.activeBank = bank;
      localStorage.setItem(STORAGE_BANK, bank);
    }
    if (unit) {
      state.unitFilter = unit;
      if (state.pathway === "modular" && /^Unit\s+[12]$/i.test(unit)) {
        state.modularUnit = unit;
        localStorage.setItem(STORAGE_UNIT, unit);
      }
    }
    if (topic) state.topicFilter = topic;
    if (view) state.viewFilter = view;
    if (difficulty) state.difficultyFilter = difficulty;

    if (mode === "weak") {
      state.viewFilter = "unsolved";
      setQuickMode("weak");
    } else if (mode === "review") {
      state.viewFilter = "mistakes-due";
      setQuickMode("mistakes");
    }
  }

  function bind() {
    els.searchInput?.addEventListener("input", (e) => { state.search = e.target.value; render(); });
    els.topicSelect?.addEventListener("change", (e) => { state.topicFilter = e.target.value; render(); });
    els.unitSelect?.addEventListener("change", (e) => { state.unitFilter = e.target.value; render(); });
    els.paperSelect?.addEventListener("change", (e) => { state.paperFilter = e.target.value; render(); });
    els.viewSelect?.addEventListener("change", (e) => setViewFilter(e.target.value));
    els.difficultySelect?.addEventListener("change", (e) => { state.difficultyFilter = e.target.value; render(); });
    els.minMarksInput?.addEventListener("input", (e) => { state.minMarks = e.target.value; render(); });
    els.maxMarksInput?.addEventListener("input", (e) => { state.maxMarks = e.target.value; render(); });
    els.minQuestionInput?.addEventListener("input", (e) => { state.minQuestion = e.target.value; render(); });
    els.maxQuestionInput?.addEventListener("input", (e) => { state.maxQuestion = e.target.value; render(); });
    els.sortSelect?.addEventListener("change", (e) => { state.sortMode = e.target.value; render(); });

    els.resetBtn?.addEventListener("click", () => {
      resetFilterState();
      setQuickMode("all");
      render();
    });

    els.bankButtons.forEach((b) => b.addEventListener("click", () => {
      state.activeBank = b.dataset.bank;
      localStorage.setItem(STORAGE_BANK, state.activeBank);
      render();
    }));

    els.pillButtons.forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.viewPill;
      setViewFilter(v === "all" ? "" : v);
    }));

    els.layoutButtons.forEach((b) => b.addEventListener("click", () => {
      state.layout = b.dataset.layout;
      localStorage.setItem(STORAGE_LAYOUT, state.layout);
      els.layoutButtons.forEach((x) => x.classList.toggle("is-active", x.dataset.layout === state.layout));
      render();
    }));

    els.quickButtons.forEach((button) => button.addEventListener("click", () => runQuickMode(button.dataset.practiceMode)));

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
      else if (action === "mistake-done") completeMistakeReview(id);
      else if (action === "solution") openSolution(id);
      else if (action === "fix-topic") openFixTopic(id);
    });

    els.viewerClose?.addEventListener("click", () => els.viewerDialog?.close());
    els.solutionClose?.addEventListener("click", () => els.solutionDialog?.close());

    els.resumeChange?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_PATHWAY);
      localStorage.removeItem(STORAGE_UNIT);
      window.location.href = "/";
    });

    // Timer
    els.timerStartBtn?.addEventListener("click", startTimer);
    els.timerResetBtn?.addEventListener("click", resetTimer);
    els.timerPresetButtons.forEach((b) => b.addEventListener("click", () => setTimerMinutes(b.dataset.timerPreset)));

    // Mistake review
    els.mistakeReviewBtn?.addEventListener("click", () => setViewFilter("mistakes-due"));
    els.mistakeAllBtn?.addEventListener("click", () => setViewFilter("mistakes"));
    els.mistakeMasteredBtn?.addEventListener("click", () => setViewFilter("mistakes-mastered"));

    // Worksheet builder
    els.worksheetBuild?.addEventListener("click", () => buildWorksheet());
    els.worksheetPrint?.addEventListener("click", () => buildWorksheet({ printAfter: true }));
    els.clearSelectedBtn?.addEventListener("click", clearSelected);
    els.printBuildBtn?.addEventListener("click", () => printByScope(els.printScope?.value || "selected"));
    els.randomVisibleBtn?.addEventListener("click", () => randomVisible(10));

    // Fix Topic
    els.fixSave?.addEventListener("click", saveFixTopic);
    els.fixClear?.addEventListener("click", clearFixTopic);
    els.fixClose?.addEventListener("click", () => els.fixDialog?.close());
  }

  // ---- FIX TOPIC ADMIN ---------------------------------------------
  let fixActiveId = null;
  function openFixTopic(id) {
    const qq = questionById(id);
    if (!qq || !els.fixDialog) return;
    fixActiveId = id;
    if (els.fixTitle) els.fixTitle.textContent = `${qq.paper} · Q${qq.question}`;
    if (els.fixCurrentTopic) els.fixCurrentTopic.textContent = qq._origTopic || qq.topic;
    if (els.fixImage) {
      els.fixImage.src = qq.image;
      els.fixImage.alt = `${qq.paper} Q${qq.question}`;
    }
    // Populate select with the full topic catalog
    if (els.fixSelect) {
      const topics = (meta.topics || []).slice();
      const current = corrections[id]?.topic || qq.topic;
      els.fixSelect.innerHTML = topics.map((t) => `<option value="${escapeHtml(t)}"${t === current ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
    }
    els.fixDialog.showModal();
  }
  function saveFixTopic() {
    if (!fixActiveId || !els.fixSelect) return;
    const newTopic = els.fixSelect.value;
    if (!newTopic) return;
    corrections[fixActiveId] = { topic: newTopic, savedAt: new Date().toISOString() };
    saveCorrections(corrections);
    applyCorrections();
    els.fixDialog?.close();
    render();
  }
  function clearFixTopic() {
    if (!fixActiveId) return;
    delete corrections[fixActiveId];
    saveCorrections(corrections);
    applyCorrections();
    els.fixDialog?.close();
    render();
  }

  function shuffled(items) {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  function matchesWorksheetMode(question, mode) {
    if (mode === "quick") return Number(question.marks) <= 3;
    if (mode === "standard") return Number(question.marks) >= 4 && Number(question.marks) <= 6;
    if (mode === "long") return Number(question.marks) >= 7;
    if (mode === "q20") return Number(question.question) >= 20;
    return true;
  }

  function setWorksheetStatus(text) {
    if (els.worksheetStatus) els.worksheetStatus.textContent = text || "";
  }

  function buildWorksheet({ printAfter = false } = {}) {
    const topic = els.worksheetTopic?.value || "";
    const mode = els.worksheetMode?.value || "current";
    const count = Math.max(1, Math.min(40, Number(els.worksheetCount?.value || 12)));
    const basePool = mode === "current" ? lastVisible : lastPool;
    const pool = basePool.filter((question) => {
      if (topic && question.topic !== topic) return false;
      return matchesWorksheetMode(question, mode);
    });

    if (!pool.length) {
      setWorksheetStatus("No questions found. Relax the filters or choose another topic.");
      return;
    }

    for (const question of lastPool) state.selected.delete(question.id);
    const picked = shuffled(pool).slice(0, Math.min(count, pool.length));
    for (const question of picked) state.selected.add(question.id);

    state.viewFilter = "selected";
    if (els.viewSelect) els.viewSelect.value = "selected";
    if (topic && els.topicSelect && [...els.topicSelect.options].some((option) => option.value === topic)) {
      state.topicFilter = topic;
      els.topicSelect.value = topic;
    }

    saveSets();
    setWorksheetStatus(`Built ${picked.length} question${picked.length === 1 ? "" : "s"} in My set.`);
    render();
    if (printAfter) setTimeout(() => printByScope("selected"), 60);
  }

  function randomVisible(count = 10) {
    const pool = lastVisible.length ? lastVisible : applyFilters(scopedQuestions());
    if (!pool.length) {
      setWorksheetStatus("No visible questions to pick from.");
      return;
    }
    for (const question of lastPool) state.selected.delete(question.id);
    const picked = shuffled(pool).slice(0, Math.min(count, pool.length));
    for (const question of picked) state.selected.add(question.id);
    state.viewFilter = "selected";
    if (els.viewSelect) els.viewSelect.value = "selected";
    saveSets();
    setWorksheetStatus(`Random ${picked.length} added to My set.`);
    render();
  }

  function clearSelected() {
    for (const question of lastPool) state.selected.delete(question.id);
    saveSets();
    setWorksheetStatus("My set cleared.");
    render();
  }

  function printableForScope(scope) {
    if (scope === "visible") return lastVisible;
    if (scope === "topic") {
      return state.topicFilter
        ? lastPool.filter((question) => question.topic === state.topicFilter)
        : [];
    }
    if (scope === "unit") {
      return state.unitFilter
        ? lastPool.filter((question) => question.unit === state.unitFilter)
        : [];
    }
    if (scope === "pool") return lastPool;

    const inScope = new Set(lastPool.map((question) => question.id));
    return [...state.selected]
      .filter((id) => inScope.has(id))
      .map(questionById)
      .filter(Boolean);
  }

  function printByScope(scope = "selected") {
    if (!els.printArea) return;
    const printable = printableForScope(scope);
    if (!printable.length) {
      if (scope === "topic") setWorksheetStatus("Choose a topic before printing that scope.");
      else if (scope === "unit") setWorksheetStatus("Choose a chapter or unit before printing that scope.");
      else setWorksheetStatus("Nothing to print yet.");
      return;
    }

    els.printArea.innerHTML = printable.map((question, index) => `<section class="print-question">
      <div class="print-paper-brand">
        <strong>Elite IGCSE Mathematics - Dr Eslam Ahmed</strong>
        <span>WhatsApp: 01120009622 | eliteigcse.com</span>
      </div>
      <h2>${index + 1}. ${escapeHtml(question.paper)} Q${question.question} | ${escapeHtml(question.topic)} | ${question.marks} marks</h2>
      <img src="${escapeHtml(question.image)}" alt="${escapeHtml(question.paper)} Q${question.question}" />
      <div class="print-paper-footer">Prepared by Dr Eslam Ahmed | Assistant Lecturer, Cairo University Faculty of Engineering | 01120009622</div>
    </section>`).join("");
    setWorksheetStatus(`Prepared ${printable.length} question${printable.length === 1 ? "" : "s"} for print / Save as PDF.`);
    window.print();
  }

  function toggleSelected(id) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    saveSets(); render();
  }
  function toggleSolved(id) {
    if (state.solved.has(id)) {
      state.solved.delete(id);
    } else {
      state.solved.add(id);
      advanceMistake(id);
    }
    saveSets(); render();
  }
  function toggleMistake(id) {
    if (mistakeState(id)) {
      delete state.mistakes[id];
    } else {
      addMistake(id);
    }
    saveSets(); render();
  }
  function completeMistakeReview(id) {
    if (!mistakeState(id)) addMistake(id);
    state.solved.add(id);
    advanceMistake(id);
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
    refreshCloudUser();
    applyInitialParams();
    if (els.viewSelect) els.viewSelect.value = state.viewFilter;
    if (els.difficultySelect) els.difficultySelect.value = state.difficultyFilter;
    bind();
    render();
  }

  window.addEventListener("elite-cloud-state", (event) => {
    cloudUser = event.detail?.user || null;
    if (hasRendered) render();
  });

  window.addEventListener("elite-cloud-local-updated", () => {
    refreshProgressFromStorage();
    if (hasRendered) render();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
