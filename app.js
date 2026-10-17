const SESSION_KEY = "billo_session";
const API_HOST = window.location.hostname || "localhost";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API_ORIGIN = window.location.port === "3434"
  ? window.location.origin
  : `${API_PROTOCOL}//${API_HOST}:3434`;
const API_USERS = `${API_ORIGIN}/users`;
const API_ARTICLES = `${API_ORIGIN}/article`;
const API_AUTHOR_REQUESTS = `${API_ORIGIN}/authorRequests`;

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

async function refreshSessionRoles(session) {
  const endpoint = session.id
    ? `${API_USERS}/${encodeURIComponent(session.id)}`
    : `${API_USERS}?email=${encodeURIComponent(session.email)}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Unable to refresh account roles");
  const result = await response.json();
  const account = Array.isArray(result)
    ? result.find(user => user.email === session.email)
    : result;
  if (!account) throw new Error("Account not found");

  const refreshedSession = {
    ...session,
    id: account.id,
    email: account.email,
    auteur: account.auteur === true || account.auteur === "true",
    admin: account.admin === true || account.admin === "true"
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(refreshedSession));
  return refreshedSession;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatArticleDate(date) {
  const parsedDate = new Date(date);
  return Number.isNaN(parsedDate.getTime())
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(parsedDate);
}

function showPageError(container, message) {
  container.innerHTML = `<p class="notice notice-error" role="alert">${escapeHtml(message)}</p>`;
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
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        id: account.id,
        email: account.email,
        auteur: account.auteur === true,
        admin: account.admin === true
      }));
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
        body: JSON.stringify({ email, mdp: hashPassword(password, poivre, sel), auteur: false, admin: false, poivre, sel })
      });
      if (!response.ok) throw new Error("Registration failed");
      const account = await response.json();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        id: account.id,
        email: account.email,
        auteur: account.auteur === true,
        admin: account.admin === true
      }));
      window.location.assign("index.html");
    } catch {
      setError(error, "Impossible de joindre le serveur. Vérifiez qu’il est lancé avec npm start.");
    }
  });
}

async function initHomePage() {
  let session = getSession();
  if (!session) {
    window.location.replace("auth.html");
    return;
  }

  try {
    session = await refreshSessionRoles(session);
  } catch {
    // Keep the cached session usable while the API is temporarily unavailable.
  }

  const greeting = document.querySelector("#home-greeting");
  greeting.textContent = session.email ? `Bienvenue, ${session.email}.` : "Bienvenue dans votre espace.";
  document.querySelector("#logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("auth.html");
  });
  const authorLink = document.querySelector("#write-article-link");
  if (authorLink && session.auteur === true) authorLink.hidden = false;
  const adminLink = document.querySelector("#admin-link");
  if (adminLink && session.admin === true) adminLink.hidden = false;
  const validationLink = document.querySelector("#validation-link");
  if (validationLink && session.admin === true) validationLink.hidden = false;
  initAuthorRequest(session);
}

async function initAuthorRequest(session) {
  const section = document.querySelector("#author-request-section");
  if (!section || session.auteur === true || session.admin === true) return;

  const form = document.querySelector("#author-request-form");
  const status = document.querySelector("#author-request-status");
  const error = document.querySelector("#author-request-error");
  section.hidden = false;

  async function loadRequest() {
    const response = await fetch(`${API_AUTHOR_REQUESTS}?userId=${encodeURIComponent(session.id)}`);
    if (!response.ok) throw new Error("Request lookup failed");
    const requests = await response.json();
    return requests.sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())[0];
  }

  try {
    const request = await loadRequest();
    if (request?.status === "pending") {
      status.textContent = "Votre demande est en attente de validation par un administrateur.";
      status.className = "author-request-status is-pending";
      return;
    }
    if (request?.status === "approved") {
      status.textContent = "Votre demande a été acceptée. Vous pouvez maintenant écrire des articles.";
      status.className = "author-request-status is-approved";
      return;
    }
    if (request?.status === "rejected") {
      status.textContent = "Votre précédente demande a été refusée. Vous pouvez en envoyer une nouvelle.";
      status.className = "author-request-status is-rejected";
    }
    form.hidden = false;
  } catch {
    status.textContent = "Impossible de vérifier vos demandes. Réessayez plus tard.";
    status.className = "author-request-status is-rejected";
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    if (!form.reportValidity()) return;

    const request = {
      userId: session.id,
      email: session.email,
      justification: form.elements.justification.value.trim(),
      status: "pending",
      date: new Date().toISOString()
    };
    try {
      const response = await fetch(API_AUTHOR_REQUESTS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!response.ok) throw new Error("Request submission failed");
      status.textContent = "Votre demande a bien été envoyée à l’administration.";
      status.className = "author-request-status is-pending";
      form.reset();
      form.hidden = true;
    } catch {
      error.textContent = "Impossible d’envoyer votre demande. Vérifiez que le serveur est lancé avec npm start.";
    }
  });
}

async function initArticlesPage() {
  const session = getSession();
  const container = document.querySelector("#article-list");
  const writeLink = document.querySelector("#write-article-link");
  const adminLink = document.querySelector("#admin-link");
  const validationLink = document.querySelector("#validation-link");
  const accountLink = document.querySelector("#account-link");
  if (writeLink && session?.auteur === true) writeLink.hidden = false;
  if (adminLink && session?.admin === true) adminLink.hidden = false;
  if (validationLink && session?.admin === true) validationLink.hidden = false;
  if (accountLink) accountLink.textContent = session ? "Mon espace" : "Se connecter";
  if (accountLink) accountLink.href = session ? "index.html" : "auth.html";

  try {
    const response = await fetch(API_ARTICLES);
    if (!response.ok) throw new Error("API unavailable");
    const articles = await response.json();
    const visibleArticles = articles
      .filter(article => article.publier === true)
      .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());

    if (visibleArticles.length === 0) {
      container.innerHTML = '<div class="empty-state"><span aria-hidden="true">✳</span><h2>Aucun article pour le moment</h2><p>Les nouveaux articles apparaîtront ici.</p></div>';
      return;
    }

    container.innerHTML = visibleArticles.map(article => `
      <article class="article-card">
        <div class="article-card-meta">
          <time datetime="${escapeHtml(article.date)}">${escapeHtml(formatArticleDate(article.date))}</time>
        </div>
        <h2>${escapeHtml(article.titre || "Sans titre")}</h2>
        <p class="article-card-body">${escapeHtml(article.article || "")}</p>
      </article>`).join("");
  } catch {
    showPageError(container, "Impossible de charger les articles. Vérifiez que le serveur est lancé avec npm start.");
  }
}

async function initAdminPage() {
  let session = getSession();
  if (!session) {
    window.location.replace("auth.html");
    return;
  }

  try {
    session = await refreshSessionRoles(session);
  } catch {
    // Continue with the cached administrator session while the API is temporarily unavailable.
  }

  const accessMessage = document.querySelector("#admin-access-message");
  const dashboard = document.querySelector("#admin-dashboard");
  if (session.admin !== true) {
    accessMessage.hidden = false;
    return;
  }
  dashboard.hidden = false;

  const regularUsersList = document.querySelector("#regular-users-list");
  const authorsList = document.querySelector("#authors-list");
  const adminsList = document.querySelector("#admins-list");
  const articlesList = document.querySelector("#admin-articles");
  const feedback = document.querySelector("#admin-feedback");

  async function loadAdminData() {
    regularUsersList.innerHTML = '<p class="loading-message">Chargement…</p>';
    authorsList.innerHTML = '<p class="loading-message">Chargement…</p>';
    adminsList.innerHTML = '<p class="loading-message">Chargement…</p>';
    articlesList.innerHTML = '<p class="loading-message">Chargement des articles…</p>';
    try {
      const [usersResponse, articlesResponse] = await Promise.all([fetch(API_USERS), fetch(API_ARTICLES)]);
      if (!usersResponse.ok || !articlesResponse.ok) throw new Error("API unavailable");
      const [users, articles] = await Promise.all([usersResponse.json(), articlesResponse.json()]);

      const renderUsers = group => group.length ? group.map(user => `
        <div class="admin-row">
          <div class="admin-row-main"><strong>${escapeHtml(user.email)}</strong></div>
          <button class="danger-button" type="button" data-action="delete-user" data-id="${escapeHtml(user.id)}" ${user.id === session.id || (!session.id && user.email === session.email) ? "disabled title=\"Vous ne pouvez pas supprimer votre propre compte connecté.\"" : ""}>Supprimer</button>
        </div>`).join("") : '<p class="empty-admin">Aucun compte dans cette catégorie.</p>';
      const admins = users.filter(user => user.admin === true);
      const authors = users.filter(user => user.admin !== true && user.auteur === true);
      const regularUsers = users.filter(user => user.admin !== true && user.auteur !== true);
      regularUsersList.innerHTML = renderUsers(regularUsers);
      authorsList.innerHTML = renderUsers(authors);
      adminsList.innerHTML = renderUsers(admins);

      articles.sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());
      articlesList.innerHTML = articles.length ? articles.map(article => `
        <div class="admin-row">
          <div class="admin-row-main">
            <strong>${escapeHtml(article.titre || "Sans titre")}</strong>
            <span class="admin-row-meta">${escapeHtml(formatArticleDate(article.date))} · ${article.publier === true ? "Publié" : "Brouillon"}</span>
          </div>
          <div class="admin-row-actions">
            <button class="publish-button" type="button" data-action="toggle-publish" data-id="${escapeHtml(article.id)}" data-published="${article.publier === true}">${article.publier === true ? "Dépublier" : "Publier"}</button>
            <button class="danger-button" type="button" data-action="delete-article" data-id="${escapeHtml(article.id)}">Supprimer</button>
          </div>
        </div>`).join("") : '<p class="empty-admin">Aucun article.</p>';
    } catch {
      showPageError(regularUsersList, "Impossible de charger les données d’administration. Vérifiez que le serveur est lancé avec npm start.");
      authorsList.innerHTML = "";
      adminsList.innerHTML = "";
      articlesList.innerHTML = "";
    }
  }

  dashboard.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    const kind = action === "delete-user" ? "cet utilisateur" : "cet article";
    if (action.startsWith("delete-") && !window.confirm(`Voulez-vous vraiment supprimer ${kind} ?`)) return;

    button.disabled = true;
    feedback.textContent = "";
    try {
      let response;
      if (action === "toggle-publish") {
        response = await fetch(`${API_ARTICLES}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publier: button.dataset.published !== "true" })
        });
      } else {
        const endpoint = action === "delete-user" ? API_USERS : API_ARTICLES;
        response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      if (!response.ok) throw new Error("Admin action failed");
      feedback.textContent = action === "toggle-publish"
        ? "Statut de publication mis à jour."
        : "Suppression effectuée.";
      await loadAdminData();
    } catch {
      feedback.textContent = "Action impossible. Vérifiez que le serveur est lancé avec npm start.";
      button.disabled = false;
    }
  });

  await loadAdminData();
}

