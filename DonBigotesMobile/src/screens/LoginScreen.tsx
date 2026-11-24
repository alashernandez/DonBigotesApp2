import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';

const GOOGLE_WEB_CLIENT_ID =
  '251022172595-rkhukg31ell4o5aronp9hd5k806mq8ek.apps.googleusercontent.com';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let googleSigninPkg: GoogleSigninModule | null = null;
let googleModuleError: string | null = null;

try {
  // Evita que Expo Go truene al evaluar RNGoogleSignin si el binario nativo no lo incluye
  const loaded = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  if (loaded?.GoogleSignin) {
    googleSigninPkg = loaded;
  } else {
    googleModuleError =
      'El módulo nativo de Google Sign-In no está disponible en este entorno (Expo Go).';
  }
} catch {
  googleModuleError =
    'El módulo nativo de Google Sign-In no está disponible en este entorno (Expo Go).';
}

async function ensureUserDocInFirestore(user: User): Promise<string> {
  if (!user.uid) return 'cliente';
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const defaultRole = 'cliente';
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email ?? '',
      nombre: user.displayName ?? user.email?.split('@')[0] ?? 'Usuario',
      role: defaultRole,
      createdAt: serverTimestamp(),
    });
    return defaultRole;
  }

  return String(snap.data()?.role || 'cliente').toLowerCase();
}

async function redirectByRole(user: User, navigation: any) {
  const roleVal = await ensureUserDocInFirestore(user);
  if (roleVal === 'cliente') {
    navigation.replace('ClientDashboard');
  } else {
    navigation.replace('Home');
  }
}

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!googleSigninPkg) return;

    try {
      googleSigninPkg.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
      });
    } catch {
      googleModuleError = 'No se pudo inicializar Google Sign-In en este binario.';
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(
        'Campos requeridos',
        'Por favor ingresa tu correo electrónico y tu contraseña para continuar.'
      );
      return;
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await redirectByRole(userCredential.user, navigation);
    } catch (error: any) {
      console.error('Error de autenticación:', error);

      let mensajeError = 'Ocurrió un error al iniciar sesión.';
      if (error.code === 'auth/invalid-email') {
        mensajeError = 'El formato del correo electrónico no es válido.';
      } else if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        mensajeError = 'Correo o contraseña incorrectos. Verifica tus datos.';
      } else if (error.code === 'auth/too-many-requests') {
        mensajeError = 'Demasiados intentos fallidos. Inténtalo más tarde.';
      }

      Alert.alert('Error de Acceso', mensajeError);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleSigninPkg) {
      Alert.alert(
        'No disponible en Expo Go',
        googleModuleError ||
          'Google Sign-In nativo requiere una compilación nativa. Usa correo y contraseña para probar en Expo Go.'
      );
      return;
    }

    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } =
      googleSigninPkg;

    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();

      if (!isSuccessResponse(signInResult)) {
        return;
      }

      const idToken = signInResult.data.idToken;
      if (!idToken) {
        throw new Error('No se recibió el idToken de Google.');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      await redirectByRole(userCredential.user, navigation);
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        if (
          error.code === statusCodes.SIGN_IN_CANCELLED ||
          error.code === statusCodes.IN_PROGRESS
        ) {
          return;
        }
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert(
            'Google Play Services',
            'Google Play Services no está disponible o requiere actualización.'
          );
          return;
        }
      }

      console.error('Error al iniciar sesión con Google:', error);
      Alert.alert(
        'Error de Acceso',
        error?.code === 'auth/invalid-credential'
          ? 'Credencial de Google inválida. Verifica el Web Client ID en Firebase.'
          : error?.message || 'No se pudo iniciar sesión con Google.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const anyLoading = loading || googleLoading;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Don Bigotes</Text>
        <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!anyLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!anyLoading}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={anyLoading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.divider} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, anyLoading && styles.disabledButton]}
          onPress={handleGoogleLogin}
          disabled={anyLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#333" />
          ) : (
            <Text style={styles.googleButtonText}>Continuar con Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 15, alignItems: 'center' }}
          onPress={() => navigation.navigate('Register')}
          disabled={anyLoading}
        >
          <Text style={{ color: '#5c1d24', fontSize: 14 }}>
            ¿No tienes cuenta? Registrar nuevo usuario
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  card: {
    width: 320,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#4a154b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  button: {
    height: 44,
    backgroundColor: '#5c1d24',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#777',
    fontSize: 13,
  },
  googleButton: {
    height: 44,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#222',
    fontWeight: '600',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
});