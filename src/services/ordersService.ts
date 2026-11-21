import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  CreateOrderInput,
  DeliveryType,
  Order,
  OrderItem,
  OrderStatus,
} from "@/types/order";

const COLLECTION_NAME = "orders";

export interface FetchOrdersParams {
  status?: OrderStatus;
  date?: string; // "today" o "AAAA-MM-DD"
}

function normalizeStatusFromFirestore(raw: unknown): OrderStatus {
  const val = String(raw ?? "Pendiente")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (val.includes("preparacion")) return "en_preparacion";
  if (val.includes("listo")) return "listo";
  if (val.includes("entregado")) return "entregado";
  if (val.includes("cancelado")) return "cancelado";
  return "pendiente";
}

function formatStatusToFirestore(status: OrderStatus): string {
  switch (status) {
    case "pendiente":
      return "Pendiente";
    case "en_preparacion":
      return "En preparación";
    case "listo":
      return "Listo";
    case "entregado":
      return "Entregado";
    case "cancelado":
      return "Cancelado";
  }
}

function parseFirestoreDate(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") return fn().toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function inferDeliveryType(tableRaw: unknown, explicitType?: unknown): DeliveryType {
  if (explicitType === "local" || explicitType === "para_llevar" || explicitType === "domicilio") {
    return explicitType;
  }
  const table = String(tableRaw ?? "").toLowerCase();
  if (table.includes("domicilio") || table.includes("linea") || table.includes("línea")) {
    return "domicilio";
  }
  if (table.includes("llevar")) {
    return "para_llevar";
  }
  return "local";
}

function parseItems(data: Record<string, unknown>, total: number): OrderItem[] {
  if (Array.isArray(data.itemsDetalle)) {
    return data.itemsDetalle as OrderItem[];
  }
  if (Array.isArray(data.items)) {
    return data.items as OrderItem[];
  }
  if (typeof data.items === "string" && data.items.trim()) {
    const parts = data.items.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.map((part, idx) => {
      const match = part.match(/^(\d+)\s*x\s*(.+)$/i);
      const quantity = match ? Number(match[1]) : 1;
      const dishName = match ? match[2].trim() : part;
      const subtotal = idx === 0 ? total : 0;
      return {
        dishId: `mobile-${idx}`,
        dishName,
        unitPrice: quantity > 0 ? subtotal / quantity : subtotal,
        quantity,
        subtotal,
      };
    });
  }
  return [];
}

function mapDocToOrder(
  id: string,
  data: Record<string, unknown>,
  index: number
): Order {
  const total = Number(data.total ?? 0);
  const createdAt = parseFirestoreDate(data.createdAt);
  const updatedAt = data.updatedAt ? parseFirestoreDate(data.updatedAt) : createdAt;
  const deliveryType = inferDeliveryType(data.table, data.deliveryType);
  const tableStr = typeof data.table === "string" ? data.table : "";
  const rawCustomer = String(data.clientName ?? data.customerName ?? "Cliente");
  const customerName =
    tableStr && deliveryType === "local" && !rawCustomer.includes("(")
      ? `${rawCustomer} (${tableStr})`
      : rawCustomer;

  return {
    id,
    number: typeof data.number === "number" ? data.number : index + 1,
    customerName,
    customerPhone: data.customerPhone ? String(data.customerPhone) : undefined,
    deliveryType,
    deliveryAddress:
      data.deliveryAddress
        ? String(data.deliveryAddress)
        : deliveryType === "domicilio" && tableStr
          ? tableStr
          : undefined,
    paymentMethod: data.paymentMethod === "tarjeta" ? "tarjeta" : "efectivo",
    notes: data.notes ? String(data.notes) : undefined,
    items: parseItems(data, total),
    total,
    status: normalizeStatusFromFirestore(data.status),
    createdAt,
    updatedAt,
    createdBy:
      typeof data.createdBy === "object" && data.createdBy !== null
        ? (data.createdBy as Order["createdBy"])
        : {
            id: String(data.clientEmail ?? "app-movil"),
            nombre: String(data.clientEmail ?? "App Móvil"),
          },
  };
}

function getElSalvadorDateKey(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoDate));
}

export async function fetchOrders(params?: FetchOrdersParams): Promise<Order[]> {
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const totalDocs = snapshot.docs.length;
  let orders = snapshot.docs.map((docSnap, idx) =>
    mapDocToOrder(docSnap.id, docSnap.data() as Record<string, unknown>, totalDocs - idx - 1)
  );

  if (params?.status) {
    orders = orders.filter((o) => o.status === params.status);
  }

  if (params?.date) {
    const targetKey =
      params.date === "today"
        ? getElSalvadorDateKey(new Date().toISOString())
        : params.date;
    orders = orders.filter((o) => getElSalvadorDateKey(o.createdAt) === targetKey);
  }

  return orders;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const itemsWithSubtotal: OrderItem[] = input.items.map((item) => ({
    ...item,
    subtotal: Number((item.unitPrice * item.quantity).toFixed(2)),
  }));

  const total = Number(
    itemsWithSubtotal.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
  );

  // Texto compatible con la app móvil (ej. "2x Tacos, 1x Horchata")
  const itemsSummary = itemsWithSubtotal
    .map((item) => `${item.quantity}x ${item.dishName}`)
    .join(", ");

  const tableLabel =
    input.deliveryType === "domicilio"
      ? input.deliveryAddress?.trim() || "A domicilio"
      : input.deliveryType === "para_llevar"
        ? "Para llevar"
        : "Comer en el local";

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    clientName: input.customerName.trim(),
    clientEmail: input.createdBy?.nombre ?? "web@donbigotes.com",
    customerPhone: input.customerPhone?.trim() || "",
    deliveryType: input.deliveryType,
    deliveryAddress: input.deliveryAddress?.trim() || "",
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() || "",
    table: tableLabel,
    items: itemsSummary,
    itemsDetalle: itemsWithSubtotal,
    total,
    status: "Pendiente",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy,
  });

  const createdSnap = await getDoc(docRef);
  return mapDocToOrder(
    docRef.id,
    (createdSnap.data() ?? {}) as Record<string, unknown>,
    0
  );
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<Order> {
  const ref = doc(db, COLLECTION_NAME, id);
  await updateDoc(ref, {
    status: formatStatusToFirestore(status),
    updatedAt: serverTimestamp(),
  });

  const updatedSnap = await getDoc(ref);
  return mapDocToOrder(
    id,
    (updatedSnap.data() ?? {}) as Record<string, unknown>,
    0
  );
}

export async function deleteOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
}