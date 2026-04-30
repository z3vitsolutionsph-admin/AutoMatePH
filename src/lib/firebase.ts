import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json'; // Adjust path based on root

const app = initializeApp({
  ...firebaseConfig,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY
});
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
