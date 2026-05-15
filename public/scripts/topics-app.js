(() => {
  const questions = window.QUESTION_DATA || [];
  const solved = new Set(readJSON("elitePracticeSolved", []));
  const selected = new Set(readJSON("elitePracticeSelected", []));
  const els = {
    total: document.querySelector("[data-roadmap-total]"),
    topics: document.querySelector("[data-roadmap-topics]"),
    solved: document.querySelector("[data-roadmap-solved]"),
    search: document.querySelector("[data-roadmap-search]"),
    unit: document.querySelector("[data-roadmap-unit]"),
    bank: document.querySelector("[data-roadmap-bank]"),
    progress: document.querySelector("[data-roadmap-progress]"),
    grid: document.querySelector("[data-roadmap-grid]"),
  };

  function readJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (_) {
      return fallback;
    }
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }
  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }
  function topicRows() {
    const rows = new Map();
    for (const question of questions) {
      const key = `${question.unit}|||${question.topic}`;
      const row = rows.get(key) || {
        unit: question.unit,
        topic: question.topic,
        order: Number(question.topic_order || 9999),
        all: 0,
        expertise: 0,
        solvedAll: 0,
        solvedExpertise: 0,
        selected: 0,
        papers: new Set(),
      };
      if (question.bank === "all") row.all += 1;
      if (question.bank === "expertise") row.expertise += 1;
      if (solved.has(question.id) && question.bank === "all") row.solvedAll += 1;
      if (solved.has(question.id) && question.bank === "expertise") row.solvedExpertise += 1;
      if (selected.has(question.id)) row.selected += 1;
      if (question.paper) row.papers.add(question.paper);
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => a.order - b.order || a.topic.localeCompare(b.topic));
  }
  function progressState(row, total, bank) {
    const solvedCount = bank === "expertise" ? row.solvedExpertise : row.solvedAll;
    if (!solvedCount) return "unsolved";
    if (solvedCount >= total) return "complete";
    return "started";
  }
  function link(row, bank) {
    const params = new URLSearchParams({ topic: row.topic, unit: row.unit, bank });
    return `/practice?${params.toString()}`;
  }
  let rows = [];
  function fillUnits() {
    if (!els.unit) return;
    const current = els.unit.value;
    els.unit.innerHTML = `<option value="">All chapters / units</option>` +
      uniqueSorted(rows.map((row) => row.unit))
        .map((unit) => `<option value="${escapeHtml(unit)}"${unit === current ? " selected" : ""}>${escapeHtml(unit)}</option>`)
        .join("");
  }
  function render() {
    if (!els.grid) return;
    const bank = els.bank?.value || "all";
    const search = (els.search?.value || "").trim().toLowerCase();
    const unit = els.unit?.value || "";
    const progress = els.progress?.value || "";
    const visible = rows.filter((row) => {
      const total = bank === "expertise" ? row.expertise : row.all;
      if (!total) return false;
      if (unit && row.unit !== unit) return false;
      if (search && !`${row.topic} ${row.unit}`.toLowerCase().includes(search)) return false;
      if (progress && progressState(row, total, bank) !== progress) return false;
      return true;
    });
    if (els.total) els.total.textContent = String(questions.length);
    if (els.topics) els.topics.textContent = String(visible.length);
    if (els.solved) els.solved.textContent = String(solved.size);
    if (!visible.length) {
      els.grid.innerHTML = `<p class="empty-card">No topic matches these filters.</p>`;
      return;
    }
    els.grid.innerHTML = visible.map((row) => {
      const total = bank === "expertise" ? row.expertise : row.all;
      const solvedCount = bank === "expertise" ? row.solvedExpertise : row.solvedAll;
      const pct = total ? Math.round((solvedCount / total) * 100) : 0;
      return `<article class="roadmap-card card">
        <div class="roadmap-head">
          <span class="meta">${escapeHtml(row.unit)}</span>
          <h2>${escapeHtml(row.topic)}</h2>
        </div>
        <div class="roadmap-meter" aria-label="${pct}% solved"><span style="width:${pct}%"></span></div>
        <div class="roadmap-stats">
          <span><strong>${row.all}</strong> full</span>
          <span><strong>${row.expertise}</strong> Q20+</span>
          <span><strong>${solvedCount}</strong> solved</span>
          <span><strong>${row.papers.size}</strong> papers</span>
        </div>
        <div class="roadmap-actions">
          <a class="btn btn-primary btn-sm" href="${link(row, bank)}">Practice topic</a>
          ${row.expertise ? `<a class="btn btn-ghost btn-sm" href="${link(row, "expertise")}">Q20+ only</a>` : ""}
        </div>
      </article>`;
    }).join("");
  }
  function init() {
    rows = topicRows();
    fillUnits();
    [els.search, els.unit, els.bank, els.progress].forEach((control) => control?.addEventListener("input", render));
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
