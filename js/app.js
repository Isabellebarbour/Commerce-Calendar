const navButtons = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll(".page");
const sidebarButtons = document.querySelectorAll(".nav-item");

let authMode = "login"; // login | signup

function showPage(pageId) {
  pages.forEach((page) => {
    page.classList.toggle("is-active", page.id === `page-${pageId}`);
  });

  sidebarButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === pageId);
  });

  if (pageId === "calendar") {
    window.ComCalCalendar?.reload();
  }
  if (pageId === "assignments") {
    window.ComCalAssignments?.render();
  }
  if (pageId === "grades") {
    window.ComCalGrades?.render();
  }
  if (pageId === "profile") {
    window.ComCalProfile?.render();
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

function initPageFromHash() {
  const initialPage = location.hash.replace("#", "");
  if (initialPage && document.getElementById(`page-${initialPage}`)) {
    showPage(initialPage);
  }
}

function setAuthStatus(message, isError = false) {
  const status = document.getElementById("auth-status");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", !!isError);
}

function syncAuthFormMode() {
  const title = document.getElementById("auth-title");
  const copy = document.getElementById("auth-copy");
  const submit = document.getElementById("auth-submit");
  const switchBtn = document.getElementById("auth-switch");
  const dialog = document.querySelector(".auth-dialog");
  const password = document.getElementById("auth-password");
  const isSignup = authMode === "signup";

  if (title) title.textContent = isSignup ? "Create an account" : "Login";
  if (copy) {
    copy.hidden = true;
    copy.textContent = "";
  }
  if (submit) submit.textContent = isSignup ? "CREATE ACCOUNT" : "SIGN IN";
  if (switchBtn) {
    switchBtn.textContent = isSignup
      ? "Already have an account? Login"
      : "Need an account? Sign up";
  }
  document.querySelectorAll(".auth-signup-only").forEach((field) => {
    field.hidden = !isSignup;
  });
  const gradSelect = document.getElementById("auth-grad-date");
  if (gradSelect) {
    gradSelect.required = isSignup;
    if (!isSignup) gradSelect.value = "";
  }
  dialog?.classList.toggle("is-signup", isSignup);
  if (password) {
    password.autocomplete = isSignup ? "new-password" : "current-password";
  }
  setAuthStatus("");
}

function openAuthModal(mode = "login") {
  authMode = mode;
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  syncAuthFormMode();
  modal.hidden = false;
  const focusId = mode === "signup" ? "auth-first-name" : "auth-email";
  document.getElementById(focusId)?.focus();
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.hidden = true;
  setAuthStatus("");
  document.getElementById("auth-form")?.reset();
}

function applySessionToProfile(session) {
  if (!session) return;
  try {
    const raw = JSON.parse(localStorage.getItem("comcal-profile") || "{}");
    const program = session.graduationDate
      ? `BCOM – ${session.graduationDate}, BCom`
      : raw.program || "";
    const next = {
      ...raw,
      name: session.name || raw.name || "",
      email: session.email || raw.email || "",
      program: program || raw.program || "",
    };
    localStorage.setItem("comcal-profile", JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.ComCalProfile?.render?.();
}

function updateLandingParallax() {
  if (!document.body.classList.contains("is-landing")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const hero = document.querySelector(".landing-hero");
  const img = document.querySelector(".landing-hero-img");
  const overlay = document.querySelector(".landing-hero-overlay");
  if (!hero || !img) return;

  const rect = hero.getBoundingClientRect();
  const heroHeight = hero.offsetHeight || 1;
  // How far the hero has moved up the viewport while still partly visible
  const scrolled = Math.min(Math.max(-rect.top, 0), heroHeight);
  // Image drifts downward as you scroll (Smith-style parallax)
  const imgOffset = scrolled * 0.45;
  const titleOffset = scrolled * 0.18;

  img.style.transform = `translate3d(0, ${imgOffset}px, 0)`;
  if (overlay) {
    overlay.style.transform = `translate3d(0, ${titleOffset}px, 0)`;
  }
}

function bindLandingParallax() {
  if (window.__comcalLandingParallaxBound) return;
  window.__comcalLandingParallaxBound = true;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateLandingParallax();
      ticking = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  updateLandingParallax();
}

function showApp() {
  const landing = document.getElementById("landing");
  const app = document.getElementById("app-shell");
  document.body.classList.remove("is-landing");
  document.body.classList.add("is-app");
  if (landing) landing.hidden = true;
  if (app) app.hidden = false;
  closeAuthModal();
  initPageFromHash();
}

function showLanding() {
  const landing = document.getElementById("landing");
  const app = document.getElementById("app-shell");
  document.body.classList.add("is-landing");
  document.body.classList.remove("is-app");
  if (landing) landing.hidden = false;
  if (app) app.hidden = true;
  closeAuthModal();
  requestAnimationFrame(updateLandingParallax);
}

function refreshAuthGate() {
  if (window.ComCalAuth?.isLoggedIn()) {
    const session = window.ComCalAuth.getSession();
    applySessionToProfile(session);
    showApp();
  } else {
    showLanding();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document.getElementById("auth-email")?.value || "";
  const password = document.getElementById("auth-password")?.value || "";
  const firstName = document.getElementById("auth-first-name")?.value || "";
  const lastName = document.getElementById("auth-last-name")?.value || "";
  const graduationDate = document.getElementById("auth-grad-date")?.value || "";
  const submit = document.getElementById("auth-submit");
  if (submit) submit.disabled = true;
  setAuthStatus(authMode === "signup" ? "Creating account…" : "Signing in…");

  try {
    const session =
      authMode === "signup"
        ? await window.ComCalAuth.signUp({
            firstName,
            lastName,
            graduationDate,
            email,
            password,
          })
        : await window.ComCalAuth.logIn({ email, password });
    applySessionToProfile(session);
    showApp();
  } catch (error) {
    setAuthStatus(error.message || "Something went wrong.", true);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function bindAuthUi() {
  document.getElementById("landing-login-open")?.addEventListener("click", () => {
    openAuthModal("login");
  });
  document.getElementById("landing-signup-open")?.addEventListener("click", () => {
    openAuthModal("signup");
  });
  document.getElementById("auth-cancel")?.addEventListener("click", closeAuthModal);
  document.getElementById("auth-switch")?.addEventListener("click", () => {
    openAuthModal(authMode === "signup" ? "login" : "signup");
  });
  document.getElementById("auth-form")?.addEventListener("submit", handleAuthSubmit);
  document.getElementById("auth-modal")?.addEventListener("click", (event) => {
    if (
      event.target.id === "auth-modal" ||
      event.target.classList.contains("auth-backdrop")
    ) {
      closeAuthModal();
    }
  });
  document.getElementById("app-logout")?.addEventListener("click", () => {
    window.ComCalAuth.logOut();
    showLanding();
  });
}

bindAuthUi();
bindLandingParallax();
refreshAuthGate();
setTimeout(initPageFromHash, 0);
