const POSTS_API_URL = window.MURTA_CONFIG?.postsApiUrl || "";
const COGNITO_CLIENT_ID = window.MURTA_CONFIG?.cognitoClientId || "";
const COGNITO_DOMAIN = window.MURTA_CONFIG?.cognitoDomain || "";
const tokenStorageKey = "murta-owner-tokens";
const verifierStorageKey = "murta-owner-pkce-verifier";
const stateStorageKey = "murta-owner-oauth-state";

const views = document.querySelectorAll(".posts-view");
const indexView = document.querySelector("#posts-index");
const postView = document.querySelector("#post-view");
const writeView = document.querySelector("#write-view");
let posts = [];
let activePost = null;
let loadError = false;

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomValue(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

function readTokens() {
  try {
    const tokens = JSON.parse(sessionStorage.getItem(tokenStorageKey));
    if (!tokens?.access_token || Date.now() >= tokens.expiresAt) return null;
    return tokens;
  } catch {
    return null;
  }
}

async function beginSignIn() {
  if (!COGNITO_CLIENT_ID || !COGNITO_DOMAIN) throw new Error("Cognito configuration is missing.");
  const verifier = randomValue(48);
  const state = randomValue();
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem(verifierStorageKey, verifier);
  sessionStorage.setItem(stateStorageKey, state);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "openid email",
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${query}`);
}

async function finishSignIn() {
  const query = new URLSearchParams(location.search);
  const code = query.get("code");
  if (!code) return;
  const expectedState = sessionStorage.getItem(stateStorageKey);
  const verifier = sessionStorage.getItem(verifierStorageKey);
  if (!expectedState || query.get("state") !== expectedState || !verifier) {
    throw new Error("The sign-in response could not be verified. Please sign in again.");
  }
  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: redirectUri(),
      code,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error("Cognito could not complete sign-in.");
  const tokens = await response.json();
  tokens.expiresAt = Date.now() + (tokens.expires_in * 1000) - 30000;
  sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  sessionStorage.removeItem(verifierStorageKey);
  sessionStorage.removeItem(stateStorageKey);
  history.replaceState({}, "", `${location.pathname}#write`);
}

function renderOwnerState(message = "") {
  const tokens = readTokens();
  const gate = document.querySelector("#owner-gate");
  const editor = document.querySelector("#post-editor");
  gate.hidden = Boolean(tokens);
  editor.hidden = !tokens;
  if (message) document.querySelector("#owner-gate p").textContent = message;
}

async function apiError(response, fallback) {
  try {
    const payload = await response.json();
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function showView(view) {
  views.forEach((item) => { item.hidden = item !== view; });
  window.scrollTo({ top: 0, behavior: "instant" });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function allComments(post) { return post.comments || []; }

function makeTag(tag) {
  const item = document.createElement("li");
  item.textContent = tag;
  return item;
}

function renderStats() {
  document.querySelector("#thread-count").textContent = posts.length;
  document.querySelector("#reply-count").textContent = posts.reduce((sum, post) => sum + allComments(post).length, 0);
}

function renderPosts() {
  const list = document.querySelector("#post-list");
  list.replaceChildren();
  posts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";
    const content = document.createElement("div");
    const meta = document.createElement("p");
    meta.className = "status";
    meta.textContent = [formatDate(post.publishedAt), ...(post.tags || [])].join(" / ");
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = `#post/${post.slug}`;
    link.textContent = post.title;
    title.append(link);
    content.append(meta, title);
    const stats = document.createElement("div");
    stats.className = "post-stats";
    const count = allComments(post).length;
    stats.innerHTML = `<b>${count}</b>${count === 1 ? "reply" : "replies"}`;
    card.append(content, stats);
    list.append(card);
  });
  const empty = document.querySelector("#empty-posts");
  empty.textContent = loadError ? "Posts could not be loaded. Please try again later." : "No posts published yet.";
  empty.hidden = posts.length !== 0;
}

function renderComments(post) {
  const comments = allComments(post);
  const list = document.querySelector("#comment-list");
  list.replaceChildren();
  document.querySelector("#comment-count").textContent = `(${comments.length})`;
  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No replies yet. You can fix that.";
    list.append(empty);
    return;
  }
  comments.forEach((comment) => {
    const article = document.createElement("article");
    article.className = "comment";
    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const author = document.createElement("b");
    author.textContent = comment.name;
    const time = document.createElement("time");
    time.dateTime = comment.createdAt;
    time.textContent = formatDate(comment.createdAt);
    meta.append(author, time);
    if (readTokens()) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-control";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete reply";
      deleteButton.addEventListener("click", () => deleteComment(post, comment));
      meta.append(deleteButton);
    }
    const body = document.createElement("p");
    body.textContent = comment.body;
    article.append(meta, body);
    list.append(article);
  });
}

