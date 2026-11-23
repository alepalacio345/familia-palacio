# 📦 Sistema de Inventario, Entregas y Reventas — Guía de cambios

Este documento explica todo lo que se cambió, de dónde sale la tasa de cambio,
cómo configurar la base de datos y qué más se podría agregar en el futuro.

---

## 1) 💱 ¿De dónde sale la tasa de cambio?

**El precio de cada producto se guarda SIEMPRE en dólares (USD)** en la base de
datos. Por ejemplo, una caja vale `130` (USD). Las demás monedas (Bolívares,
Euro, Rupia, Yuan) se **calculan al momento de mostrar**, usando la tasa de
cambio actual.

### Tasa del Bolívar (Bs) — Banco Central de Venezuela (BCV)

El **Banco Central de Venezuela** publica su tasa oficial cada día en su página
(`https://www.bcv.org.ve/`). El problema es que el BCV **no ofrece una API JSON
pública que un navegador pueda consultar directamente** (no tiene CORS
habilitado y no da un endpoint estable).

Por eso usamos un **espejo confiable** que lee la tasa oficial del BCV y la
vuelve a publicar en formato JSON:

- `https://ve.dolarapi.com/v1/dolares/oficial`
  → responde `{ ..., "promedio": 918.76, ... }`
  → ese **`promedio` es la tasa oficial del BCV** (cuántos Bs cuesta 1 USD).

### Tasas de Euro, Rupia y Yuan

Para las demás monedas usamos una API gratuita de tipo de cambio (no pide
llave y permite CORS):

- `https://open.er-api.com/v6/latest/USD`
  → responde `{ "rates": { "USD":1, "EUR":0.91, "INR":92.7, "CNY":6.68, ... } }`

### Respaldo automático

Si el espejo del BCV falla (no hay internet, está caído, etc.), el sistema usa
la tasa de Bolívares que trae `open.er-api.com` como respaldo. Así **nunca te
quedas sin precio**.

> El código de todo esto está en `js/tasas.js`, muy comentado.

---

## 2) 🔁 Cómo se convierten los precios

| Moneda | Código | Cálculo (desde USD)          |
|--------|--------|------------------------------|
| Dólar  | USD    | precio × 1                   |
| Bs     | VES    | precio × tasa BCV            |
| Euro   | EUR    | precio × 0.91 (aprox)        |
| Rupia  | INR    | precio × 92.7 (aprox)        |
| Yuan   | CNY    | precio × 6.68 (aprox)        |

El selector **"Moneda"** de la barra superior cambia cómo se ven **todos** los
precios de la pantalla. Además, cada entrega/reventa guarda la **tasa usada en
ese momento**, así que los recibos PDF viejos no cambian si mañana cambia la
tasa.

---

## 3) 👥 Usuarios y permisos (roles)

| Acción                                    | Admin (tú) | Revendedora (master02) |
|-------------------------------------------|:----------:|:----------------------:|
| Ver inventario                            | ✅ editar   | ✅ solo lectura        |
| Registrar/editar/eliminar productos       | ✅          | ❌                     |
| Procesar entregas (y elegir tipo)         | ✅          | ❌                     |
| Ver historial de entregas                 | ✅          | ❌                     |
| Ver disponibilidad para revender          | ✅          | ✅                     |
| Registrar reventas                        | ❌ (solo ve) | ✅                   |
| Ver mis reventas                          | —           | ✅                     |
| Ver TODAS las reventas + filtrar          | ✅          | ❌                     |
| Eliminar una reventa                      | ✅ cualquiera | ✅ solo las suyas     |
| Ver registro de accesos (sesiones)        | ✅          | ❌                     |

### Credenciales creadas

- **Revendedora:** usuario `master02` — clave `ledismar1413`.
- **Admin:** tu usuario actual. Al migrar, todo usuario sin `rol` se vuelve
  `admin` automáticamente, así que **no necesitas crear tu cuenta de nuevo**.

