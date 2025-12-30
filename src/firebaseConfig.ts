// src/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// SUBSTITUA PELOS SEUS DADOS DO CONSOLE FIREBASE
const firebaseConfig = {
  apiKey: 'AIzaSyBUrnUZVHswwc3fhO-dz_7ZBLLLQ3GWRZo',
  authDomain: 'ritual-732ea.firebaseapp.com',
  projectId: 'ritual-732ea',
  storageBucket: 'ritual-732ea.firebasestorage.app',
  messagingSenderId: '230980088654',
  appId: '1:230980088654:web:3babb2276ac1137d03641f',
  measurementId: 'G-71BV2ZHSY3',
};

// Inicia o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as ferramentas para usarmos no App
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
