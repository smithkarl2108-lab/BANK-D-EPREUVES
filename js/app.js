/* BANK D'EPREUVES — bibliothèque publique connectée à Supabase. */
"use strict";

const config = window.BANK_SUPABASE_CONFIG;
const supabaseLib = window.supabase;
const client = config && supabaseLib?.createClient
  ? supabaseLib.createClient(config.url, config.publishableKey)
  : null;

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

let resources = [];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function showEmpty(title, description) {
  elements.grid.innerHTML = `<div class="empty-state"><span>⌕</span><strong>${escapeHTML(title)}</strong><p>${escapeHTML(description)}</p></div>`;
}

function populateFilter(select, rows, placeholder) {
  if (!select) return;
  const current = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  rows.forEach((row) => select.add(new Option(row.name, row.id)));
  if (rows.some((row) => row.id === current)) select.value = current;
}

async function loadCatalogs() {
  const [classes, subjects] = await Promise.all([
    client.from("school_classes").select("id,name").eq("is_active", true).order("level_order").order("name"),
    client.from("subjects").select("id,name").eq("is_active", true).order("name")
  ]);
  if (!classes.error) populateFilter(elements.classFilter, classes.data || [], "Toutes les classes");
  if (!subjects.error) populateFilter(elements.subjectFilter, subjects.data || [], "Toutes les matières");
}

async function loadResources() {
  if (!client) {
    showEmpty("Bibliothèque momentanément indisponible", "Le service de ressources n'a pas pu être initialisé. Réessaie plus tard.");
    return;
  }

  showEmpty("Chargement des épreuves…", "Nous récupérons les ressources publiées.");
  const { data, error } = await client
    .from("documents")
    .select(`
      id,title,description,document_type,exam_year,sequence_number,published_at,
      school_class_id,series_id,subject_id,
      school_classes(name),series(name),subjects(name),
      document_files(id,storage_path,original_name,mime_type)
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Chargement des documents impossible :", error);
    showEmpty("Impossible de charger la bibliothèque", "Vérifie ta connexion puis actualise la page.");
    return;
  }

  const ids = (data || []).map((item) => item.id);
  const assoc = ids.length ? await client.from("document_classes").select("document_id,class_id").in("document_id", ids) : { data: [], error: null };
  const classIds = [...new Set((assoc.data || []).map((row) => row.class_id))];
  const classRows = classIds.length ? await client.from("school_classes").select("id,name").in("id", classIds) : { data: [], error: null };
  const classNames = new Map((classRows.data || []).map((row) => [row.id, row.name]));
  const classesByDoc = new Map();
  (assoc.data || []).forEach((row) => { const arr = classesByDoc.get(row.document_id) || []; const name = classNames.get(row.class_id); if (name && !arr.includes(name)) arr.push(name); classesByDoc.set(row.document_id, arr); });
  resources = await Promise.all((data || []).map(async (item) => {
    const files = await Promise.all((item.document_files || []).map(async (file) => {
      const { data: signed, error: signedError } = await client.storage
        .from("documents").createSignedUrl(file.storage_path, 3600);
      return signedError || !signed?.signedUrl ? null : {
        name: file.original_name || "Consulter le document",
        url: signed.signedUrl
      };
    }));
    return {
      ...item,
      classIds: (assoc.data || []).filter((row) => row.document_id === item.id).map((row) => row.class_id),
      classNames: classesByDoc.get(item.id)?.length ? classesByDoc.get(item.id) : [item.school_classes?.name || "Classe non précisée"],
      className: (classesByDoc.get(item.id)?.length ? classesByDoc.get(item.id) : [item.school_classes?.name || "Classe non précisée"]).join(" · "),
      seriesName: item.series?.name || "",
      subjectName: item.subjects?.name || "Matière non précisée",
      typeLabel: ({ sujet: "Sujet", corrige: "Corrigé", cours: "Cours", autre: "Autre" })[item.document_type] || "Document",
      yearLabel: item.exam_year ? String(item.exam_year) : "Année non précisée",
      files: files.filter(Boolean)
    };
  }));

  renderResources();
}

function renderResources() {
  if (!elements.grid) return;
  const query = (elements.search?.value || "").trim().toLocaleLowerCase("fr");
  const selectedClass = elements.classFilter?.value || "";
  const selectedSubject = elements.subjectFilter?.value || "";
  const selectedType = elements.typeFilter?.value || "";

  const filtered = resources.filter((item) => {
    const searchable = [item.title, item.description, item.className, item.seriesName,
      item.subjectName, item.typeLabel, item.yearLabel, item.sequence_number]
      .join(" ").toLocaleLowerCase("fr");
    return searchable.includes(query)
      && (!selectedClass || item.classIds?.includes(selectedClass) || item.school_class_id === selectedClass)
      && (!selectedSubject || item.subject_id === selectedSubject)
      && (!selectedType || item.typeLabel === selectedType);
  });

  if (elements.count) {
    elements.count.textContent = `${filtered.length} ressource${filtered.length > 1 ? "s" : ""}`;
  }
  if (!filtered.length) {
    showEmpty(resources.length ? "Aucun résultat" : "Aucune épreuve publiée pour le moment",
      resources.length ? "Essaie de modifier tes critères de recherche." : "Les sujets et corrigés apparaîtront ici après validation par l'administration.");
    return;
  }

  elements.grid.innerHTML = filtered.map((item) => {
    const meta = [item.className, item.seriesName, item.subjectName].filter(Boolean).join(" · ");
    const sequence = item.sequence_number ? ` · Séquence ${item.sequence_number}` : "";
    const files = item.files.length
      ? item.files.map((file) => `<a class="button button-ghost resource-open" href="${escapeHTML(file.url)}" target="_blank" rel="noopener noreferrer">Consulter <span>↗</span></a>`).join("")
      : '<span class="resource-no-file">Fichier indisponible</span>';
    return `
      <article class="resource-card">
        <span class="resource-meta">${escapeHTML(meta)}</span>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.typeLabel)} · ${escapeHTML(item.yearLabel)}${escapeHTML(sequence)}</p>
        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
        <div class="resource-actions">${files}</div>
      </article>
    `;
  }).join("");
}

[elements.search, elements.classFilter, elements.subjectFilter, elements.typeFilter]
  .filter(Boolean)
  .forEach((control) => control.addEventListener("input", renderResources));

if (elements.year) elements.year.textContent = new Date().getFullYear();
elements.menuToggle?.addEventListener("click", () => {
  const isOpen = elements.menu?.classList.toggle("open");
  elements.menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});
elements.menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  elements.menu.classList.remove("open");
  elements.menuToggle?.setAttribute("aria-expanded", "false");
}));

(async () => {
  if (!client) {
    showEmpty("Bibliothèque momentanément indisponible", "Le service de ressources n'a pas pu être initialisé.");
    return;
  }
  await Promise.all([loadCatalogs(), loadResources()]);
})();
