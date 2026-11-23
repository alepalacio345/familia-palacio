// ============================================================================
//  state.js - ESTADO GLOBAL DE LA APLICACION
// ============================================================================
//  Aqui se guarda TODA la informacion en memoria de la sesion actual.
//  Los datos se traen de Supabase al iniciar sesion y se van actualizando
//  despues de cada operacion (guardar producto, procesar entrega, etc.).
//
//  IMPORTANTE: los precios en `inventario`, `listaVenta` y `entregas`
//  SIEMPRE estan en DOLARES (USD). La conversion a Bs/Euro/Rupia/Yuan se
//  hace solo al momento de MOSTRAR, usando las tasas de `state.tasas`.
// ============================================================================

export const state = {
    // --- Inventario del negocio (lo administra el dueno/admin) ---
    //     [{ id, name, cantidad, precio }]  (precio en USD)
    inventario: [],

    // --- Lista temporal de productos que se van a entregar (carrito) ---
    //     [{ id, name, cantidad, precio }]  (precio en USD)
    listaVenta: [],

    // --- Historial de entregas (ventas que hace el ADMIN) ---
    //     [{ id, fecha, cliente, cedula, lugar_entrega, detalle, total,
    //        tipo, moneda, tasa, total_moneda, usuario }]
    entregas: [],

    // --- Ventas que registra la REVENDEDORA (reventas) ---
    //     [{ id, fecha, usuario, cliente, cedula, tipo_pago, moneda, monto,
    //        monto_bs, tasa, total_usd, pendiente, fecha_pago, como_pagara,
    //        detalle, id_entrega }]
    reventas: [],

    // --- Stock disponible para revender (stock de la revendedora) ---
    //     [{ product_id, name, cantidad }]
    stockRevendedora: [],

    // --- Lista temporal de productos para UNA reventa (carrito de la revendedora) ---
    //     [{ id, name, cantidad, precio }]  (precio en USD)
    listaReventa: [],

    // --- Registro de entradas/salidas de sesion ---
    //     [{ id, usuario, rol, fecha_entrada, fecha_salida, notas }]
    sesiones: [],

    // --- Movimientos de DINERO (caja): ingresos y gastos ---
    //     [{ id, tipo, nombre, motivo, moneda, monto, monto_usd, monto_bs,
    //        tasa, fecha, usuario }]
    caja: [],

    // --- PAPELERA: productos eliminados del inventario (recuperables) ---
    //     [{ id, product_id, name, cantidad, precio, fecha_eliminado, usuario }]
    papelera: [],

    // --- Id de la reventa que la revendedora esta EDITANDO (o null) ---
    reventaEditandoId: null,

    // --- Producto que se esta editando actualmente (id o null) ---
    idEditando: null,

    // --- Usuario que inicio sesion ---
    //     { usuario, rol, nombre }
    //     rol: 'admin' | 'revendedora'
    usuarioActual: null,

    // --- Id de la fila en `sesiones` de la sesion activa ---
    //     Se usa para marcar la hora de salida al cerrar sesion.
    sesionId: null,

    // --- Moneda activa para MOSTRAR precios en toda la app ---
    //     Puede ser: USD, VES, EUR, INR, CNY
    moneda: "USD",

    // --- Tasas de cambio cargadas (1 USD = X moneda) ---
    //     { USD:1, VES:918.76, EUR:0.91, INR:92.75, CNY:6.68,
    //       actualizado: "...", fuente: "..." }
    tasas: {
        USD: 1,
        VES: null,
        EUR: null,
        INR: null,
        CNY: null,
        actualizado: null,
        fuente: null,
    },

    // --- Filtros del historial de REVENTAS (para el admin) ---
    filtrosReventas: {
        usuario: "",     // Filtrar por usuario (revendedora)
        desde: "",       // Fecha inicial (YYYY-MM-DD)
        hasta: "",       // Fecha final   (YYYY-MM-DD)
        cliente: "",     // Nombre del comprador (busqueda parcial)
        montoMin: "",    // Monto minimo
        montoMax: "",    // Monto maximo
        moneda: "USD",   // Moneda con la que se comparan los montos del filtro
    },

    // --- Texto de busqueda del INVENTARIO (por nombre o ID) ---
    busquedaInventario: "",
};
