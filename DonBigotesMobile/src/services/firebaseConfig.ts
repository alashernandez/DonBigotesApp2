import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyC1bRkBMz2yefsmSymUDpZIUdMbgDX-D2o",
  authDomain: "donbigotesapp-f71ee.firebaseapp.com",
  projectId: "donbigotesapp-f71ee",
  storageBucket: "donbigotesapp-f71ee.firebasestorage.app",
  messagingSenderId: "251022172595",
  appId: "1:251022172595:web:0afc95458f86601e0f6bc6",
  measurementId: "G-5SDXVHV79M"
};

// Evita re-inicializar la app en recargas rápidas (Fast Refresh)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth(): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  try {
    const getRNPersistence = (
      firebaseAuth as unknown as {
        getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
      }
    ).getReactNativePersistence;

    return initializeAuth(
      app,
      getRNPersistence ? { persistence: getRNPersistence(AsyncStorage) } : undefined
    );
  } catch {
    // Si ya fue inicializado previamente, devuelve la instancia existente
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = getFirestore(app);