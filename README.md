# DonBigotesApp — Web y Etapa Móvil

Sistema de gestión para el Comedor **"Don Bigotes"** (Colonia Las Brisas, Soyapango). Proyecto de capstone con aplicación web en Next.js y aplicación móvil en React Native (Expo) orientadas a la autenticación por roles, gestión del menú, registro y seguimiento de pedidos, y panel de resumen operativo.

* Manual de usuario del módulo de pedidos y dashboard:
  [`docs/manual-usuario-pedidos.md`](docs/manual-usuario-pedidos.md)

* Licencia del proyecto:
  [`LICENSE.md`](LICENSE.md)

## Autoría y contexto del repositorio

Este repositorio (`DonBigotesApp2`) continúa el trabajo base de `Lyoko97/DonBigotesApp` e integra la evolución y paridad de funcionalidades, documentación, maquetas y licencia bajo la responsabilidad de **Carlos Eduardo Hernández Alas** (`alashernandez`).

## Roles y Permisos

El sistema maneja tres roles principales con vistas y permisos adaptados a la operación diaria del comedor **Don Bigotes**:

* **Administrador (`admin`):**

  * Acceso completo a la gestión del menú (crear, editar, cambiar disponibilidad o eliminar platillos).

  * Creación de cuentas de usuario y gestión del equipo (`/register` en web y creación de usuarios en móvil).

  * Supervisión de pedidos, avance de estados, cancelación y eliminación definitiva de registros cuando aplique.

  * Consulta de métricas y analítica de ventas (resumen del día, semana, mes, top de platillos y distribución por estado).

* **Encargado (`encargado`):**

  * Consulta de indicadores operativos de la jornada (pedidos de hoy, pedidos activos, platillos disponibles y ventas acumuladas).

  * Control de disponibilidad de platillos y avance de estados en los pedidos activos.

  * Sin permiso de eliminación definitiva de pedidos ni administración de cuentas de equipo.

* **Cliente (`cliente`):**

  * Consulta del menú disponible con selectores de cantidad para armar pedidos.

  * Envío de órdenes y seguimiento del estado de sus pedidos (`ClientDashboardScreen` en la aplicación móvil).

### Registro y Gestión de Usuarios

La creación de cuentas nuevas está restringida al rol **`admin`** (tanto desde `/register` en la aplicación web como desde la gestión de usuarios en la aplicación móvil), con el fin de controlar el acceso del personal y las cuentas del sistema. Los usuarios ya registrados acceden mediante inicio de sesión con validación de rol.

### Flujo de Estados de Pedidos

Los pedidos siguen un ciclo controlado de estados para mantener claridad entre cocina, entrega y seguimiento del cliente:

* **Flujo principal:** `pendiente` → `en_preparacion` → `listo` → `entregado`.

* **Cancelación:** Un pedido en curso puede pasar a `cancelado`, conservándose en el historial para control.

* **Validación de transiciones:** Las transiciones inválidas o saltos indebidos entre estados se rechazan. En el flujo de cliente (como `ClientDashboardScreen`), el usuario puede revisar el avance de sus pedidos, mientras que `admin` y `encargado` administran la operación.

## Aplicación Web (Next.js)

### Stack Web

