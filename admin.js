/* ============================================================
   admin.js — Rajshree College of Nursing · Admin Panel
   Vanilla JS. Reads/writes Firebase Firestore + Supabase Storage.
   Sections in this file:
     1. Imports & DOM refs
     2. Small UI utilities (toast, spinner, confirm modal)
     3. Validation & sanitization helpers
     4. Supabase storage helpers
     5. Authentication
     6. Sidebar navigation
     7. Hero Management
     8. Gallery Management
     9. Notice Management
    10. Contact Information
    11. Dashboard stats & bootstrap
   ============================================================ */

import {
  auth,
  db,
  supabaseClient,
  ADMIN_EMAIL,
  BUCKETS,
  COLLECTIONS,
  HERO_SLOT_COUNT,
  GALLERY_SLOT_COUNT,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_PDF_TYPES,
} from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   1. DOM REFERENCES
   ============================================================ */
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const toastContainer = document.getElementById("toastContainer");

const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");

const loginScreen = document.getElementById("loginScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");
const adminEmailDisplay = document.getElementById("adminEmailDisplay");

/* ============================================================
   2. UI UTILITIES
   ============================================================ */
function showLoading(text = "Working…") {
  loadingText.textContent = text;
  loadingOverlay.classList.remove("hidden");
}
function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const dot = document.createElement("span");
  dot.className = "dot";
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(dot);
  toast.appendChild(text);
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showConfirm(title, message, okLabel = "Confirm") {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = okLabel;
    confirmModal.classList.remove("hidden");

    function cleanup(result) {
      confirmModal.classList.add("hidden");
      confirmOkBtn.removeEventListener("click", onOk);
      confirmCancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    confirmOkBtn.addEventListener("click", onOk);
    confirmCancelBtn.addEventListener("click", onCancel);
  });
}
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) confirmCancelBtn.click();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!noticeModal.classList.contains("hidden")) closeNoticeModal();
  if (!confirmModal.classList.contains("hidden")) confirmCancelBtn.click();
});

/* ============================================================
   3. VALIDATION & SANITIZATION
   ============================================================ */
