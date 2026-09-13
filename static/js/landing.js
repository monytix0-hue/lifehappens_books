import {
  auth,
  onAuthStateChanged,
  ensureAnalytics,
  trackEvent,
  signInWithGoogle,
  firebaseSignOut,
  describeAuthError,
  ensureReaderProfile,
} from "./firebase-client.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

document.addEventListener("contextmenu", (e) => e.preventDefault());

const authStatus = document.getElementById("auth-status");
const authError = document.getElementById("auth-error");
const googleBtn = document.getElementById("btn-google");
const signedOut = document.getElementById("signed-out");
const signedIn = document.getElementById("signed-in");
const signedInEmail = document.getElementById("signed-in-email");
const emailForm = document.getElementById("email-auth-form");
const modeToggle = document.getElementById("auth-mode-toggle");
const submitBtn = document.getElementById("email-submit");
let signupMode = false;

function setBusy(busy) {
  if (googleBtn) googleBtn.disabled = busy;
  if (submitBtn) submitBtn.disabled = busy;
}

function showError(message) {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message || "";
}

function setStatus(message) {
  if (authStatus) authStatus.textContent = message;
}

function renderAuth(user) {
  if (user) {
    const name = user.displayName || user.email || "Reader";
    setStatus(`Signed in as ${name}`);
    if (signedInEmail) signedInEmail.textContent = `Signed in as ${name}`;
    if (signedOut) signedOut.hidden = true;
    if (signedIn) signedIn.hidden = false;
  } else {
    setStatus("Sign in to unlock the protected reader");
    if (signedOut) signedOut.hidden = false;
    if (signedIn) signedIn.hidden = true;
  }
}

if (modeToggle) {
  modeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    signupMode = !signupMode;
    modeToggle.textContent = signupMode
      ? "Already have an account? Sign in"
      : "Need an account? Create one";
    if (submitBtn) submitBtn.textContent = signupMode ? "Create account" : "Sign in with email";
    showError("");
  });
}

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    showError("");
    setBusy(true);
    setStatus("Signing in with Google…");
    try {
      const { user } = await signInWithGoogle();
      renderAuth(user);
      window.location.href = "/read.html";
    } catch (err) {
      setStatus("Sign in to unlock the protected reader");
      showError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  });
}

if (emailForm) {
  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    setBusy(true);
    setStatus(signupMode ? "Creating account…" : "Signing in…");
    try {
      const cred = signupMode
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      await ensureReaderProfile(cred.user);
      await trackEvent("login", { method: "password" });
      renderAuth(cred.user);
      window.location.href = "/read.html";
    } catch (err) {
      setStatus("Sign in to unlock the protected reader");
      showError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  });
}

const signOutBtn = document.getElementById("btn-signout");
if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await firebaseSignOut();
    window.location.href = "/";
  });
}

ensureAnalytics().then(() => trackEvent("landing_view"));

onAuthStateChanged(auth, async (user) => {
  renderAuth(user);
  if (user) {
    try {
      await ensureReaderProfile(user);
    } catch (_) {}
  }
});
