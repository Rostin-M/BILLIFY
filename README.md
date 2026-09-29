# BILLIFY

Plataforma SaaS de punto de venta y facturación diseñada para cafeterías y pequeños negocios de alimentos en Colombia. Reemplaza cuadernos y hojas de cálculo con una operación digital simple, rápida y confiable.

---

## Funcionalidades

### Punto de Venta (POS)

- Venta rápida sin factura para despacho inmediato en caja
- Venta facturada con datos del cliente y número de factura consecutivo
- Venta por mesa integrada al módulo de mesas
- Productos más vendidos primero en la grilla de venta
- Lectura de códigos de barras con la cámara del celular o computador, con modo de escaneo continuo
- Venta por peso (frutas y verduras) y productos de precio abierto
- Soporte de múltiples métodos de pago: efectivo, tarjeta, transferencia y crédito (fiado)
- Foto del comprobante de pago adjunta a la venta
- Factura en PDF descargable y envío por correo al cliente
- Anulación de ventas con motivo y devolución automática del stock
- Historial de ventas por día con detalle de ítems
- Modo offline: las ventas se guardan en el dispositivo y se sincronizan al volver la conexión, sin duplicarse

### Gestión de Mesas

- Apertura y cierre de sesiones de mesa, con nombre sugerido automáticamente
- Registro de comensales con nombre, descripción y cliente registrado opcional
- Pedidos (rondas) individuales por comensal dentro de la misma mesa
- Renombrar o quitar comensales y mover pedidos entre comensales
- Cancelación de pedidos o de la mesa completa con devolución del stock
- Cobro dividido: varios grupos de comensales, cada uno con su forma de pago y su factura
- Opción de conservar a los comensales en la mesa después de cobrar
- Cuenta de la mesa en PDF

### Caja

- Apertura y cierre de turno de caja con saldo inicial
- Registro de entradas y salidas de efectivo con descripción
- Dashboard de caja con resumen del turno en curso
- Cierre con nota, diferencia neta y ventas por otros medios de pago
- Reporte de cierre de caja en PDF
- Historial de cierres (solo propietario)
- Control de múltiples cajas según el plan contratado

### Fiados (ventas a crédito)

- Listado de clientes con saldo pendiente
- Registro de abonos, protegido contra registros duplicados
- Historial de ventas a crédito y pagos por cliente

### Inventario

- Seguimiento de stock por producto en tiempo real
- Registro de movimientos de inventario con razón y nota
- Alerta visual para productos con bajo stock
- Control por lote y fecha de vencimiento

### Productos

- Creación, edición y desactivación de productos
- Precio de venta y costo unitario
- Código de barras (se puede escanear al crear el producto), marca y presentación
- Unidad de medida configurable
- Impuestos por producto
- Categorías configurables por el negocio
- Control de stock activable o desactivable por producto
- Historial de ventas por producto
- Permiso configurable para que los cajeros cambien precios

### Clientes

- Registro de clientes con nombre, alias, documento, correo y teléfono
- Búsqueda rápida desde el punto de venta
- Historial de compras por cliente
- Activación y desactivación de clientes

### Empleados

- Registro de empleados con roles: Propietario y Cajero
- Activación y desactivación de acceso
- Restablecimiento de la contraseña de un empleado
- Control de permisos para manejo de caja por empleado

### Dashboard

- Resumen de ventas del día, semana y mes
- Indicadores clave: total vendido, número de transacciones, ticket promedio
- Gráficas de rendimiento por período

### Configuración del Negocio

- Nombre, NIT/documento, dirección, teléfono y logo del negocio
- Datos de contacto que aparecen en las facturas
- Hasta 3 impuestos (IVA, impoconsumo u otros) con nombre y porcentaje
- Opción de aplicar impuesto automáticamente y de mostrarlo resumido o por ítem en la factura
- Categorías de productos, permisos de precios y módulo de frutas y verduras
- Plan contratado (número de cajas)

### Trazabilidad y Auditoría

