import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyClwt6BaBxM_y4CmdW6hp5CE4GWZaLuw3A",
  authDomain: "toledolibros-e72a1.firebaseapp.com",
  projectId: "toledolibros-e72a1",
  storageBucket: "toledolibros-e72a1.firebasestorage.app",
  messagingSenderId: "870236370927",
  appId: "1:870236370927:web:f9fb2d4f2da7af3b85281a",
  measurementId: "G-52K3CRC4ZP"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
