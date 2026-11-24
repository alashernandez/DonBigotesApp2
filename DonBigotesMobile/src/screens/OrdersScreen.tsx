import React, { useEffect, useMemo, useState } from 'react';
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
  RefreshControl,
  Modal,
} from 'react-native';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';

const DELIVERY_TYPES = ['Comer en el local', 'Para llevar', 'A domicilio'] as const;
type DeliveryType = (typeof DELIVERY_TYPES)[number];

const PAYMENT_METHODS = ['Efectivo', 'Tarjeta'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const ORDER_STATUSES = [
  'Pendiente',
  'En preparación',
  'Listo para entregar',
  'Entregado',
  'Cancelado',
] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

type DateFilterType = 'today' | 'yesterday' | 'last7days' | 'all' | 'custom';

const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface Product {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
}

interface OrderRecord {
  id: string;
  clientName: string;
  clientPhone?: string;
  notes?: string;
  deliveryType: string;
  paymentMethod: string;
  items: string;
  total: number;
  status: OrderStatus;
  createdAtDate: Date;
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function getFirstWeekdayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0, 1).getDay();
}

function normalizeOrderStatus(raw: unknown): OrderStatus {
  const val = String(raw || 'Pendiente').trim().toLowerCase();
  if (val === 'en preparación' || val === 'en preparacion') return 'En preparación';
  if (val === 'listo para entregar' || val === 'listo') return 'Listo para entregar';
  if (val === 'entregado' || val === 'completado') return 'Entregado';
  if (val === 'cancelado' || val === 'cancelada') return 'Cancelado';
  return 'Pendiente';
}

function getStatusBadgeStyle(status: OrderStatus) {
  switch (status) {
    case 'Pendiente':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'En preparación':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'Listo para entregar':
      return { bg: '#ede9fe', text: '#6d28d9' };
    case 'Entregado':
      return { bg: '#dcfce7', text: '#15803d' };
    case 'Cancelado':
      return { bg: '#fee2e2', text: '#dc2626' };
  }
}

