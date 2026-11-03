import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const viteEnv = import.meta.env ?? {};
const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: viteEnv.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseClientConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

export function getFirebaseAuth() {
  if (!firebaseClientConfigured) {
    throw new Error("A configuração pública do Firebase ainda não foi adicionada ao site.");
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
