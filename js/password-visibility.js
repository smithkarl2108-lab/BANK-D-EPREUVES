/* Bouton afficher/masquer pour tous les champs mot de passe. */
"use strict";
(() => {
  const eyeOpen = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeClosed = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.8 15.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.8 10.8 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function addPasswordToggle(input) {
    if (input.dataset.visibilityReady === "true") return;
    input.dataset.visibilityReady = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle";
    toggle.innerHTML = eyeOpen;
    toggle.setAttribute("aria-label", "Afficher le mot de passe");
    toggle.setAttribute("aria-pressed", "false");
    toggle.title = "Afficher le mot de passe";
    toggle.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      toggle.innerHTML = visible ? eyeClosed : eyeOpen;
      toggle.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
      toggle.setAttribute("aria-pressed", String(visible));
      toggle.title = visible ? "Masquer le mot de passe" : "Afficher le mot de passe";
      input.focus();
    });
    wrapper.appendChild(toggle);
  }

  document.querySelectorAll('input[type="password"]').forEach(addPasswordToggle);
})();