export default function OrdersScreen({ navigation }: any) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('Comer en el local');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [quantities, setQuantities] = useState<{ [productId: string]: number }>({});

  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [customDateStr, setCustomDateStr] = useState<string>(() => toYMD(new Date()));
  const [statusFilter, setStatusFilter] = useState<'Todos' | OrderStatus>('Todos');

  const [calendarVisible, setCalendarVisible] = useState(false);
  const initialDate = useMemo(() => {
    const parts = customDateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  }, [customDateStr]);

  const [calYear, setCalYear] = useState<number>(initialDate.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(initialDate.getMonth());

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
    const unsubProducts = onSnapshot(
      collection(db, 'productos'),
      (snap) => {
        const list: Product[] = snap.docs.map((d) => {
          const raw = d.data();
          const available =
            typeof raw.disponible === 'boolean'
              ? raw.disponible
              : typeof raw.available === 'boolean'
              ? raw.available
              : true;

          return {
            id: d.id,
            nombre: raw.nombre || raw.name || 'Sin nombre',
            precio: Number(raw.precio ?? raw.price ?? 0),
            disponible: available,
          };
        });
        setProducts(list);
        setLoadingMenu(false);
      },
      (err) => {
        console.error('Error al cargar productos en Pedidos:', err);
        setLoadingMenu(false);
      }
    );

    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list: OrderRecord[] = snap.docs.map((d) => {
          const raw = d.data();
          const createdAt = raw.createdAt?.toDate
            ? raw.createdAt.toDate()
            : raw.createdAt
            ? new Date(raw.createdAt)
            : new Date();

          return {
            id: d.id,
            clientName: raw.clientName || 'Cliente',
            clientPhone: raw.clientPhone || '',
            notes: raw.notes || '',
            deliveryType: raw.deliveryType || raw.table || 'Comer en el local',
            paymentMethod: raw.paymentMethod || 'Efectivo',
            items: raw.items || '',
            total: Number(raw.total ?? 0),
            status: normalizeOrderStatus(raw.status),
            createdAtDate: createdAt,
          };
        });

        list.sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime());
        setOrders(list);
        setLoadingOrders(false);
      },
      (err) => {
        console.error('Error al cargar pedidos:', err);
        setLoadingOrders(false);
      }
    );

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      notify('Error', 'No se pudo cerrar sesión.');
    }
  };

  const openCalendarModal = () => {
    const parts = customDateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      setCalYear(parts[0]);
      setCalMonth(parts[1] - 1);
    } else {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth());
    }
    setCalendarVisible(true);
  };

  const handleSelectCalendarDay = (day: number) => {
    const picked = new Date(calYear, calMonth, day);
    setCustomDateStr(toYMD(picked));
    setDateFilter('custom');
    setCalendarVisible(false);
  };

  const handleShiftMonth = (delta: number) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  const handleChangeQty = (product: Product, delta: number) => {
    if (!product.disponible && delta > 0) return;

    setQuantities((prev) => {
      const current = prev[product.id] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      }
      return { ...prev, [product.id]: next };
    });
  };

  const { itemsSummary, orderTotal } = useMemo(() => {
    const parts: string[] = [];
    let sum = 0;

    products.forEach((p) => {
      const qty = quantities[p.id] || 0;
      if (qty > 0) {
        parts.push(`${qty}x ${p.nombre}`);
        sum += qty * p.precio;
      }
    });

    return {
      itemsSummary: parts.join(', '),
      orderTotal: sum,
    };
  }, [products, quantities]);

  const handleRegisterOrder = async () => {
    if (!itemsSummary || orderTotal <= 0) {
      notify(
        'Sin platillos',
        'Selecciona al menos un platillo disponible para registrar el pedido.'
      );
      return;
    }

    const finalClientName = clientName.trim() || 'Cliente mostrador';
    const currentUser = auth.currentUser;

    try {
      setSaving(true);
      await addDoc(collection(db, 'orders'), {
        clientName: finalClientName,
        clientPhone: clientPhone.trim(),
        clientEmail: currentUser?.email || '',
        notes: notes.trim(),
        deliveryType,
        table: deliveryType,
        paymentMethod,
        items: itemsSummary,
        total: Number(orderTotal.toFixed(2)),
        status: 'Pendiente' as OrderStatus,
        createdAt: serverTimestamp(),
      });

      setClientName('');
      setClientPhone('');
      setNotes('');
      setDeliveryType('Comer en el local');
      setPaymentMethod('Efectivo');
      setQuantities({});
      notify('Pedido registrado', 'El pedido se guardó con estado Pendiente.');
    } catch (err) {
      console.error('Error al registrar pedido:', err);
      notify('Error', 'No se pudo registrar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: nextStatus,
      });
    } catch (err) {
      console.error('Error al actualizar estado del pedido:', err);
      notify('Error', 'No se pudo actualizar el estado del pedido.');
    }
  };

  const dateFilteredOrders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = toYMD(todayStart);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);
    const yesterdayKey = toYMD(yesterdayStart);

    const sevenDaysStart = new Date(todayStart);
    sevenDaysStart.setDate(todayStart.getDate() - 6);

    return orders.filter((ord) => {
      const ordDayStart = new Date(
        ord.createdAtDate.getFullYear(),
        ord.createdAtDate.getMonth(),
        ord.createdAtDate.getDate()
      );
      const ordKey = toYMD(ordDayStart);

      if (dateFilter === 'today') return ordKey === todayKey;
      if (dateFilter === 'yesterday') return ordKey === yesterdayKey;
      if (dateFilter === 'last7days') {
        return ordDayStart >= sevenDaysStart && ordDayStart <= todayStart;
      }
      if (dateFilter === 'custom') return ordKey === customDateStr.trim();
      return true;
    });
  }, [orders, dateFilter, customDateStr]);

  const statusCounts = useMemo(() => {
    const counts: Record<OrderStatus, number> = {
      Pendiente: 0,
      'En preparación': 0,
      'Listo para entregar': 0,
      Entregado: 0,
      Cancelado: 0,
    };
    dateFilteredOrders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [dateFilteredOrders]);

  const visibleOrders = useMemo(() => {
    if (statusFilter === 'Todos') return dateFilteredOrders;
    return dateFilteredOrders.filter((o) => o.status === statusFilter);
  }, [dateFilteredOrders, statusFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 350);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
          <TouchableOpacity onPress={() => navigation.navigate('Menu')}>
            <Text style={styles.navLinkYellow}>Menú</Text>
          </TouchableOpacity>
          <View style={styles.navActivePill}>
            <Text style={styles.navActiveText}>Pedidos</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Register', { isAdminCreating: true })}
            >
              <Text style={styles.navLinkYellow}>Nuevo usuario</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Pedidos - Don Bigotes</Text>
          <Text style={styles.pageSubtitle}>
            Registro de comandas y seguimiento de su estado
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nuevo pedido</Text>

        <Text style={styles.fieldLabel}>Cliente</Text>
        <TextInput
          style={styles.input}
          placeholder="Doña Marta (mesa 3)"
          placeholderTextColor="#9ca3af"
          value={clientName}
          onChangeText={setClientName}
        />

        <Text style={styles.fieldLabel}>Teléfono (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="7012-3456"
          placeholderTextColor="#9ca3af"
          value={clientPhone}
          onChangeText={setClientPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.fieldLabel}>Notas (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Sin cebolla, cambio de $20..."
          placeholderTextColor="#9ca3af"
          value={notes}
          onChangeText={setNotes}
        />

        <Text style={styles.fieldLabel}>Tipo de entrega</Text>
        <View style={styles.chipsRow}>
          {DELIVERY_TYPES.map((type) => {
            const active = deliveryType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                onPress={() => setDeliveryType(type)}
              >
                <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Método de pago</Text>
        <View style={styles.chipsRow}>
          {PAYMENT_METHODS.map((method) => {
            const active = paymentMethod === method;
            return (
              <TouchableOpacity
                key={method}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                onPress={() => setPaymentMethod(method)}
              >
                <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                  {method}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Platillos</Text>
        {loadingMenu ? (
          <ActivityIndicator size="small" color="#5c1d24" style={{ marginVertical: 12 }} />
        ) : (
          <View style={styles.dishesList}>
            {products.map((prod) => {
              const qty = quantities[prod.id] || 0;
              const isSoldOut = !prod.disponible;

              return (
                <View
                  key={prod.id}
                  style={[styles.dishRowCard, isSoldOut && styles.dishRowSoldOut]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.dishRowName,
                        isSoldOut && styles.soldOutStrikeText,
                      ]}
                    >
                      {prod.nombre}
                    </Text>
                    <View style={styles.priceStatusLine}>
                      <Text
                        style={[
                          styles.dishRowPrice,
                          isSoldOut && { color: '#9ca3af' },
                        ]}
                      >
                        ${prod.precio.toFixed(2)}
                      </Text>
                      {isSoldOut && <Text style={styles.soldOutTag}>Agotado</Text>}
                    </View>
                  </View>

                  <View style={styles.qtyBox}>
                    <TouchableOpacity
                      style={[
                        styles.qtyBtn,
                        (isSoldOut || qty === 0) && styles.qtyBtnDisabled,
                      ]}
                      onPress={() => handleChangeQty(prod, -1)}
                      disabled={isSoldOut || qty === 0}
                    >
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyNumber}>{qty}</Text>

                    <TouchableOpacity
                      style={[styles.qtyBtn, isSoldOut && styles.qtyBtnDisabled]}
                      onPress={() => handleChangeQty(prod, 1)}
                      disabled={isSoldOut}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.submitRow}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Total: </Text>
            <Text style={styles.totalAmount}>${orderTotal.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, saving && { opacity: 0.7 }]}
            onPress={handleRegisterOrder}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.registerBtnText}>Registrar pedido</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(
          [
            ['today', 'Hoy'],
            ['yesterday', 'Ayer'],
            ['last7days', 'Últimos 7 días'],
            ['all', 'Todas'],
          ] as [DateFilterType, string][]
        ).map(([key, label]) => {
          const active = dateFilter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.datePill, active && styles.datePillActive]}
              onPress={() => setDateFilter(key)}
            >
              <Text style={[styles.datePillText, active && styles.datePillTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.datePill,
            styles.customDatePill,
            dateFilter === 'custom' && styles.datePillActive,
          ]}
          onPress={openCalendarModal}
        >
          <Text
            style={[
              styles.datePillText,
              dateFilter === 'custom' && styles.datePillTextActive,
            ]}
          >
            📅 {customDateStr}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
        contentContainerStyle={{ gap: 8 }}
      >
        <TouchableOpacity
          style={[
            styles.statusFilterPill,
            statusFilter === 'Todos' && styles.statusFilterPillActive,
          ]}
          onPress={() => setStatusFilter('Todos')}
        >
          <Text
            style={[
              styles.statusFilterText,
              statusFilter === 'Todos' && styles.statusFilterTextActive,
            ]}
          >
            Todos ({dateFilteredOrders.length})
          </Text>
        </TouchableOpacity>

        {ORDER_STATUSES.map((st) => {
          const active = statusFilter === st;
          return (
            <TouchableOpacity
              key={st}
              style={[styles.statusFilterPill, active && styles.statusFilterPillActive]}
              onPress={() => setStatusFilter(st)}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  active && styles.statusFilterTextActive,
                ]}
              >
                {st} ({statusCounts[st] ?? 0})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.summaryCard}>
        {loadingOrders ? (
          <ActivityIndicator size="small" color="#5c1d24" style={{ paddingVertical: 20 }} />
        ) : visibleOrders.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No hay pedidos en este rango de fechas.</Text>
            <Text style={styles.emptySubtitle}>
              Prueba con otra fecha u otro estado, o registra un pedido nuevo arriba.
            </Text>
          </View>
        ) : (
          visibleOrders.map((ord) => {
            const badge = getStatusBadgeStyle(ord.status);
            return (
              <View key={ord.id} style={styles.orderItemCard}>
                <View style={styles.orderTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderClientTitle}>{ord.clientName}</Text>
                    <Text style={styles.orderMeta}>
                      {ord.deliveryType} · {ord.paymentMethod}
                      {ord.clientPhone ? ` · Tel: ${ord.clientPhone}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                      {ord.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.orderItemsText}>{ord.items}</Text>
                {!!ord.notes && <Text style={styles.orderNotesText}>Nota: {ord.notes}</Text>}

                <View style={styles.orderBottomRow}>
                  <Text style={styles.orderPriceText}>Total: ${ord.total.toFixed(2)}</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                  contentContainerStyle={{ gap: 6 }}
                >
                  {ORDER_STATUSES.map((nextSt) => {
                    const isCurrent = ord.status === nextSt;
                    return (
                      <TouchableOpacity
                        key={nextSt}
                        style={[
                          styles.changeStatusBtn,
                          isCurrent && styles.changeStatusBtnCurrent,
                        ]}
                        onPress={() => handleUpdateOrderStatus(ord.id, nextSt)}
                      >
                        <Text
                          style={[
                            styles.changeStatusText,
                            isCurrent && styles.changeStatusTextCurrent,
                          ]}
                        >
                          {nextSt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })
        )}
      </View>

      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => handleShiftMonth(-1)}
              >
                <Text style={styles.monthNavText}>‹</Text>
              </TouchableOpacity>

              <Text style={styles.calendarTitle}>
                {MONTHS_ES[calMonth]} {calYear}
              </Text>

              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => handleShiftMonth(1)}
              >
                <Text style={styles.monthNavText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekDaysRow}>
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((wd) => (
                <Text key={wd} style={styles.weekDayLabel}>
                  {wd}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: getFirstWeekdayOfMonth(calYear, calMonth) }).map(
                (_, idx) => (
                  <View key={`empty-${idx}`} style={styles.dayCell} />
                )
              )}

              {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map(
                (_, idx) => {
                  const dayNum = idx + 1;
                  const cellDateStr = toYMD(new Date(calYear, calMonth, dayNum));
                  const isSelected = cellDateStr === customDateStr;
                  const isToday = cellDateStr === toYMD(new Date());

                  return (
                    <TouchableOpacity
                      key={dayNum}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => handleSelectCalendarDay(dayNum)}
                    >
                      <Text
                        style={[
                          styles.dayCellText,
                          isToday && styles.dayCellTextToday,
                          isSelected && styles.dayCellTextSelected,
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            <View style={styles.calendarFooter}>
              <TouchableOpacity
                style={styles.todayQuickBtn}
                onPress={() => {
                  const today = new Date();
                  setCalYear(today.getFullYear());
                  setCalMonth(today.getMonth());
                  setCustomDateStr(toYMD(today));
                  setDateFilter('custom');
                  setCalendarVisible(false);
                }}
              >
                <Text style={styles.todayQuickText}>Hoy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeCalendarBtn}
                onPress={() => setCalendarVisible(false)}
              >
                <Text style={styles.closeCalendarText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#efe4d2' },
  content: { padding: 14, paddingBottom: 34 },
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

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 10,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#5c1d24' },
  pageSubtitle: { fontSize: 13, color: '#6b5c54', marginTop: 2 },
  refreshBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6c7b8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshBtnText: { color: '#3f322c', fontWeight: '600', fontSize: 13 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6d8c5',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#2b1b17', marginBottom: 10 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2b1b17',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 7,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#1f2937',
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  choiceChipActive: {
    backgroundColor: '#5c1d24',
    borderColor: '#5c1d24',
  },
  choiceChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  choiceChipTextActive: { color: '#fff' },

  dishesList: { gap: 8, marginTop: 4 },
  dishRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  dishRowSoldOut: {
    backgroundColor: '#fafafa',
    borderColor: '#f3f4f6',
  },
  dishRowName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  soldOutStrikeText: { color: '#9ca3af', textDecorationLine: 'line-through' },
  priceStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  dishRowPrice: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  soldOutTag: { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyBtnText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  qtyNumber: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  divider: { height: 1, backgroundColor: '#ece3d5', marginVertical: 14 },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  totalLine: { flexDirection: 'row', alignItems: 'baseline' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#2b1b17' },
  totalAmount: { fontSize: 20, fontWeight: '800', color: '#5c1d24' },
  registerBtn: {
    backgroundColor: '#5c1d24',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 7,
  },
  registerBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  datePill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6c7b8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  datePillActive: {
    backgroundColor: '#5c1d24',
    borderColor: '#5c1d24',
  },
  datePillText: { fontSize: 13, fontWeight: '600', color: '#3f322c' },
  datePillTextActive: { color: '#fff' },
  customDatePill: {
    borderColor: '#d97706',
    justifyContent: 'center',
  },

  statusFilterPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6c7b8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  statusFilterPillActive: {
    backgroundColor: '#5c1d24',
    borderColor: '#5c1d24',
  },
  statusFilterText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  statusFilterTextActive: { color: '#fff' },

  summaryCard: {
    backgroundColor: '#faf4eb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d6c7b8',
  },
  emptyStateBox: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 10 },
  emptyIcon: { fontSize: 26, marginBottom: 8 },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3f322c',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#7a6a62',
    textAlign: 'center',
    marginTop: 4,
  },

  orderItemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e6d8c5',
    marginBottom: 10,
  },
  orderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  orderClientTitle: { fontSize: 15, fontWeight: '700', color: '#2b1b17' },
  orderMeta: { fontSize: 12, color: '#6b5c54', marginTop: 2 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  orderItemsText: { fontSize: 13, color: '#1f2937', marginTop: 8, fontWeight: '500' },
  orderNotesText: { fontSize: 12, color: '#b45309', marginTop: 4 },
  orderBottomRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  orderPriceText: { fontSize: 14, fontWeight: '800', color: '#5c1d24' },

  changeStatusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  changeStatusBtnCurrent: {
    backgroundColor: '#5c1d24',
    borderColor: '#5c1d24',
  },
  changeStatusText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  changeStatusTextCurrent: { color: '#fff' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f5ede0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNavText: { fontSize: 20, fontWeight: '700', color: '#5c1d24' },
  calendarTitle: { fontSize: 16, fontWeight: '800', color: '#2b1b17' },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weekDayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#6b5c54',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#b45309',
  },
  dayCellSelected: {
    backgroundColor: '#5c1d24',
  },
  dayCellText: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  dayCellTextToday: { color: '#b45309', fontWeight: '800' },
  dayCellTextSelected: { color: '#fff', fontWeight: '800' },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  todayQuickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
  },
  todayQuickText: { color: '#b45309', fontWeight: '700', fontSize: 13 },
  closeCalendarBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#5c1d24',
  },
  closeCalendarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});