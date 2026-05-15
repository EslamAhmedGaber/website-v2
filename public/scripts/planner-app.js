(() => {
  const questions = window.QUESTION_DATA || [];
  const notes = window.NOTE_DATA || [];
  const solved = new Set(readJSON("elitePracticeSolved", []));
  const saved = readJSON("eliteStudyPlanSettingsV2", {});
  const els = {
    examDate: document.querySelector("[data-plan-exam-date]"),
    targetGrade: document.querySelector("[data-plan-target]"),
    weeklyHours: document.querySelector("[data-plan-hours]"),
    focusUnit: document.querySelector("[data-plan-focus]"),
    planLength: document.querySelector("[data-plan-length]"),
    confidence: document.querySelector("[data-plan-confidence]"),
    build: document.querySelector("[data-build-plan]"),
    print: document.querySelector("[data-print-plan]"),
    reset: document.querySelector("[data-reset-plan]"),
    summary: document.querySelector("[data-plan-summary]"),
    weeks: document.querySelector("[data-plan-weeks]"),
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
  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }
  function formatDate(date) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function weeksUntil(value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = value ? new Date(value) : addDays(today, 56);
    exam.setHours(0, 0, 0, 0);
    const days = Math.max(7, Math.ceil((exam - today) / 86400000));
    return Math.max(2, Math.min(12, Math.ceil(days / 7)));
  }
  function unitRows() {
    const rows = new Map();
    for (const question of questions) {
      const row = rows.get(question.unit) || { unit: question.unit, total: 0, solved: 0, topics: new Map() };
      row.total += 1;
      if (solved.has(question.id)) row.solved += 1;
      const topic = row.topics.get(question.topic) || { topic: question.topic, unit: question.unit, total: 0, solved: 0, expertise: 0 };
      topic.total += 1;
      if (solved.has(question.id)) topic.solved += 1;
      if (question.bank === "expertise") topic.expertise += 1;
      row.topics.set(question.topic, topic);
      rows.set(question.unit, row);
    }
    return [...rows.values()].sort((a, b) => a.unit.localeCompare(b.unit));
  }
  function populateUnits() {
    for (const row of unitRows()) {
      const option = document.createElement("option");
      option.value = row.unit;
      option.textContent = row.unit;
      els.focusUnit?.append(option);
    }
  }
  function loadSettings() {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    const defaultExam = addDays(new Date(), 56);
    els.examDate.value = saved.examDate || isoDate(defaultExam);
    els.targetGrade.value = saved.targetGrade || "9";
    els.weeklyHours.value = saved.weeklyHours || "5";
    els.focusUnit.value = focus || saved.focusUnit || "";
    els.planLength.value = saved.planLength || "auto";
    els.confidence.value = saved.confidence || "medium";
  }
  function settings() {
    return {
      examDate: els.examDate.value,
      targetGrade: els.targetGrade.value,
      weeklyHours: els.weeklyHours.value,
      focusUnit: els.focusUnit.value,
      planLength: els.planLength.value,
      confidence: els.confidence.value,
    };
  }
  function saveSettings(value) {
    localStorage.setItem("eliteStudyPlanSettingsV2", JSON.stringify(value));
  }
  function topicPool(value) {
    const rows = unitRows();
    const ordered = value.focusUnit
      ? [...rows.filter((row) => row.unit === value.focusUnit), ...rows.filter((row) => row.unit !== value.focusUnit)]
      : rows;
    return ordered.flatMap((unit) => [...unit.topics.values()]
      .sort((a, b) => (a.solved / Math.max(1, a.total)) - (b.solved / Math.max(1, b.total)) || b.expertise - a.expertise || b.total - a.total));
  }
  function topicLink(topic) {
    return `/practice?${new URLSearchParams({ unit: topic.unit, topic: topic.topic, bank: "all" }).toString()}`;
  }
  function noteForUnit(unit) {
    return notes.find((note) => note.unit === unit);
  }
  function buildPlan() {
    const value = settings();
    saveSettings(value);
    const autoWeeks = weeksUntil(value.examDate);
    const weekCount = value.planLength === "auto" ? autoWeeks : Number(value.planLength);
    const hours = Number(value.weeklyHours);
    const target = Number(value.targetGrade);
    const confidenceBoost = value.confidence === "high" ? 1 : value.confidence === "low" ? -1 : 0;
    const tasksPerWeek = Math.max(3, Math.min(6, Math.round(hours / 2) + 2 + confidenceBoost));
    const topics = topicPool(value);
    const exam = new Date(value.examDate);
    const weeks = Array.from({ length: weekCount }, (_, index) => {
      const isLate = index >= Math.max(1, weekCount - 2);
      return {
        number: index + 1,
        date: addDays(new Date(), index * 7),
        title: isLate ? "Exam-style sprint" : index === 0 ? "Build momentum" : "Close weak gaps",
        topics: Array.from({ length: tasksPerWeek }, (_, offset) => topics[(index * tasksPerWeek + offset) % topics.length]).filter(Boolean),
        includeExpertise: target >= 8 || isLate,
      };
    });
    els.summary.innerHTML = `<strong>${weekCount}-week plan built for Grade ${value.targetGrade}.</strong>
      <p>Exam date: <b>${formatDate(exam)}</b>. Weekly time: <b>${hours} hours</b>. ${value.focusUnit ? `First focus: <b>${escapeHtml(value.focusUnit)}</b>.` : "Balanced across the full syllabus."}</p>`;
    els.weeks.innerHTML = weeks.map((week) => {
      const expertiseTask = week.includeExpertise
        ? `<li><span>Hard-question training</span><a href="/practice?bank=expertise&difficulty=q20">Train Q20+</a></li>`
        : `<li><span>Confidence set</span><a href="/practice?view=unsolved">Continue unsolved</a></li>`;
      return `<article class="plan-week card">
        <header><span class="meta">Week ${week.number} - ${formatDate(week.date)}</span><h2>${escapeHtml(week.title)}</h2></header>
        <ul>
          ${week.topics.map((topic, index) => {
            const note = noteForUnit(topic.unit);
            const useNotes = index === 0 && note;
            return `<li><span>${useNotes ? "Read strategy" : "Practise topic"}: ${escapeHtml(topic.topic)}</span><a href="${useNotes ? note.file : topicLink(topic)}">${useNotes ? "Open notes" : "Open practice"}</a></li>`;
          }).join("")}
          ${expertiseTask}
          <li><span>After solving, mark solved and review mistakes.</span><a href="/practice">Open bank</a></li>
        </ul>
      </article>`;
    }).join("");
  }
  function resetPlan() {
    localStorage.removeItem("eliteStudyPlanSettingsV2");
    els.weeks.innerHTML = "";
    els.summary.innerHTML = `<strong>Your plan is ready to build.</strong><p>Choose your settings, then build a weekly route.</p>`;
    loadSettings();
  }
  function printPlan() {
    if (!els.weeks.children.length) buildPlan();
    window.print();
  }
  function init() {
    if (!els.weeks) return;
    populateUnits();
    loadSettings();
    buildPlan();
    els.build?.addEventListener("click", buildPlan);
    els.print?.addEventListener("click", printPlan);
    els.reset?.addEventListener("click", resetPlan);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
