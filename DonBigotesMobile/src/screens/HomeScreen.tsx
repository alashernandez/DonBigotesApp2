import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
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
  status: string;
  createdAtDate: Date;
}

interface TopDish {
  name: string;
  quantity: number;
}

interface DailySalesRow {
  dateKey: string;
  label: string;
  orders: number;
  revenue: number;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeStatus(raw: string): string {
  return (raw || 'Pendiente').trim().toLowerCase();
}

export default function HomeScreen({ navigation }: any) {
  const [userRole, setUserRole] = useState<'admin' | 'encargado'>('encargado');
  const [userName, setUserName] = useState('Usuario');
  const [loadingUser, setLoadingUser] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);

  // Tabla de últimos 7 días en vista Admin
  const [showSevenDaysTable, setShowSevenDaysTable] = useState(true);

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // 1. Obtener perfil y rol del usuario actual desde Firestore (`users`)
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
        const rawRole = String(data.role || 'cliente').toLowerCase();

        if (rawRole === 'cliente') {
          setLoadingUser(false);
          navigation.replace('ClientDashboard');
          return;
        }

        if (rawRole === 'admin' || rawRole === 'encargado') {
          setUserRole(rawRole);
        } else {
          setUserRole('encargado');
        }
        setUserName(data.nombre || currentUser.email || 'Usuario');
      }
      setLoadingUser(false);
    });

    return () => unsubscribeUser();
  }, [navigation]);

  // 2. Cargar productos (`productos`) y pedidos (`orders`) en tiempo real
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const list: Product[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data();
        const isAvailable =
          typeof raw.disponible === 'boolean'
            ? raw.disponible
            : typeof raw.available === 'boolean'
            ? raw.available
            : true;

        return {
          id: docSnap.id,
          nombre: raw.nombre || raw.name || 'Sin nombre',
          precio: Number(raw.precio ?? raw.price ?? 0),
          disponible: isAvailable,
        };
      });
      setProducts(list);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const fetchedOrders: OrderItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate()
          : data.createdAt
          ? new Date(data.createdAt)
          : new Date();
        const orderTotal = Number(data.total ?? 0);
        const safeTotal = Number.isNaN(orderTotal) ? 0 : orderTotal;

        return {
          id: docSnap.id,
          clientName: data.clientName || 'Cliente',
          items: data.items || '',
          total: safeTotal,
          status: data.status || 'Pendiente',
          createdAtDate: createdAt,
        };
      });

      setAllOrders(fetchedOrders);
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  // 3. Calcular resumen alineado a DashboardSummary (Web)
  const getDashboardSummary = () => {
    const now = new Date();
    const todayKey = toDateKey(now);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Lunes de esta semana (00:00:00)
    const dayOfWeek = startOfToday.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - diffToMonday);

    // Día 1 del mes actual (00:00:00)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Ventana de últimos 7 días (hace 6 días hasta hoy = 7 días)
    const startOf7Days = new Date(startOfToday);
    startOf7Days.setDate(startOfToday.getDate() - 6);

    const availableDishes = products.filter((p) => p.disponible !== false).length;
    const totalDishes = products.length;

    let ordersToday = 0;
    let cancelledToday = 0;
    let saleToday = 0;
    let revenueToday = 0;
    let pendingRevenueToday = 0;

    let weekRevenue = 0;
    let weekOrders = 0;

    let monthRevenue = 0;
    let monthOrders = 0;

    const activeOrders: OrderItem[] = [];
    const statusCounts: Record<string, number> = {};
    const dishCounts7Days: Record<string, number> = {};

    const last7DaysMap: Record<string, DailySalesRow> = {};
    const last7DaysList: DailySalesRow[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(startOfToday.getDate() - i);
      const key = toDateKey(d);
      const label =
        i === 0
          ? 'Hoy'
          : d.toLocaleDateString('es-ES', {
              weekday: 'short',
              day: 'numeric',
            });
      const row: DailySalesRow = { dateKey: key, label, orders: 0, revenue: 0 };
      last7DaysMap[key] = row;
      last7DaysList.push(row);
    }

    const sortedOrders = [...allOrders].sort(
      (a, b) => a.createdAtDate.getTime() - b.createdAtDate.getTime()
    );

    sortedOrders.forEach((ord) => {
      const st = normalizeStatus(ord.status);
      const isCancelled = st === 'cancelado' || st === 'cancelada';
      const isDelivered =
        st === 'entregado' || st === 'entregada' || st === 'completado';
      const isInProgress =
        st === 'pendiente' ||
        st === 'en preparación' ||
        st === 'en preparacion' ||
        st === 'listo para entregar' ||
        st === 'listo';

      const ordDate = ord.createdAtDate;
      const isToday = toDateKey(ordDate) === todayKey;

      if (isInProgress) {
        activeOrders.push(ord);
      }

      if (isToday) {
        statusCounts[ord.status] = (statusCounts[ord.status] || 0) + 1;

        if (isCancelled) {
          cancelledToday += 1;
        } else {
          ordersToday += 1;
        }

        if (isDelivered) {
          saleToday += 1;
          revenueToday += ord.total;
        } else if (!isCancelled) {
          pendingRevenueToday += ord.total;
        }
      }

      if (!isCancelled && ordDate >= startOfWeek) {
        weekOrders += 1;
        if (isDelivered) {
          weekRevenue += ord.total;
        }
      }

      if (isDelivered && ordDate >= startOfMonth) {
        monthOrders += 1;
        monthRevenue += ord.total;
      }

      const ordDayStart = new Date(
        ordDate.getFullYear(),
        ordDate.getMonth(),
        ordDate.getDate()
      );
      if (
        !isCancelled &&
        ordDayStart >= startOf7Days &&
        ordDayStart <= startOfToday
      ) {
        const key = toDateKey(ordDayStart);
        if (last7DaysMap[key]) {
          last7DaysMap[key].orders += 1;
          if (isDelivered) {
            last7DaysMap[key].revenue += ord.total;
          }
        }

        if (ord.items) {
          ord.items.split(',').forEach((part) => {
            const trimmed = part.trim();
            const match = trimmed.match(/^(\d+)x\s+(.+)$/i);
            if (match) {
              const qty = parseInt(match[1], 10);
              const dishName = match[2].trim();
              dishCounts7Days[dishName] = (dishCounts7Days[dishName] || 0) + qty;
            } else if (trimmed) {
              dishCounts7Days[trimmed] = (dishCounts7Days[trimmed] || 0) + 1;
            }
          });
        }
      }
    });

    const averageTicketMonth = monthOrders > 0 ? monthRevenue / monthOrders : 0;
    const total7DaysRevenue = last7DaysList.reduce((acc, r) => acc + r.revenue, 0);

    const topDishes: TopDish[] = Object.entries(dishCounts7Days)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    return {
      ordersToday,
      cancelledToday,
      inProgressToday: activeOrders.length,
      availableDishes,
      totalDishes,
      saleToday,
      activeOrders,
      revenueToday,
      pendingRevenueToday,
      weekRevenue,
      weekOrders,
      monthRevenue,
      monthOrders,
      averageTicketMonth,
      last7DaysList,
      total7DaysRevenue,
      topDishes,
      statusCounts,
    };
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      showNotification('Error', 'No se pudo cerrar sesión.');
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

  const summary = getDashboardSummary();
  const maxDishQty = summary.topDishes.length > 0 ? summary.topDishes[0].quantity : 1;
  const formattedDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Barra superior de navegación */}
      <View style={styles.navbar}>
        <Text style={styles.navBrand}>Don Bigotes</Text>
        <View style={styles.navActions}>
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

      {/* Saludo y fecha */}
      <View style={styles.welcomeHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeTitle}>Bienvenido/a, {userName}</Text>
          <Text style={styles.roleSubtitle}>
            Rol actual: {userRole.charAt(0).toUpperCase() + userRole.slice(1)} ·{' '}
            {formattedDate}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshChip} onPress={onRefresh}>
          <Text style={styles.refreshChipText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {/* VISTA PARA ADMIN / ENCARGADO */}
      <View>
        {/* 4 métricas principales */}
        <View style={styles.grid2}>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardTitle}>Pedidos de hoy</Text>
            <Text style={styles.metricCardValue}>{summary.ordersToday}</Text>
            <Text style={styles.metricCardSub}>{summary.cancelledToday} cancelados</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricCardTitle}>Pedidos activos</Text>
            <Text style={styles.metricCardValue}>{summary.inProgressToday}</Text>
            <Text style={styles.metricCardSub}>Pendientes, en preparación o listos</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricCardTitle}>Platillos disponibles</Text>
            <Text style={styles.metricCardValue}>{summary.availableDishes}</Text>
            <Text style={styles.metricCardSub}>de {summary.totalDishes} en el menú</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricCardTitle}>Ventas del día</Text>
            <Text style={styles.metricCardValue}>{summary.saleToday}</Text>
            <Text style={styles.metricCardSub}>Pedidos entregados</Text>
          </View>
        </View>

        {/* Pedidos activos */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionCardTitle}>
              Pedidos activos ({summary.inProgressToday})
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
              <Text style={styles.linkAction}>Ir a pedidos →</Text>
            </TouchableOpacity>
          </View>

          {summary.activeOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyBoxText}>
                No hay pedidos en curso en este momento.
              </Text>
            </View>
          ) : (
            summary.activeOrders.map((ord) => (
              <View key={ord.id} style={styles.activeOrderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeOrderClient}>
                    {ord.clientName} · {ord.status}
                  </Text>
                  <Text style={styles.activeOrderItems}>{ord.items}</Text>
                </View>
                <Text style={styles.activeOrderTotal}>${ord.total.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>

        {/* MÓDULO EXCLUSIVO ADMIN */}
        {userRole === 'admin' ? (
          <View style={{ paddingBottom: 24 }}>
            <Text style={styles.adminEyebrow}>SOLO ADMIN · VENTAS E INGRESOS</Text>

            <View style={styles.grid2}>
              <View style={[styles.metricCard, styles.highlightCard]}>
                <Text style={styles.metricCardTitle}>Ingresos de hoy</Text>
                <Text style={styles.moneyValue}>${summary.revenueToday.toFixed(2)}</Text>
                <Text style={styles.metricCardSub}>
                  ${summary.pendingRevenueToday.toFixed(2)} por cobrar
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricCardTitle}>Esta semana</Text>
                <Text style={styles.moneyValue}>${summary.weekRevenue.toFixed(2)}</Text>
                <Text style={styles.metricCardSub}>
                  {summary.weekOrders} pedidos · desde el lunes
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricCardTitle}>Este mes</Text>
                <Text style={styles.moneyValue}>${summary.monthRevenue.toFixed(2)}</Text>
                <Text style={styles.metricCardSub}>
                  {summary.monthOrders} pedidos entregados
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricCardTitle}>Ticket promedio</Text>
                <Text style={styles.moneyValue}>
                  ${summary.averageTicketMonth.toFixed(2)}
                </Text>
                <Text style={styles.metricCardSub}>Por pedido entregado este mes</Text>
              </View>
            </View>

            {/* Ingresos de los últimos 7 días */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionCardTitle}>
                  Ingresos de los últimos 7 días
                </Text>
                <Text style={styles.totalPeriodText}>
                  Total: ${summary.total7DaysRevenue.toFixed(2)}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setShowSevenDaysTable((prev) => !prev)}>
                <Text style={styles.toggleTableText}>
                  {showSevenDaysTable ? '▾ Ver como tabla' : '▸ Ver como tabla'}
                </Text>
              </TouchableOpacity>

              {showSevenDaysTable && (
                <View style={{ marginTop: 10 }}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { flex: 2 }]}>DÍA</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>
                      PEDIDOS
                    </Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>
                      INGRESOS
                    </Text>
                  </View>
                  {summary.last7DaysList.map((row) => (
                    <View key={row.dateKey} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 2 }]}>{row.label}</Text>
                      <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                        {row.orders}
                      </Text>
                      <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                        ${row.revenue.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Platillos más vendidos (7 días) */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>
                Platillos más vendidos (7 días)
              </Text>
              {summary.topDishes.length === 0 ? (
                <Text style={styles.emptyReportText}>
                  Aún no hay ventas registradas en este periodo.
                </Text>
              ) : (
                summary.topDishes.map((dish, index) => {
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

            {/* Pedidos de hoy por estado */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>
                Pedidos de hoy por estado ({summary.ordersToday})
              </Text>
              {Object.keys(summary.statusCounts).length === 0 ? (
                <Text style={styles.emptyReportText}>Aún no hay pedidos hoy.</Text>
              ) : (
                Object.entries(summary.statusCounts).map(([statusName, count]) => (
                  <View key={statusName} style={styles.statusSummaryRow}>
                    <Text style={styles.td}>{statusName}</Text>
                    <Text style={styles.tdBold}>{count}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : (
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxText}>
              Como encargado, puedes gestionar la disponibilidad del menú y el control de
              pedidos activos.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5ede0', padding: 14 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5ede0',
  },
  navbar: {
    backgroundColor: '#5c1d24',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  navBrand: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navTab: { paddingHorizontal: 8, paddingVertical: 4 },
  navTabActive: {
    backgroundColor: '#b45309',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  navTabText: { color: '#ffd700', fontWeight: '600', fontSize: 13 },
  navTabTextActive: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  userInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#47151b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  userBadgeName: { color: '#fff', fontSize: 12, fontWeight: '500' },
  roleBadgeTag: {
    backgroundColor: '#ffd700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  roleBadgeText: { color: '#5c1d24', fontSize: 9, fontWeight: 'bold' },
  logoutButton: {
    backgroundColor: '#b45309',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  logoutText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  welcomeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 10,
  },
  welcomeTitle: { fontSize: 22, fontWeight: 'bold', color: '#4a151b' },
  roleSubtitle: { fontSize: 13, color: '#6b5c54', marginTop: 2 },
  refreshChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd0be',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshChipText: { color: '#4a151b', fontSize: 12, fontWeight: '600' },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    width: '48.4%',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8dccb',
    elevation: 1,
  },
  highlightCard: {
    backgroundColor: '#f7ead9',
    borderColor: '#d9b994',
  },
  metricCardTitle: {
    fontSize: 13,
    color: '#5c4b43',
    marginBottom: 6,
    fontWeight: '600',
  },
  metricCardValue: { fontSize: 24, fontWeight: '800', color: '#4a151b' },
  moneyValue: { fontSize: 21, fontWeight: '800', color: '#4a151b' },
  metricCardSub: { fontSize: 11, color: '#7a6a62', marginTop: 4 },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8dccb',
    marginBottom: 14,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionCardTitle: { fontSize: 16, fontWeight: '700', color: '#4a151b' },
  linkAction: { fontSize: 13, fontWeight: '700', color: '#5c1d24' },
  emptyBox: {
    backgroundColor: '#faf4eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  emptyBoxText: { color: '#6b5c54', fontSize: 13 },
  activeOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f2e8da',
  },
  activeOrderClient: { fontSize: 13, fontWeight: '700', color: '#4a151b' },
  activeOrderItems: { fontSize: 12, color: '#6b5c54' },
  activeOrderTotal: { fontSize: 14, fontWeight: '700', color: '#4a151b' },
  adminEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8a5a36',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 2,
  },
  totalPeriodText: { fontSize: 13, fontWeight: '700', color: '#6b5c54' },
  toggleTableText: { fontSize: 12, fontWeight: '600', color: '#6b5c54' },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e6d9c8',
    paddingBottom: 6,
    marginBottom: 4,
  },
  th: { fontSize: 11, fontWeight: '700', color: '#7a6a62' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3ece2',
    paddingVertical: 7,
  },
  td: { fontSize: 13, color: '#3f322c' },
  tdBold: { fontSize: 13, fontWeight: '700', color: '#4a151b' },
  infoBox: {
    backgroundColor: '#f5efe6',
    borderWidth: 1,
    borderColor: '#e5dcce',
    padding: 16,
    borderRadius: 10,
    marginBottom: 24,
  },
  infoBoxText: {
    color: '#5c1d24',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyReportText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    paddingVertical: 12,
  },
  dishRankRow: { marginBottom: 12 },
  dishRankHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dishRankName: { fontSize: 13, fontWeight: '600', color: '#333' },
  dishRankQty: { fontSize: 13, fontWeight: 'bold', color: '#5c1d24' },
  barBackground: {
    height: 8,
    backgroundColor: '#f0ebe1',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#d97706', borderRadius: 4 },
  statusSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f5efe6',
  },
});