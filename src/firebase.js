import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBvx_N32-mTulLATSZrUi9Tc1Mr-9d6cLE",
  authDomain: "diane-maison-famille.firebaseapp.com",
  projectId: "diane-maison-famille",
  storageBucket: "diane-maison-famille.firebasestorage.app",
  messagingSenderId: "385094855505",
  appId: "1:385094855505:web:b8aa64d0e00a1b85f0c170"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);