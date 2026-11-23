/* Espace privé, changement obligatoire après reset et gestion admin. */
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


  if (session.user.app_metadata?.must_change_password === true) {
    document.getElementById("changePasswordPanel").hidden = false;
    document.getElementById("accountCard").hidden = true;
    document.getElementById("exploreLink").hidden = true;
    document.getElementById("changePasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("newPassword").value;
      const confirmation = document.getElementById("confirmNewPassword").value;
      if (password !== confirmation) return say("Les deux mots de passe ne correspondent pas.", "error");
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const { data: { session: currentSession } } = await client.auth.getSession();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.publishableKey,
            Authorization: "Bearer " + currentSession.access_token,
          },
          body: JSON.stringify({ action: "change-password", password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Le changement de mot de passe a échoué.");
        say(result.message, "success");
        await client.auth.refreshSession();
        window.location.reload();
      } catch (error) {
        say(error.message, "error");
        button.disabled = false;
      }
    });
    return;
  }

  async function loadRequests() {
    const target = document.getElementById("resetRequests");
    try {
      const { data: { session: currentSession } } = await client.auth.getSession();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: "Bearer " + currentSession.access_token,
        },
        body: JSON.stringify({ action: "admin-list" })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Impossible de charger les demandes.");
      if (!result.requests.length) {
        target.textContent = "Aucune demande en attente.";
        return;
      }
      target.replaceChildren();
      result.requests.forEach((item) => {
        const user = item.profiles || {};
        const row = document.createElement("div");
        row.className = "reset-request-row";
        const info = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = user.display_name || user.username || "Utilisateur";
        const detail = document.createElement("p");
        detail.textContent = "@" + (user.username || "identifiant inconnu") +
          (user.phone_number ? " · " + user.phone_number : " · Aucun téléphone renseigné");
        info.append(title, detail);

        const actions = document.createElement("div");
        actions.className = "reset-request-actions";
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
        actions.append(approve, reject);
        row.append(info, actions);
        target.append(row);
      });
    } catch (error) {
      target.textContent = error.message;
    }
  }

  async function review(id, decision, button) {
    button.disabled = true;
    try {
      const { data: { session: currentSession } } = await client.auth.getSession();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: "Bearer " + currentSession.access_token,
        },
        body: JSON.stringify({ action: "admin-reset", requestId: id, decision })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "La demande n'a pas pu être traitée.");
      if (result.temporaryPassword) {
        const box = document.getElementById("temporaryPasswordBox");
        box.hidden = false;
        box.replaceChildren();
        const label = document.createElement("p");
        label.textContent = "Mot de passe temporaire — copie-le maintenant et transmets-le une seule fois à l'utilisateur :";
        const code = document.createElement("code");
        code.textContent = result.temporaryPassword;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "text-action";
        copy.textContent = "Copier le mot de passe";
        copy.addEventListener("click", async () => {
          await navigator.clipboard.writeText(result.temporaryPassword);
          copy.textContent = "Copié";
        });
        box.append(label, code, copy);
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
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) say("La déconnexion a échoué : " + error.message, "error");
    else window.location.replace("connexion.html");
  });
})();
