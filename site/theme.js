const themeButton = document.querySelector("[data-theme-toggle]");
const themeStorageKey = "murta-theme";
const themeCookieKey = "murta_theme";
const lightWarningKey = "murta-light-warning-shown";
const hasThemeJoke = document.body.hasAttribute("data-theme-joke");
const themeChannel = "BroadcastChannel" in window ? new BroadcastChannel("murta-theme") : null;

function readThemeCookie() {
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${themeCookieKey}=`));
  return cookie ? cookie.split("=")[1] : null;
}

function savedTheme() {
  try {
    const storedTheme = localStorage.getItem(themeStorageKey);
    if (storedTheme === "dark" || storedTheme === "light") return storedTheme;
  } catch {
    // Some local previews block localStorage; the cookie below is the fallback.
  }

  const cookieTheme = readThemeCookie();
  return cookieTheme === "dark" || cookieTheme === "light" ? cookieTheme : null;
}

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function updateButton(theme) {
  themeButton.textContent = theme === "dark" ? "light mode" : "dark mode";
  themeButton.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
}

function setTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  updateButton(theme);

  if (persist) {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Cookie persistence still works in many restrictive preview contexts.
    }

    document.cookie = `${themeCookieKey}=${theme}; max-age=31536000; path=/; SameSite=Lax`;
    themeChannel?.postMessage(theme);
  }
}

function warningWasShown() {
  try {
    return sessionStorage.getItem(lightWarningKey) === "true";
  } catch {
    return false;
  }
}

function rememberWarning() {
  try {
    sessionStorage.setItem(lightWarningKey, "true");
  } catch {
    // The joke still works without session persistence.
  }
}

function showLightModeDialog(allowLight) {
  const dialog = document.createElement("dialog");
  dialog.className = "theme-dialog";
  dialog.innerHTML = allowLight
    ? "<section><h2>if you want it that much just tell us....</h2><p>This website is not appropriate for it though lol</p><button type=\"button\">turn on light mode</button></section>"
    : "<section><h2>tf are you doing? who uses light mode in 2026?</h2><p>We’ll assume you misclicked.</p><button type=\"button\">lol my bad</button></section>";

  const confirmButton = dialog.querySelector("button");
  confirmButton.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
    if (allowLight) setTheme("light", true);
  });
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  confirmButton.focus();
}

if (themeButton) {
  setTheme(savedTheme() || systemTheme());

  themeButton.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;

    if (current === "dark" && hasThemeJoke) {
      const hasSeenWarning = warningWasShown();
      if (!hasSeenWarning) rememberWarning();
      showLightModeDialog(hasSeenWarning);
      return;
    }

    setTheme(current === "dark" ? "light" : "dark", true);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === themeStorageKey && (event.newValue === "dark" || event.newValue === "light")) {
      setTheme(event.newValue);
    }
  });

  if (themeChannel) {
    themeChannel.addEventListener("message", (event) => {
      if (event.data === "dark" || event.data === "light") setTheme(event.data);
    });
  }
}
