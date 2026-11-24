'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { Dish } from '@/types/dish';
import {
  createDish,
  deleteDish,
  fetchDishes,
  updateDishAvailability,
} from '@/services/dishesService';

export default function MenuPage() {
  const { role, isLoading: authLoading } = useAuth();
  const isClient = role === 'cliente';
  const isStaff = role === 'admin' || role === 'encargado';
  const isAdmin = role === 'admin';

  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('almuerzo');

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const loadDishes = async () => {
    try {
      const data = await fetchDishes();
      setDishes(data);
    } catch (error) {
      console.error('Error al obtener platillos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDishes();
  }, []);

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    if (!isStaff) return;
    try {
      await updateDishAvailability(id, !currentStatus);
      await loadDishes();
    } catch (error) {
      console.error('Error al actualizar disponibilidad:', error);
    }
  };

  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStaff || !name || !price) return;

    try {
      await createDish({ name, description, price, category });
      setName('');
      setDescription('');
      setPrice('');
      await loadDishes();
    } catch (error) {
      console.error('Error al crear platillo:', error);
    }
  };

  const handleDeleteDish = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDish(id);
      await loadDishes();
    } catch (error) {
      console.error('Error al eliminar platillo:', error);
    }
  };

  const changeQuantity = (dishId: string, delta: number, available: boolean) => {
    if (!available) return;
    setQuantities((prev) => {
      const current = prev[dishId] ?? 1;
      const next = Math.max(1, Math.min(50, current + delta));
      return { ...prev, [dishId]: next };
    });
  };

  const handleAddToOrder = (dish: Dish) => {
    if (!dish.available) return;
    const qty = quantities[dish.id] ?? 1;

    const stored = JSON.parse(localStorage.getItem('donBigotesDraftOrder') || '[]');
    const existingIndex = stored.findIndex((item: { id: string }) => item.id === dish.id);
    if (existingIndex >= 0) {
      stored[existingIndex].quantity += qty;
    } else {
      stored.push({
        id: dish.id,
        name: dish.name,
        price: dish.price,
        quantity: qty,
      });
    }
    localStorage.setItem('donBigotesDraftOrder', JSON.stringify(stored));
    setAddedMessage(`Se añadieron ${qty} × ${dish.name} al pedido.`);
  };

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 w-full">
        {authLoading ? (
          <div className="p-8 text-center text-gray-600">Verificando sesión y rol...</div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {isClient ? 'Menú - Don Bigotes' : 'Gestión de Menú - Don Bigotes'}
            </h1>
            <p className="text-gray-600 mb-6">
              {isClient
                ? 'Escoge tus platillos disponibles y añádelos a tu pedido'
                : 'Control Completo de Platillos y Disponibilidad'}
            </p>

            {addedMessage && (
              <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 text-sm">
                {addedMessage}
              </div>
            )}

            {isStaff && (
              <form onSubmit={handleCreateDish} className="bg-white p-5 rounded-lg shadow border border-gray-200 mb-8">
                <h2 className="text-lg font-bold text-gray-800 mb-3">Agregar Nuevo Platillo</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border p-2 rounded text-sm w-full"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Precio ($)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="border p-2 rounded text-sm w-full"
                    required
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border p-2 rounded text-sm w-full"
                  >
                    <option value="almuerzo">Almuerzo</option>
                    <option value="mexicana">Mexicana</option>
                    <option value="bebida">Bebida</option>
                    <option value="postre">Postre</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-amber-700 hover:bg-amber-800 text-white font-medium p-2 rounded text-sm transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Descripción corta"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border p-2 rounded text-sm w-full"
                />
              </form>
            )}

            {loading ? (
              <div className="p-8 text-center text-gray-600">Cargando menú de Don Bigotes...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dishes.map((dish) => {
                  const qty = quantities[dish.id] ?? 1;
                  return (
                    <div key={dish.id} className="bg-white p-5 rounded-lg shadow border border-gray-200 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h2 className="text-xl font-semibold text-gray-900">{dish.name}</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-green-600">${dish.price.toFixed(2)}</span>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteDish(dish.id)}
                                className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                                title="Eliminar platillo"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm mb-3">{dish.description}</p>
                        <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded capitalize mb-4">
                          {dish.category}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-2">
                        <span className={`text-sm font-medium ${dish.available ? 'text-green-600' : 'text-red-500'}`}>
                          {dish.available ? '● Disponible' : '○ Agotado'}
                        </span>

                        {isStaff ? (
                          <button
                            onClick={() => toggleAvailability(dish.id, dish.available)}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                              dish.available
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            {dish.available ? 'Marcar Agotado' : 'Marcar Disponible'}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!dish.available || qty <= 1}
                              onClick={() => changeQuantity(dish.id, -1, dish.available)}
                              className="px-2.5 py-1 rounded border text-sm font-bold disabled:opacity-40"
                            >
                              -
                            </button>
                            <span className="text-sm font-semibold w-5 text-center">{qty}</span>
                            <button
                              type="button"
                              disabled={!dish.available}
                              onClick={() => changeQuantity(dish.id, 1, dish.available)}
                              className="px-2.5 py-1 rounded border text-sm font-bold disabled:opacity-40"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              disabled={!dish.available}
                              onClick={() => handleAddToOrder(dish)}
                              className="px-3 py-1.5 rounded text-sm font-medium bg-amber-700 hover:bg-amber-800 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Añadir al pedido
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}