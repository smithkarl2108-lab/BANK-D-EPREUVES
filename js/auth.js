/* Authentification BANK D'EPREUVES — Supabase Auth */
"use strict";

(() => {
  const config = window.BANK_SUPABASE_CONFIG;
  const supabaseLib = window.supabase;
  const message = document.getElementById("authMessage");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const resetForm = document.getElementById("resetForm");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const year = document.getElementById("authYear");
  if (year) year.textContent = new Date().getFullYear();

  if (!config?.url || !config?.publishableKey || !supabaseLib?.createClient) {
    showMessage("La connexion au service est momentanément indisponible. Réessaie plus tard.", "error");
    return;
  }

  const client = supabaseLib.createClient(config.url, config.publishableKey);
  let recoveryMode = new URLSearchParams(window.location.search).get("mode") === "reset";

  function showMessage(text, type = "info") {
    if (!message) return;
    message.textContent = text;
    message.className = `auth-message ${type}`;
    message.hidden = false;
  }

  function hideMessage() {
    if (message) message.hidden = true;
  }

  function setBusy(form, busy) {
    const button = form?.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = busy;
      button.dataset.originalText ||= button.textContent;
      button.textContent = busy ? "Patiente un instant…" : button.dataset.originalText;
    }
  }

  function switchMode(mode) {
    hideMessage();
    recoveryMode = false;
    loginForm.hidden = mode !== "login";
    signupForm.hidden = mode !== "signup";
    resetForm.hidden = true;
    loginTab.classList.toggle("active", mode === "login");
    signupTab.classList.toggle("active", mode === "signup");
  }

  async function redirectToAccount() {
    window.location.href = "espace.html";
  }

  loginTab?.addEventListener("click", () => switchMode("login"));
  signupTab?.addEventListener("click", () => switchMode("signup"));

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();
    setBusy(loginForm, true);
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    setBusy(loginForm, false);
    if (error) return showMessage(error.message, "error");
    await redirectToAccount();
  });

  signupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();
    const fullName = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmation = document.getElementById("signupConfirm").value;
    if (password !== confirmation) return showMessage("Les deux mots de passe ne correspondent pas.", "error");
    setBusy(signupForm, true);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + "/connexion.html"
      }
    });
    setBusy(signupForm, false);
    if (error) return showMessage(error.message, "error");
    if (data.session) {
      showMessage("Ton compte est créé. Bienvenue sur BANK D'EPREUVES !", "success");
      window.setTimeout(redirectToAccount, 900);
    } else {
      showMessage("Inscription enregistrée ! Consulte ta boîte e-mail pour confirmer ton adresse avant de te connecter.", "success");
      signupForm.reset();
    }
  });

  document.getElementById("forgotPassword")?.addEventListener("click", async () => {
    hideMessage();
    const email = document.getElementById("loginEmail").value.trim();
    if (!email) return showMessage("Saisis d'abord ton adresse e-mail dans le champ de connexion.", "info");
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/connexion.html?mode=reset"
    });
    if (error) return showMessage(error.message, "error");
    showMessage("Un lien de réinitialisation vient d'être envoyé si cette adresse correspond à un compte.", "success");
  });

  if (recoveryMode) {
    loginForm.hidden = true;
    signupForm.hidden = true;
    resetForm.hidden = false;
    loginTab.classList.remove("active");
    signupTab.classList.remove("active");
  }

  resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();
    const password = document.getElementById("newPassword").value;
    setBusy(resetForm, true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(resetForm, false);
    if (error) return showMessage(error.message, "error");
    showMessage("Ton mot de passe a été modifié. Tu peux maintenant te connecter.", "success");
    resetForm.hidden = true;
    loginForm.hidden = false;
    loginTab.classList.add("active");
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) showMessage("Impossible de vérifier la session : " + error.message, "error");
    else if (data.session && !recoveryMode) redirectToAccount();
  });
})();
