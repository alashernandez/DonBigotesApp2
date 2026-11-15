import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';

interface Product {
  id: string;
  nombre: string;
  precio: number;
  disponible?: boolean;
}

export default function MenuScreen({ navigation }: any) {
  const [userRole, setUserRole] = useState<'admin' | 'encargado' | 'cliente'>('cliente');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Campos para crear platillo (Solo Admin)
  const [newNombre, setNewNombre] = useState('');
  const [newPrecio, setNewPrecio] = useState('');
  const [saving, setSaving] = useState(false);

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // 1. Obtener rol del usuario actual
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const unsubUser = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userDoc = snapshot.docs.find(
        (d) => d.id === currentUser.uid || d.data().uid === currentUser.uid
      );
      if (userDoc) {
        setUserRole(userDoc.data().role || 'cliente');
      }
    });

    return () => unsubUser();
  }, []);

  // 2. Cargar productos/platillos en tiempo real
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const list: Product[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        nombre: docSnap.data().nombre || 'Sin nombre',
        precio: Number(docSnap.data().precio || 0),
        disponible: docSnap.data().disponible ?? true,
      }));
      setProducts(list);
      setLoading(false);
    });

    return () => unsubProducts();
  }, []);

  // Crear platillo (Solo Admin)
  const handleCreateProduct = async () => {
    if (!newNombre.trim() || !newPrecio.trim()) {
      showNotification('Campos incompletos', 'Ingresa el nombre y precio del platillo.');
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, 'productos'), {
        nombre: newNombre.trim(),
        precio: Number(newPrecio),
        disponible: true,
      });
      setNewNombre('');
      setNewPrecio('');
    } catch (error) {
      console.error('Error al crear platillo:', error);
      showNotification('Error', 'No se pudo registrar el platillo.');
    } finally {
      setSaving(false);
    }
  };

  // Eliminar platillo (Solo Admin)
  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'productos', id));
    } catch (error) {
      console.error('Error al eliminar platillo:', error);
      showNotification('Error', 'No se pudo eliminar el platillo.');
    }
  };

  // Cambiar disponibilidad (Admin y Encargado)
  const handleToggleAvailability = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'productos', id), {
        disponible: !currentStatus,
      });
    } catch (error) {
      console.error('Error al cambiar disponibilidad:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Barra de Navegación Superior */}
      <View style={styles.navbar}>
        <Text style={styles.navBrand}>Don Bigotes</Text>
        <View style={styles.navActions}>
          <TouchableOpacity
            style={styles.navTab}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.navTabText}>Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTabActive}>
            <Text style={styles.navTabTextActive}>Menú</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTab}
            onPress={() => navigation.navigate('Orders')}
          >
            <Text style={styles.navTabText}>Pedidos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.logoutText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.title}>Gestión de Menú - Don Bigotes</Text>
      <Text style={styles.subtitle}>Control completo de platillos y disponibilidad</Text>

      {/* Panel Exclusivo Admin para Agregar Platillos */}
      {userRole === 'admin' && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Agregar Nuevo Platillo</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre (Ej. Tacos al Pastor)"
            value={newNombre}
            onChangeText={setNewNombre}
          />
          <TextInput
            style={styles.input}
            placeholder="Precio ($)"
            keyboardCurrency="numeric"
            keyboardType="numeric"
            value={newPrecio}
            onChangeText={setNewPrecio}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleCreateProduct}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>+ Agregar Platillo</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Catálogo Actual</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#5c1d24" style={{ marginTop: 20 }} />
      ) : (
        products.map((item) => (
          <View key={item.id} style={styles.productCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{item.nombre}</Text>
              <Text style={styles.productPrice}>${item.precio.toFixed(2)}</Text>
              <Text
                style={[
                  styles.statusText,
                  { color: item.disponible !== false ? '#16a34a' : '#dc2626' },
                ]}
              >
                {item.disponible !== false ? '• Disponible' : '• Agotado'}
              </Text>
            </View>

            <View style={styles.cardActions}>
              {(userRole === 'admin' || userRole === 'encargado') && (
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    { backgroundColor: item.disponible !== false ? '#16a34a' : '#d97706' },
                  ]}
                  onPress={() => handleToggleAvailability(item.id, item.disponible ?? true)}
                >
                  <Text style={styles.toggleButtonText}>
                    {item.disponible !== false ? 'Marcar Agotado' : 'Marcar Disponible'}
                  </Text>
                </TouchableOpacity>
              )}

              {userRole === 'admin' && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteProduct(item.id)}
                >
                  <Text style={styles.deleteButtonText}>Eliminar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF7', padding: 15 },
  navbar: {
    backgroundColor: '#5c1d24',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    flexWrap: 'wrap',
    gap: 10,
  },
  navBrand: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navTab: { paddingHorizontal: 8, paddingVertical: 4 },
  navTabActive: { backgroundColor: '#7a2831', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  navTabText: { color: '#ffd700', fontWeight: '600', fontSize: 13 },
  navTabTextActive: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  logoutButton: { backgroundColor: '#4a154b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logoutText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#5c1d24', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 15 },
  formCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  formTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10, color: '#333' },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  addButton: {
    backgroundColor: '#5c1d24',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#4a154b', marginBottom: 10 },
  productCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  productPrice: { fontSize: 13, color: '#5c1d24', fontWeight: 'bold', marginVertical: 2 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  toggleButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  deleteBtn: { backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  deleteButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});