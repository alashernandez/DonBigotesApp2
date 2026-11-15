import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
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
  serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../services/firebaseConfig';

interface Product {
  id: string;
  nombre: string;
  precio: number;
  disponible?: boolean;
}

interface OrderItem {
  id: string;
  clientName: string;
  items: string;
  total: number;
  status: 'Pendiente' | 'En preparación' | 'Entregado';
  createdAtDate: Date;
}

interface TopDish {
  name: string;
  quantity: number;
}

export default function HomeScreen({ navigation }: any) {
  const [userRole, setUserRole] = useState<'admin' | 'encargado' | 'cliente'>('cliente');
  const [userName, setUserName] = useState('Usuario');
  const [loadingUser, setLoadingUser] = useState(true);

  // Estados generales de datos
  const [products, setProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);

  // Estados exclusivos para Cliente
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: number }>({});
  const [clientOrders, setClientOrders] = useState<OrderItem[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showMyOrders, setShowMyOrders] = useState(false);

  // Métricas rápidas de hoy (Admin / Encargado)
  const [todayOrdersCount, setTodayOrdersCount] = useState(0);
  const [availableProductsCount, setAvailableProductsCount] = useState(0);
  const [todaySalesSum, setTodaySalesSum] = useState(0);

  // Estados de Analítica (Exclusivo Admin)
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week'>('today');

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // 1. Obtener perfil y rol del usuario actual
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      navigation.replace('Login');
      return;
    }

    const unsubscribeUser = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userDoc = snapshot.docs.find(
        (d) => d.id === currentUser.uid || d.data().uid === currentUser.uid
      );
      if (userDoc) {
        const data = userDoc.data();
        setUserRole(data.role || 'cliente');
        setUserName(data.nombre || currentUser.email || 'Usuario');
      }
      setLoadingUser(false);
    });

    return () => unsubscribeUser();
  }, []);

  // 2. Cargar productos y pedidos en tiempo real
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const list: Product[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        nombre: docSnap.data().nombre || 'Sin nombre',
        precio: Number(docSnap.data().precio || 0),
        disponible: docSnap.data().disponible ?? true,
      }));
      setProducts(list);
      setAvailableProductsCount(list.filter((p) => p.disponible !== false).length);
    });

    const currentUser = auth.currentUser;
    const todayStr = new Date().toDateString();

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      let countToday = 0;
      let sumTodaySales = 0;
      const myOrdersList: OrderItem[] = [];
      const fetchedOrders: OrderItem[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        const orderTotal = Number(data.total || 0);
        const safeTotal = isNaN(orderTotal) ? 0 : orderTotal;

        const orderObj: OrderItem = {
          id: doc.id,
          clientName: data.clientName || 'Cliente',
          items: data.items || '',
          total: safeTotal,
          status: data.status || 'Pendiente',
          createdAtDate: createdAt,
        };

        fetchedOrders.push(orderObj);

        const isToday = createdAt.toDateString() === todayStr || !data.createdAt;
        if (isToday) {
          countToday += 1;
          sumTodaySales += safeTotal;
        }

        if (currentUser && data.clientEmail === currentUser.email) {
          myOrdersList.push(orderObj);
        }
      });

      setAllOrders(fetchedOrders);
      setTodayOrdersCount(countToday);
      setTodaySalesSum(sumTodaySales);
      setClientOrders(myOrdersList);
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  // 3. Procesar analítica por día o semana (Exclusivo Admin)
  const getAdminAnalytics = () => {
    const now = new Date();
    const todayStr = now.toDateString();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const filteredOrders = allOrders.filter((ord) => {
      if (reportPeriod === 'today') {
        return ord.createdAtDate.toDateString() === todayStr;
      }
      return ord.createdAtDate >= sevenDaysAgo;
    });

    const periodSales = filteredOrders.reduce((acc, ord) => acc + ord.total, 0);
    const periodOrdersCount = filteredOrders.length;

    // Agrupar platillos vendidos leyendo el formato "2x Tacos, 1x Café"
    const dishCounts: { [name: string]: number } = {};

    filteredOrders.forEach((ord) => {
      if (!ord.items) return;
      const parts = ord.items.split(',');
      parts.forEach((part) => {
        const trimmed = part.trim();
        const match = trimmed.match(/^(\d+)x\s+(.+)$/i);
        if (match) {
          const qty = parseInt(match[1], 10);
          const dishName = match[2].trim();
          dishCounts[dishName] = (dishCounts[dishName] || 0) + qty;
        } else if (trimmed) {
          dishCounts[trimmed] = (dishCounts[trimmed] || 0) + 1;
        }
      });
    });

    const topDishes: TopDish[] = Object.entries(dishCounts)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    return { periodSales, periodOrdersCount, topDishes };
  };

  // Funciones del Cliente
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

  const calculateOrderDetails = () => {
    let summaryText = '';
    let totalPrice = 0;

    Object.entries(selectedItems).forEach(([id, qty]) => {
      const product = products.find((p) => p.id === id);
      if (product) {
        summaryText += `${qty}x ${product.nombre}, `;
        totalPrice += Number(product.precio || 0) * Number(qty);
      }
    });

    if (summaryText.endsWith(', ')) {
      summaryText = summaryText.slice(0, -2);
    }

    return { summaryText, totalPrice };
  };

  const handleSendClientOrder = async () => {
    const { summaryText, totalPrice } = calculateOrderDetails();

    if (!summaryText) {
      showNotification('Menú vacío', 'Selecciona al menos un platillo para ordenar.');
      return;
    }

    try {
      setSavingOrder(true);
      const currentUser = auth.currentUser;

      await addDoc(collection(db, 'orders'), {
        clientName: userName,
        clientEmail: currentUser?.email || '',
        table: 'Pedido en Línea',
        items: summaryText,
        total: Number(totalPrice),
        status: 'Pendiente',
        createdAt: serverTimestamp(),
      });

      setSelectedItems({});
      showNotification('¡Pedido enviado!', 'Tu orden ha sido enviada a cocina exitosamente.');
      setShowMyOrders(true);
    } catch (error) {
      console.error('Error al enviar pedido:', error);
      showNotification('Error', 'No se pudo enviar el pedido.');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (loadingUser) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5c1d24" />
        <Text style={{ marginTop: 10, color: '#666' }}>Cargando...</Text>
      </View>
    );
  }

  const { periodSales, periodOrdersCount, topDishes } = getAdminAnalytics();
  const maxDishQty = topDishes.length > 0 ? topDishes[0].quantity : 1;

  return (
    <ScrollView style={styles.container}>
      {/* Barra superior de navegación */}
      <View style={styles.navbar}>
        <Text style={styles.navBrand}>Don Bigotes</Text>
        <View style={styles.navActions}>
          {userRole !== 'cliente' && (
            <>
              <TouchableOpacity style={styles.navTabActive}>
                <Text style={styles.navTabTextActive}>Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navTab}
                onPress={() => navigation.navigate('Menu')}
              >
                <Text style={styles.navTabText}>Menú</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navTab}
                onPress={() => navigation.navigate('Orders')}
              >
                <Text style={styles.navTabText}>Pedidos</Text>
              </TouchableOpacity>
            </>
          )}

          {userRole === 'admin' && (
            <TouchableOpacity
              style={styles.navTab}
              onPress={() => navigation.navigate('Register', { isAdminCreating: true })}
            >
              <Text style={styles.navTabText}>Nuevo usuario</Text>
            </TouchableOpacity>
          )}

          <View style={styles.userInfoBadge}>
            <Text style={styles.userBadgeName}>{userName}</Text>
            <View style={styles.roleBadgeTag}>
              <Text style={styles.roleBadgeText}>{userRole.toUpperCase()}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Saludo */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>¡Bienvenido/a, {userName}!</Text>
        <Text style={styles.roleSubtitle}>
          {userRole === 'cliente'
            ? 'Explora el menú disponible y arma tu orden'
            : `Rol actual: ${userRole}`}
        </Text>
      </View>

      {/* VISTA EXCLUSIVA PARA CLIENTES */}
      {userRole === 'cliente' ? (
        <View>
          <View style={styles.clientTabRow}>
            <TouchableOpacity
              style={[styles.clientTabBtn, !showMyOrders && styles.clientTabBtnActive]}
              onPress={() => setShowMyOrders(false)}
            >
              <Text style={[styles.clientTabText, !showMyOrders && styles.clientTabTextActive]}>
                🍽️ Menú Disponible
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.clientTabBtn, showMyOrders && styles.clientTabBtnActive]}
              onPress={() => setShowMyOrders(true)}
            >
              <Text style={[styles.clientTabText, showMyOrders && styles.clientTabTextActive]}>
                📋 Ver Mi Pedido y Estado ({clientOrders.length})
              </Text>
            </TouchableOpacity>
          </View>

          {!showMyOrders ? (
            <View>
              <Text style={styles.sectionTitle}>Selecciona tus platillos:</Text>
              {products.filter((p) => p.disponible !== false).length === 0 ? (
                <Text style={styles.noOrdersText}>No hay menú disponible por el momento.</Text>
              ) : (
                products
                  .filter((p) => p.disponible !== false)
                  .map((item) => {
                    const qty = selectedItems[item.id] || 0;
                    return (
                      <View key={item.id} style={styles.menuCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.productName}>{item.nombre}</Text>
                          <Text style={styles.productPrice}>${item.precio.toFixed(2)}</Text>
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
                  })
              )}

              {products.filter((p) => p.disponible !== false).length > 0 && (
                <TouchableOpacity
                  style={styles.sendOrderButton}
                  onPress={handleSendClientOrder}
                  disabled={savingOrder}
                >
                  {savingOrder ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.sendOrderButtonText}>Enviar Pedido a Cocina</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.sectionTitle}>Estado de tus Pedidos Recientes</Text>
              {clientOrders.length === 0 ? (
                <Text style={styles.noOrdersText}>Aún no has realizado ningún pedido.</Text>
              ) : (
                clientOrders.map((ord) => (
                  <View key={ord.id} style={styles.orderStatusCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemsText}>{ord.items}</Text>
                      <Text style={styles.orderTotalText}>Total: ${ord.total.toFixed(2)}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            ord.status === 'Pendiente'
                              ? '#fef3c7'
                              : ord.status === 'En preparación'
                              ? '#dbeafe'
                              : '#dcfce7',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              ord.status === 'Pendiente'
                                ? '#d97706'
                                : ord.status === 'En preparación'
                                ? '#2563eb'
                                : '#16a34a',
                          },
                        ]}
                      >
                        {ord.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      ) : (
        /* VISTA PARA ADMIN / ENCARGADO */
        <View>
          {/* Tarjetas superiores de estado rápido de hoy */}
          <View style={styles.cardsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardTitle}>Pedidos de hoy</Text>
              <Text style={styles.metricCardValue}>{todayOrdersCount}</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricCardTitle}>Platillos disponibles</Text>
              <Text
                style={[
                  styles.metricCardValue,
                  availableProductsCount === 0 && { fontSize: 13, color: '#dc2626', marginTop: 4 },
                ]}
              >
                {availableProductsCount > 0 ? availableProductsCount : 'No hay menú disponible'}
              </Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricCardTitle}>Ventas del día</Text>
              <Text style={styles.metricCardValue}>${todaySalesSum.toFixed(2)}</Text>
            </View>
          </View>

          {/* MÓDULO EXCLUSIVO ADMIN: Reportes por Día / Semana y Top Platillos */}
          {userRole === 'admin' ? (
            <View style={styles.analyticsCard}>
              <View style={styles.analyticsHeader}>
                <Text style={styles.analyticsTitle}>Reporte de Ventas y Demanda</Text>
                <View style={styles.periodToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.periodBtn,
                      reportPeriod === 'today' && styles.periodBtnActive,
                    ]}
                    onPress={() => setReportPeriod('today')}
                  >
                    <Text
                      style={[
                        styles.periodBtnText,
                        reportPeriod === 'today' && styles.periodBtnTextActive,
                      ]}
                    >
                      Hoy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.periodBtn,
                      reportPeriod === 'week' && styles.periodBtnActive,
                    ]}
                    onPress={() => setReportPeriod('week')}
                  >
                    <Text
                      style={[
                        styles.periodBtnText,
                        reportPeriod === 'week' && styles.periodBtnTextActive,
                      ]}
                    >
                      Últimos 7 días
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Resumen del período seleccionado */}
              <View style={styles.summaryStrip}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Ingresos ({reportPeriod === 'today' ? 'Hoy' : '7 días'})</Text>
                  <Text style={styles.summaryNumber}>${periodSales.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Órdenes realizadas</Text>
                  <Text style={styles.summaryNumber}>{periodOrdersCount}</Text>
                </View>
              </View>

              {/* Ranking de lo más vendido */}
              <Text style={styles.topDishesSubtitle}>Platillos más vendidos</Text>
              {topDishes.length === 0 ? (
                <Text style={styles.emptyReportText}>
                  No hay ventas registradas en este período.
                </Text>
              ) : (
                topDishes.map((dish, index) => {
                  const barWidthPercent = Math.round((dish.quantity / maxDishQty) * 100);
                  return (
                    <View key={dish.name} style={styles.dishRankRow}>
                      <View style={styles.dishRankHeader}>
                        <Text style={styles.dishRankName}>
                          #{index + 1} {dish.name}
                        </Text>
                        <Text style={styles.dishRankQty}>{dish.quantity} uds.</Text>
                      </View>
                      <View style={styles.barBackground}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${barWidthPercent}%` },
                            index === 0 && { backgroundColor: '#5c1d24' },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                Como encargado, puedes gestionar la disponibilidad del menú y el control de pedidos activos.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF7', padding: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDFBF7' },
  navbar: {
    backgroundColor: '#5c1d24',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 10,
  },
  navBrand: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navTab: { paddingHorizontal: 8, paddingVertical: 4 },
  navTabActive: { backgroundColor: '#7a2831', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  navTabText: { color: '#ffd700', fontWeight: '600', fontSize: 13 },
  navTabTextActive: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  userInfoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4a154b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  userBadgeName: { color: '#fff', fontSize: 12, fontWeight: '500' },
  roleBadgeTag: { backgroundColor: '#ffd700', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  roleBadgeText: { color: '#5c1d24', fontSize: 9, fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#d97706', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logoutText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  welcomeSection: { marginBottom: 15 },
  welcomeTitle: { fontSize: 22, fontWeight: 'bold', color: '#5c1d24' },
  roleSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  metricCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e0d8',
    elevation: 2,
  },
  metricCardTitle: { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: '600' },
  metricCardValue: { fontSize: 22, fontWeight: 'bold', color: '#5c1d24' },
  infoBox: {
    backgroundColor: '#f5efe6',
    borderWidth: 1,
    borderColor: '#e5dcce',
    padding: 16,
    borderRadius: 10,
  },
  infoBoxText: { color: '#5c1d24', fontSize: 13, textAlign: 'center', fontWeight: '500' },

  // Estilos Analítica Admin
  analyticsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e0d8',
    marginBottom: 30,
    elevation: 2,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  analyticsTitle: { fontSize: 16, fontWeight: 'bold', color: '#5c1d24' },
  periodToggleRow: { flexDirection: 'row', backgroundColor: '#f3eee6', borderRadius: 8, padding: 3 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  periodBtnActive: { backgroundColor: '#5c1d24' },
  periodBtnText: { fontSize: 12, fontWeight: '600', color: '#5c1d24' },
  periodBtnTextActive: { color: '#fff' },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#FDFBF7',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#e5e0d8' },
  summaryLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  summaryNumber: { fontSize: 18, fontWeight: 'bold', color: '#16a34a' },
  topDishesSubtitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  emptyReportText: { textAlign: 'center', color: '#888', fontSize: 13, paddingVertical: 15 },
  dishRankRow: { marginBottom: 12 },
  dishRankHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dishRankName: { fontSize: 13, fontWeight: '600', color: '#333' },
  dishRankQty: { fontSize: 13, fontWeight: 'bold', color: '#5c1d24' },
  barBackground: { height: 8, backgroundColor: '#f0ebe1', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#d97706', borderRadius: 4 },

  // Estilos Cliente
  clientTabRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  clientTabBtn: { flex: 1, padding: 10, backgroundColor: '#e5e0d8', borderRadius: 8, alignItems: 'center' },
  clientTabBtnActive: { backgroundColor: '#5c1d24' },
  clientTabText: { fontSize: 13, fontWeight: 'bold', color: '#5c1d24' },
  clientTabTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#5c1d24', marginBottom: 10 },
  menuCard: {
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
  productPrice: { fontSize: 13, color: '#5c1d24', fontWeight: 'bold', marginTop: 2 },
  counterContainer: { flexDirection: 'row', alignItems: 'center' },
  counterBtn: { width: 30, height: 30, backgroundColor: '#5c1d24', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  counterBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  counterText: { marginHorizontal: 12, fontSize: 15, fontWeight: 'bold', color: '#333' },
  sendOrderButton: { backgroundColor: '#16a34a', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 15, marginBottom: 30 },
  sendOrderButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  noOrdersText: { textAlign: 'center', color: '#666', marginTop: 20, fontSize: 14 },
  orderStatusCard: {
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
  orderItemsText: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 4 },
  orderTotalText: { fontSize: 13, fontWeight: 'bold', color: '#5c1d24' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
});