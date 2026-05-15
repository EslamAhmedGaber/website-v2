(() => {
  const identity = {
    school: "Elite IGCSE Mathematics",
    course: "Edexcel IGCSE 4MA1 Higher",
    teacher: "Dr Eslam Ahmed",
    role: "Assistant Lecturer, Cairo University Faculty of Engineering",
    phone: "01120009622",
    site: "eliteigcse.com",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function masthead(label = "") {
    return `<div class="print-brand">
      <span class="print-brand-mark">IGCSE</span>
      <div class="print-brand-copy">
        <strong>${escapeHtml(identity.school)}</strong>
        <span>${escapeHtml(identity.course)}${label ? ` | ${escapeHtml(label)}` : ""}</span>
      </div>
      <div class="print-brand-contact">
        <strong>${escapeHtml(identity.teacher)}</strong>
        <span>${escapeHtml(identity.role)}</span>
        <span>${escapeHtml(identity.phone)} | ${escapeHtml(identity.site)}</span>
      </div>
    </div>`;
  }

  function footer() {
    return `<div class="print-brand-footer">
      ${escapeHtml(identity.teacher)} | ${escapeHtml(identity.course)} | ${escapeHtml(identity.phone)} | ${escapeHtml(identity.site)}
    </div>`;
  }

  window.ElitePrintBrand = { identity, masthead, footer };
})();
