import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Configuración condicional: getAuth para Web, initializeAuth con AsyncStorage para Móvil
export const auth = Platform.OS === 'web' 
  ? getAuth(app) 
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

// Initialize Firestore database
export const db = getFirestore(app);