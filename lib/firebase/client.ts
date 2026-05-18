import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  type Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getAuth,
  type Auth,
  connectAuthEmulator,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

function isConfigured(): boolean {
  return !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
}

function getApp(): FirebaseApp {
  if (!isConfigured()) {
    throw new Error(
      "Firebase não está configurado. Verifique suas variáveis de ambiente."
    );
  }
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp());
    if (process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) {
      connectFirestoreEmulator(
        db,
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
        Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080")
      );
    }
  }
  return db;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
    if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
      connectAuthEmulator(
        auth,
        `http://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}:${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT ?? "9099"}`
      );
    }
  }
  return auth;
}

export { isConfigured };
