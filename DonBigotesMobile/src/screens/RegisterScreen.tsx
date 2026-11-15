import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';

type UserRole = 'cliente' | 'encargado' | 'admin';

export default function RegisterScreen({ navigation, route }: any) {
  // Si el Admin abre esta pantalla desde su panel, activamos la selección de roles administrativos
  const isAdminCreating = route?.params?.isAdminCreating || false;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    isAdminCreating ? 'encargado' : 'cliente'
  );
  const [loading, setLoading] = useState(false);

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      showNotification('Campos incompletos', 'Por favor completa todos los campos obligatorios.');
      return;
    }

    if (password.length < 6) {
      showNotification('Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      showNotification('Error', 'Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);

      // 1. Crear el usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      // 2. Guardar su perfil y rol en la colección 'users' de Firestore
      const roleToAssign: UserRole = isAdminCreating ? selectedRole : 'cliente';

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        nombre: name.trim(),
        email: user.email,
        role: roleToAssign,
        createdAt: serverTimestamp(),
      });

      showNotification(
        'Registro exitoso',
        isAdminCreating
          ? `Usuario ${name.trim()} creado con rol de ${roleToAssign.toUpperCase()}.`
          : 'Tu cuenta de cliente ha sido creada. ¡Bienvenido a Don Bigotes!'
      );

      // Si lo creó el Admin regresamos al panel; si es cliente nuevo va directo a su menú
      if (isAdminCreating) {
        navigation.goBack();
      } else {
        navigation.replace('Home');
      }
    } catch (error: any) {
      console.error('Error al registrar usuario:', error);
      let errorMsg = 'Ocurrió un error al crear la cuenta.';
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'Este correo electrónico ya está registrado.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'El formato del correo electrónico no es válido.';
      }
      showNotification('Error de registro', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {isAdminCreating ? 'Registrar Nuevo Personal' : 'Crear Cuenta'}
        </Text>
        <Text style={styles.subtitle}>
          {isAdminCreating
            ? 'Asigna credenciales y nivel de acceso - Don Bigotes'
            : 'Regístrate para ordenar en Comedor Don Bigotes'}
        </Text>

        <Text style={styles.label}>Nombre completo</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Carlos Alas / Doña Rosa"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          placeholder="correo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 caracteres"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Confirmar contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Repite tu contraseña"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {/* Selector de rol visible SOLO cuando el Admin abre la pantalla */}
        {isAdminCreating && (
          <View style={styles.roleSection}>
            <Text style={styles.label}>Selecciona el Rol del Usuario:</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  selectedRole === 'encargado' && styles.roleOptionActive,
                ]}
                onPress={() => setSelectedRole('encargado')}
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    selectedRole === 'encargado' && styles.roleOptionTextActive,
                  ]}
                >
                  Encargado
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  selectedRole === 'admin' && styles.roleOptionActive,
                ]}
                onPress={() => setSelectedRole('admin')}
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    selectedRole === 'admin' && styles.roleOptionTextActive,
                  ]}
                >
                  Admin
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isAdminCreating ? 'Crear Usuario' : 'Registrarme'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkText}>
            {isAdminCreating
              ? '← Cancelar y volver'
              : '¿Ya tienes cuenta? Inicia sesión aquí'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FDFBF7',
  },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e0d8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#5c1d24',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  roleSection: {
    marginBottom: 16,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5c1d24',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleOptionActive: {
    backgroundColor: '#5c1d24',
  },
  roleOptionText: {
    color: '#5c1d24',
    fontWeight: 'bold',
    fontSize: 14,
  },
  roleOptionTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#5c1d24',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#4a154b',
    fontSize: 13,
    fontWeight: '600',
  },
});