- Registro automático de acciones críticas: ventas, anulaciones, movimientos de caja
- Consulta de logs por entidad, usuario y fecha
- Exportación a CSV de ventas y movimientos de caja (hoy, semana o mes), protegida contra inyección de fórmulas en Excel
- Trazabilidad completa para control interno

### Autenticación y Multi-tenant

- Registro de negocio con creación automática del usuario propietario
- Verificación del correo con código
- Recuperación y cambio de contraseña
- Inicio de sesión seguro con contraseña hasheada y límite de intentos
- Cierre de sesión automático a las 24 h, con aviso previo si hay una caja abierta
- Aislamiento total de datos entre negocios
- Soporte para múltiples usuarios por negocio

### Otros

- Aplicación instalable (PWA)
- Modo claro y oscuro
- Correos transaccionales (verificación, recuperación, bienvenida, facturas) vía Brevo
- Páginas legales: términos, privacidad y cookies

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
| Tests | Vitest (unitarios + integración contra Postgres real) |
| Calidad de código | SonarQube Cloud (y SonarQube local opcional) |
| Despliegue | Vercel |

---

## Instalación local

```bash
# 1. Clonar el repositorio
git clone https://github.com/Rostin-M/BILLIFY.git
cd BILLIFY

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

## Variables de entorno

Se validan al arrancar en `src/env.js`; la plantilla está en `.env.example`.

```env
# Requeridas
AUTH_SECRET=                # Secreto para Auth.js (genera con: npx auth secret)
DATABASE_URL=               # URL de conexión pooled de Supabase (para queries)
DIRECT_URL=                 # URL de conexión directa de Supabase (para migraciones)
BREVO_API_KEY=              # Brevo: envío de correos (verificación, recuperación, facturas)
SMTP_FROM=                  # Correo remitente de esos envíos

# Opcionales (sin ellas no funcionan las subidas de logo y comprobantes)
SUPABASE_URL=               # Supabase Storage
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Scripts disponibles