* [Next.js 16](https://nextjs.org) (App Router) + TypeScript

* [Tailwind CSS 4](https://tailwindcss.com)

* Context API para autenticación, roles y estado de pedidos (sin Redux)

* `axios` para consumir las rutas de la API REST

Persistencia de datos por módulo en la etapa web:

* **Autenticación y usuarios:** datos mock en memoria + `localStorage`, sin backend real todavía. Los puntos de integración futura están marcados con `// TODO` en `src/lib/auth.ts`, `src/lib/mockUsers.ts`, `src/context/AuthContext.tsx` y `src/proxy.ts`.

* **Menú:** API REST propia (rutas `/api/dishes` en Next.js). Los datos persisten durante las pruebas en producción (Vercel), pero al ser almacenamiento en memoria en el servidor (sin base de datos) podrían no ser 100 % consistentes bajo alta concurrencia o tras un *cold start* prolongado.

* **Pedidos:** API REST propia (`/api/orders`) con un store en memoria (`src/lib/ordersStore.ts`) que simula la tabla de pedidos. Arranca con pedidos de ejemplo de hoy y un historial determinista de 5 semanas (`src/lib/ordersSeed.ts`), igual en cada instancia, para que el dashboard tenga ventas de la semana y del mes. En Vercel **no persiste entre instancias**: un *cold start* vuelve a los datos de ejemplo y dos instancias activas pueden mostrar listas distintas. Registrar un pedido todavía no descuenta stock del platillo.

### Desarrollo local (Web)

Requisito: Node.js 20.9 o superior (probado con Node 24 LTS).

```
npm install
npm run dev

```

Abrir <http://localhost:3000>.

Usuarios de prueba (ver `src/lib/mockUsers.ts`):

| Rol | Correo | Contraseña | 
| ----- | ----- | ----- | 
| admin | rosa@donbigotes.com | comedor123 | 
| encargado | encargado@donbigotes.com | turno123 | 

### Arquitectura y módulos Web

Separación por capas:

| Capa | Ubicación | 
| ----- | ----- | 
| Tipos | `src/types/` — `auth.ts`, `dish.ts`, `order.ts`, `dashboard.ts` | 
| Datos / API | `src/app/api/` (`dishes`, `orders`) y `src/lib/` (stores en memoria, validación, cálculos del dashboard) | 
| Lógica de cliente | `src/services/` (llamadas `axios`), `src/hooks/` (`usePolling`) y `src/context/` (`AuthContext`, `OrdersContext`) | 
| UI | `src/components/` (`Navbar`, `ProtectedRoute`, `forms/`, `orders/`, `dashboard/`) y páginas en `src/app/(login|register|dashboard|menu|pedidos)` | 

* `src/proxy.ts` — protege `/dashboard`, `/menu`, `/pedidos` y `/register` a nivel de ruta; `ProtectedRoute` aplica además los permisos por rol en el cliente.

* `/menu` cuenta con CRUD de platillos integrado con la API REST.

#### Pedidos y dashboard (`/pedidos` y `/dashboard`)

**`/pedidos`**

* Registro de pedidos con cliente, teléfono, tipo de entrega (en el local, para llevar o a domicilio), método de pago (efectivo o tarjeta), notas y selección de platillos con cantidades y total en vivo. Los platillos agotados se muestran bloqueados.

* **Tarjeta deshabilitada a domicilio:** el POS solo está en el local, por lo que la opción "Tarjeta" no está disponible para pedidos a domicilio (se indica en el formulario y la API lo rechaza con `400`).

* Flujo de estados: `pendiente → en_preparacion → listo → entregado`, y `cancelado` desde cualquier estado en curso. Las transiciones inválidas se rechazan en el servidor (`409`).

* Filtros por fecha (Hoy, Ayer, Últimos 7 días, Todas o una fecha específica) y por estado, con contadores.

* *Skeleton* durante la primera carga, estado vacío según los filtros, banner de error con "Reintentar" e indicador "Actualizado hace X s".

* Cancelar conserva el pedido en el historial; eliminar es definitivo y solo lo ve el `admin`.

**`/dashboard`**

| Indicador | Encargado | Admin | 
| ----- | ----- | ----- | 
| Pedidos de hoy, pedidos activos, platillos disponibles, ventas del día | ✔ | ✔ | 
| Lista de pedidos activos (el más antiguo primero) | ✔ | ✔ | 
| Ingresos de hoy (y por cobrar), de la semana y del mes | — | ✔ | 
| Ticket promedio del mes | — | ✔ | 
| Gráfico de ingresos de los últimos 7 días (con vista de tabla) | — | ✔ | 
| Top 5 de platillos (7 días) y distribución de pedidos de hoy por estado | — | ✔ | 

La semana va de lunes a hoy y el mes del día 1 a hoy; las ventas cuentan solo pedidos entregados.

**Actualización dinámica:** `OrdersContext` expone `isLoading`, `isRefreshing`, `error` y `lastUpdated`. Consulta `/api/orders` y `/api/dishes` al entrar, cada 10 s mientras la pestaña está visible (el *polling* se pausa si está oculta), al volver a la pestaña y después de cada acción. Si dos respuestas se solapan solo se aplica la más reciente. Los cambios de estado son **optimistas**: la tarjeta cambia al instante y se revierte si el servidor rechaza el cambio o no responde.

**Validación:** las mismas reglas (`src/lib/orderValidation.ts`) se usan en el formulario y en la API: nombre de 2 a 60 caracteres; teléfono salvadoreño de 8 dígitos (obligatorio a domicilio); dirección de 10 a 150 caracteres (obligatoria a domicilio); tarjeta no permitida a domicilio; notas de hasta 200 caracteres; de 1 a 20 platillos distintos y de 1 a 50 unidades por platillo.

**"Hoy"** se calcula con la zona horaria `America/El_Salvador`, porque los servidores de Vercel corren en UTC.

| Método | Ruta | Descripción | 
| ----- | ----- | ----- | 
| GET | `/api/orders?status=&date=today` | Lista pedidos (más recientes primero) | 
| POST | `/api/orders` | Crea un pedido en estado `pendiente` (incluye `deliveryType`, `paymentMethod` y, a domicilio, `deliveryAddress`) | 
| PATCH | `/api/orders/:id` | Cambia el estado (`{ "status": "listo" }`) | 
| DELETE | `/api/orders/:id` | Elimina el pedido | 

Las rutas responden `401` sin cookie de sesión. El permiso de borrado del admin se aplica en la UI: la cookie mock solo guarda el id del usuario, no su rol.

### Despliegue Web

La aplicación está desplegada en Vercel: [https://don-bigotes-app2.vercel.app](https://don-bigotes-app.vercel.app)

### Verificación Web

```
npm run lint
npm run build

```

Prueba manual del módulo de pedidos:

1. Iniciar sesión como `encargado`, registrar un pedido en `/pedidos`, avanzarlo de estado y cancelar otro. No debe aparecer "Eliminar".

2. En el formulario, elegir "Tarjeta" y luego "A domicilio": el pago debe pasar a "Efectivo", "Tarjeta" queda bloqueada con el aviso del POS y se piden dirección y teléfono.

3. Marcar un platillo como agotado en `/menu`: en `/pedidos` debe verse bloqueado en unos 10 s.

4. Probar los filtros de fecha ("Ayer", "Últimos 7 días") con el historial de ejemplo.

5. Iniciar sesión como `admin`: en `/dashboard` deben verse ingresos de hoy/semana/mes, el gráfico de 7 días, el top 5 y la distribución por estado, y en `/pedidos` el botón "Eliminar".

6. Sin sesión, `/pedidos` redirige a `/login` y `/api/orders` responde `401`.

### Limitaciones conocidas (Web)

* Menú y pedidos se guardan en memoria del servidor: en Vercel no persisten entre instancias ni tras un *cold start*, y las dos APIs no comparten memoria (por eso cada pedido guarda su propia copia de nombre y precio).

* La cookie de sesión mock solo contiene el id del usuario: los permisos por rol se aplican en la UI, no en la API.

* Registrar un pedido no descuenta stock.

* Los usuarios creados desde `/register` viven en la memoria del navegador y se pierden al recargar la página.

## Aplicación Móvil (React Native / Expo)

### Stack Móvil

* **Frontend Móvil:** React Native, Expo, TypeScript

* **Navegación:** React Navigation (`@react-navigation/native-stack`)

* **Backend y Base de Datos:** Firebase Authentication y Cloud Firestore

## Estructura del Proyecto

```
DonBigotesApp2/
├── docs/                       # Documentación y maquetas de diseño
│   ├── maquetas/               # Capturas exportadas desde Figma
│   └── manual-usuario-pedidos.md
├── DonBigotesMobile/           # Aplicación móvil en React Native / Expo
│   ├── assets/                 # Íconos y recursos gráficos
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── ClientDashboardScreen.tsx
│   │   │   ├── MenuScreen.tsx
│   │   │   ├── OrdersScreen.tsx
│   │   │   └── ...
│   │   └── services/
│   │       └── firebaseConfig.ts
│   ├── App.tsx
│   └── package.json
├── public/                     # Recursos estáticos públicos
├── src/                        # Aplicación web en Next.js (App Router)
│   ├── app/
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   └── types/
├── LICENSE.md                  # Licencia Creative Commons BY-NC 4.0
├── package.json
└── README.md

```

## Mockups de Diseño (Etapa 1 - Figma)

A continuación se presentan las maquetas base de **Don Bigotes**, que definieron la identidad visual, la jerarquía de información y los flujos de gestión y pedidos:

### Vista Móvil — Gestión de Menú
![Mockup Móvil Menú](./docs/maquetas/movil-menu-admin.png)
*Diseño de referencia para la visualización y administración de platillos en dispositivos móviles.*

### Vista Móvil — Pedidos y Seguimiento
![Mockup Móvil Pedidos](./docs/maquetas/movil-menu-pedidos.png)
*Diseño de referencia para la toma y seguimiento de pedidos desde la interfaz móvil.*

### Vista Web — Gestión de Menú
![Mockup Web Menú](./docs/maquetas/web-menu-admin.png)
*Diseño de referencia para el control de platillos, precios y disponibilidad en el panel web.*

### Vista Web — Pedidos
![Mockup Web Pedidos](./docs/maquetas/web-menu-pedidos.png)
*Diseño de referencia para el seguimiento y operación de pedidos en el panel web.*

## Licencia

Este proyecto se encuentra bajo una licencia **Creative Commons Reconocimiento-NoComercial 4.0 Internacional (CC BY-NC 4.0)**. Revisa los detalles en el archivo [LICENSE.md](./LICENSE.md).
