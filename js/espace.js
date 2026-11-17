/* Espace privé et interface de traitement des demandes de reset. */
"use strict";
(async () => {
  const config = window.BANK_SUPABASE_CONFIG;
  const lib = window.supabase;
  const message = document.getElementById("accountMessage");
  const say = (text, type = "info") => {
    message.textContent = text;
    message.className = "auth-message " + type;
    message.hidden = false;
  };
  if (!config || !lib?.createClient) {
    say("Le service de compte est indisponible.", "error");
    return;
  }

  const client = lib.createClient(config.url, config.publishableKey);
  const endpoint = config.url + "/functions/v1/account";
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.replace("connexion.html");
    return;
  }

  const { data: profile, error } = await client.from("profiles")
    .select("display_name,username,role,is_active")
    .eq("id", session.user.id).single();

  if (error || !profile) {
    say("Ton profil n'est pas encore disponible. Contacte l'administration.", "error");
    return;
  }
  if (!profile.is_active) {
    await client.auth.signOut();
    say("Ce compte est désactivé. Contacte l'administration.", "error");
    return;
  }

  document.getElementById("welcomeTitle").textContent =
    "Bienvenue, " + (profile.display_name || "sur BANK D'EPREUVES") + " !";
  document.getElementById("accountIdentity").textContent =
    "Identifiant : " + (profile.username || "non défini") + " · " +
    ({ student: "Élève", teacher: "Intervenant", admin: "Administrateur" }[profile.role] || "Utilisateur");

  async function accountCall(payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        Authorization: "Bearer " + session.access_token
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  async function loadRequests() {
    const target = document.getElementById("resetRequests");
    try {
      const result = await accountCall({ action: "admin-list" });
      if (!result.requests.length) {
        target.textContent = "Aucune demande en attente.";
        return;
      }
      target.replaceChildren();
      result.requests.forEach((item) => {
        const user = item.profiles || {};
        const row = document.createElement("div");
        row.className = "account-card";
        row.style.marginTop = "12px";

        const info = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = user.display_name || user.username || "Utilisateur";
        const detail = document.createElement("p");
        detail.textContent = "@" + (user.username || "identifiant inconnu") +
          (user.phone_number ? " · " + user.phone_number : " · Aucun téléphone renseigné");
        info.append(title, detail);

        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "auth-submit";
        approve.textContent = "Réinitialiser";
        approve.addEventListener("click", () => review(item.id, "approve", approve));

        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "text-action";
        reject.textContent = "Refuser";
        reject.addEventListener("click", () => review(item.id, "reject", reject));

        row.append(info, approve, reject);
        target.append(row);
      });
    } catch (error) {
      target.textContent = error.message;
    }
  }

  async function review(id, decision, button) {
    button.disabled = true;
    try {
      const result = await accountCall({ action: "admin-reset", requestId: id, decision });
      if (result.temporaryPassword) {
        const box = document.getElementById("temporaryPasswordBox");
        box.hidden = false;
        box.textContent =
          "Mot de passe temporaire (copie-le et transmets-le une seule fois) : " +
          result.temporaryPassword;
      }
      say(result.message, "success");
      await loadRequests();
    } catch (error) {
      say(error.message, "error");
      button.disabled = false;
    }
  }

  if (profile.role === "admin") {
    document.getElementById("adminResetPanel").hidden = false;
    await loadRequests();
    window.setInterval(loadRequests, 30000);
  }

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) say("La déconnexion a échoué : " + error.message, "error");
    else window.location.replace("connexion.html");
  });
})();