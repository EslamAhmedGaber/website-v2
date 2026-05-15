(() => {
  const PHONE = "201120009622";
  const KEY = "eliteLeadInfoV2";
  function examSessions() {
    const now = new Date();
    const sessions = [];
    let year = now.getFullYear();
    while (sessions.length < 4) {
      for (const month of [0, 4]) {
        const label = month === 0 ? `January ${year}` : `May/June ${year}`;
        const anchor = new Date(year, month, 1);
        if (anchor >= new Date(now.getFullYear(), now.getMonth(), 1)) sessions.push(label);
        if (sessions.length === 4) break;
      }
      year += 1;
    }
    sessions.push("Later / Undecided");
    return sessions;
  }
  function readLead() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (_) {
      return {};
    }
  }
  function dialogHtml() {
    return `<dialog class="lead-dialog" data-lead-dialog>
      <form method="dialog" data-lead-form>
        <header class="lead-head">
          <strong>Book your free first class</strong>
          <button type="button" data-lead-close aria-label="Close">x</button>
        </header>
        <p class="lead-sub">Tell Dr Eslam a little about you so the first WhatsApp reply can be useful from the start.</p>
        <label>Your name<input name="name" required autocomplete="name" placeholder="Student name"></label>
        <label>Email (optional)<input name="email" type="email" autocomplete="email" placeholder="parent or student email"></label>
        <label>Year / Grade<select name="year" required>
          <option value="">Select year</option>
          <option>Year 9</option>
          <option>Year 10</option>
          <option>Year 11</option>
          <option>Repeat / Retake</option>
          <option>Other</option>
        </select></label>
        <label>Target exam session<select name="exam" required>
          <option value="">Select session</option>
          ${examSessions().map((session) => `<option>${session}</option>`).join("")}
        </select></label>
        <label>Interested in<select name="package">
          <option value="">Any package</option>
          <option value="group">Group Course</option>
          <option value="private">Private 1-to-1</option>
          <option value="intensive">Intensive Sprint</option>
        </select></label>
        <div class="lead-actions">
          <button class="btn btn-primary" type="submit">Open WhatsApp</button>
          <button class="btn btn-ghost" type="button" data-lead-skip>Skip and chat directly</button>
        </div>
        <p class="lead-privacy">Saved only in this browser and added to the WhatsApp message you send.</p>
      </form>
    </dialog>`;
  }
  function buildUrl(info) {
    const packageLabel = ({ group: "Group Course", private: "Private 1-to-1", intensive: "Intensive Sprint" })[info.package] || "Any package";
    const lines = [
      "Hello Dr Eslam, I would like to enroll in the IGCSE Math course.",
      `Name: ${info.name}`,
      info.email ? `Email: ${info.email}` : "",
      `Year: ${info.year}`,
      `Target exam: ${info.exam}`,
      `Interested in: ${packageLabel}`,
    ].filter(Boolean);
    return `https://wa.me/${PHONE}?text=${encodeURIComponent(lines.join("\n"))}`;
  }
  function ensureDialog() {
    if (!document.querySelector("[data-lead-dialog]")) document.body.insertAdjacentHTML("beforeend", dialogHtml());
  }
  function initLead() {
    ensureDialog();
    const dialog = document.querySelector("[data-lead-dialog]");
    const form = document.querySelector("[data-lead-form]");
    const closeBtn = document.querySelector("[data-lead-close]");
    const skipBtn = document.querySelector("[data-lead-skip]");
    let pendingPackage = "";
    function prefill() {
      const saved = readLead();
      for (const [key, value] of Object.entries(saved)) {
        const field = form.elements.namedItem(key);
        if (field && value) field.value = value;
      }
      if (pendingPackage) form.elements.namedItem("package").value = pendingPackage;
    }
    function open(pkg = "") {
      pendingPackage = pkg;
      prefill();
      dialog.showModal();
    }
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-lead-trigger]");
      const packageTrigger = event.target.closest("[data-package]");
      if (!trigger && !packageTrigger) return;
      event.preventDefault();
      open(packageTrigger?.dataset.package || "");
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const info = Object.fromEntries(new FormData(form).entries());
      if (!info.name || !info.year || !info.exam) return;
      localStorage.setItem(KEY, JSON.stringify(info));
      dialog.close();
      window.open(buildUrl(info), "_blank", "noopener,noreferrer");
    });
    closeBtn?.addEventListener("click", () => dialog.close());
    skipBtn?.addEventListener("click", () => {
      dialog.close();
      window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent("Hello Dr Eslam, I would like to ask about the IGCSE Math course.")}`, "_blank", "noopener,noreferrer");
    });
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  function initPwa() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
  }
  function init() {
    initLead();
    initPwa();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