| Comando | Descripción |
| --------- | ------------- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run db:generate` | Crear y aplicar una migración nueva (desarrollo) |
| `npm run db:migrate` | Ejecutar migraciones pendientes |
| `npm run db:studio` | Abrir Prisma Studio |
| `npm run db:backup` | Respaldo de la base (ver [Backups](#backups-y-restauración)) |
| `npm run check` | Lint + typecheck |
| `npm run format:write` | Formatear con Prettier |
| `npm run test` | Ejecutar todos los tests |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con reporte de cobertura (`coverage/lcov.info`) |
| `npm run test:db:up` / `test:db:down` | Levantar / eliminar la base de prueba |
| `npm run sonar:up` / `sonar:down` | Levantar / detener SonarQube local |
| `npm run sonar:scan` | Tests con cobertura + análisis en SonarQube local |

---

## Tests

Los tests usan **Vitest**. Los unitarios corren sin dependencias; los de integración (routers tRPC, autenticación, rate limit, rutas `/api`) usan una base **Postgres 17 desechable** definida en `docker-compose.test.yml`, que escucha solo en `127.0.0.1:5433`, guarda los datos en memoria y no comparte nada con desarrollo ni producción.

```bash
npm run test:db:up   # requiere Docker
npm run test         # o npm run test:coverage
npm run test:db:down
```

Si la base de prueba no está arriba, los tests fallan con el mensaje `No se pudo preparar la base de prueba`.

---

## Calidad de código

**SonarQube Cloud** analiza `main` automáticamente en cada push con el quality gate *Sonar way*.

- Usa el Análisis Automático, que se configura en **`.sonarcloud.properties`** (fuentes, tests y exclusiones, p. ej. `prisma/migrations/**`). Este análisis no lee `sonar-project.properties`.
- Los issues que se dejan a propósito se marcan como *Accepted* (o *False positive*) en SonarCloud con un comentario que explica el motivo.

**SonarQube local (opcional)**: sirve para revisar también la cobertura, que el Análisis Automático no calcula. Se configura en `sonar-project.properties`:

```bash
npm run sonar:up     # SonarQube en http://localhost:9000 (primer acceso: admin / admin)
export SONAR_TOKEN=… # token de My Account → Security
npm run sonar:scan   # levanta la base de prueba, genera cobertura y ejecuta el scanner
npm run sonar:down
```

Si cambias fuentes o exclusiones, actualiza **ambos** archivos de propiedades.

---

## Seguridad

- **`.env` nunca se sube al repositorio** (está en `.gitignore`). Las credenciales de producción viven solo en Vercel y en el `.env` local de quien administra; no se comparten por chat ni se copian a scripts.
- El esquema se gestiona **solo con migraciones** (`npm run db:generate` en desarrollo, `npm run db:migrate` en despliegue). No usar `prisma db push`: borraría los índices parciales creados con SQL (factura única por negocio, una caja abierta por usuario).
- La app envía cabeceras de seguridad (CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, COOP) definidas en `next.config.js`. Si se agrega un servicio externo (fuentes, analítica, imágenes), hay que añadir su origen a la CSP.
- Las subidas (`/api/upload/logo`, `/api/upload/receipt`) solo aceptan PNG, JPEG o WebP verificados por su firma binaria (SVG no), con límite de 2 MB para logos y 4 MB para comprobantes.
- `scripts/clear-db.mjs` borra todos los datos y solo corre contra una base en `localhost`/`127.0.0.1` y con `--yes`.
- Para desarrollo local, `./start-database.sh` levanta Postgres 17 escuchando solo en `127.0.0.1` y con una contraseña propia (nunca la de producción).

## Backups y restauración

Los respaldos cubren el esquema `public` de Postgres (todos los datos de la app). Los archivos de Supabase Storage (logos y comprobantes) no se incluyen.

**Respaldo** — `npm run db:backup` (usa `DIRECT_URL` del entorno o de `.env`):

- Genera `backups/billify_AAAAMMDD_HHMMSS.dump` (formato custom de `pg_dump`, permisos solo para el usuario) y lo verifica con `pg_restore --list`.
- Conserva los últimos 7 respaldos (`BACKUP_KEEP` para cambiarlo, `BACKUP_DIR` para otra carpeta). `backups/` está en `.gitignore`.
- Necesita `pg_dump` 17 o superior; si no está instalado, usa Docker (`postgres:17`) automáticamente. La contraseña se pasa por variables de entorno, nunca en la línea de comandos.

**Restauración** — `bash scripts/restore.sh <archivo.dump> --target <url>`:

- El destino se indica siempre de forma explícita y debe ser una base **vacía**. Se restaura en una sola transacción: si algo falla, no queda nada a medias.
- Se niega a restaurar en Supabase salvo que se agregue `--i-know-this-is-production` (y pide escribir el host para confirmar).
- Al terminar imprime el conteo de filas de `sales`, `products`, `customers`, `cash_registers` y `audit_logs`.

**Prueba de restauración (hacerla periódicamente):**

```bash
# 1. Postgres 17 local y desechable, solo en 127.0.0.1
docker run -d --name billify-restore-test -e POSTGRES_PASSWORD=restoretest \
  -p 127.0.0.1:55432:5432 postgres:17

# 2. Restaurar el último respaldo
bash scripts/restore.sh backups/billify_AAAAMMDD_HHMMSS.dump \
  --target postgresql://postgres:restoretest@127.0.0.1:55432/postgres --yes

# 3. Comparar los conteos impresos con los de Administración (admin.dbStats) en producción

# 4. Eliminar el contenedor
docker rm -f billify-restore-test
```

En Git Bash (Windows), si un comando `docker` recibe rutas mal convertidas, antepón `MSYS_NO_PATHCONV=1`.

---

## Licencia y derechos

Este software es propiedad exclusiva de **BILLIFY**. Queda expresamente prohibida su reproducción, distribución, modificación, uso comercial o puesta a disposición de terceros sin autorización escrita previa del titular.

---

© 2026 BILLIFY. Todos los derechos reservados.
