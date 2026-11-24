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
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';

const DELIVERY_TYPES = ['Comer en el local', 'Para llevar', 'A domicilio'] as const;
type DeliveryType = (typeof DELIVERY_TYPES)[number];

const PAYMENT_METHODS = ['Efectivo', 'Tarjeta'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const TIMELINE_STEPS = [
  'Pendiente',
  'En preparación',
  'Listo para entregar',
  'Entregado',
] as const;

type OrderStatus =
  | 'Pendiente'
  | 'En preparación'
  | 'Listo para entregar'
  | 'Entregado'
  | 'Cancelado';

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

interface Dish {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
}

interface ClientOrder {
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

function formatDisplayDate(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

export default function ClientDashboardScreen({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<'menu' | 'orders'>('menu');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loadingDishes, setLoadingDishes] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [userName, setUserName] = useState('Cliente');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('Comer en el local');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [quantities, setQuantities] = useState<{ [dishId: string]: number }>({});

  // Filtros y secciones agrupadas para pedidos del cliente
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [customDateStr, setCustomDateStr] = useState<string>(() => toYMD(new Date()));
  const [showPastOrders, setShowPastOrders] = useState(false);

  // Modal calendario
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
    if (!currentUser) return;

    const unsubUser = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loadedName = data.nombre || currentUser.email || 'Cliente';
        setUserName(loadedName);
        setClientName((prev) => (prev.trim() ? prev : loadedName));
      } else if (currentUser.email) {
        setUserName(currentUser.email);
      }
    });

    return () => unsubUser();
  }, []);

  useEffect(() => {
    const unsubDishes = onSnapshot(
      collection(db, 'productos'),
      (snap) => {
        const list: Dish[] = snap.docs
          .map((d) => {
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
          })
          .filter((item) => item.disponible);

        setDishes(list);
        setLoadingDishes(false);
      },
      (err) => {
        console.error('Error al cargar menú del cliente:', err);
        setLoadingDishes(false);
      }
    );

    const currentUser = auth.currentUser;
    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list: ClientOrder[] = snap.docs
      .map((d) => {
        const raw = d.data();
        const createdAt = raw.createdAt?.toDate
          ? raw.createdAt.toDate()
          : raw.createdAt
          ? new Date(raw.createdAt)
          : new Date();

        return {
          id: d.id,
          clientName: raw.clientName || 'Cliente',
          clientPhone: raw.clientPhone || raw.customerPhone || '',
          notes: raw.notes || '',
          deliveryType: raw.deliveryType || raw.table || 'Comer en el local',
          paymentMethod: raw.paymentMethod || 'Efectivo',
          items: raw.items || '',
          total: Number(raw.total ?? 0),
          status: normalizeOrderStatus(raw.status),
          createdAtDate: createdAt,
          _ownerUid: raw.clientUid || raw.createdBy?.id || '',
          _ownerEmail: raw.clientEmail || '',
          _creatorName: raw.createdBy?.nombre || '',
        };
      })
      .filter((item: any) => {
        if (!currentUser) return true;
        if (item._ownerUid && item._ownerUid === currentUser.uid) return true;
        if (
          currentUser.email &&
          item._ownerEmail &&
          item._ownerEmail.toLowerCase() === currentUser.email.toLowerCase()
        ) {
          return true;
        }
        if (
          userName &&
          item._creatorName &&
          item._creatorName.trim().toLowerCase() === userName.trim().toLowerCase()
        ) {
          return true;
        }
        return false;
      })
      .map(({ _ownerUid, _ownerEmail, _creatorName, ...rest }: any) => rest);

        list.sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime());
        setOrders(list);
        setLoadingOrders(false);
      },
      (err) => {
        console.error('Error al cargar pedidos del cliente:', err);
        setLoadingOrders(false);
      }
    );

    return () => {
      unsubDishes();
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

  const handleChangeQty = (dishId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[dishId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[dishId];
        return copy;
      }
      return { ...prev, [dishId]: next };
    });
  };

  const { itemsSummary, orderTotal } = useMemo(() => {
    const parts: string[] = [];
    let sum = 0;

    dishes.forEach((p) => {
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
  }, [dishes, quantities]);

  const handlePlaceOrder = async () => {
    if (!itemsSummary || orderTotal <= 0) {
      notify('Selecciona platillos', 'Agrega al menos un platillo para realizar tu pedido.');
      return;
    }

    const currentUser = auth.currentUser;
    const finalName = clientName.trim() || userName || 'Cliente';

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'orders'), {
        clientUid: currentUser?.uid || '',
        clientEmail: currentUser?.email || '',
        clientName: finalName,
        clientPhone: clientPhone.trim(),
        notes: notes.trim(),
        deliveryType,
        table: deliveryType,
        paymentMethod,
        items: itemsSummary,
        total: Number(orderTotal.toFixed(2)),
        status: 'Pendiente' as OrderStatus,
        createdAt: serverTimestamp(),
      });

      setQuantities({});
      setClientPhone('');
      setNotes('');
      setDeliveryType('Comer en el local');
      setPaymentMethod('Efectivo');
      setActiveTab('orders');
      notify('Pedido enviado', 'Tu pedido quedó registrado en estado Pendiente.');
    } catch (err) {
      console.error('Error al crear pedido de cliente:', err);
      notify('Error', 'No se pudo enviar tu pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOrders = useMemo(() => {
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

  const activeOrders = useMemo(
    () =>
      filteredOrders.filter(
        (o) => o.status !== 'Entregado' && o.status !== 'Cancelado'
      ),
    [filteredOrders]
  );

  const pastOrders = useMemo(
    () =>
      filteredOrders.filter(
        (o) => o.status === 'Entregado' || o.status === 'Cancelado'
      ),
    [filteredOrders]
  );

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 350);
  };

  const renderOrderTimeline = (status: OrderStatus) => {
    if (status === 'Cancelado') {
      return (
        <View style={styles.cancelledBanner}>
          <Text style={styles.cancelledText}>✕ Pedido cancelado</Text>
        </View>
      );
    }

    const currentIndex = TIMELINE_STEPS.indexOf(status);

    return (
      <View style={styles.timelineContainer}>
        <Text style={styles.timelineTitle}>Línea de tiempo del pedido</Text>
        <View style={styles.timelineStepsRow}>
          {TIMELINE_STEPS.map((step, index) => {
            const completed = index <= currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === TIMELINE_STEPS.length - 1;

            return (
              <View key={step} style={styles.timelineStepCol}>
                <View style={styles.timelineDotLineWrap}>
                  <View
                    style={[
                      styles.timelineDot,
                      completed && styles.timelineDotCompleted,
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  >
                    <Text style={styles.timelineDotLabel}>
                      {completed ? '✓' : index + 1}
                    </Text>
                  </View>

                  {!isLast && (
                    <View
                      style={[
                        styles.timelineConnector,
                        index < currentIndex && styles.timelineConnectorActive,
                      ]}
                    />
                  )}
                </View>

                <Text
                  style={[
                    styles.timelineStepText,
                    completed && styles.timelineStepTextCompleted,
                    isCurrent && styles.timelineStepTextCurrent,
                  ]}
                  numberOfLines={2}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderOrderCard = (ord: ClientOrder) => {
    const badge = getStatusBadgeStyle(ord.status);
    return (
      <View key={ord.id} style={styles.orderHistoryCard}>
        <View style={styles.orderTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderItemsText}>{ord.items}</Text>
            <Text style={styles.orderTotalText}>Total: ${ord.total.toFixed(2)}</Text>
            <Text style={styles.orderMetaText}>
              {ord.deliveryType} · {ord.paymentMethod}
              {ord.clientPhone ? ` · Tel: ${ord.clientPhone}` : ''}
            </Text>
            {!!ord.notes && (
              <Text style={styles.orderNotesText}>Nota: {ord.notes}</Text>
            )}
          </View>

          <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusPillText, { color: badge.text }]}>
              {ord.status}
            </Text>
          </View>
        </View>

        {renderOrderTimeline(ord.status)}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      {/* Barra superior */}
      <View style={styles.topNav}>
        <Text style={styles.navBrand}>Don Bigotes</Text>
        <View style={styles.navRightGroup}>
          <View style={styles.userBadge}>
            <Text style={styles.userBadgeName}>{userName}</Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>CLIENTE</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bienvenida */}
      <Text style={styles.welcomeTitle}>Bienvenido/a, {userName}</Text>
      <Text style={styles.welcomeSubtitle}>
        Explora el menú disponible y arma tu orden
      </Text>

      {/* Selector de pestañas */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'menu' && styles.tabBtnActive]}
          onPress={() => setActiveTab('menu')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'menu' && styles.tabBtnTextActive]}>
            🍽 Menú Disponible
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'orders' && styles.tabBtnActive]}
          onPress={() => setActiveTab('orders')}
        >
          <Text
            style={[styles.tabBtnText, activeTab === 'orders' && styles.tabBtnTextActive]}
          >
            📋 Ver Mi Pedido y Estado ({orders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'menu' ? (
        <>
          <Text style={styles.sectionHeading}>Selecciona tus platillos:</Text>

          {loadingDishes ? (
            <ActivityIndicator size="large" color="#5c1d24" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.dishesStack}>
              {dishes.map((dish) => {
                const qty = quantities[dish.id] || 0;
                return (
                  <View key={dish.id} style={styles.dishCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dishName}>{dish.nombre}</Text>
                      <Text style={styles.dishPrice}>${dish.precio.toFixed(2)}</Text>
                    </View>

                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, qty === 0 && styles.stepperBtnDisabled]}
                        onPress={() => handleChangeQty(dish.id, -1)}
                        disabled={qty === 0}
                      >
                        <Text style={styles.stepperBtnText}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.stepperQty}>{qty}</Text>

                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => handleChangeQty(dish.id, 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Campos adicionales para el cliente al armar su pedido */}
          <View style={styles.orderDetailsCard}>
            <Text style={styles.detailsTitle}>Detalles de tu pedido</Text>

            <Text style={styles.fieldLabel}>Cliente</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre o mesa (ej. Raúl Castro)"
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
                    <Text
                      style={[styles.choiceChipText, active && styles.choiceChipTextActive]}
                    >
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
                    <Text
                      style={[styles.choiceChipText, active && styles.choiceChipTextActive]}
                    >
                      {method}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <View style={styles.checkoutFooter}>
              <View>
                <Text style={styles.totalLabel}>Total a pagar</Text>
                <Text style={styles.totalValue}>${orderTotal.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.submitOrderBtn, submitting && { opacity: 0.7 }]}
                onPress={handlePlaceOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitOrderText}>Confirmar pedido</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <>
          {/* Filtros de fecha */}
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
                📅 {dateFilter === 'custom' ? formatDisplayDate(customDateStr) : 'dd/mm/aaaa'}
              </Text>
            </TouchableOpacity>
          </View>

          {loadingOrders ? (
            <ActivityIndicator size="large" color="#5c1d24" style={{ marginVertical: 20 }} />
          ) : filteredOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No hay pedidos en este filtro.</Text>
              <Text style={styles.emptySub}>
                Prueba con otro rango de fechas o arma un pedido nuevo en Menú Disponible.
              </Text>
            </View>
          ) : (
            <>
              {/* Sección 1: Pedidos en curso */}
              <Text style={styles.sectionHeading}>
                Pedidos en curso ({activeOrders.length})
              </Text>
              {activeOrders.length === 0 ? (
                <View style={styles.softEmptyBox}>
                  <Text style={styles.softEmptyText}>
                    No tienes pedidos activos en este momento.
                  </Text>
                </View>
              ) : (
                <View style={styles.ordersStack}>
                  {activeOrders.map(renderOrderCard)}
                </View>
              )}

              {/* Sección 2: Historial entregados / cancelados (colapsable) */}
              <TouchableOpacity
                style={styles.historyHeaderCard}
                onPress={() => setShowPastOrders((prev) => !prev)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyHeaderTitle}>
                    Historial entregados / cancelados ({pastOrders.length})
                  </Text>
                  <Text style={styles.historyHeaderSub}>
                    {showPastOrders
                      ? 'Toca para ocultar historial anterior'
                      : 'Toca para ver tus pedidos anteriores'}
                  </Text>
                </View>
                <Text style={styles.historyChevron}>{showPastOrders ? '▾' : '▸'}</Text>
              </TouchableOpacity>

              {showPastOrders && (
                <View style={[styles.ordersStack, { marginTop: 10 }]}>
                  {pastOrders.length === 0 ? (
                    <View style={styles.softEmptyBox}>
                      <Text style={styles.softEmptyText}>
                        No hay pedidos entregados ni cancelados en este periodo.
                      </Text>
                    </View>
                  ) : (
                    pastOrders.map(renderOrderCard)
                  )}
                </View>
              )}
            </>
          )}
        </>
      )}

      {/* Modal calendario */}
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
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navBrand: { color: '#fff', fontSize: 17, fontWeight: '800' },
  navRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#431218',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  userBadgeName: { color: '#fff', fontSize: 12, fontWeight: '700' },
  roleTag: {
    backgroundColor: '#facc15',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagText: { color: '#1f2937', fontSize: 10, fontWeight: '800' },
  logoutBtn: {
    backgroundColor: '#b45309',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  welcomeTitle: { fontSize: 23, fontWeight: '800', color: '#5c1d24' },
  welcomeSubtitle: { fontSize: 13, color: '#6b5c54', marginTop: 2, marginBottom: 14 },

  tabsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tabBtn: {
    flex: 1,
    backgroundColor: '#e5ddd0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#5c1d24' },
  tabBtnText: { color: '#5c1d24', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  tabBtnTextActive: { color: '#fff' },

  sectionHeading: { fontSize: 16, fontWeight: '800', color: '#5c1d24', marginBottom: 10 },

  dishesStack: { gap: 10, marginBottom: 16 },
  dishCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  dishName: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  dishPrice: { fontSize: 14, fontWeight: '700', color: '#5c1d24', marginTop: 2 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: '#5c1d24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: { opacity: 0.45 },
  stepperBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepperQty: { minWidth: 18, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#1f2937' },

  orderDetailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  detailsTitle: { fontSize: 17, fontWeight: '800', color: '#5c1d24', marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#2b1b17', marginTop: 10, marginBottom: 6 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#1f2937',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  choiceChipActive: { backgroundColor: '#5c1d24', borderColor: '#5c1d24' },
  choiceChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  choiceChipTextActive: { color: '#fff' },

  divider: { height: 1, backgroundColor: '#ece3d5', marginVertical: 14 },
  checkoutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  totalLabel: { fontSize: 12, color: '#6b5c54', fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#5c1d24' },
  submitOrderBtn: {
    backgroundColor: '#5c1d24',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 8,
  },
  submitOrderText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  datePill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6c7b8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  datePillActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  datePillText: { fontSize: 12, fontWeight: '700', color: '#3f322c' },
  datePillTextActive: { color: '#fff' },
  customDatePill: { borderColor: '#d97706' },

  ordersStack: { gap: 12, marginBottom: 16 },
  orderHistoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  orderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  orderItemsText: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  orderTotalText: { fontSize: 14, fontWeight: '700', color: '#5c1d24', marginTop: 4 },
  orderMetaText: { fontSize: 12, color: '#6b5c54', marginTop: 3 },
  orderNotesText: { fontSize: 12, color: '#b45309', marginTop: 3 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  timelineContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1e8dc',
  },
  timelineTitle: { fontSize: 12, fontWeight: '700', color: '#5c1d24', marginBottom: 10 },
  timelineStepsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineStepCol: { flex: 1, alignItems: 'center' },
  timelineDotLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 6,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  timelineDotCompleted: { backgroundColor: '#16a34a' },
  timelineDotCurrent: { backgroundColor: '#5c1d24' },
  timelineDotLabel: { color: '#fff', fontSize: 11, fontWeight: '800' },
  timelineConnector: {
    position: 'absolute',
    left: '50%',
    right: '-50%',
    height: 3,
    backgroundColor: '#e5e7eb',
    zIndex: 1,
  },
  timelineConnectorActive: { backgroundColor: '#16a34a' },
  timelineStepText: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  timelineStepTextCompleted: { color: '#15803d', fontWeight: '700' },
  timelineStepTextCurrent: { color: '#5c1d24', fontWeight: '800' },

  cancelledBanner: {
    marginTop: 12,
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  cancelledText: { color: '#dc2626', fontWeight: '700', fontSize: 12, textAlign: 'center' },

  historyHeaderCard: {
    backgroundColor: '#faf4eb',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dfd0bc',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#4a151b' },
  historyHeaderSub: { fontSize: 12, color: '#6b5c54', marginTop: 2 },
  historyChevron: { fontSize: 18, fontWeight: '800', color: '#5c1d24', paddingLeft: 8 },

  softEmptyBox: {
    backgroundColor: '#faf4eb',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d6c7b8',
    marginBottom: 14,
  },
  softEmptyText: { fontSize: 13, color: '#6b5c54', textAlign: 'center' },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6d8c5',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#2b1b17' },
  emptySub: { fontSize: 13, color: '#6b5c54', textAlign: 'center', marginTop: 4 },

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
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  dayCellToday: { borderWidth: 1, borderColor: '#b45309' },
  dayCellSelected: { backgroundColor: '#5c1d24' },
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