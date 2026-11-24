import React, { useEffect, useState } from 'react';
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
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';

const CATEGORIES = ['Almuerzo', 'Mexicana', 'Bebida', 'Postre'] as const;
type CategoryType = (typeof CATEGORIES)[number];

interface Dish {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  descripcion?: string;
  disponible: boolean;
}

export default function MenuScreen({ navigation }: any) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [categoria, setCategoria] = useState<CategoryType>('Almuerzo');
  const [descripcion, setDescripcion] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const notify = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsAdmin(false);
      return;
    }

    const unsubUser = onSnapshot(collection(db, 'users'), (snap) => {
      const found = snap.docs.find(
        (d) => d.id === currentUser.uid || d.data().uid === currentUser.uid
      );
      const roleVal = String(found?.data()?.role || '').toLowerCase();
      setIsAdmin(roleVal === 'admin');
    });

    return () => unsubUser();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'productos'),
      (snapshot) => {
        const list: Dish[] = snapshot.docs.map((snap) => {
          const data = snap.data();
          const isAvailable =
            typeof data.disponible === 'boolean'
              ? data.disponible
              : typeof data.available === 'boolean'
              ? data.available
              : true;

          return {
            id: snap.id,
            nombre: data.nombre || data.name || 'Sin nombre',
            precio: Number(data.precio ?? data.price ?? 0),
            categoria: String(data.categoria || data.category || 'Almuerzo'),
            descripcion: data.descripcion || data.description || '',
            disponible: isAvailable,
          };
        });

        setDishes(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error al escuchar productos en Firestore:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      notify('Error', 'No se pudo cerrar sesión.');
    }
  };

  const handleAddDish = async () => {
    const cleanName = nombre.trim();
    const numericPrice = parseFloat(precio.replace(',', '.'));

    if (!cleanName) {
      notify('Campo requerido', 'Ingresa el nombre del platillo.');
      return;
    }
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      notify('Precio inválido', 'Ingresa un precio válido mayor a 0.');
      return;
    }

    try {
      setSaving(true);
      const cleanDesc = descripcion.trim();
      const lowerCat = categoria.toLowerCase();

      await addDoc(collection(db, 'productos'), {
        nombre: cleanName,
        name: cleanName,
        precio: numericPrice,
        price: numericPrice,
        categoria,
        category: lowerCat,
        descripcion: cleanDesc,
        description: cleanDesc,
        disponible: true,
        available: true,
        createdAt: serverTimestamp(),
      });

      setNombre('');
      setPrecio('');
      setDescripcion('');
      setDropdownOpen(false);
    } catch (error) {
      console.error('Error al agregar platillo:', error);
      notify('Error', 'No se pudo agregar el platillo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (dish: Dish) => {
    const nextAvailable = !dish.disponible;
    try {
      await updateDoc(doc(db, 'productos', dish.id), {
        disponible: nextAvailable,
        available: nextAvailable,
      });
    } catch (error) {
      console.error('Error al cambiar disponibilidad:', error);
      notify('Error', 'No se pudo actualizar la disponibilidad.');
    }
  };

  const handleDeleteDish = async (dish: Dish) => {
    const performDelete = async () => {
      try {
        await deleteDoc(doc(db, 'productos', dish.id));
      } catch (error) {
        console.error('Error al eliminar platillo:', error);
        notify('Error', 'No se pudo eliminar el platillo.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar "${dish.nombre}" del menú?`)) {
        await performDelete();
      }
      return;
    }

    Alert.alert(
      'Eliminar platillo',
      `¿Seguro que deseas eliminar "${dish.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: performDelete },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
          <View style={styles.navActivePill}>
            <Text style={styles.navActiveText}>Menú</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
            <Text style={styles.navLinkYellow}>Pedidos</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Register', { isAdminCreating: true })}
            >
              <Text style={styles.navLinkYellow}>Nuevo usuario</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.pageTitle}>Gestión de Menú - Don Bigotes</Text>
      <Text style={styles.pageSubtitle}>Control Completo de Platillos y Disponibilidad</Text>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Agregar Nuevo Platillo</Text>

        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, styles.flexInput]}
            placeholder="Nombre"
            placeholderTextColor="#9ca3af"
            value={nombre}
            onChangeText={setNombre}
          />

          <TextInput
            style={[styles.input, styles.priceInput]}
            placeholder="Precio ($)"
            placeholderTextColor="#9ca3af"
            value={precio}
            onChangeText={setPrecio}
            keyboardType="decimal-pad"
          />

          <View style={styles.dropdownWrapper}>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setDropdownOpen((prev) => !prev)}
            >
              <Text style={styles.dropdownButtonText}>{categoria}</Text>
              <Text style={styles.caret}>▾</Text>
            </TouchableOpacity>

            {dropdownOpen && (
              <View style={styles.dropdownMenu}>
                {CATEGORIES.map((cat) => {
                  const selected = cat === categoria;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                      onPress={() => {
                        setCategoria(cat);
                        setDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selected && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddDish}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.addButtonText}>+ Agregar</Text>
            )}
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder="Descripción corta"
          placeholderTextColor="#9ca3af"
          value={descripcion}
          onChangeText={setDescripcion}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5c1d24" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.cardsGrid}>
          {dishes.map((dish) => (
            <View key={dish.id} style={styles.dishCard}>
              <View style={styles.dishTopRow}>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.nombre}
                </Text>
                <View style={styles.dishPriceDeleteRow}>
                  <Text style={styles.dishPrice}>${dish.precio.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={styles.deleteMiniBtn}
                    onPress={() => handleDeleteDish(dish)}
                  >
                    <Text style={styles.deleteMiniText}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{dish.categoria}</Text>
              </View>

              {!!dish.descripcion && (
                <Text style={styles.dishDesc} numberOfLines={2}>
                  {dish.descripcion}
                </Text>
              )}

              <View style={styles.dishDivider} />

              <View style={styles.dishFooterRow}>
                <Text
                  style={[
                    styles.statusLabel,
                    { color: dish.disponible ? '#16a34a' : '#dc2626' },
                  ]}
                >
                  • {dish.disponible ? 'Disponible' : 'Agotado'}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.toggleAvailabilityBtn,
                    dish.disponible ? styles.btnMarkSoldOut : styles.btnMarkAvailable,
                  ]}
                  onPress={() => handleToggleAvailability(dish)}
                >
                  <Text
                    style={[
                      styles.toggleAvailabilityText,
                      dish.disponible ? styles.textMarkSoldOut : styles.textMarkAvailable,
                    ]}
                  >
                    {dish.disponible ? 'Marcar Agotado' : 'Marcar Disponible'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#efe4d2' },
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
    backgroundColor: '#7a2831',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  navActiveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#2b1b17' },
  pageSubtitle: { fontSize: 13, color: '#6b5c54', marginTop: 2, marginBottom: 14 },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6d8c5',
    marginBottom: 16,
    zIndex: 20,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#2b1b17', marginBottom: 12 },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#1f2937',
  },
  flexInput: { flex: 1, minWidth: 140 },
  priceInput: { width: 95 },

  dropdownWrapper: { position: 'relative', minWidth: 120, zIndex: 30 },
  dropdownButton: {
    height: 40,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: { fontSize: 13, color: '#111827', fontWeight: '500' },
  caret: { fontSize: 12, color: '#111827', marginLeft: 6 },
  dropdownMenu: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    elevation: 6,
    zIndex: 50,
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 8 },
  dropdownItemSelected: { backgroundColor: '#1d4ed8' },
  dropdownItemText: { fontSize: 13, color: '#111827' },
  dropdownItemTextSelected: { color: '#fff', fontWeight: '600' },

  addButton: {
    height: 40,
    backgroundColor: '#b45309',
    paddingHorizontal: 18,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  dishCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  dishTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  dishName: { fontSize: 16, fontWeight: '700', color: '#1f2937', flex: 1 },
  dishPriceDeleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dishPrice: { fontSize: 16, fontWeight: '800', color: '#16a34a' },
  deleteMiniBtn: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteMiniText: { color: '#ef4444', fontSize: 15, fontWeight: '700', lineHeight: 17 },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    marginTop: 8,
  },
  categoryChipText: { fontSize: 11, color: '#4b5563', fontWeight: '600' },
  dishDesc: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  dishDivider: { height: 1, backgroundColor: '#f3ece2', marginVertical: 12 },
  dishFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: { fontSize: 13, fontWeight: '700' },
  toggleAvailabilityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  btnMarkSoldOut: { backgroundColor: '#fee2e2' },
  textMarkSoldOut: { color: '#dc2626', fontWeight: '700', fontSize: 12 },
  btnMarkAvailable: { backgroundColor: '#fef3c7' },
  textMarkAvailable: { color: '#b45309', fontWeight: '700', fontSize: 12 },
});