---

## 4) 🗂️ Nuevos módulos y flujo

### Inventario con búsqueda y totales

El panel de inventario ahora tiene:

- **Búsqueda en vivo** por **nombre o ID** (escribes y la tabla se filtra al
  instante). Ideal para cuando haya muchos productos.
- **Resumen de totales**: cuántos **productos (tipos)** hay, cuántas
  **unidades en total**, y el **valor total** del inventario (en la moneda
  activa y en USD).

### Tipo de operación al procesar una entrega

Al procesar una venta, el admin ahora elige **Tipo de operación**:

1. **Entrega (cliente final)** → venta normal, descuenta inventario.
2. **Otra persona (no revende)** → igual que entrega, pero queda etiquetada
   para saber que esa persona NO revende.
3. **Revendedora (para reventa)** → descuenta del inventario principal **y
   además SUMA** esas cantidades al **stock de la revendedora**.

### Módulo de la revendedora

La revendedora ve un panel donde:

- Elige productos **solo de su stock** (lo que tú le entregaste).
- Arma un carrito y registra la venta.
- Indica **cómo fue el pago** (divisa o bolívares) y la **moneda**.
- Puede marcar **"pago pendiente"**, y si está pendiente:
  - posible **fecha del pago**,
  - **cómo pagará** (divisa o bolívares).
- Registra **nombre de a quién le vendió** y **cédula (opcional)**.
- Genera un **recibo PDF de reventa**.

### Filtros para el admin (Reventas)

El admin puede filtrar las reventas por:

- **Revendedora** (por si más adelante hay varias),
- **rango de fechas** (desde / hasta — para un solo día, pon la misma fecha en ambos),
- **nombre del comprador** (búsqueda parcial),
- **monto mínimo / máximo** (en USD).

### Registro de accesos (sesiones)

Cada vez que alguien entra o sale del sistema, se guarda en la tabla
`sesiones`: usuario, rol, **hora de entrada** y **hora de salida**. El admin lo
ve en el panel **"Accesos (Sesiones)"**.

> Nota: la salida se registra al pulsar el botón **"Salir"**. Si se cierra la
> pestaña de golpe, esa sesión puede quedar con "Sigue activa".

### Barra lateral (sidebar)

Se agregó un **menú lateral a la izquierda** con todos los módulos. En pantallas
pequeñas se **desliza** desde la izquierda (botón ☰). Cada rol ve **solo sus
módulos**.

### Módulo de Dinero / Caja (solo admin) 💰

Para saber **cuánto dinero hay realmente**. Registra lo que entra (ingresos) y
lo que sale (gastos), y calcula el **saldo**:

- **Ingreso** (+): por ejemplo, los `240$` que trae la revendedora.
- **Gasto** (−): `100$` adelanto de sueldo, `60$` gasto adicional, `25$`
  transporte, etc.
- **Saldo** = ingresos − gastos → en tu ejemplo quedarían `55$`.

Cada movimiento tiene:

- **Nombre** (a quién / de qué es, ej. "Ledismar Fuentes").
- **Motivo** predeterminado: Sueldo, Adelanto de sueldo, Transporte, Comida,
  Imprevistos, Gasto adicional… y la opción **"Otro"** para escribir uno propio.
- **Monto** en dólares o bolívares.

El resumen y cada movimiento se muestran **en dólares y en bolívares** (con la
tasa actual). Los motivos predeterminados se pueden editar en `js/caja.js`.

---

## 5) 🛠️ Cómo instalar / configurar

1. Abre el proyecto y el archivo `index.html` en tu navegador (o con tu
   servidor actual). Usa tu URL de Supabase ya configurada en `js/config.js`.
2. **Ejecuta el script SQL** `sql/schema.sql` una sola vez en Supabase:
   - Dashboard de Supabase → **SQL Editor** → pega el contenido → **Run**.
   - Esto crea el usuario `master02`, las tablas `reventas`,
     `stock_revendedora`, `sesiones`, `caja` y agrega los campos nuevos.
