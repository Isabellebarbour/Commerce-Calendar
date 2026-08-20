const PROFILE_STORAGE = "comcal-profile";
const BANNER_STORAGE = "comcal-profile-banner";
const PHOTO_STORAGE = "comcal-profile-photo";
const DEFAULT_BANNER = "assets/profile-banner.png";

const DEFAULT_PROFILE = {
  name: "",
  email: "",
  program: "",
};

function loadProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(PROFILE_STORAGE) || "{}") || {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function loadBanner() {
  try {
    return localStorage.getItem(BANNER_STORAGE) || DEFAULT_BANNER;
  } catch {
    return DEFAULT_BANNER;
  }
}

function saveBanner(value) {
  localStorage.setItem(BANNER_STORAGE, value);
  window.ComCalCloud?.notifyChanged?.();
}

function loadPhoto() {
  try {
    const value = localStorage.getItem(PHOTO_STORAGE) || "";
    if (value.startsWith("data:image/")) return value;
    if (value) localStorage.removeItem(PHOTO_STORAGE);
    return "";
  } catch {
    return "";
  }
}

function savePhoto(value) {
  localStorage.setItem(PHOTO_STORAGE, value);
  window.ComCalCloud?.notifyChanged?.();
}

function readImageFile(file, onLoad) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result));
  reader.readAsDataURL(file);
}

function escapeProfile(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyAvatarPhoto(photo, img, placeholder, container) {
  const hasPhoto = Boolean(photo);
  if (img) {
    if (hasPhoto) {
      img.src = photo;
    } else {
      img.removeAttribute("src");
    }
  }
  container?.classList.toggle("has-photo", hasPhoto);
  if (img) img.hidden = !hasPhoto;
  if (placeholder) placeholder.hidden = hasPhoto;
}

function renderAvatars() {
  const photo = loadPhoto();
  applyAvatarPhoto(
    photo,
    document.getElementById("profile-photo-img"),
    document.getElementById("profile-photo-placeholder"),
    document.getElementById("profile-photo")
  );
  applyAvatarPhoto(
    photo,
    document.getElementById("sidebar-avatar-img"),
    document.getElementById("sidebar-avatar-placeholder"),
    document.getElementById("sidebar-avatar")
  );
}
function yearCardHtml(year) {
  return `<div class="profile-year${year.done ? " is-done" : ""}">
    <span class="profile-year-mark" aria-hidden="true">
      ${
        year.done
          ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#34a853" /><path d="m7.5 12.2 3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#e8e8e8" /></svg>`
      }
    </span>
    <span>${escapeProfile(year.label)}</span>
  </div>`;
}

function render() {
  const root = document.getElementById("page-profile");
  if (!root) return;

  const profile = loadProfile();
  const banner = document.getElementById("profile-banner");
  const nameEl = document.getElementById("profile-name");
  const programEl = document.getElementById("profile-program");
  const emailEl = document.getElementById("profile-email");
  const titleEl = document.getElementById("profile-progress-title");
  const fillEl = document.getElementById("profile-progress-fill");
  const yearsEl = document.getElementById("profile-years");

  if (banner) banner.style.backgroundImage = `url("${loadBanner()}")`;
  renderAvatars();
  if (nameEl) nameEl.textContent = profile.name;
  if (programEl) programEl.textContent = profile.program;
  if (emailEl) emailEl.textContent = profile.email;

  const progress = window.ComCalCurriculum?.getProgress?.() || {
    percent: 0,
    years: [1, 2, 3, 4].map((year) => ({ year, label: `Year ${year}`, done: false })),
  };
  if (titleEl) {
    titleEl.textContent = `You’re ${progress.percent}% complete with your BCom Degree`;
  }
  if (fillEl) fillEl.style.width = `${progress.percent}%`;
  if (yearsEl) yearsEl.innerHTML = progress.years.map(yearCardHtml).join("");
}

function bindProfile() {
  const edit = document.getElementById("profile-banner-edit");
  const file = document.getElementById("profile-banner-file");
  const photoBtn = document.getElementById("profile-photo");
  const photoFile = document.getElementById("profile-photo-file");
  const copy = document.getElementById("profile-copy-email");

  edit?.addEventListener("click", () => file?.click());
  file?.addEventListener("change", () => {
    readImageFile(file.files?.[0], (data) => {
      saveBanner(data);
      render();
    });
    file.value = "";
  });

  photoBtn?.addEventListener("click", () => photoFile?.click());
  photoFile?.addEventListener("change", () => {
    const file = photoFile.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      photoFile.value = "";
      return;
    }
    readImageFile(file, (data) => {
      if (!data.startsWith("data:image/")) return;
      savePhoto(data);
      render();
    });
    photoFile.value = "";
  });

  copy?.addEventListener("click", async () => {
    const email = document.getElementById("profile-email")?.textContent || "";
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      copy.classList.add("is-copied");
      window.setTimeout(() => copy.classList.remove("is-copied"), 1200);
    } catch {
      /* ignore */
    }
  });
}

bindProfile();
render();

window.ComCalProfile = { render };