function sanitizeText(str) {
  return String(str ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .trim();
}

function validateImageFile(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return "Only JPG, PNG or WEBP images are allowed.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be smaller than 5MB.";
  return null;
}

function validatePdfFile(file) {
  if (!file) return null; // optional field
  if (!ALLOWED_PDF_TYPES.includes(file.type)) return "Only PDF files are allowed.";
  if (file.size > MAX_PDF_BYTES) return "PDF must be smaller than 10MB.";
  return null;
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  if (!dateStr || isNaN(d)) return { dd: "--", mon: "---" };
  return {
    dd: String(d.getDate()).padStart(2, "0"),
    mon: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
  };
}

function placeholderDataUri(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <rect width="100%" height="100%" fill="#0d1425"/>
    <text x="50%" y="50%" fill="#3b82f6" font-family="sans-serif" font-size="26" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ============================================================
   4. SUPABASE STORAGE HELPERS
   ============================================================ */

/** Replace-only upload for a FIXED slot (hero/gallery).
 *  Keeps the same base filename so old references stay valid;
 *  cleans up stale files if the extension changed, and
 *  cache-busts the returned URL so the new image shows immediately. */
async function replaceFixedSlotFile(bucket, baseName, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${baseName}.${ext}`;

  try {
    const { data: existing } = await supabaseClient.storage
      .from(bucket)
      .list("", { search: baseName });
    if (existing && existing.length) {
      const stale = existing
        .filter((f) => f.name.startsWith(`${baseName}.`) && f.name !== path)
        .map((f) => f.name);
      if (stale.length) await supabaseClient.storage.from(bucket).remove(stale);
    }
  } catch (e) {
    console.warn("Stale file cleanup skipped:", e);
  }

  const uploadPromise = supabaseClient.storage
    .from(bucket)
    .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out after 30s — check your internet connection or try a smaller photo.")), 30000)
  );
  const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
  if (uploadError) throw uploadError;

  const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return `${urlData.publicUrl}?v=${Date.now()}`;
}

/** Notices allow add/delete, so each PDF gets a unique path tied to its doc id. */
async function uploadNoticePdf(file, noticeId) {
  const path = `${noticeId}.pdf`;
  const { error } = await supabaseClient.storage
    .from(BUCKETS.notices)
    .upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(BUCKETS.notices).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, path };
}

async function deleteNoticePdf(path) {
  if (!path) return;
  try {
    await supabaseClient.storage.from(BUCKETS.notices).remove([path]);
  } catch (e) {
    console.warn("Failed to delete old PDF:", e);
  }
}

async function touchLastUpdated() {
  try {
    await setDoc(
      doc(db, COLLECTIONS.settings, "meta"),
      { lastUpdated: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.warn("Could not update lastUpdated:", e);
  }
}

/* ============================================================
   5. AUTHENTICATION
   ============================================================ */
function mapAuthError(err) {
  switch (err && err.code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

document.getElementById("togglePassword").addEventListener("click", () => {
  const input = document.getElementById("loginPassword");
  const btn = document.getElementById("togglePassword");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.textContent = show ? "🙈" : "👁";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    loginError.textContent = "This account is not authorized to access the admin panel.";
    loginError.classList.remove("hidden");
    return;
  }

  loginSubmitBtn.disabled = true;
  showLoading("Signing in…");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (cred.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      await signOut(auth);
      loginError.textContent = "This account is not authorized to access the admin panel.";
      loginError.classList.remove("hidden");
    }
    // onAuthStateChanged below takes care of showing the dashboard
  } catch (err) {
    loginError.textContent = mapAuthError(err);
    loginError.classList.remove("hidden");
  } finally {
    loginSubmitBtn.disabled = false;
    hideLoading();
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const ok = await showConfirm(
    "Log out?",
    "You'll need to sign in again to make further changes.",
    "Log out"
  );
  if (!ok) return;
  await signOut(auth);
  showToast("Logged out successfully.", "info");
});

let dashboardBooted = false;
onAuthStateChanged(auth, async (user) => {
  const isAuthorized = user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (isAuthorized) {
    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");
    adminEmailDisplay.textContent = user.email;
    if (!dashboardBooted) {
      dashboardBooted = true;
      bootDashboard();
    }
  } else {
    if (user) {
      // Signed in, but not the designated admin account — kick back to login.
      await signOut(auth);
    }
    dashboardScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginForm.reset();
  }
});

/* ============================================================
   6. SIDEBAR NAVIGATION
   ============================================================ */
const navItems = document.querySelectorAll(".nav-item");
const contentSections = document.querySelectorAll(".content-section");
const pageTitle = document.getElementById("pageTitle");
const appShell = document.getElementById("dashboardScreen");
const menuToggle = document.getElementById("menuToggle");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

const SECTION_TITLES = {
  dashboard: "Dashboard",
  hero: "Hero Management",
  gallery: "Gallery Management",
  notices: "Notice Management",
  contact: "Contact Information",
};

function goToSection(key) {
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.section === key));
  contentSections.forEach((sec) => sec.classList.toggle("is-active", sec.id === `section-${key}`));
  pageTitle.textContent = SECTION_TITLES[key] || "Dashboard";
  appShell.classList.remove("nav-open");
}

navItems.forEach((btn) => btn.addEventListener("click", () => goToSection(btn.dataset.section)));
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => goToSection(btn.dataset.goto));
});
menuToggle.addEventListener("click", () => appShell.classList.toggle("nav-open"));
sidebarBackdrop.addEventListener("click", () => appShell.classList.remove("nav-open"));

/* ============================================================
   7. HERO MANAGEMENT  (exactly HERO_SLOT_COUNT fixed slots)
   ============================================================ */
const heroGrid = document.getElementById("heroGrid");
const heroPendingFiles = {};

function renderHeroSlots() {
  heroGrid.innerHTML = "";
  for (let i = 1; i <= HERO_SLOT_COUNT; i++) {
    const slotId = `hero-${i}`;
    const card = document.createElement("div");
    card.className = "hero-card glass";

    card.innerHTML = `
      <div class="hero-card-media">
        <img id="img-${slotId}" alt="Hero slot ${i} preview" src="${placeholderDataUri("Hero " + i)}" />
        <span class="slot-badge">Slot ${i}</span>
        <div class="media-overlay">
          <button type="button" class="btn btn-secondary btn-sm replace-btn">Replace Image</button>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden-file-input" id="file-${slotId}" />
      </div>
      <div class="hero-card-body">
        <div class="field">
          <label for="title-${slotId}">Title</label>
          <input type="text" maxlength="120" id="title-${slotId}" placeholder="Banner title" />
        </div>
        <div class="field">
          <label for="desc-${slotId}">Description</label>
          <textarea rows="3" maxlength="300" id="desc-${slotId}" placeholder="Banner description"></textarea>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="save-${slotId}">Save Changes</button>
      </div>
    `;
    heroGrid.appendChild(card);

    const fileInput = card.querySelector(`#file-${slotId}`);
    const img = card.querySelector(`#img-${slotId}`);
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = placeholderDataUri("Hero " + i);
    });

    card.querySelector(".replace-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      const err = validateImageFile(file);
      if (err) {
        showToast(err, "error");
        fileInput.value = "";
        return;
      }
      heroPendingFiles[slotId] = file;
      img.src = URL.createObjectURL(file);
    });

    card.querySelector(`#save-${slotId}`).addEventListener("click", () => saveHeroSlot(slotId, i));
  }
}

