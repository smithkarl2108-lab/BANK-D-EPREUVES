/* Authentification par identifiant — aucune adresse e-mail demandée à l'utilisateur. */
"use strict";
(() => {
  const config = window.BANK_SUPABASE_CONFIG;
  const lib = window.supabase;
  const message = document.getElementById("authMessage");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const requestResetForm = document.getElementById("requestResetForm");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const year = document.getElementById("authYear");
  if (year) year.textContent = new Date().getFullYear();

  if (!config?.url || !config?.publishableKey || !lib?.createClient) {
    showMessage("Le service de compte est momentanément indisponible.", "error");
    return;
  }
  const client = lib.createClient(config.url, config.publishableKey);
  const endpoint = config.url + "/functions/v1/account";

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = "auth-message " + type;
    message.hidden = false;
  }
  function hideMessage() { message.hidden = true; }
  function busy(form, value) {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = value;
      button.dataset.label ||= button.textContent;
      button.textContent = value ? "Patiente un instant…" : button.dataset.label;
    }
  }
  async function callAccount(payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
    return result;
  }
  function switchMode(mode) {
    hideMessage();
    loginForm.hidden = mode !== "login";
    signupForm.hidden = mode !== "signup";
    requestResetForm.hidden = mode !== "reset";
    loginTab.classList.toggle("active", mode === "login");
    signupTab.classList.toggle("active", mode === "signup");
  }
  loginTab.addEventListener("click", () => switchMode("login"));
  signupTab.addEventListener("click", () => switchMode("signup"));
  document.getElementById("forgotPassword").addEventListener("click", () => {
    document.getElementById("resetUsername").value = document.getElementById("loginUsername").value.trim();
    switchMode("reset");
  });
  document.getElementById("backToLogin").addEventListener("click", () => switchMode("login"));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); hideMessage(); busy(loginForm, true);
    try {
      const result = await callAccount({
        action: "login",
        username: document.getElementById("loginUsername").value,
        password: document.getElementById("loginPassword").value
      });
      const { error } = await client.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      if (error) throw error;
      window.location.href = "espace.html";
    } catch (error) {
      showMessage(error.message || "Connexion impossible.", "error");
    } finally {
      busy(loginForm, false);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault(); hideMessage();
    const password = document.getElementById("signupPassword").value;
    if (password !== document.getElementById("signupConfirm").value) {
      return showMessage("Les deux mots de passe ne correspondent pas.", "error");
    }
    busy(signupForm, true);
    try {
      const result = await callAccount({
        action: "signup",
        fullName: document.getElementById("signupName").value,
        username: document.getElementById("signupUsername").value,
        phoneNumber: document.getElementById("signupPhone").value,
        password
      });
      signupForm.reset();
      switchMode("login");
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message || "Création du compte impossible.", "error");
    } finally {
      busy(signupForm, false);
    }
  });

  requestResetForm.addEventListener("submit", async (event) => {
    event.preventDefault(); hideMessage(); busy(requestResetForm, true);
    try {
      const result = await callAccount({
        action: "request-reset",
        username: document.getElementById("resetUsername").value
      });
      requestResetForm.reset();
      switchMode("login");
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message || "Envoi de la demande impossible.", "error");
    } finally {
      busy(requestResetForm, false);
    }
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.replace("espace.html");
  });
})();