3. Recarga la página e inicia sesión.

> ⚠️ Si no ejecutas `schema.sql`, el login fallará con un error porque las
> tablas/columnas nuevas no existen todavía.

---

## 6) 📁 Estructura de archivos

| Archivo               | Qué hace                                                        |
|-----------------------|-----------------------------------------------------------------|
| `index.html`          | Pantallas + sidebar + todos los paneles                         |
| `styles.css`          | Estilos (sidebar, tarjetas, etiquetas, responsive)              |
| `js/config.js`        | Conexión a Supabase                                             |
| `js/state.js`         | Estado global en memoria                                        |
| `js/tasas.js`         | **Tasas de cambio (BCV + cruces) y conversión**                 |
| `js/auth.js`          | Login por rol                                                   |
| `js/sesion.js`        | Roles, permisos, sidebar y log de sesiones                      |
| `js/ui.js`            | Renderizado de tablas/totales con moneda                        |
| `js/inventario.js`    | Gestión de productos (admin)                                    |
| `js/entregas.js`      | Ventas/entregas del admin + tipo de operación                   |
| `js/stock.js`         | Stock de la revendedora (leer/sumar/restar)                     |
| `js/reventas.js`      | Módulo de la revendedora + filtros                              |
| `js/caja.js`          | **Módulo de Dinero/Caja (ingresos, gastos y saldo)**            |
| `js/pdf.js`           | Recibos PDF (entrega y reventa, multi-moneda)                   |
| `sql/schema.sql`      | Migración de base de datos (ejecutar una vez)                   |

Todos los archivos y funciones están **comentados en español**.

---

## 7) 💡 Sugerencias de cosas que podrías agregar

1. **Permisos reales de seguridad (RLS):** hoy los permisos se controlan en la
   interfaz. Si quieres que sea seguro de verdad, activa **Row Level Security**
   en Supabase para que la revendedora no pueda leer datos de admin ni siquiera
   con la consola del navegador.
2. **Múltiples revendedoras:** el código ya está preparado (filtro por
   revendedora). Solo faltaría crear más usuarios con rol `revendedora` y un
   stock separado por cada una (hoy el stock es compartido).
3. **Ganancias / comisión de la revendedora:** comparar lo que tú le entregaste
   (a precio de costo) contra lo que ella vendió, para ver su ganancia y/o la
   comisión que te debe.
4. **Reporte de pagos pendientes:** una lista de todas las reventas pendientes
   con fecha próxima a vencer, para cobrar a tiempo.
5. **Cambiar una reventa:** hoy la revendedora puede **eliminar** sus propias
   reventas (y se devuelve el stock), pero no editarlas. Podrías agregar un
   botón "Editar" si prefieres que corrija en lugar de borrar y rehacer.
6. **Alertas de stock bajo:** avisar cuando un producto (o el stock de la
   revendedora) está por debajo de un mínimo.
7. **Registro de caja / cierre diario:** total vendido en Bs y en divisa por
   día, para cuadrar la caja.
8. **Vincular reventas a la caja:** que cuando la revendedora registre una
   reventa **pagada**, se cree automáticamente un ingreso en la caja (así no lo
   anotas dos veces).
9. **Filtrar la caja por fecha o motivo:** un rango de fechas y un selector de
   motivo para revisar solo "Transporte" o solo "Sueldo" en un mes.
10. **Copia de seguridad / exportar todo:** un botón que descargue inventario +
    entregas + reventas + sesiones + caja en un solo archivo.
11. **Notas de crédito o devoluciones:** registrar una devolución de mercancía
    que sume de vuelta al inventario o al stock.
12. **Historial de precios:** guardar cada cambio de precio para saber cuándo y
    cuánto cambió un producto.

---

*Generado para el proyecto `familia-palacio` — inventario + entregas + reventas.*
