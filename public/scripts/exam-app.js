(() => {
  const STORAGE = {
    exam: "eliteMockExamV2",
    history: "eliteMockExamHistoryV2",
    solved: "elitePracticeSolved",
    mistakes: "elitePracticeMistakes",
    pathway: "elitePathway",
  };
  const questions = window.QUESTION_DATA || [];
  const solutions = window.SOLUTION_DATA || {};
  const pathway = localStorage.getItem(STORAGE.pathway) || "linear";

  const els = {
    bank: q("[data-exam-bank]"),
    scope: q("[data-exam-scope]"),
    count: q("[data-exam-count]"),
    duration: q("[data-exam-duration]"),
    mix: q("[data-exam-mix]"),
    start: q("[data-exam-start]"),
    finish: q("[data-exam-finish]"),
    save: q("[data-exam-save]"),
    reset: q("[data-exam-reset]"),
    print: q("[data-exam-print]"),
    timer: q("[data-exam-timer]"),
    timerLabel: q("[data-exam-timer-label]"),
    pathway: q("[data-exam-pathway]"),
    result: q("[data-exam-result]"),
    weakness: q("[data-exam-weakness]"),
    history: q("[data-exam-history]"),
    paper: q("[data-exam-paper]"),
  };

  let state = readJSON(STORAGE.exam, { status: "idle", ids: [], scores: {} });
  let tickHandle = null;

  function q(selector) { return document.querySelector(selector); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }
  function readJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }
  function questionById(id) {
    return questions.find((question) => question.id === id);
  }
  function shuffle(items) {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }
  function pathLabel() {
    return pathway === "modular" ? "Modular pathway" : "Linear pathway";
  }
  function scopeValues() {
    const all = questions.filter((question) => question.bank === (els.bank?.value || "all"));
    return uniqueSorted(all.map((question) => question.unit));
  }
  function populateScopes() {
    if (!els.scope) return;
    const current = els.scope.value;
    const label = pathway === "modular" ? "Both units" : "All chapters";
    const scopes = scopeValues();
    els.scope.innerHTML = `<option value="">${label}</option>` +
      scopes.map((scope) => `<option value="${escapeHtml(scope)}"${scope === current ? " selected" : ""}>${escapeHtml(scope)}</option>`).join("");
  }
  function scopedPool() {
    const bank = els.bank?.value || state.bank || "all";
    const scope = els.scope?.value || state.scope || "";
    return questions.filter((question) => question.bank === bank && (!scope || question.unit === scope));
  }
  function takeUnique(target, pool, count) {
    const used = new Set(target.map((question) => question.id));
    for (const question of shuffle(pool)) {
      if (target.length >= count) return;
      if (used.has(question.id)) continue;
      target.push(question);
      used.add(question.id);
    }
  }
  function buildPaper(pool, count, mix) {
    if (mix === "random") return shuffle(pool).slice(0, count);
    if (mix === "quick") return shuffle(pool.filter((question) => Number(question.marks) <= 3)).slice(0, count);
    if (mix === "standard") return shuffle(pool.filter((question) => Number(question.marks) >= 4 && Number(question.marks) <= 6)).slice(0, count);
    if (mix === "long") return shuffle(pool.filter((question) => Number(question.marks) >= 7 || Number(question.question) >= 20)).slice(0, count);

    const quickTarget = Math.max(3, Math.round(count * 0.28));
    const standardTarget = Math.max(5, Math.round(count * 0.4));
    const longTarget = Math.max(0, count - quickTarget - standardTarget);
    const picked = [];
    takeUnique(picked, pool.filter((question) => Number(question.marks) <= 3), quickTarget);
    takeUnique(picked, pool.filter((question) => Number(question.marks) >= 4 && Number(question.marks) <= 6), quickTarget + standardTarget);
    takeUnique(picked, pool.filter((question) => Number(question.marks) >= 7 || Number(question.question) >= 20), quickTarget + standardTarget + longTarget);
    takeUnique(picked, pool, count);
    return picked.slice(0, count);
  }
  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function remainingSeconds() {
    if (state.status !== "running") return Number(state.durationSeconds || Number(els.duration?.value || 90) * 60);
    const elapsed = Math.floor((Date.now() - Number(state.startedAt || Date.now())) / 1000);
    return Number(state.durationSeconds || 0) - elapsed;
  }
  function updateTimer() {
    const remaining = remainingSeconds();
    if (els.timer) els.timer.textContent = formatTime(remaining);
    if (!els.timerLabel) return;
    if (state.status === "running") {
      els.timerLabel.textContent = remaining <= 0 ? "Time is up" : "Exam running";
      if (remaining <= 0) finishExam();
    } else if (state.status === "marking") {
      els.timerLabel.textContent = "Mark your paper";
    } else if (state.status === "complete") {
      els.timerLabel.textContent = "Result saved";
    } else {
      els.timerLabel.textContent = "Ready to start";
    }
  }
  function startTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(updateTimer, 1000);
    updateTimer();
  }
  function totalMarks() {
    return state.ids.map(questionById).filter(Boolean).reduce((sum, question) => sum + Number(question.marks || 0), 0);
  }
  function achievedMarks() {
    return state.ids.reduce((sum, id) => sum + Math.max(0, Number(state.scores?.[id] || 0)), 0);
  }
  function startExam() {
    const pool = scopedPool();
    const count = Math.max(5, Math.min(40, Number(els.count?.value || 25)));
    const picked = buildPaper(pool, count, els.mix?.value || "balanced");
    if (!picked.length) {
      if (els.result) els.result.innerHTML = "<strong>No questions match these settings.</strong><p class=\"meta\">Choose another mix or widen the scope.</p>";
      return;
    }
    state = {
      status: "running",
      bank: els.bank?.value || "all",
      scope: els.scope?.value || "",
      mix: els.mix?.value || "balanced",
      durationSeconds: Math.max(15, Math.min(180, Number(els.duration?.value || 90))) * 60,
      startedAt: Date.now(),
      finishedAt: null,
      ids: picked.map((question) => question.id),
      scores: {},
    };
    saveJSON(STORAGE.exam, state);
    render();
  }
  function finishExam() {
    if (state.status !== "running") return;
    state.status = "marking";
    state.finishedAt = Date.now();
    saveJSON(STORAGE.exam, state);
    render();
  }
  function resetExam() {
    state = { status: "idle", ids: [], scores: {} };
    saveJSON(STORAGE.exam, state);
    render();
  }
  function readScores() {
    document.querySelectorAll("[data-score-id]").forEach((input) => {
      const question = questionById(input.dataset.scoreId);
      if (!question) return;
      const value = Math.max(0, Math.min(Number(question.marks || 0), Number(input.value || 0)));
      state.scores[input.dataset.scoreId] = value;
    });
  }
  function addMissedQuestionsToPractice() {
    const mistakes = readJSON(STORAGE.mistakes, {});
    const solved = new Set(readJSON(STORAGE.solved, []));
    const now = Date.now();
    for (const id of state.ids) {
      const question = questionById(id);
      if (!question) continue;
      const score = Number(state.scores?.[id] || 0);
      if (score >= Number(question.marks || 0)) {
        solved.add(id);
        continue;
      }
      const current = mistakes[id] || {};
      mistakes[id] = {
        id,
        reason: "mock-exam",
        level: 0,
        attempts: Number(current.attempts || 0) + 1,
        addedAt: Number(current.addedAt || now),
        updatedAt: now,
        dueAt: now,
        masteredAt: null,
      };
    }
    saveJSON(STORAGE.mistakes, mistakes);
    saveJSON(STORAGE.solved, [...solved]);
  }
  function saveHistory() {
    const history = readJSON(STORAGE.history, []);
    const total = totalMarks();
    const score = achievedMarks();
    history.unshift({
      date: new Date().toISOString(),
      bank: state.bank,
      scope: state.scope,
      score,
      total,
      percent: total ? Math.round((score / total) * 100) : 0,
    });
    saveJSON(STORAGE.history, history.slice(0, 10));
  }
  function saveMarks() {
    if (state.status !== "marking" && state.status !== "complete") return;
    readScores();
    state.status = "complete";
    state.savedAt = Date.now();
    saveJSON(STORAGE.exam, state);
    addMissedQuestionsToPractice();
    saveHistory();
    render();
  }
  function topicBreakdown() {
    const rows = new Map();
    for (const id of state.ids) {
      const question = questionById(id);
      if (!question) continue;
      const score = Math.max(0, Number(state.scores?.[id] || 0));
      const row = rows.get(question.topic) || { topic: question.topic, unit: question.unit, score: 0, total: 0, lost: 0 };
      row.score += score;
      row.total += Number(question.marks || 0);
      row.lost += Math.max(0, Number(question.marks || 0) - score);
      rows.set(question.topic, row);
    }
    return [...rows.values()].sort((a, b) => b.lost - a.lost || b.total - a.total);
  }
  function practiceLink(row) {
    const params = new URLSearchParams({
      bank: state.bank || "all",
      unit: row.unit || "",
      topic: row.topic,
      mode: "weak",
    });
    return `/practice?${params.toString()}`;
  }
  function formatInline(text) {
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function renderMarkdown(text) {
    const escaped = escapeHtml(text || "").trim();
    if (!escaped) return "<p class=\"meta\">Solution has not been written yet.</p>";
    return escaped.split(/\n{2,}/).map((block) => {
      const lines = block.split(/\n/);
      if (lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
        return `<ul>${lines.map((line) => `<li>${formatInline(line.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${formatInline(block).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  function renderResult() {
    if (!els.result) return;
    if (state.status === "idle") {
      els.result.innerHTML = "<strong>No active mock yet.</strong><p class=\"meta\">Generate a paper to begin. Answers stay hidden until you finish.</p>";
      return;
    }
    const total = totalMarks();
    const score = achievedMarks();
    const percent = total ? Math.round((score / total) * 100) : 0;
    const label = state.status === "running" ? "Exam in progress" : state.status === "marking" ? "Self-marking mode" : "Mock saved";
    els.result.innerHTML = `<div class="result-main">
      <div class="score-ring" style="--score:${percent}%">
        <strong>${percent}%</strong>
        <span>${score}/${total}</span>
      </div>
      <div>
        <strong>${label}</strong>
        <p class="meta">${state.ids.length} questions${state.scope ? ` · ${escapeHtml(state.scope)}` : ""}. ${state.status === "running" ? "Worked solutions stay hidden while the timer runs." : "Enter marks, save, and weak questions will return to the Mistake Box."}</p>
      </div>
    </div>`;
  }
  function renderWeakness() {
    if (!els.weakness) return;
    if (state.status === "running" || !state.ids.length) {
      els.weakness.innerHTML = "";
      return;
    }
    els.weakness.innerHTML = topicBreakdown().slice(0, 4).map((row) => `<article class="weakness-card">
      <strong>${escapeHtml(row.topic)}</strong>
      <span class="meta">${row.score}/${row.total} marks · lost ${row.lost}</span>
      <a class="btn btn-primary btn-sm" href="${practiceLink(row)}">Revise topic</a>
    </article>`).join("");
  }
  function renderHistory() {
    if (!els.history) return;
    const history = readJSON(STORAGE.history, []);
    if (!history.length) {
      els.history.innerHTML = "<p class=\"meta\">No saved mocks yet.</p>";
      return;
    }
    els.history.innerHTML = `<div class="history-list">${history.slice(0, 5).map((row) => `<div class="history-row">
      <span>${new Date(row.date).toLocaleDateString()}</span>
      <strong>${row.score}/${row.total} (${row.percent}%)</strong>
    </div>`).join("")}</div>`;
  }
  function renderPaper() {
    if (!els.paper) return;
    if (!state.ids.length) {
      els.paper.innerHTML = "<p class=\"exam-empty\">Your generated paper will appear here.</p>";
      return;
    }
    const canMark = state.status !== "running";
    els.paper.innerHTML = state.ids.map((id, index) => {
      const question = questionById(id);
      if (!question) return "";
      const score = state.scores?.[id] ?? "";
      const solution = solutions[id]?.source || "";
      return `<article class="exam-question">
        <div class="print-paper-brand">
          <strong>Elite IGCSE Mathematics - Dr Eslam Ahmed</strong>
          <span>WhatsApp: 01120009622 | eliteigcse.com</span>
        </div>
        <header>
          <div>
            <span class="meta">Question ${index + 1}</span>
            <strong>${escapeHtml(question.paper)} Q${question.question}</strong>
          </div>
          <span class="badge">${question.marks}m</span>
        </header>
        <img src="${escapeHtml(question.image)}" alt="${escapeHtml(question.paper)} Q${question.question}" loading="lazy" />
        <footer>
          <span class="meta">${escapeHtml(question.topic)}</span>
          ${canMark ? `<label><span class="label">Score</span><input class="input score-input" type="number" min="0" max="${question.marks}" value="${score}" data-score-id="${escapeHtml(id)}" /></label>` : "<span class=\"meta\">Solutions hidden until finish</span>"}
        </footer>
        ${canMark ? `<details class="exam-solution"><summary>Show worked solution</summary>${renderMarkdown(solution)}</details>` : ""}
        <div class="print-paper-footer">Prepared by Dr Eslam Ahmed | Assistant Lecturer, Cairo University Faculty of Engineering | 01120009622</div>
      </article>`;
    }).join("");
    if (window.MathJax?.typesetPromise && canMark) {
      window.MathJax.typesetPromise([els.paper]).catch(() => {});
    }
  }
  function renderButtons() {
    if (els.finish) els.finish.disabled = state.status !== "running";
    if (els.save) els.save.disabled = state.status !== "marking" && state.status !== "complete";
    if (els.print) els.print.disabled = !state.ids.length;
    if (els.start) els.start.disabled = state.status === "running";
  }
  function render() {
    if (els.pathway) els.pathway.textContent = pathLabel();
    renderButtons();
    renderResult();
    renderHistory();
    renderWeakness();
    renderPaper();
    updateTimer();
  }
  function bind() {
    els.bank?.addEventListener("change", populateScopes);
    els.start?.addEventListener("click", startExam);
    els.finish?.addEventListener("click", finishExam);
    els.save?.addEventListener("click", saveMarks);
    els.reset?.addEventListener("click", resetExam);
    els.print?.addEventListener("click", () => window.print());
    els.paper?.addEventListener("input", (event) => {
      if (!event.target.matches("[data-score-id]")) return;
      readScores();
      saveJSON(STORAGE.exam, state);
      renderResult();
      renderWeakness();
    });
    els.duration?.addEventListener("input", () => {
      if (state.status === "idle") updateTimer();
    });
  }

  populateScopes();
  bind();
  render();
  startTicker();
})();
