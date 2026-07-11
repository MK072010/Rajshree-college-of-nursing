/* ============================================================
   firebase-config.js
   Rajshree College of Nursing — Admin Panel
   Central configuration & SDK initialization.
   ------------------------------------------------------------
   ⚠️  BEFORE DEPLOYING:
   1. Replace `firebaseConfig` with your project's values
      (Firebase Console → Project Settings → General → Your apps).
   2. Replace SUPABASE_URL / SUPABASE_ANON_KEY with your project's
      values (Supabase Dashboard → Project Settings → API).
   3. Set ADMIN_EMAIL to the single account allowed to sign in.
   4. Create the Supabase Storage buckets: hero, gallery, notices
      (Storage → New bucket → make them Public so index.html can
      read images without auth).
   5. Lock down Firestore + Storage with the rules described in
      README.md — this file alone does not secure your data.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------------------------------------------
   1. FIREBASE PROJECT CONFIG
--------------------------------------------------------------- */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBoOiJHIXtVItNtaMgJhmTuwX2sVt3TiLQ",
  authDomain: "rajshree-college-of-nursing.firebaseapp.com",
  projectId: "rajshree-college-of-nursing",
  storageBucket: "rajshree-college-of-nursing.firebasestorage.app",
  messagingSenderId: "616840002549",
  appId: "1:616840002549:web:281630699b143fe9563ebc",
  measurementId: "G-R7W26PGCG9"
};
/* ---------------------------------------------------------------
   2. SUPABASE PROJECT CONFIG
--------------------------------------------------------------- */
const SUPABASE_URL = "https://qdwjibkqvpxmyaiothyh.supabase.co";
const SUPABASE_ANON_KEY = "J/DujZXuyLufc+Z0K53p9orK3Vg2hLsQDzrnT7jOL9PIZfbXcgaaxUTtaaRvKLsB9IOMTdDRoZDkz9sbhueRfw==";

/* ---------------------------------------------------------------
   3. THE ONE ADMIN ACCOUNT ALLOWED TO LOG IN
   (must already exist in Firebase Authentication → Users;
   this panel has no sign-up / registration flow by design)
--------------------------------------------------------------- */
export const ADMIN_EMAIL = "mohitprajapat0724@gmail.com";

/* ---------------------------------------------------------------
   4. INITIALIZE FIREBASE (Auth + Firestore only — no writes
      happen through the Firebase Storage SDK in this project)
--------------------------------------------------------------- */
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("[firebase-config] persistence error:", err);
});

/* ---------------------------------------------------------------
   5. INITIALIZE SUPABASE
   (supabase-js UMD build is loaded globally via <script> tag in
   admin.html before this module runs, so `window.supabase` exists)
--------------------------------------------------------------- */
export const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/* ---------------------------------------------------------------
   6. STORAGE BUCKETS  (must exist in Supabase Storage, set Public)
--------------------------------------------------------------- */
export const BUCKETS = {
  hero: "hero",
  gallery: "gallery",
  notices: "notices",
};

/* ---------------------------------------------------------------
   7. FIRESTORE COLLECTIONS
--------------------------------------------------------------- */
export const COLLECTIONS = {
  settings: "settings",
  hero: "hero",
  gallery: "gallery",
  notices: "notices",
  contact: "contact",
};

/* ---------------------------------------------------------------
   8. FIXED SLOT COUNTS
   Hero = exactly 4 (per spec). Gallery slot count is fixed but
   adjustable here — change this single number to resize the grid;
   nothing else in admin.js needs to change.
--------------------------------------------------------------- */
export const HERO_SLOT_COUNT = 4;
export const GALLERY_SLOT_COUNT = 8;

/* ---------------------------------------------------------------
   9. UPLOAD LIMITS
--------------------------------------------------------------- */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_PDF_TYPES = ["application/pdf"];
