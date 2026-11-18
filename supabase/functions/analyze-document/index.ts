import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    document_type: { type: "string", enum: ["sujet", "corrige", "cours", "autre"] },
    class_name: { type: ["string", "null"] },
    subsystem_name: { type: ["string", "null"] },
    series_name: { type: ["string", "null"] },
    language_option: { type: ["string", "null"] },
    subject_name: { type: ["string", "null"] },
    exam_year: { type: ["integer", "null"] },
    sequence_number: { type: ["integer", "null"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    warnings: { type: "array", items: { type: "string" } },
    extracted_text_summary: { type: "string" },
  },
  required: ["title", "description", "document_type", "class_name", "subsystem_name", "series_name", "language_option", "subject_name", "exam_year", "sequence_number", "confidence", "warnings", "extracted_text_summary"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
        const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Session invalide." }, 401);
    const userId = authData.user.id;

    const { data: profile, error: profileError } = await userClient.from("profiles")
      .select("role,is_active").eq("id", userId).single();
    if (profileError || !profile?.is_active || !["admin", "teacher"].includes(profile.role)) {
      return json({ error: "Accès réservé aux enseignants actifs et à l'administration." }, 403);
    }

    const body = await req.json();
    const storagePath = String(body.storagePath ?? "");
    const mimeType = String(body.mimeType ?? "").toLowerCase();
    const fileName = String(body.fileName ?? "document").slice(0, 180);
    if (!storagePath.startsWith(userId + "/") || storagePath.includes("..")) {
      return json({ error: "Chemin de fichier invalide." }, 400);
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(mimeType)) return json({ error: "Format non pris en charge." }, 400);

    const { data: file, error: downloadError } = await userClient.storage.from("documents").download(storagePath);
    if (downloadError || !file) return json({ error: "Impossible de lire le fichier déposé." }, 400);
    if (file.size > 20 * 1024 * 1024) return json({ error: "Le fichier dépasse 20 Mo." }, 413);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "La clé OpenAI n'est pas encore configurée sur le serveur." }, 503);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const [{ data: classes }, { data: series }, { data: variants }, { data: offerings }, { data: links }, { data: subjects }] = await Promise.all([
      userClient.from("school_classes").select("id,name,subsystem_id,school_subsystems(name)").eq("is_active", true),
      userClient.from("series").select("id,name").eq("is_active", true),
      userClient.from("school_variants").select("id,name").eq("is_active", true),
      userClient.from("class_offerings").select("id,class_id,series_id,variant_id,display_name").eq("is_active", true),
      userClient.from("class_offering_subjects").select("offering_id,subject_id,is_optional,note").eq("is_active", true),
      userClient.from("subjects").select("id,name").eq("is_active", true),
    ]);

    const catalog = {
      classes: (classes ?? []).map((x: any) => ({ id: x.id, name: x.name, subsystem: x.school_subsystems?.name ?? null })),
      series: (series ?? []).map((x: any) => ({ id: x.id, name: x.name })),
      variants: (variants ?? []).map((x: any) => ({ id: x.id, name: x.name })),
      offerings: (offerings ?? []).map((o: any) => ({
        label: o.display_name,
        class_name: (classes ?? []).find((c: any) => c.id === o.class_id)?.name ?? null,
        series_name: (series ?? []).find((s: any) => s.id === o.series_id)?.name ?? null,
        language_option: (variants ?? []).find((v: any) => v.id === o.variant_id)?.name ?? null,
        allowed_subjects: (links ?? []).filter((link: any) => link.offering_id === o.id).map((link: any) => ({
          name: (subjects ?? []).find((s: any) => s.id === link.subject_id)?.name ?? null,
          optional: link.is_optional,
          note: link.note,
        })).filter((s: any) => s.name),
      })),
    };

    const prompt = `Tu es l'assistant de classement de BANK D'EPREUVES, plateforme scolaire camerounaise.
Analyse le document joint comme une épreuve ou ressource scolaire. Lis réellement le contenu, y compris les pages/images.
Identifie uniquement les informations visibles ou déductibles avec une forte confiance. N'invente jamais une classe, un sous-système, une série, une option linguistique, une matière, une année ou un numéro de séquence.
Réponds en français. Génère un titre court, précis et professionnel contenant la matière, la classe et la séquence/année lorsqu'elles sont identifiables.
Classe parmi sujet, corrige, cours, autre.
Sélectionne la combinaison de classe et d'orientation exacte dans le référentiel. Pour les séries A francophones, identifie l'option linguistique si elle est visible. Pour Lower Sixth et Upper Sixth, distingue Arts et Science. Pour subject_name, choisis exclusivement une matière figurant dans allowed_subjects de l'offre sélectionnée. N'invente aucune association. Si un élément est absent ou incertain, renvoie null et ajoute une alerte.
Référentiel actif : ${JSON.stringify(catalog)}
Le document s'appelle : ${fileName}
confidence est une confiance globale entre 0 et 100. Ajoute une alerte pour toute donnée absente, ambiguë, contradictoire, illisible ou hors référentiel. Si le document contient plusieurs matières ou plusieurs sujets, signale-le.
extracted_text_summary doit résumer brièvement le contenu effectivement lu.`;

    const content = mimeType === "application/pdf"
      ? [{ type: "input_text", text: prompt }, { type: "input_file", filename: fileName, file_data: dataUrl }]
      : [{ type: "input_text", text: prompt }, { type: "input_image", image_url: dataUrl, detail: "high" }];

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6.1-terra",
        store: false,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "bank_depreuves_document_analysis", strict: true, schema } },
        max_output_tokens: 1200,
      }),
    });
    const aiPayload = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI API error", aiPayload);
      return json({ error: "L'analyse IA a échoué. Vérifie la configuration et réessaie." }, 502);
    }
    const outputText = (aiPayload.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === "output_text")
      .map((part: any) => part.text)
      .join("\n");
    if (!outputText) return json({ error: "L'IA n'a retourné aucun résultat exploitable." }, 502);
    let analysis;
    try { analysis = JSON.parse(outputText); }
    catch { return json({ error: "Le résultat de l'analyse est illisible. Réessaie." }, 502); }

    return json({ success: true, analysis });
  } catch (error) {
    console.error("analyze-document error", error);
    return json({ error: error instanceof Error ? error.message : "Erreur inattendue pendant l'analyse." }, 500);
  }
});
