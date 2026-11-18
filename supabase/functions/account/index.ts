import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
function validUsername(value: string) {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}
async function getAuthenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Connexion requise.");
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) throw new Error("Session invalide. Reconnecte-toi.");
  const { data: profile } = await admin.from("profiles")
    .select("id,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) throw new Error("Ce compte est désactivé ou indisponible.");
  return { user, profile };
}
async function requireAdmin(req: Request) {
  const { user, profile } = await getAuthenticatedUser(req);
  if (profile.role !== "admin") throw new Error("Accès réservé à l'administration.");
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "signup") {
      const username = normalizeUsername(body.username);
      const fullName = String(body.fullName ?? "").trim();
      const phoneNumber = String(body.phoneNumber ?? "").trim();
      const password = String(body.password ?? "");
      if (!validUsername(username)) return json({ error: "L'identifiant doit contenir 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore." }, 400);
      if (fullName.length < 2 || fullName.length > 80) return json({ error: "Saisis ton nom complet (2 à 80 caractères)." }, 400);
      if (password.length < 8 || password.length > 72) return json({ error: "Le mot de passe doit contenir entre 8 et 72 caractères." }, 400);
      if (phoneNumber.length > 30) return json({ error: "Numéro de téléphone invalide." }, 400);

      const { data: existing } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (existing) return json({ error: "Cet identifiant est déjà utilisé. Choisis-en un autre." }, 409);

      const internalEmail = `${crypto.randomUUID()}@auth.bankdepreuves.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, username, phone_number: phoneNumber },
      });
      if (createError || !created.user) return json({ error: createError?.message ?? "Création du compte impossible." }, 400);

      const { error: profileError } = await admin.from("profiles").update({
        username, phone_number: phoneNumber || null, display_name: fullName,
      }).eq("id", created.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Le profil n'a pas pu être créé. Réessaie." }, 500);
      }
      return json({ success: true, message: "Compte créé. Tu peux maintenant te connecter avec ton identifiant." });
    }

    if (action === "login") {
      const username = normalizeUsername(body.username);
      const password = String(body.password ?? "");
      if (!validUsername(username) || !password) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
      const { data: profile } = await admin.from("profiles")
        .select("id,is_active").ilike("username", username).maybeSingle();
      if (!profile?.id || !profile.is_active) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
      const { data: authUser, error: userError } = await admin.auth.admin.getUserById(profile.id);
      if (userError || !authUser.user?.email) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ email: authUser.user.email, password }),
      });
      const session = await response.json();
      if (!response.ok) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
      return json({ session });
    }

    if (action === "request-reset") {
      const username = normalizeUsername(body.username);
      if (validUsername(username)) {
        const { data: profile } = await admin.from("profiles")
          .select("id,is_active").ilike("username", username).maybeSingle();
        if (profile?.id && profile.is_active) {
          const { data: pending } = await admin.from("password_reset_requests")
            .select("id").eq("user_id", profile.id).eq("status", "pending").maybeSingle();
          if (!pending) await admin.from("password_reset_requests").insert({ user_id: profile.id });
        }
      }
      return json({ success: true, message: "Si cet identifiant existe, la demande a été transmise à l'administration." });
    }

    if (action === "change-password") {
      const { user } = await getAuthenticatedUser(req);
      const password = String(body.password ?? "");
      if (password.length < 8 || password.length > 72) {
        return json({ error: "Le nouveau mot de passe doit contenir entre 8 et 72 caractères." }, 400);
      }
      const { data: current, error: getError } = await admin.auth.admin.getUserById(user.id);
      if (getError || !current.user) return json({ error: "Impossible de vérifier le compte." }, 500);
      const appMetadata = { ...(current.user.app_metadata ?? {}), must_change_password: false };
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password, app_metadata: appMetadata,
      });
      if (error) return json({ error: "Le changement de mot de passe a échoué." }, 500);
      return json({ success: true, message: "Mot de passe modifié. Tu peux maintenant accéder à ton espace." });
    }

    if (action === "admin-list") {
      await requireAdmin(req);
      const { data, error } = await admin.from("password_reset_requests")
        .select("id,status,created_at,profiles!password_reset_requests_user_id_fkey(display_name,username,phone_number)")
        .eq("status", "pending").order("created_at", { ascending: true });
      if (error) return json({ error: "Impossible de charger les demandes." }, 500);
      return json({ requests: data ?? [] });
    }

    if (action === "admin-reset") {
      const reviewer = await requireAdmin(req);
      const requestId = String(body.requestId ?? "");
      const decision = String(body.decision ?? "approve");
      if (!/^[0-9a-f-]{36}$/i.test(requestId) || !["approve", "reject"].includes(decision)) {
        return json({ error: "Demande ou décision invalide." }, 400);
      }
      const { data: request } = await admin.from("password_reset_requests")
        .select("id,user_id,status").eq("id", requestId).maybeSingle();
      if (!request || request.status !== "pending") return json({ error: "Cette demande n'est plus en attente." }, 404);

      if (decision === "reject") {
        const { error } = await admin.from("password_reset_requests").update({
          status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id,
        }).eq("id", requestId).eq("status", "pending");
        if (error) return json({ error: "Impossible de clôturer cette demande." }, 500);
        return json({ success: true, message: "Demande refusée." });
      }

      const bytes = crypto.getRandomValues(new Uint8Array(18));
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@";
      const temporaryPassword = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(request.user_id);
      if (targetError || !target.user) return json({ error: "Compte utilisateur introuvable." }, 404);
      const appMetadata = { ...(target.user.app_metadata ?? {}), must_change_password: true };
      const { error: resetError } = await admin.auth.admin.updateUserById(request.user_id, {
        password: temporaryPassword, app_metadata: appMetadata,
      });
      if (resetError) return json({ error: "La réinitialisation a échoué." }, 500);

      const { error: updateError } = await admin.from("password_reset_requests").update({
        status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id,
      }).eq("id", requestId).eq("status", "pending");
      if (updateError) {
        return json({
          success: true, temporaryPassword,
          message: "Mot de passe réinitialisé, mais la demande n'a pas pu être clôturée. Transmets immédiatement le mot de passe à l'utilisateur et signale le problème à l'administrateur technique.",
        });
      }
      return json({
        success: true, temporaryPassword,
        message: "Mot de passe temporaire généré. Transmets-le à l'utilisateur par un canal privé ; il devra le modifier à sa prochaine connexion.",
      });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur est survenue.";
    const status = message.includes("réservé") || message.includes("Connexion") || message.includes("Session") ? 403 : 400;
    return json({ error: message }, status);
  }
});
