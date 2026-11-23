-- ============================================================================
--  SISTEMA DE INVENTARIO Y ENTREGAS - MIGRACION DE BASE DE DATOS (Supabase)
-- ============================================================================
--  Ejecuta este script UNA SOLA VEZ en el editor SQL de Supabase
--  (Dashboard -> SQL Editor -> New query -> Run).
--
--  Que hace este script:
--   1) Agrega el campo `rol` a la tabla `usuarios` (admin | revendedora).
--   2) Crea el usuario de la revendedora (master02 / ledismar1413).
--   3) Agrega columnas nuevas a `entregas` (tipo de operacion, moneda y tasas).
--   4) Crea `stock_revendedora`: lo que la revendedora tiene disponible para revender.
--   5) Crea `reventas`: las ventas que registra la revendedora.
--   6) Crea `sesiones`: registro de entrada/salida de cada usuario al sistema.
--
--  IMPORTANTE: los precios SIEMPRE se guardan en DOLARES (USD) en la base.
--  Las otras monedas (Bs, Euro, Rupia, Yuan) se calculan al momento de mostrar
--  usando la tasa de cambio actual. Asi, si manana cambia la tasa, todo se
--  recalcula automaticamente sin tocar la base de datos.
-- ============================================================================


-- ============================================================================
-- 1) USUARIOS: agregar columna `rol` y `nombre`
--    El rol define que puede hacer cada persona en el sistema:
--      * 'admin'        -> acceso TOTAL (el dueno).
--      * 'revendedora'  -> solo registrar reventas y ver disponibilidad.
-- ============================================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol text DEFAULT 'admin';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre text DEFAULT '';

-- Aseguramos que `usuario` sea unico para poder usar ON CONFLICT abajo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios (usuario);

-- Creamos (o actualizamos) el usuario de la REVENDEDORA.
-- Usuario: master02   |   Clave: ledismar1413
INSERT INTO usuarios (usuario, clave, rol, nombre)
VALUES ('master02', 'ledismar1413', 'revendedora', 'Revendedora')
ON CONFLICT (usuario)
DO UPDATE SET clave = 'ledismar1413', rol = 'revendedora', nombre = 'Revendedora';

-- NOTA: tu usuario de ADMIN ya existe. Al agregar la columna `rol` con valor
-- por defecto 'admin', tu usuario queda automaticamente como administrador.
-- Si tu usuario no se llama 'admin', no hace falta cambiarlo: todo usuario
-- SIN rol explicito es tratado como admin por la aplicacion.


-- ============================================================================
-- 2) ENTREGAS: agregar columnas para distinguir el TIPO de operacion y la
--    moneda en la que se emitio el recibo.
--
--    tipo:
--      * 'entrega'      -> venta/entrega a un cliente final normal.
--      * 'otra'         -> entrega a otra persona que TAMPOCO revende.
--      * 'revendedora'  -> entrega a la revendedora (se suma a su stock).
-- ============================================================================
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'entrega';
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'USD';
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tasa numeric;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS total_moneda numeric;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS usuario text DEFAULT '';

-- Nota: la columna `total` de entregas sigue guardando el total en DOLARES.
-- `total_moneda` guarda el total convertido a la moneda elegida en el recibo.


-- ============================================================================
-- 3) STOCK_REVENDEDORA: inventario disponible para que la REVENDEDORA revenda.
--    Solo se llena cuando el admin hace una entrega con tipo 'revendedora'.
--    Cuando la revendedora registra una reventa, aqui se descuenta.
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_revendedora (
    product_id text PRIMARY KEY,      -- ID del producto (igual al inventario)
    name       text,                  -- Nombre del producto (para mostrar)
    cantidad   numeric DEFAULT 0      -- Cantidad disponible para revender
);


-- ============================================================================
-- 4) REVENTAS: las ventas que registra la revendedora (su propio historial).
-- ============================================================================
CREATE TABLE IF NOT EXISTS reventas (
    id           text PRIMARY KEY,    -- Ej: REV-001
    fecha        text,                -- Fecha y hora de la reventa
    usuario      text,                -- Usuario de la revendedora que la hizo
    cliente      text,                -- Nombre de a quien se le vendio
    cedula       text,                -- Cedula (opcional)
    tipo_pago    text,                -- 'divisa' o 'bolivares'
    moneda       text,                -- Moneda en la que paga (USD, VES, EUR...)
    monto        numeric,             -- Monto en esa moneda
    monto_bs     numeric,             -- Equivalente en bolivares (para reportes)
    tasa         numeric,             -- Tasa usada para la conversion
    total_usd    numeric,             -- Total en dolares (base)
    pendiente    boolean DEFAULT false, -- TRUE si el pago quedo pendiente
    fecha_pago   text,                -- Posible fecha de pago (si pendiente)
    como_pagara  text,                -- Como pagara (divisa / bolivares)
    detalle      text,                -- Productos vendidos (texto resumido)
    id_entrega   text,                -- Entrega de origen (opcional)
    creado_en    timestamptz DEFAULT now()
);


-- ============================================================================
-- 5) SESIONES: registro de entrada y salida de cada usuario al sistema.
--    Sirve para saber a que hora entro/salio la revendedora y el admin.
-- ============================================================================
CREATE TABLE IF NOT EXISTS sesiones (
    id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    usuario       text,               -- Usuario que inicio sesion
    rol           text,               -- Rol al momento de entrar
    fecha_entrada text,               -- Fecha/hora de entrada
    fecha_salida  text,               -- Fecha/hora de salida (null mientras siga)
    notas         text                -- Notas adicionales (opcional)
);


-- ============================================================================
-- 6) CAJA (movimientos de dinero)
--    Registra el dinero que ENTRA (ingresos/ventas) y el que SALE (gastos).
--    Con esto el admin sabe cuanto dinero hay en total y cuanto queda.
--
--    Ejemplo del negocio:
--      + Ingreso  240.00  (la revendedora trajo ventas)
--      - Gasto    100.00  (adelanto de sueldo)
--      - Gasto     60.00  (gasto adicional)
--      - Gasto     25.00  (transporte)
--      --------------------------
--      SALDO      55.00
--
--    Cada movimiento guarda:
--      - tipo:       'ingreso' (entra) o 'gasto' (sale).
--      - nombre:     a quien o de que es (ej. "Ledismar Fuentes").
--      - motivo:     razon (Sueldo, Transporte, Comida, Imprevistos, Otro...).
--      - monto_usd:  SIEMPRE en dolares (base para calcular el saldo).
--      - monto_bs:   equivalente en bolivares con la tasa del momento.
-- ============================================================================
CREATE TABLE IF NOT EXISTS caja (
    id        bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tipo      text NOT NULL,           -- 'ingreso' | 'gasto'
    nombre    text,                    -- A quien / de que es el movimiento
    motivo    text,                    -- Razon del pago (predeterminado o "otro")
    moneda    text DEFAULT 'USD',      -- Moneda en la que se registro (USD/VES)
    monto     numeric,                 -- Monto en la moneda indicada
    monto_usd numeric,                 -- Monto en dolares (base)
    monto_bs  numeric,                 -- Equivalente en bolivares
    tasa      numeric,                 -- Tasa usada para la conversion
    fecha     text,                    -- Fecha/hora del movimiento
    usuario   text,                    -- Quien lo registro
    creado_en timestamptz DEFAULT now()
);