async function loadHeroData() {
  for (let i = 1; i <= HERO_SLOT_COUNT; i++) {
    const slotId = `hero-${i}`;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.hero, slotId));
      const data = snap.exists() ? snap.data() : {};
      const img = document.getElementById(`img-${slotId}`);
      const titleInput = document.getElementById(`title-${slotId}`);
      const descInput = document.getElementById(`desc-${slotId}`);
      if (img && data.imageUrl) img.src = data.imageUrl;
      if (titleInput) titleInput.value = data.title || "";
      if (descInput) descInput.value = data.description || "";
    } catch (e) {
      console.error(`Failed to load ${slotId}:`, e);
    }
  }
}

async function saveHeroSlot(slotId, index) {
  const titleInput = document.getElementById(`title-${slotId}`);
  const descInput = document.getElementById(`desc-${slotId}`);
  const saveBtn = document.getElementById(`save-${slotId}`);
  const title = sanitizeText(titleInput.value);
  const description = sanitizeText(descInput.value);

  saveBtn.disabled = true;
  showLoading(`Step 1/3: checking existing files…`);
  try {
    const doSave = (async () => {
      let imageUrl = null;
      const pendingFile = heroPendingFiles[slotId];
      if (pendingFile) {
        showLoading(`Step 2/3: uploading image (${(pendingFile.size / 1024 / 1024).toFixed(2)} MB)…`);
        imageUrl = await replaceFixedSlotFile(BUCKETS.hero, slotId, pendingFile);
      } else {
        const snap = await getDoc(doc(db, COLLECTIONS.hero, slotId));
        imageUrl = snap.exists() ? snap.data().imageUrl || null : null;
      }

      showLoading(`Step 3/3: saving details…`);
      await setDoc(
        doc(db, COLLECTIONS.hero, slotId),
        { title, description, imageUrl, order: index, updatedAt: serverTimestamp() },
        { merge: true }
      );

      delete heroPendingFiles[slotId];
      await touchLastUpdated();
    })();

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out after 30s. Check your internet connection and try again.")), 30000)
    );

    await Promise.race([doSave, timeout]);
    showToast(`Hero slot ${index} saved.`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Could not save: ${err.message || err.error_description || JSON.stringify(err)}`, "error");
  } finally {
    saveBtn.disabled = false;
    hideLoading();
  }
}

/* ============================================================
   8. GALLERY MANAGEMENT  (exactly GALLERY_SLOT_COUNT fixed slots)
   ============================================================ */
const galleryGrid = document.getElementById("galleryGrid");

function renderGallerySlots() {
  galleryGrid.innerHTML = "";
  for (let i = 1; i <= GALLERY_SLOT_COUNT; i++) {
    const slotId = `gallery-${i}`;
    const card = document.createElement("div");
    card.className = "gallery-card glass";

    card.innerHTML = `
      <div class="gallery-card-media">
        <img id="img-${slotId}" alt="Gallery slot ${i}" src="${placeholderDataUri("#" + i)}" />
        <span class="slot-badge">#${i}</span>
        <div class="media-overlay">
          <button type="button" class="btn btn-secondary btn-sm replace-btn">Replace</button>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden-file-input" id="file-${slotId}" />
      </div>
    `;
    galleryGrid.appendChild(card);

    const fileInput = card.querySelector(`#file-${slotId}`);
    const media = card.querySelector(".gallery-card-media");
    const img = card.querySelector(`#img-${slotId}`);
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = placeholderDataUri("#" + i);
    });

    card.querySelector(".replace-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      const err = validateImageFile(file);
      if (err) {
        showToast(err, "error");
        fileInput.value = "";
        return;
      }

      const progress = document.createElement("div");
      progress.className = "upload-progress";
      progress.textContent = "Uploading…";
      media.appendChild(progress);

      try {
        const url = await replaceFixedSlotFile(BUCKETS.gallery, slotId, file);
        await setDoc(
          doc(db, COLLECTIONS.gallery, slotId),
          { imageUrl: url, order: i, updatedAt: serverTimestamp() },
          { merge: true }
        );
        img.src = url;
        await touchLastUpdated();
        showToast(`Gallery slot ${i} updated.`, "success");
      } catch (e) {
        console.error(e);
        showToast("Upload failed. Please try again.", "error");
      } finally {
        progress.remove();
        fileInput.value = "";
      }
    });
  }
}

