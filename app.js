const SESSION_KEY = "billo_session";
const API_USERS = "/users";

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setError(element, message) {
  element.textContent = message;
}

function hashPassword(password, poivre, sel) {
  return CryptoJS.MD5(`${password}${poivre}${sel}`).toString();
}

function randomHex(byteLength = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function initAuthPage() {
  if (getSession()) {
    window.location.replace("index.html");
    return;
  }

  const tabs = Array.from(document.querySelectorAll("[data-mode]"));
  const loginForm = document.querySelector("#login-form");
  const signupForm = document.querySelector("#signup-form");
  const title = document.querySelector("#form-title");
  const intro = document.querySelector("#form-intro");

  function setMode(mode) {
    const signup = mode === "signup";
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    title.textContent = signup ? "Créer un compte" : "Connexion";
    intro.textContent = signup ? "Quelques détails et votre espace est prêt." : "Retrouvez votre espace personnel.";
    tabs.forEach(tab => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelector("#login-error").textContent = "";
    document.querySelector("#signup-error").textContent = "";
  }

  tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = loginForm.elements.email.value.trim().toLowerCase();
    const password = loginForm.elements.password.value;
    const error = document.querySelector("#login-error");
    setError(error, "");

    if (!loginForm.reportValidity()) return;
    try {
      const response = await fetch(`${API_USERS}?email=${encodeURIComponent(email)}`);
      if (!response.ok) throw new Error("API unavailable");
      const accounts = await response.json();
      const account = accounts[0];
      if (!account) {
        setError(error, "Aucun compte associé à cette adresse. Créez votre compte pour continuer.");
        return;
      }
      if (hashPassword(password, account.poivre, account.sel) !== account.mdp) {
        setError(error, "Mot de passe incorrect.");
        return;
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: account.email, auteur: account.auteur }));
      window.location.assign("index.html");
    } catch {
      setError(error, "Impossible de joindre le serveur. Vérifiez qu’il est lancé avec npm start.");
    }
  });

  signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.querySelector("#signup-error");
    setError(error, "");
    if (!signupForm.reportValidity()) return;

    const email = signupForm.elements.email.value.trim().toLowerCase();
    const password = signupForm.elements.password.value;
    const poivre = randomHex();
    const sel = randomHex();

    try {
      const existingResponse = await fetch(`${API_USERS}?email=${encodeURIComponent(email)}`);
      if (!existingResponse.ok) throw new Error("API unavailable");
      const existingAccounts = await existingResponse.json();
      if (existingAccounts.length > 0) {
        setError(error, "Un compte existe déjà avec cette adresse e-mail.");
        return;
      }

      const response = await fetch(API_USERS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mdp: hashPassword(password, poivre, sel), auteur: false, poivre, sel })
      });
      if (!response.ok) throw new Error("Registration failed");
      const account = await response.json();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: account.email, auteur: account.auteur }));
      window.location.assign("index.html");
    } catch {
      setError(error, "Impossible de joindre le serveur. Vérifiez qu’il est lancé avec npm start.");
    }
  });
}

function initHomePage() {
  const session = getSession();
  if (!session) {
    window.location.replace("auth.html");
    return;
  }

  const greeting = document.querySelector("#home-greeting");
  greeting.textContent = session.email ? `Bienvenue, ${session.email}.` : "Bienvenue dans votre espace.";
  document.querySelector("#logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("auth.html");
  });
}

if (document.body.dataset.page === "auth") initAuthPage();
if (document.body.dataset.page === "home") initHomePage();