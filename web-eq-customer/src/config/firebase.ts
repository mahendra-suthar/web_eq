import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const app = initializeApp({
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
});

export const firebaseAuth = getAuth(app);
