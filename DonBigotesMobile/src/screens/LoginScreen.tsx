import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Validar si los campos están vacíos antes de llamar a Firebase
    if (!email.trim() || !password) {
      Alert.alert(
        'Campos requeridos', 
        'Por favor ingresa tu correo electrónico y tu contraseña para continuar.'
      );
      return;
    }

    try {
      setLoading(true);
      // Intentar iniciar sesión en Firebase Auth
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
      // Si es exitoso, navegamos al Home
      navigation.replace('Home');
    } catch (error: any) {
      console.error('Error de autenticación:', error);
      
      // Personalizar mensajes según el error de Firebase para mayor claridad
      let mensajeError = 'Ocurrió un error al iniciar sesión.';
      if (error.code === 'auth/invalid-email') {
        mensajeError = 'El formato del correo electrónico no es válido.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        mensajeError = 'Correo o contraseña incorrectos. Verifica tus datos.';
      } else if (error.code === 'auth/too-many-requests') {
        mensajeError = 'Demasiados intentos fallidos. Inténtalo más tarde.';
      }

      Alert.alert('Error de Acceso', mensajeError);
    } finally {
      setLoading(false);
    }
  };

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
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin} // <- Esto activa el login con la tecla Enter
        />

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ marginTop: 15, alignItems: 'center' }}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={{ color: '#5c1d24', fontSize: 14 }}>¿No tienes cuenta? Registrar nuevo usuario</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.compile ? StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  card: { width: 320, padding: 24, backgroundColor: '#fff', borderRadius: 12, elevation: 3 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#4a154b', marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 20 },
  input: { height: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, marginBottom: 14 },
  button: { height: 44, backgroundColor: '#5c1d24', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
}) : {
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  card: { width: 320, padding: 24, backgroundColor: '#fff', borderRadius: 12 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#4a154b', marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 20 },
  input: { height: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, marginBottom: 14 },
  button: { height: 44, backgroundColor: '#5c1d24', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
};