function renderPost(post) {
  activePost = post;
  document.title = `${post.title} - murta`;
  document.querySelector("#post-meta").textContent = `POSTED ${formatDate(post.publishedAt)} / FELIPE MURTA`;
  document.querySelector("#post-title").textContent = post.title;
  document.querySelector("#post-tags").replaceChildren(...(post.tags || []).map(makeTag));
  document.querySelector("#delete-post").hidden = !readTokens();
  const body = document.querySelector("#post-body");
  body.replaceChildren(...post.body.map((paragraph) => {
    const element = document.createElement("p");
    element.textContent = paragraph;
    return element;
  }));
  renderComments(post);
  showView(postView);
}

async function authenticatedDelete(path) {
  const tokens = readTokens();
  if (!tokens) throw new Error("Your owner session expired. Please sign in again.");
  const response = await fetch(`${POSTS_API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!response.ok) throw new Error(await apiError(response, "Delete failed"));
}

async function deleteComment(post, comment) {
  if (!confirm(`Delete ${comment.name}'s reply? This cannot be undone.`)) return;
  const status = document.querySelector("#comment-status");
  try {
    await authenticatedDelete(`/posts/${encodeURIComponent(post.slug)}/comments/${encodeURIComponent(comment.id)}`);
    post.comments = allComments(post).filter((item) => item.id !== comment.id);
    renderComments(post);
    renderStats();
    status.textContent = "Reply deleted.";
  } catch (error) {
    status.textContent = error.message;
  }
}

document.querySelector("#delete-post").addEventListener("click", async () => {
  if (!activePost || !confirm(`Delete “${activePost.title}” and all of its replies? This cannot be undone.`)) return;
  const button = document.querySelector("#delete-post");
  button.disabled = true;
  try {
    await authenticatedDelete(`/posts/${encodeURIComponent(activePost.slug)}`);
    posts = posts.filter((post) => post.slug !== activePost.slug);
    activePost = null;
    location.hash = "";
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

function route() {
  const routeValue = location.hash.slice(1);
  if (routeValue === "write") { showView(writeView); return; }
  if (routeValue.startsWith("post/")) {
    const post = posts.find((item) => item.slug === routeValue.slice(5));
    if (post) { renderPost(post); return; }
  }
  document.title = "posts - murta";
  showView(indexView);
  renderStats();
  renderPosts();
}

document.querySelector("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const status = document.querySelector("#comment-status");
  if (data.get("website")) return;
  const comment = { id: crypto.randomUUID(), name: data.get("name").trim(), body: data.get("body").trim(), createdAt: new Date().toISOString() };
  try {
    if (!POSTS_API_URL) throw new Error("Comments will open when the posts API is deployed.");
    const response = await fetch(`${POSTS_API_URL}/posts/${activePost.slug}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...comment, email: data.get("email") }) });
    if (!response.ok) throw new Error(await apiError(response, "Reply could not be posted"));
    const savedComment = await response.json();
    activePost.comments = [...allComments(activePost), savedComment];
    form.reset();
    status.textContent = "Reply submitted.";
    renderComments(activePost);
    renderStats();
  } catch (error) { status.textContent = error.message; }
});

document.querySelector("#owner-sign-in").addEventListener("click", async () => {
  try {
    await beginSignIn();
  } catch (error) {
    renderOwnerState(error.message);
  }
});

document.querySelector("#post-editor").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const status = document.querySelector("#editor-status");
  const tokens = readTokens();
  if (!tokens) {
    renderOwnerState("Your owner session expired. Please sign in again.");
    return;
  }
  const post = {
    title: data.get("title").trim(),
    tags: data.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    body: data.get("body").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
  };
  status.textContent = "Publishing…";
  try {
    const response = await fetch(`${POSTS_API_URL}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(post),
    });
    if (!response.ok) throw new Error(await apiError(response, "Post could not be published"));
    const savedPost = await response.json();
    posts.unshift(savedPost);
    form.reset();
    status.textContent = "Published.";
    location.hash = `post/${savedPost.slug}`;
  } catch (error) {
    status.textContent = error.message;
  }
});

async function loadPosts() {
  try {
    await finishSignIn();
  } catch (error) {
    renderOwnerState(error.message);
  }
  renderOwnerState();
  if (POSTS_API_URL) {
    try {
      const response = await fetch(`${POSTS_API_URL}/posts`);
      if (!response.ok) throw new Error("Posts could not be loaded");
      const payload = await response.json();
      posts = Array.isArray(payload) ? payload : payload.items || [];
    } catch { loadError = true; }
  }
  route();
}

window.addEventListener("hashchange", route);
loadPosts();
