/* Dépôt de ressources par les intervenants et administrateurs. */
"use strict";
(async () => {
  const panel = document.getElementById("uploadDocumentPanel");
  const form = document.getElementById("uploadDocumentForm");
  if (!panel || !form) return;
  const config = window.BANK_SUPABASE_CONFIG;
  const lib = window.supabase;
  if (!config || !lib?.createClient) return;
  const client = lib.createClient(config.url, config.publishableKey);
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const { data: profile } = await client.from("profiles")
    .select("role,is_active").eq("id", session.user.id).single();
  if (!profile?.is_active || !["teacher", "admin"].includes(profile.role)) return;
  panel.hidden = false;

  const feedback = document.getElementById("uploadFeedback");
  const tell = (message, type = "info") => {
    feedback.textContent = message;
    feedback.className = "auth-message " + type;
    feedback.hidden = false;
  };
  async function fillSelect(id, table, firstLabel, orderBy = "name") {
    const select = document.getElementById(id);
    const { data, error } = await client.from(table).select("id,name")
      .eq("is_active", true).order(orderBy);
    if (error) throw error;
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = firstLabel;
    select.append(first);
    (data || []).forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.append(option);
    });
  }
  try {
    await Promise.all([
      fillSelect("uploadClass", "school_classes", "Choisir une classe"),
      fillSelect("uploadSeries", "series", "Aucune / sans série"),
      fillSelect("uploadSubject", "subjects", "Choisir une matière")
    ]);
  } catch (error) {
    tell("Impossible de charger les classes et matières : " + error.message, "error");
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("uploadSubmit");
    const file = document.getElementById("uploadFile").files[0];
    const title = document.getElementById("uploadTitle").value.trim();
    const description = document.getElementById("uploadDescription").value.trim();
    const classId = document.getElementById("uploadClass").value;
    const seriesId = document.getElementById("uploadSeries").value || null;
    const subjectId = document.getElementById("uploadSubject").value;
    const yearValue = document.getElementById("uploadYear").value;
    const sequenceValue = document.getElementById("uploadSequence").value;
    if (!file || !title || !classId || !subjectId) return tell("Complète les champs obligatoires et sélectionne un fichier.", "error");
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return tell("Format non accepté. Utilise un PDF, JPG, PNG ou WEBP.", "error");
    if (file.size > 20 * 1024 * 1024) return tell("Le fichier dépasse la limite de 20 Mo.", "error");
    if (file.size === 0) return tell("Le fichier est vide.", "error");

    button.disabled = true;
    button.textContent = "Envoi en cours…";
    tell("Préparation du dépôt…");
    let documentId = null;
    let storagePath = null;
    try {
      const { data: { session: current } } = await client.auth.getSession();
      if (!current) throw new Error("Ta session a expiré. Reconnecte-toi.");
      const documentData = {
        title, description: description || null,
        document_type: document.getElementById("uploadType").value,
        status: "pending",
        school_class_id: classId, series_id: seriesId, subject_id: subjectId,
        exam_year: yearValue ? Number(yearValue) : null,
        sequence_number: sequenceValue ? Number(sequenceValue) : null,
        uploader_id: current.user.id
      };
      const { data: doc, error: docError } = await client.from("documents")
        .insert(documentData).select("id").single();
      if (docError) throw docError;
      documentId = doc.id;
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      storagePath = current.user.id + "/" + documentId + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: storageError } = await client.storage.from("documents")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (storageError) throw storageError;
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const { error: fileError } = await client.from("document_files").insert({
        document_id: documentId,
        uploader_id: current.user.id,
        bucket_id: "documents",
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        sha256
      });
      if (fileError) throw fileError;
      form.reset();
      tell("Dépôt envoyé avec succès. Il est maintenant en attente de validation par l'administration.", "success");
    } catch (error) {
      if (storagePath) await client.storage.from("documents").remove([storagePath]);
      if (documentId) await client.from("documents").delete().eq("id", documentId);
      tell("Le dépôt a échoué : " + error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Envoyer pour validation →";
    }
  });
})();
