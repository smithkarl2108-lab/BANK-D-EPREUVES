/* Modération des documents — réservé aux administrateurs via RLS Supabase. */
"use strict";
(async () => {
  const panel = document.getElementById("adminDocumentsPanel");
  if (!panel) return;
  const config = window.BANK_SUPABASE_CONFIG;
  const lib = window.supabase;
  if (!config || !lib?.createClient) return;
  const client = lib.createClient(config.url, config.publishableKey);
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const { data: profile } = await client.from("profiles")
    .select("role,is_active").eq("id", session.user.id).single();
  if (profile?.role !== "admin" || !profile.is_active) return;
  panel.hidden = false;

  const list = document.getElementById("pendingDocuments");
  const stats = document.getElementById("adminDocumentStats");
  const stat = (value, label) => {
    const card = document.createElement("div");
    card.className = "admin-stat";
    const number = document.createElement("strong");
    number.textContent = String(value ?? 0);
    const caption = document.createElement("span");
    caption.textContent = label;
    card.append(number, caption);
    return card;
  };
  async function loadStats() {
    const [all, pending, published] = await Promise.all([
      client.from("documents").select("id", { count: "exact", head: true }),
      client.from("documents").select("id", { count: "exact", head: true }).eq("status", "pending"),
      client.from("documents").select("id", { count: "exact", head: true }).eq("status", "published")
    ]);
    stats.replaceChildren(
      stat(all.count, "Documents au total"),
      stat(pending.count, "En attente"),
      stat(published.count, "Publiés")
    );
  }
  function makeAction(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", () => handler(button));
    return button;
  }
  async function moderate(documentId, decision, button) {
    button.disabled = true;
    const { data: { session: current } } = await client.auth.getSession();
    if (!current) { list.textContent = "Session expirée. Reconnecte-toi."; return; }
    const update = {
      status: decision === "publish" ? "published" : "rejected",
      reviewer_id: current.user.id,
      review_note: decision === "publish" ? null : "Document refusé après examen.",
      published_at: decision === "publish" ? new Date().toISOString() : null
    };
    const { error } = await client.from("documents").update(update)
      .eq("id", documentId).eq("status", "pending");
    if (error) {
      button.disabled = false;
      const notice = document.createElement("p");
      notice.className = "admin-document-error";
      notice.textContent = "Action impossible : " + error.message;
      button.parentElement.append(notice);
      return;
    }
    await loadPending();
    await loadStats();
  }
  async function loadPending() {
    list.textContent = "Chargement…";
    const { data, error } = await client.from("documents")
      .select("id,title,description,document_type,exam_year,sequence_number,created_at,school_classes(name),series(name),class_offerings(display_name,school_variants(name)),subjects(name),document_files(original_name,storage_path,bucket_id,mime_type)")
      .eq("status", "pending").order("created_at", { ascending: true });
    if (error) {
      list.textContent = "Impossible de charger les documents : " + error.message;
      return;
    }
    const documentIds = (data || []).map((doc) => doc.id);
    const associations = documentIds.length ? await client.from("document_classes").select("document_id,class_id").in("document_id", documentIds) : { data: [], error: null };
    const classIds = [...new Set((associations.data || []).map((row) => row.class_id))];
    const classRows = classIds.length ? await client.from("school_classes").select("id,name").in("id", classIds) : { data: [], error: null };
    const classNames = new Map((classRows.data || []).map((row) => [row.id, row.name]));
    const classesByDoc = new Map();
    (associations.data || []).forEach((row) => { const arr = classesByDoc.get(row.document_id) || []; const name = classNames.get(row.class_id); if (name && !arr.includes(name)) arr.push(name); classesByDoc.set(row.document_id, arr); });
    if (!data?.length) {
      const empty = document.createElement("p");
      empty.className = "admin-document-empty";
      empty.textContent = "Aucun document en attente de validation.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren();
    data.forEach((doc) => {
      const card = document.createElement("article");
      card.className = "pending-document";
      const title = document.createElement("h3");
      title.textContent = doc.title || "Document sans titre";
      const meta = document.createElement("p");
      const type = ({ sujet: "Sujet", corrige: "Corrigé", cours: "Cours", autre: "Autre" })[doc.document_type] || "Document";
      const linkedClasses = classesByDoc.get(doc.id) || [doc.class_offerings?.display_name || [doc.school_classes?.name, doc.series?.name].filter(Boolean).join(" ")];
      meta.textContent = [type, linkedClasses.join(" / "), doc.subjects?.name, doc.exam_year, doc.sequence_number ? "Séquence " + doc.sequence_number : ""].filter(Boolean).join(" · ");
      const description = document.createElement("p");
      description.textContent = doc.description || "Aucune description.";
      const fileInfo = document.createElement("p");
      const attached = doc.document_files?.[0];
      if (attached) {
        const { data: signed, error: signedError } = await client.storage
          .from(attached.bucket_id).createSignedUrl(attached.storage_path, 3600);
        if (!signedError && signed?.signedUrl) {
          const fileLink = document.createElement("a");
          fileLink.href = signed.signedUrl;
          fileLink.target = "_blank";
          fileLink.rel = "noopener noreferrer";
          fileLink.textContent = "Consulter le fichier : " + (attached.original_name || "ouvrir le document");
          fileInfo.append(fileLink);
        } else {
          fileInfo.textContent = "Fichier joint, mais aperçu temporairement indisponible.";
        }
      } else {
        fileInfo.textContent = "Aucun fichier joint détecté.";
      }
      const actions = document.createElement("div");
      actions.className = "pending-document-actions";
      actions.append(
        makeAction("Publier", "document-approve", (button) => moderate(doc.id, "publish", button)),
        makeAction("Refuser", "document-reject", (button) => moderate(doc.id, "reject", button))
      );
      card.append(title, meta, description, fileInfo, actions);
      list.append(card);
    });
  }
  await Promise.all([loadStats(), loadPending()]);
})();
