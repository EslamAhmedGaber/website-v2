(() => {
  const questions = window.QUESTION_DATA || [];
  const notes = window.NOTE_DATA || [];
  const solved = new Set(readJSON("elitePracticeSolved", []));
  const selected = new Set(readJSON("elitePracticeSelected", []));
  const saved = readJSON("eliteReadinessCheckV2", {});
  const els = {
    target: document.querySelector("[data-check-target]"),
    mock: document.querySelector("[data-check-mock]"),
    confidence: document.querySelector("[data-check-confidence]"),
    time: document.querySelector("[data-check-time]"),
    weakUnits: document.querySelector("[data-weak-units]"),
    run: document.querySelector("[data-run-check]"),
    save: document.querySelector("[data-save-check]"),
    card: document.querySelector("[data-readiness-card]"),
    recommendations: document.querySelector("[data-recommendations]"),
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
  function populateWeakUnits() {
    if (!els.weakUnits) return;
    els.weakUnits.innerHTML = unitRows().map((row) => `<label class="check-pill">
      <input type="checkbox" value="${escapeHtml(row.unit)}"${saved.weakUnits?.includes(row.unit) ? " checked" : ""}>
      <span>${escapeHtml(row.unit)}</span>
    </label>`).join("");
  }
  function loadSaved() {
    if (!saved.target) return;
    els.target.value = saved.target;
    els.mock.value = saved.mock;
    els.confidence.value = saved.confidence;
    els.time.value = saved.time;
  }
  function currentSettings() {
    return {
      target: els.target?.value || "9",
      mock: els.mock?.value || "unknown",
      confidence: els.confidence?.value || "medium",
      time: els.time?.value || "5",
      weakUnits: [...els.weakUnits.querySelectorAll("input:checked")].map((input) => input.value),
    };
  }
  function score(settings) {
    const targetPenalty = { "9": 12, "8": 8, "7": 4, "6": 0 }[settings.target] || 0;
    const mockScore = settings.mock === "unknown" ? 58 : Number(settings.mock);
    const confidenceScore = { low: 45, medium: 65, high: 82 }[settings.confidence] || 65;
    const timeScore = Math.min(90, Number(settings.time) * 8);
    const solvedScore = Math.min(92, Math.round((solved.size / Math.max(1, questions.length)) * 220));
    const selectedScore = Math.min(20, selected.size);
    const weakPenalty = Math.min(20, settings.weakUnits.length * 5);
    return Math.max(12, Math.min(98, Math.round(
      mockScore * 0.34 + confidenceScore * 0.24 + timeScore * 0.18 +
      solvedScore * 0.18 + selectedScore * 0.06 - targetPenalty - weakPenalty
    )));
  }
  function readinessLabel(value) {
    if (value >= 78) return "Strong - polish exam technique";
    if (value >= 58) return "Building - practise weak topics";
    if (value >= 38) return "Needs structure - use notes and guided practice";
    return "Start gently - rebuild core topics first";
  }
  function weakestTopics(unit) {
    const row = unitRows().find((item) => item.unit === unit) || unitRows()[0];
    return [...row.topics.values()]
      .sort((a, b) => (a.solved / Math.max(1, a.total)) - (b.solved / Math.max(1, b.total)) || b.expertise - a.expertise)
      .slice(0, 3);
  }
  function noteForUnit(unit) {
    return notes.find((note) => note.unit === unit);
  }
  function actionCard(title, text, href, button) {
    return `<article class="recommendation-card card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <a class="btn btn-primary btn-sm" href="${href}">${escapeHtml(button)}</a>
    </article>`;
  }
  function practiceLink(unit, topic, bank = "all") {
    return `/practice?${new URLSearchParams({ unit, topic, bank }).toString()}`;
  }
  function runCheck() {
    const settings = currentSettings();
    const value = score(settings);
    const units = settings.weakUnits.length
      ? settings.weakUnits
      : unitRows().sort((a, b) => (a.solved / Math.max(1, a.total)) - (b.solved / Math.max(1, b.total))).slice(0, 2).map((row) => row.unit);
    const topic = weakestTopics(units[0])[0];
    const note = noteForUnit(units[0]);
    els.card.innerHTML = `<div class="readiness-score" style="--score:${value}%">
      <strong>${value}</strong><span>/100</span>
    </div>
    <div>
      <h2>${readinessLabel(value)}</h2>
      <p>First focus: <strong>${escapeHtml(units[0])}</strong>. You have marked <strong>${solved.size}</strong> solved questions and saved <strong>${selected.size}</strong> in My set.</p>
    </div>`;
    els.recommendations.innerHTML = [
      actionCard("Fix one weak topic first", `Start with ${topic.topic}. Solve before opening the worked solution.`, practiceLink(topic.unit, topic.topic), "Open practice"),
      note
        ? actionCard("Read the matching notes", `${note.title} is ready before this practice set.`, note.file, "Read notes")
        : actionCard("Use the roadmap", "Choose one topic from your weakest chapter or unit and work through it in order.", "/topics", "Open roadmap"),
      actionCard("Train hard questions", "Do one Q20+ set each week so long questions stop feeling unfamiliar.", "/practice?bank=expertise&difficulty=q20", "Train Q20+"),
      actionCard("Turn this into a plan", "Build a weekly route from your date, target grade, and weakest area.", `/planner?focus=${encodeURIComponent(units[0])}`, "Build plan"),
    ].join("");
    return settings;
  }
  function saveCheck() {
    const settings = runCheck();
    localStorage.setItem("eliteReadinessCheckV2", JSON.stringify(settings));
    if (els.save) {
      els.save.textContent = "Saved";
      setTimeout(() => { els.save.textContent = "Save result"; }, 1200);
    }
  }
  function init() {
    if (!els.card || !els.recommendations) return;
    populateWeakUnits();
    loadSaved();
    runCheck();
    els.run?.addEventListener("click", runCheck);
    els.save?.addEventListener("click", saveCheck);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
