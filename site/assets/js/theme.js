const themeButton = document.querySelector("[data-theme-toggle]");
const themeStorageKey = "murta-theme";
const themeCookieKey = "murta_theme";
const lightWarningKey = "murta-light-warning-shown";
const hasThemeJoke = document.body.hasAttribute("data-theme-joke");
const themeChannel = "BroadcastChannel" in window ? new BroadcastChannel("murta-theme") : null;

function readThemeCookie() {
  try {
    const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${themeCookieKey}=`));
    return cookie ? cookie.split("=")[1] : null;
  } catch {
    return null;
  }
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
  const targetTheme = theme === "dark" ? "light" : "dark";
  themeButton.title = `Switch to ${targetTheme} mode`;
  themeButton.setAttribute("aria-label", `Switch to ${targetTheme} mode`);
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
    // The warning still works without session persistence.
  }
}

function showLightModeDialog(allowLight) {
  document.querySelector(".theme-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "theme-dialog";
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const copy = document.createElement("p");
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";

  heading.textContent = allowLight ? "if you want it that much just tell us...." : "tf are you doing? who uses light mode in 2026?";
  copy.textContent = allowLight ? "This website is not appropriate for it though lol" : "We’ll assume you misclicked.";
  confirmButton.textContent = allowLight ? "turn on light mode" : "lol my bad";
  section.append(heading, copy, confirmButton);
  dialog.append(section);

  function closeDialog() {
    dialog.close();
    dialog.remove();
    updateButton(document.documentElement.dataset.theme);
  }

  confirmButton.addEventListener("click", () => {
    if (allowLight) setTheme("light", true);
    closeDialog();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  document.body.append(dialog);
  dialog.showModal();
  confirmButton.focus();
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

    try {
      document.cookie = `${themeCookieKey}=${theme}; max-age=31536000; path=/; SameSite=Lax`;
    } catch {
      // localStorage remains the primary persistence mechanism.
    }
    themeChannel?.postMessage(theme);
  }
}

if (themeButton) {
  setTheme(document.documentElement.dataset.theme || savedTheme() || systemTheme());

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

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
    if (!savedTheme()) setTheme(event.matches ? "light" : "dark");
  });
}
