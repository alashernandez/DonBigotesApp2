import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Dish } from "@/types/dish";

const COLLECTION_NAME = "productos";

function mapDocToDish(id: string, data: Record<string, unknown>): Dish {
  const rawCategory = String(data.categoria ?? data.category ?? "almuerzo").toLowerCase();
  const validCategories: Dish["category"][] = ["almuerzo", "mexicana", "bebida", "postre"];
  const category = validCategories.includes(rawCategory as Dish["category"])
    ? (rawCategory as Dish["category"])
    : "almuerzo";

  return {
    id,
    name: String(data.nombre ?? data.name ?? "Sin nombre"),
    description: String(data.descripcion ?? data.description ?? ""),
    price: Number(data.precio ?? data.price ?? 0),
    category,
    available: Boolean(data.disponible ?? data.available ?? true),
    stock: Number(data.stock ?? (data.disponible === false ? 0 : 10)),
  };
}

export async function fetchDishes(): Promise<Dish[]> {
  const q = query(collection(db, COLLECTION_NAME), orderBy("nombre", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) =>
    mapDocToDish(docSnap.id, docSnap.data() as Record<string, unknown>)
  );
}

export interface CreateDishInput {
  name: string;
  description?: string;
  price: number | string;
  category: string;
}

export async function createDish(input: CreateDishInput): Promise<void> {
  await addDoc(collection(db, COLLECTION_NAME), {
    nombre: input.name.trim(),
    descripcion: (input.description ?? "").trim(),
    precio: Number(input.price) || 0,
    categoria: input.category || "almuerzo",
    disponible: true,
  });
}

export async function updateDishAvailability(
  id: string,
  available: boolean
): Promise<void> {
  await updateDoc(doc(db, COLLECTION_NAME, id), {
    disponible: available,
  });
}

export async function deleteDish(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
}