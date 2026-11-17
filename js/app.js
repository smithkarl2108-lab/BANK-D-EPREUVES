/* BANK D'EPREUVES — JavaScript natif */
"use strict";

const resources = [];

const elements = {
  search: document.getElementById("searchInput"),
  classFilter: document.getElementById("classFilter"),
  subjectFilter: document.getElementById("subjectFilter"),
  typeFilter: document.getElementById("typeFilter"),
  grid: document.getElementById("resourceGrid"),
  count: document.getElementById("resourceCount"),
  year: document.getElementById("currentYear"),
  menu: document.getElementById("mainNav"),
  menuToggle: document.getElementById("menuToggle")
};

function renderResources() {
  if (!elements.grid) return;
  const query = (elements.search?.value || "").trim().toLocaleLowerCase("fr");
  const selectedClass = elements.classFilter?.value || "";
  const selectedSubject = elements.subjectFilter?.value || "";
  const selectedType = elements.typeFilter?.value || "";

  const filtered = resources.filter((item) => {
    const searchable = [item.title, item.className, item.subject, item.type, item.year]
      .join(" ").toLocaleLowerCase("fr");
    return searchable.includes(query)
      && (!selectedClass || item.className === selectedClass)
      && (!selectedSubject || item.subject === selectedSubject)
      && (!selectedType || item.type === selectedType);
  });

  elements.count.textContent = `${filtered.length} ressource${filtered.length > 1 ? "s" : ""}`;
  if (!filtered.length) {
    elements.grid.innerHTML = '<div class="empty-state"><span>⌕</span><strong>Aucune épreuve pour le moment</strong><p>Les ressources seront affichées ici dès leur publication.</p></div>';
    return;
  }

  elements.grid.innerHTML = filtered.map((item) => `
    <article class="resource-card">
      <span class="resource-meta">${escapeHTML(item.className)} · ${escapeHTML(item.subject)}</span>
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.type)} · ${escapeHTML(item.year)}</p>
    </article>
  `).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

[elements.search, elements.classFilter, elements.subjectFilter, elements.typeFilter]
  .filter(Boolean)
  .forEach((control) => control.addEventListener("input", renderResources));

elements.year && (elements.year.textContent = new Date().getFullYear());
elements.menuToggle?.addEventListener("click", () => {
  const isOpen = elements.menu.classList.toggle("open");
  elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
});
elements.menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  elements.menu.classList.remove("open");
  elements.menuToggle?.setAttribute("aria-expanded", "false");
}));

renderResources();
