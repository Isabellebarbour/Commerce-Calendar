const USERS_STORAGE = "comcal-users";
const SESSION_STORAGE = "comcal-session";

function loadUsers() {
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_STORAGE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE, JSON.stringify(users));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE) || "null");
  } catch {
    return null;
  }
}

function setSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE);
    return;
  }
  localStorage.setItem(SESSION_STORAGE, JSON.stringify(session));
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? new Uint8Array(hexToBuffer(saltHex))
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return {
    salt: bufferToHex(salt.buffer || salt),
    hash: bufferToHex(bits),
  };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function signUp({ firstName, lastName, graduationDate, email, password }) {
  const cleanedEmail = normalizeEmail(email);
  const cleanedFirst = String(firstName || "").trim();
  const cleanedLast = String(lastName || "").trim();
  const cleanedGrad = String(graduationDate || "").trim();
  const cleanedName = [cleanedFirst, cleanedLast].filter(Boolean).join(" ");

  if (!cleanedFirst) throw new Error("Enter your first name.");
  if (!cleanedLast) throw new Error("Enter your last name.");
  if (!cleanedGrad) throw new Error("Enter your graduation date.");
  if (!cleanedEmail || !cleanedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const users = loadUsers();
  if (users.some((user) => user.email === cleanedEmail)) {
    throw new Error("An account with that email already exists. Try signing in.");
  }

  const { salt, hash } = await hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name: cleanedName,
    firstName: cleanedFirst,
    lastName: cleanedLast,
    graduationDate: cleanedGrad,
    email: cleanedEmail,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);

  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    graduationDate: user.graduationDate,
  };
  setSession(session);
  return session;
}

async function logIn({ email, password }) {
  const cleanedEmail = normalizeEmail(email);
  const users = loadUsers();
  const user = users.find((row) => row.email === cleanedEmail);
  if (!user) throw new Error("No account found for that email.");

  const { hash } = await hashPassword(password, user.salt);
  if (hash !== user.hash) throw new Error("Incorrect password.");

  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    graduationDate: user.graduationDate || "",
  };
  setSession(session);
  return session;
}

function logOut() {
  setSession(null);
}

function isLoggedIn() {
  const session = getSession();
  if (!session?.userId) return false;
  return loadUsers().some((user) => user.id === session.userId);
}

window.ComCalAuth = {
  signUp,
  logIn,
  logOut,
  getSession,
  isLoggedIn,
};