async function initValidationPage() {
  let session = getSession();
  if (!session) {
    window.location.replace("auth.html");
    return;
  }
  try {
    session = await refreshSessionRoles(session);
  } catch {
    // Use cached role values while the API is temporarily unavailable.
  }

  const accessMessage = document.querySelector("#validation-access-message");
  const dashboard = document.querySelector("#validation-dashboard");
  if (session.admin !== true) {
    accessMessage.hidden = false;
    return;
  }
  dashboard.hidden = false;

  const summary = document.querySelector("#validation-summary");
  const list = document.querySelector("#validation-list");
  const pagination = document.querySelector("#validation-pagination");
  const feedback = document.querySelector("#validation-feedback");
  const pageSize = 5;
  let requests = [];
  let currentPage = 1;

  function renderRequests() {
    const pageCount = Math.ceil(requests.length / pageSize);
    currentPage = Math.min(currentPage, Math.max(pageCount, 1));
    const startIndex = (currentPage - 1) * pageSize;
    const pageRequests = requests.slice(startIndex, startIndex + pageSize);

    summary.textContent = requests.length
      ? `${requests.length} demande${requests.length === 1 ? "" : "s"} · page ${currentPage} sur ${pageCount}`
      : "Aucune demande à traiter.";
    list.innerHTML = pageRequests.length ? pageRequests.map(request => `
      <article class="validation-card">
        <div class="validation-card-heading">
          <div class="admin-row-main">
            <strong>${escapeHtml(request.email || "Compte inconnu")}</strong>
            <span class="admin-row-meta">${escapeHtml(formatArticleDate(request.date))}</span>
          </div>
          <span class="request-status status-${escapeHtml(request.status)}">${request.status === "pending" ? "En attente" : request.status === "approved" ? "Acceptée" : "Refusée"}</span>
        </div>
        <p class="request-justification">${escapeHtml(request.justification || "Aucune justification fournie.")}</p>
        ${request.status === "pending" ? `<div class="admin-row-actions validation-actions">
          <button class="publish-button" type="button" data-action="resolve-author-request" data-decision="approved" data-request-id="${escapeHtml(request.id)}" data-user-id="${escapeHtml(request.userId)}">Accepter</button>
          <button class="danger-button" type="button" data-action="resolve-author-request" data-decision="rejected" data-request-id="${escapeHtml(request.id)}">Refuser</button>
        </div>` : ""}
      </article>`).join("") : '<div class="empty-state"><span aria-hidden="true">✳</span><h2>Aucune demande pour le moment</h2><p>Les demandes des utilisateurs apparaîtront ici.</p></div>';

    pagination.hidden = pageCount <= 1;
    pagination.innerHTML = pageCount > 1 ? `
      <button class="pagination-button" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>← Précédent</button>
      <div class="pagination-pages" aria-label="Choisir une page">${Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        return `<button class="pagination-page${page === currentPage ? " is-current" : ""}" type="button" data-page="${page}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`;
      }).join("")}</div>
      <button class="pagination-button" type="button" data-page="${currentPage + 1}" ${currentPage === pageCount ? "disabled" : ""}>Suivant →</button>` : "";
  }

  async function loadRequests() {
    list.innerHTML = '<p class="loading-message">Chargement des demandes…</p>';
    try {
      const response = await fetch(API_AUTHOR_REQUESTS);
      if (!response.ok) throw new Error("Request loading failed");
      requests = await response.json();
      requests.sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());
      renderRequests();
    } catch {
      showPageError(list, "Impossible de charger les demandes. Vérifiez que le serveur est lancé avec npm start.");
      pagination.hidden = true;
      summary.textContent = "";
    }
  }

  pagination.addEventListener("click", event => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    renderRequests();
  });

  list.addEventListener("click", async event => {
    const button = event.target.closest('button[data-action="resolve-author-request"]');
    if (!button || button.disabled) return;
    if (button.dataset.decision === "rejected" && !window.confirm("Voulez-vous vraiment refuser cette demande ?")) return;

    button.disabled = true;
    feedback.textContent = "";
    try {
      if (button.dataset.decision === "approved") {
        const userResponse = await fetch(`${API_USERS}/${encodeURIComponent(button.dataset.userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auteur: true })
        });
        if (!userResponse.ok) throw new Error("Author approval failed");
      }
      const response = await fetch(`${API_AUTHOR_REQUESTS}/${encodeURIComponent(button.dataset.requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: button.dataset.decision, reviewedAt: new Date().toISOString() })
      });
      if (!response.ok) throw new Error("Request update failed");
      feedback.textContent = button.dataset.decision === "approved"
        ? "Demande acceptée : le compte est maintenant auteur."
        : "Demande refusée.";
      await loadRequests();
    } catch {
      feedback.textContent = "Action impossible. Vérifiez que le serveur est lancé avec npm start.";
      button.disabled = false;
    }
  });

  await loadRequests();
}

async function initWriteArticlePage() {
  let session = getSession();
  const accessMessage = document.querySelector("#author-access-message");
  const form = document.querySelector("#article-form");

  if (!session) {
    window.location.replace("auth.html");
    return;
  }

  try {
    session = await refreshSessionRoles(session);
  } catch {
    accessMessage.querySelector("h2").textContent = "Vérification impossible";
    accessMessage.querySelector("p").textContent = "Le rôle de votre compte n’a pas pu être vérifié. Vérifiez la connexion au serveur puis rechargez la page.";
    accessMessage.hidden = false;
    return;
  }

  if (session.auteur !== true) {
    accessMessage.hidden = false;
    return;
  }

  form.hidden = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.querySelector("#article-error");
    const success = document.querySelector("#article-success");
    error.textContent = "";
    success.textContent = "";
    if (!form.reportValidity()) return;

    const article = {
      titre: form.elements.titre.value.trim(),
      article: form.elements.article.value.trim(),
      date: new Date().toISOString(),
      publier: form.elements.publier.checked
    };

    try {
      const response = await fetch(API_ARTICLES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(article)
      });
      if (!response.ok) throw new Error("Article creation failed");
      window.location.assign("articles.html");
    } catch {
      error.textContent = "Impossible d’enregistrer l’article. Vérifiez que le serveur est lancé avec npm start.";
    }
  });
}

if (document.body.dataset.page === "auth") initAuthPage();
if (document.body.dataset.page === "home") initHomePage();
if (document.body.dataset.page === "articles") initArticlesPage();
if (document.body.dataset.page === "write-article") initWriteArticlePage();
if (document.body.dataset.page === "admin") initAdminPage();
if (document.body.dataset.page === "validation") initValidationPage();