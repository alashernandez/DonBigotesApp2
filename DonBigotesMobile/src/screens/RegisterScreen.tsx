import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';

const ROLES = ['cliente', 'encargado', 'admin'] as const;
type RoleType = (typeof ROLES)[number];

export default function RegisterScreen({ navigation, route }: any) {
  const isAdminCreating = Boolean(route?.params?.isAdminCreating);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleType>('cliente');
  const [saving, setSaving] = useState(false);

  const notify = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      notify('Error', 'No se pudo cerrar sesión.');
    }
  };

  const handleCreateUser = async () => {
    const cleanName = nombre.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || password.length < 6) {
      notify(
        'Datos incompletos',
        'Ingresa nombre, correo válido y contraseña de al menos 6 caracteres.'
      );
      return;
    }

    try {
      setSaving(true);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const newUid = cred.user.uid;

      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        nombre: cleanName,
        email: cleanEmail,
        role: isAdminCreating ? role : 'cliente',
        createdAt: serverTimestamp(),
      });

      setNombre('');
      setEmail('');
      setPassword('');
      setRole('cliente');

      notify('Usuario registrado', 'La cuenta y el perfil en Firestore fueron creados.');

      if (isAdminCreating) {
        navigation.navigate('Home');
      } else {
        navigation.replace('Home');
      }
    } catch (error: any) {
      console.error('Error al registrar usuario:', error);
      let msg = 'No se pudo registrar el usuario.';
      if (error.code === 'auth/email-already-in-use') {
        msg = 'Ese correo electrónico ya está registrado.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'El correo electrónico no es válido.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      }
      notify('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {auth.currentUser && (
        <View style={styles.topNav}>
          <View style={styles.topNavHeader}>
            <Text style={styles.navBrand}>Don Bigotes</Text>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutBtnText}>Salir</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.navLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('Home')}>
              <Text style={styles.navLinkYellow}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Menu')}>
              <Text style={styles.navLinkYellow}>Menú</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
              <Text style={styles.navLinkYellow}>Pedidos</Text>
            </TouchableOpacity>
            <View style={styles.navActivePill}>
              <Text style={styles.navActiveText}>Nuevo usuario</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>
          {isAdminCreating ? 'Nuevo usuario' : 'Crear cuenta'}
        </Text>
        <Text style={styles.subtitle}>Don Bigotes · Gestión de accesos</Text>

        <Text style={styles.label}>Nombre completo</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Carlos Alas"
          placeholderTextColor="#9ca3af"
          value={nombre}
          onChangeText={setNombre}
        />

        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          placeholder="usuario@donbigotes.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {isAdminCreating && (
          <>
            <Text style={styles.label}>Rol</Text>
            <View style={styles.rolesRow}>
              {ROLES.map((r) => {
                const active = role === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, active && styles.roleChipActive]}
                    onPress={() => setRole(r)}
                  >
                    <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                      {r.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.7 }]}
          onPress={handleCreateUser}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Registrar usuario</Text>
          )}
        </TouchableOpacity>

        {!auth.currentUser && (
          <TouchableOpacity
            style={styles.backLoginBtn}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.backLoginText}>¿Ya tienes cuenta? Inicia sesión</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#efe4d2' },
  content: { padding: 14, paddingBottom: 32 },
  topNav: {
    backgroundColor: '#5c1d24',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  topNavHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navBrand: { color: '#fff', fontSize: 17, fontWeight: '700' },
  logoutBtn: {
    backgroundColor: '#b45309',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  logoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  navLinks: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  navLinkYellow: { color: '#fbbf24', fontWeight: '700', fontSize: 13 },
  navActivePill: {
    backgroundColor: '#b45309',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  navActiveText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#5c1d24' },
  subtitle: { fontSize: 13, color: '#6b5c54', marginTop: 2, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#2b1b17', marginTop: 10, marginBottom: 6 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 7,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#1f2937',
  },
  rolesRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  roleChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  roleChipActive: { backgroundColor: '#5c1d24', borderColor: '#5c1d24' },
  roleChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  roleChipTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 18,
    height: 44,
    backgroundColor: '#5c1d24',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  backLoginBtn: { marginTop: 14, alignItems: 'center' },
  backLoginText: { color: '#5c1d24', fontSize: 13, fontWeight: '600' },
});