import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

interface OrderItem {
  id: string;
  table: string;
  items: string;
  total: number;
  status: 'Pendiente' | 'En preparación' | 'Entregado';
}

export default function OrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Campos para el nuevo pedido
  const [table, setTable] = useState('');
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: number }>({}); // idPlatillo -> cantidad

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // 1. Cargar el catálogo desde la colección 'productos' en Firestore
  useEffect(() => {
    const unsubscribeMenu = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const list: MenuItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.nombre || data.name || 'Platillo sin nombre',
          price: Number(data.precio || data.price || 0),
        };
      });
      setMenuItems(list);
    }, (error) => {
      console.log('Error leyendo productos:', error);
    });

    // 2. Cargar los pedidos activos en tiempo real
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(
      q,
      (snapshot) => {
        const list: OrderItem[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          table: docSnap.data().table || 'Sin mesa',
          items: docSnap.data().items || '',
          total: docSnap.data().total || 0,
          status: docSnap.data().status || 'Pendiente',
        }));
        setOrders(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error al cargar pedidos:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeMenu();
      unsubscribeOrders();
    };
  }, []);

  // Manejar cantidad de un platillo en el pedido
  const handleQuantityChange = (id: string, delta: number) => {
    setSelectedItems((prev) => {
      const current = prev[id] || 0;
      const updated = current + delta;
      if (updated <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: updated };
    });
  };

  // Calcular total y texto descriptivo del pedido
  const calculateOrderDetails = () => {
    let summaryText = '';
    let totalPrice = 0;

    Object.entries(selectedItems).forEach(([id, qty]) => {
      const menuItem = menuItems.find((m) => m.id === id);
      if (menuItem) {
        summaryText += `${qty}x ${menuItem.name}, `;
        totalPrice += menuItem.price * qty;
      }
    });

    if (summaryText.endsWith(', ')) {
      summaryText = summaryText.slice(0, -2);
    }

    return { summaryText, totalPrice };
  };

  // Guardar pedido en Firestore
  const handleCreateOrder = async () => {
    if (!table.trim()) {
      showNotification('Mesa requerida', 'Por favor ingresa el número de mesa o si es para llevar.');
      return;
    }

    const { summaryText, totalPrice } = calculateOrderDetails();

    if (!summaryText) {
      showNotification('Menú vacío', 'Selecciona al menos un platillo del menú para ordenar.');
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, 'orders'), {
        table: table.trim(),
        items: summaryText,
        total: totalPrice,
        status: 'Pendiente',
        createdAt: serverTimestamp(),
      });
      setTable('');
      setSelectedItems({});
    } catch (error) {
      console.error('Error al guardar pedido:', error);
      showNotification('Error', 'No se pudo registrar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  // Cambiar estado del pedido al tocarlo
  const handleCycleStatus = async (order: OrderItem) => {
    const nextStatusMap: Record<OrderItem['status'], OrderItem['status']> = {
      Pendiente: 'En preparación',
      'En preparación': 'Entregado',
      Entregado: 'Pendiente',
    };
    const nextStatus = nextStatusMap[order.status] || 'Pendiente';

    try {
      await updateDoc(doc(db, 'orders', order.id), { status: nextStatus });
    } catch (error) {
      console.error('Error al actualizar estado:', error);
    }
  };

  const getStatusColor = (status: OrderItem['status']) => {
    switch (status) {
      case 'Pendiente': return '#d97706';
      case 'En preparación': return '#2563eb';
      case 'Entregado': return '#16a34a';
      default: return '#666';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Control de Pedidos</Text>
      <Text style={styles.subtitle}>Selección de Menú y Comandas - Don Bigotes</Text>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Volver a Gestión de Menú</Text>
      </TouchableOpacity>

      {/* Formulario de selección interactiva */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Nuevo Pedido por Selección</Text>
        <TextInput
          style={styles.input}
          placeholder="Mesa / Cliente (Ej. Mesa 2)"
          value={table}
          onChangeText={setTable}
        />

        <Text style={styles.labelMenu}>Selecciona los platillos del Menú:</Text>
        {menuItems.map((item) => {
          const qty = selectedItems[item.id] || 0;
          return (
            <View key={item.id} style={styles.menuRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>{item.name}</Text>
                <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
              </View>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => handleQuantityChange(item.id, -1)}
                >
                  <Text style={styles.counterBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterText}>{qty}</Text>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => handleQuantityChange(item.id, 1)}
                >
                  <Text style={styles.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addButton} onPress={handleCreateOrder} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>Confirmar y Enviar Pedido</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Comandas Activas (Toca para cambiar estado)</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#5c1d24" style={{ marginTop: 20 }} />
      ) : (
        orders.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => handleCycleStatus(item)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.tableText}>{item.table}</Text>
              <Text style={styles.itemsText}>{item.items}</Text>
              {item.total > 0 && <Text style={styles.totalText}>Total: ${item.total.toFixed(2)}</Text>}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '1A' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#FDFBF7' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#5c1d24', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 15 },
  backButton: { backgroundColor: '#4a154b', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  backButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  formCard: { backgroundColor: '#fff', padding: 16, borderRadius: 10, marginBottom: 18, borderWidth: 1, borderColor: '#e0e0e0' },
  formTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10, color: '#333' },
  input: { height: 40, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, marginBottom: 12, backgroundColor: '#fafafa' },
  labelMenu: { fontSize: 14, fontWeight: 'bold', color: '#5c1d24', marginBottom: 8 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuName: { fontSize: 14, fontWeight: '500', color: '#333' },
  menuPrice: { fontSize: 12, color: '#5c1d24', fontWeight: 'bold' },
  counterContainer: { flexDirection: 'row', alignItems: 'center' },
  counterBtn: { width: 28, height: 28, backgroundColor: '#5c1d24', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  counterBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  counterText: { marginHorizontal: 12, fontSize: 14, fontWeight: 'bold', color: '#333' },
  addButton: { backgroundColor: '#5c1d24', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#4a154b', marginBottom: 10 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableText: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  itemsText: { fontSize: 13, color: '#666', marginBottom: 2 },
  totalText: { fontSize: 12, fontWeight: 'bold', color: '#5c1d24' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
});