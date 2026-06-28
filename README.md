# BILLIFY

Plataforma SaaS de punto de venta y facturación diseñada para cafeterías y pequeños negocios de alimentos en Colombia. Reemplaza cuadernos y hojas de cálculo con una operación digital simple, rápida y confiable.

---

## Funcionalidades

### Punto de Venta (POS)

- Venta rápida sin factura para despacho inmediato en caja
- Venta facturada con datos del cliente e número de factura
- Venta por mesa integrada al módulo de mesas
- Historial completo de ventas con filtros por fecha y estado
- Soporte de múltiples métodos de pago: efectivo, tarjeta, transferencia y crédito
- Modo offline con banner de alerta cuando no hay conexión a internet

### Gestión de Mesas

- Apertura y cierre de sesiones de mesa
- Registro de comensales con nombre, documento y teléfono
- Pedidos individuales por comensal dentro de la misma mesa
- Cobro de mesa con resumen por comensal y totales consolidados
- Asociación de pedidos a clientes registrados

### Caja

- Apertura y cierre de turno de caja con saldo inicial
- Registro de entradas y salidas de efectivo con descripción
- Dashboard de caja con resumen del turno en curso
- Historial de movimientos de caja por turno
- Control de múltiples cajas según el plan contratado

### Inventario

- Seguimiento de stock por producto en tiempo real
- Registro de movimientos de inventario con razón y nota
- Alerta visual para productos con bajo stock
- Control por lote y fecha de vencimiento

### Productos

- Creación, edición y desactivación de productos
- Precio de venta y costo unitario
- Unidad de medida configurable
- Tasa de impuesto por producto
- Categorización libre
- Control de stock activable o desactivable por producto

### Clientes

- Registro de clientes con nombre, documento, correo y teléfono
- Búsqueda rápida desde el punto de venta
- Historial de compras por cliente
- Activación y desactivación de clientes

### Empleados

- Registro de empleados con roles: Propietario y Cajero
- Activación y desactivación de acceso
- Control de permisos para manejo de caja por empleado

### Dashboard

- Resumen de ventas del día, semana y mes
- Indicadores clave: total vendido, número de transacciones, ticket promedio
- Gráficas de rendimiento por período

### Configuración del Negocio

- Nombre, NIT/documento, dirección y teléfono del negocio
- Configuración de impuestos (IVA, impoconsumo u otros) con nombre y porcentaje
- Opción de aplicar impuesto automáticamente en todas las ventas

### Trazabilidad y Auditoría

- Registro automático de acciones críticas: ventas, anulaciones, movimientos de caja
- Consulta de logs por entidad, usuario y fecha
- Trazabilidad completa para control interno

### Autenticación y Multi-tenant

- Registro de negocio con creación automática del usuario propietario
- Inicio de sesión seguro con contraseña hasheada
- Aislamiento total de datos entre negocios
- Soporte para múltiples usuarios por negocio

---

## Stack Tecnológico

| Capa | Tecnología |
| ------ | --------- |
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript |
| API | tRPC |
| ORM | Prisma |
| Base de datos | PostgreSQL (Supabase) |
| Autenticación | Auth.js v5 |
| Estilos | Tailwind CSS v4 |
| Despliegue | Vercel |

---

## Instalación local

```bash
# 1. Clonar el repositorio
git clone <https://github.com/Rostin-M/BILLIFY.git>
cd billify

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de base de datos

# 4. Ejecutar migraciones
npm run db:migrate

# 5. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Variables de entorno requeridas

```env
AUTH_SECRET=        # Secreto para Auth.js (genera con: openssl rand -base64 32)
DATABASE_URL=       # URL de conexión pooled de Supabase (para queries)
DIRECT_URL=         # URL de conexión directa de Supabase (para migraciones)
```

---

## Scripts disponibles

| Comando | Descripción |
| --------- | ------------- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run db:migrate` | Ejecutar migraciones pendientes |
| `npm run db:studio` | Abrir Prisma Studio |
| `npm run check` | Lint + typecheck |

---

## Licencia y derechos

Este software es propiedad exclusiva de **BILLIFY**. Queda expresamente prohibida su reproducción, distribución, modificación, uso comercial o puesta a disposición de terceros sin autorización escrita previa del titular.

---

© 2026 BILLIFY. Todos los derechos reservados.
