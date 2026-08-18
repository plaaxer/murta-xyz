(function applyInitialTheme() {
  const storageKey = "murta-theme";
  const cookieKey = "murta_theme";
  let theme = null;

  try {
    theme = localStorage.getItem(storageKey);
  } catch {
    // Cookies and the system preference remain available as fallbacks.
  }

  if (theme !== "dark" && theme !== "light") {
    try {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${cookieKey}=`));
      theme = cookie?.split("=")[1];
    } catch {
      // Some local and privacy-focused contexts block cookie access.
    }
  }

  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  document.documentElement.dataset.theme = theme;
})();