async function loadGalleryData() {
  for (let i = 1; i <= GALLERY_SLOT_COUNT; i++) {
    const slotId = `gallery-${i}`;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.gallery, slotId));
      const img = document.getElementById(`img-${slotId}`);
      if (snap.exists() && img && snap.data().imageUrl) img.src = snap.data().imageUrl;
    } catch (e) {
      console.error(`Failed to load ${slotId}:`, e);
    }
  }
}

function subscribeGalleryCount() {
  onSnapshot(
    collection(db, COLLECTIONS.gallery),
    (snap) => {
      document.getElementById("statGallery").textContent = snap.size || GALLERY_SLOT_COUNT;
    },
    (err) => console.error("Gallery count listener error:", err)
  );
}

/* ============================================================
   9. NOTICE MANAGEMENT  (add / edit / delete, PDF optional)
   ============================================================ */
const noticesList = document.getElementById("noticesList");
const noticesEmpty = document.getElementById("noticesEmpty");
const addNoticeBtn = document.getElementById("addNoticeBtn");
const noticeModal = document.getElementById("noticeModal");
const noticeModalTitle = document.getElementById("noticeModalTitle");
const noticeForm = document.getElementById("noticeForm");
const noticeIdInput = document.getElementById("noticeId");
const noticeExistingPdfInput = document.getElementById("noticeExistingPdf");
const noticeTitleInput = document.getElementById("noticeTitle");
const noticeDescInput = document.getElementById("noticeDescription");
const noticePublishDateInput = document.getElementById("noticePublishDate");
const noticePdfInput = document.getElementById("noticePdf");
const noticePdfCurrent = document.getElementById("noticePdfCurrent");
const noticeErrorEl = document.getElementById("noticeError");
const noticeCancelBtn = document.getElementById("noticeCancelBtn");
const noticeSaveBtn = document.getElementById("noticeSaveBtn");

let noticesCache = [];

