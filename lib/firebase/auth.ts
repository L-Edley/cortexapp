import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isConfigured } from "./client";

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!isConfigured()) {
    callback(null);
    return () => {};
  }
  const auth = getFirebaseAuth();
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    callback(user);
  });
  return unsubscribe;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  currentUser = result.user;
  return result.user;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  currentUser = null;
}