function openNoticeModal(notice = null) {
  noticeForm.reset();
  noticeErrorEl.classList.add("hidden");
  noticePdfCurrent.classList.add("hidden");

  if (notice) {
    noticeModalTitle.textContent = "Edit Notice";
    noticeIdInput.value = notice.id;
    noticeExistingPdfInput.value = notice.pdfPath || "";
    noticeTitleInput.value = notice.title || "";
    noticeDescInput.value = notice.description || "";
    noticePublishDateInput.value = notice.publishDate || "";
    if (notice.pdfUrl) {
      noticePdfCurrent.textContent = "A PDF is already attached — choosing a new file will replace it.";
      noticePdfCurrent.classList.remove("hidden");
    }
  } else {
    noticeModalTitle.textContent = "Add Notice";
    noticeIdInput.value = "";
    noticeExistingPdfInput.value = "";
    noticePublishDateInput.value = new Date().toISOString().slice(0, 10);
  }
  noticeModal.classList.remove("hidden");
}
function closeNoticeModal() {
  noticeModal.classList.add("hidden");
}

addNoticeBtn.addEventListener("click", () => openNoticeModal());
noticeCancelBtn.addEventListener("click", closeNoticeModal);
noticeModal.addEventListener("click", (e) => {
  if (e.target === noticeModal) closeNoticeModal();
});

noticeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  noticeErrorEl.classList.add("hidden");

  const title = sanitizeText(noticeTitleInput.value);
  const description = sanitizeText(noticeDescInput.value);
  const publishDate = noticePublishDateInput.value;
  const pdfFile = noticePdfInput.files[0] || null;
  const existingId = noticeIdInput.value || null;
  const existingPdfPath = noticeExistingPdfInput.value || null;

  if (!title || !description || !publishDate) {
    noticeErrorEl.textContent = "Please fill in the title, description and publish date.";
    noticeErrorEl.classList.remove("hidden");
    return;
  }
  const pdfErr = validatePdfFile(pdfFile);
  if (pdfErr) {
    noticeErrorEl.textContent = pdfErr;
    noticeErrorEl.classList.remove("hidden");
    return;
  }

  noticeSaveBtn.disabled = true;
  showLoading(existingId ? "Updating notice…" : "Publishing notice…");
  try {
    const docId = existingId || doc(collection(db, COLLECTIONS.notices)).id;
    let pdfUrl = null;
    let pdfPath = null;

    if (pdfFile) {
      if (existingPdfPath) await deleteNoticePdf(existingPdfPath);
      const uploaded = await uploadNoticePdf(pdfFile, docId);
      pdfUrl = uploaded.url;
      pdfPath = uploaded.path;
    } else if (existingId) {
      const existing = noticesCache.find((n) => n.id === existingId);
      pdfUrl = existing?.pdfUrl || null;
      pdfPath = existing?.pdfPath || null;
    }

    const payload = {
      title,
      description,
      publishDate,
      pdfUrl,
      pdfPath,
      updatedAt: serverTimestamp(),
    };
    if (!existingId) payload.createdAt = serverTimestamp();

    await setDoc(doc(db, COLLECTIONS.notices, docId), payload, { merge: true });
    await touchLastUpdated();
    closeNoticeModal();
    showToast(existingId ? "Notice updated." : "Notice published.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not save the notice. Please try again.", "error");
  } finally {
    noticeSaveBtn.disabled = false;
    hideLoading();
  }
});

function renderNotices(notices) {
  noticesCache = notices;
  noticesList.innerHTML = "";

  if (!notices.length) {
    noticesEmpty.classList.remove("hidden");
    return;
  }
  noticesEmpty.classList.add("hidden");

  notices.forEach((n) => {
    const { dd, mon } = formatDateShort(n.publishDate);

    const item = document.createElement("div");
    item.className = "notice-item glass";

    const main = document.createElement("div");
    main.className = "notice-main";

    const badge = document.createElement("div");
    badge.className = "notice-date-badge";
    badge.innerHTML = `<span class="dd">${dd}</span><span class="mon">${mon}</span>`;

    const textWrap = document.createElement("div");
    textWrap.className = "notice-text";
    const h4 = document.createElement("h4");
    h4.textContent = n.title || "";
    const p = document.createElement("p");
    p.textContent = n.description || "";
    textWrap.appendChild(h4);
    textWrap.appendChild(p);
    if (n.pdfUrl) {
      const link = document.createElement("a");
      link.href = n.pdfUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "pdf-chip";
      link.textContent = "📄 View PDF";
      textWrap.appendChild(link);
    }

    main.appendChild(badge);
    main.appendChild(textWrap);

    const actions = document.createElement("div");
    actions.className = "notice-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn edit-btn";
    editBtn.title = "Edit";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", () => openNoticeModal(n));
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger delete-btn";
    delBtn.title = "Delete";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", () => handleDeleteNotice(n));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(main);
    item.appendChild(actions);
    noticesList.appendChild(item);
  });
}

async function handleDeleteNotice(notice) {
  const ok = await showConfirm(
    "Delete this notice?",
    `"${notice.title}" will be permanently removed from the website.`,
    "Delete"
  );
  if (!ok) return;

  showLoading("Deleting notice…");
  try {
    if (notice.pdfPath) await deleteNoticePdf(notice.pdfPath);
    await deleteDoc(doc(db, COLLECTIONS.notices, notice.id));
    await touchLastUpdated();
    showToast("Notice deleted.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not delete the notice. Please try again.", "error");
  } finally {
    hideLoading();
  }
}

function subscribeNotices() {
  const q = query(collection(db, COLLECTIONS.notices), orderBy("publishDate", "desc"));
  onSnapshot(
    q,
    (snap) => {
      const notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderNotices(notices);
      document.getElementById("statNotices").textContent = notices.length;
    },
    (err) => console.error("Notices listener error:", err)
  );
}

/* ============================================================
   10. CONTACT INFORMATION
   ============================================================ */
const contactForm = document.getElementById("contactForm");
const contactPhone = document.getElementById("contactPhone");
const contactWhatsapp = document.getElementById("contactWhatsapp");
const contactEmail = document.getElementById("contactEmail");
const contactAddress = document.getElementById("contactAddress");
const contactSaveBtn = document.getElementById("contactSaveBtn");

async function loadContactData() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.contact, "info"));
    if (snap.exists()) {
      const d = snap.data();
      contactPhone.value = d.phone || "";
      contactWhatsapp.value = d.whatsapp || "";
      contactEmail.value = d.email || "";
      contactAddress.value = d.address || "";
    }
  } catch (e) {
    console.error("Failed to load contact info:", e);
  }
}

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const phone = sanitizeText(contactPhone.value);
  const whatsapp = sanitizeText(contactWhatsapp.value);
  const email = sanitizeText(contactEmail.value);
  const address = sanitizeText(contactAddress.value);

  const phonePattern = /^[\d+\-\s()]{7,20}$/;
  if (!phonePattern.test(phone)) {
    showToast("Please enter a valid phone number.", "error");
    return;
  }
  if (!phonePattern.test(whatsapp)) {
    showToast("Please enter a valid WhatsApp number.", "error");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Please enter a valid email address.", "error");
    return;
  }
  if (!address) {
    showToast("Please enter an address.", "error");
    return;
  }

  contactSaveBtn.disabled = true;
  showLoading("Saving contact info…");
  try {
    await setDoc(
      doc(db, COLLECTIONS.contact, "info"),
      { phone, whatsapp, email, address, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await touchLastUpdated();
    showToast("Contact information saved.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not save contact info. Please try again.", "error");
  } finally {
    contactSaveBtn.disabled = false;
    hideLoading();
  }
});

/* ============================================================
   11. DASHBOARD STATS & BOOTSTRAP
   ============================================================ */
function subscribeLastUpdated() {
  onSnapshot(
    doc(db, COLLECTIONS.settings, "meta"),
    (snap) => {
      if (snap.exists() && snap.data().lastUpdated) {
        document.getElementById("statLastUpdated").textContent = formatTimestamp(snap.data().lastUpdated);
      }
    },
    (err) => console.error("Meta listener error:", err)
  );
}

function bootDashboard() {
  document.getElementById("statHero").textContent = HERO_SLOT_COUNT;

  renderHeroSlots();
  renderGallerySlots();

  loadHeroData();
  loadGalleryData();
  loadContactData();

  subscribeNotices();
  subscribeGalleryCount();
  subscribeLastUpdated();
}
