// ============================================================================
//  ui.js - RENDERIZADO DE LA INTERFAZ (HTML)
// ============================================================================
//  Este modulo dibuja todas las tablas, listas y totales en pantalla.
//  Cada vez que cambia algo (un producto, una entrega, la moneda activa...)
//  se llama a `renderizarTodo()` para volver a pintar todo.
//
//  TODOS los precios internos estan en DOLARES. Al pintar, se convierten a la
//  moneda activa (state.moneda) usando las tasas de `state.tasas`.
// ============================================================================

import { state } from "./state.js";
import { formatearMonto, convertirDesdeUsd, textoResumenTasas, MONEDAS } from "./tasas.js";

// ----------------------------------------------------------------------------
// Utilidad: escapa texto para evitar inyectar HTML raro (seguridad).
// ----------------------------------------------------------------------------
export function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ----------------------------------------------------------------------------
// Devuelve true si el usuario actual es ADMIN (no revendedora).
// Lo definimos local para no crear dependencias circulares con sesion.js.
// ----------------------------------------------------------------------------
function esAdmin() {
    return state.usuarioActual && state.usuarioActual.rol !== "revendedora";
}

// ----------------------------------------------------------------------------
// formatearMoneda(usd)
// Recibe un monto EN DOLARES y devuelve el texto formateado en la moneda activa.
//   Ej: con moneda activa VES y tasa 918.76 -> "Bs119.438,80"
// ----------------------------------------------------------------------------
export function formatearMoneda(usd) {
    const valor = convertirDesdeUsd(usd, state.moneda);
    return formatearMonto(valor, state.moneda);
}

// ----------------------------------------------------------------------------
// Muestra u oculta las tres pantallas principales: login, app y salida.
// ----------------------------------------------------------------------------
export function mostrarPantalla(pantalla) {
    document.getElementById("login-screen").classList.toggle("hidden", pantalla !== "login");
    document.getElementById("app-screen").classList.toggle("hidden", pantalla !== "app");
    document.getElementById("exit-screen").classList.toggle("hidden", pantalla !== "exit");
}

// ----------------------------------------------------------------------------
// Muestra un mensaje temporal (verde=ok, rojo=error) en la parte superior.
// ----------------------------------------------------------------------------
export function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById("alerta-global");
    if (!alerta) return;
    alerta.textContent = mensaje;
    alerta.className = `alerta ${tipo}`;
    clearTimeout(alerta._timer);
    alerta._timer = setTimeout(() => alerta.classList.add("hidden"), 3800);
}

// ----------------------------------------------------------------------------
// renderizarTodo()
// Pinta TODAS las secciones. Se llama despues de cargar datos o al cambiar
// la moneda activa.
// ----------------------------------------------------------------------------
export function renderizarTodo() {
    renderizarInventario();
    renderizarInventarioSoloLectura();
    renderizarSelectProductos();
    renderizarListaVenta();
    renderizarEntregas();
    renderizarStockRevendedora();
    renderizarReventas();
    renderizarSesiones();
    renderizarCaja();
    renderizarPapelera();
    renderizarTasas();
}

// ----------------------------------------------------------------------------
// INVENTARIO (tabla del admin, con botones Editar / Eliminar)
// Ademas muestra el total de productos y permite buscar por nombre o ID.
// ----------------------------------------------------------------------------
export function renderizarInventario() {
    const tbody = document.getElementById("tbody-inventario");
    if (!tbody) return;

    // Actualizamos el resumen de totales (productos, unidades y valor).
    actualizarResumenInventario();

    // Filtramos por nombre o ID segun lo escrito en la busqueda.
    const busqueda = (state.busquedaInventario || "").trim().toLowerCase();
    const lista = state.inventario.filter(p =>
        !busqueda ||
        String(p.id).toLowerCase().includes(busqueda) ||
        String(p.name).toLowerCase().includes(busqueda)
    );

    if (state.inventario.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">El inventario esta vacio.</td></tr>`;
        return;
    }

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">Sin resultados para "${escaparHtml(state.busquedaInventario)}".</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(p => {
        // Mostramos el precio convertido a la moneda activa y, debajo,
        // el precio base en dolares como referencia.
        const precioMostrado = formatearMoneda(p.precio);
        const precioUsd = formatearMonto(p.precio, "USD");

        // El boton de Editar/Eliminar solo aparece para el ADMIN.
        const acciones = esAdmin() ? `
            <div class="acciones-celda">
                <button class="btn btn-warning btn-sm" data-action="edit-inv" data-id="${escaparHtml(p.id)}">Editar</button>
                <button class="btn btn-danger btn-sm" data-action="del-inv" data-id="${escaparHtml(p.id)}">Eliminar</button>
            </div>` : `<span class="sub-dato">Solo lectura</span>`;

        return `
            <tr>
                <td><strong>${escaparHtml(p.id)}</strong></td>
                <td>${escaparHtml(p.name)}</td>
                <td>${Number(p.cantidad).toFixed(2)}</td>
                <td>
                    ${escaparHtml(precioMostrado)}
                    <span class="sub-dato">≈ ${escaparHtml(precioUsd)}</span>
                </td>
                <td>${acciones}</td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// actualizarResumenInventario()
// Calcula y muestra los totales GENERALES del inventario (sin filtrar):
//   - cuantos productos (tipos) hay,
//   - cuantas unidades en total,
//   - cuanto vale todo junto (en la moneda activa y en USD).
// ----------------------------------------------------------------------------
function actualizarResumenInventario() {
    const cont = document.getElementById("resumen-inventario");
    if (!cont) return;

    const totalTipos = state.inventario.length;
    const totalUnidades = state.inventario.reduce((acc, p) => acc + Number(p.cantidad || 0), 0);
    const valorUsd = state.inventario.reduce((acc, p) => acc + Number(p.cantidad || 0) * Number(p.precio || 0), 0);

    const busqueda = (state.busquedaInventario || "").trim();
    const notaBusqueda = busqueda ? `<span class="sub-dato">Buscando: "${escaparHtml(busqueda)}"</span>` : "";

    cont.innerHTML = `
        <div class="ri-item">
            <span>Productos (tipos)</span>
            <strong>${totalTipos}</strong>
        </div>
        <div class="ri-item">
            <span>Unidades totales</span>
            <strong>${totalUnidades.toFixed(2)}</strong>
        </div>
        <div class="ri-item">
            <span>Valor total</span>
            <strong>${escaparHtml(formatearMoneda(valorUsd))}</strong>
            <span class="resumen-bs">≈ ${escaparHtml(formatearMonto(valorUsd, "USD"))}</span>
        </div>
        ${notaBusqueda}
    `;
}

// ----------------------------------------------------------------------------
// INVENTARIO SOLO LECTURA (lo ve la revendedora para saber que hay disponible)
// Sin botones de edicion/eliminacion.
// ----------------------------------------------------------------------------
export function renderizarInventarioSoloLectura() {
    const tbody = document.getElementById("tbody-inventario-lectura");
    if (!tbody) return;

    if (state.inventario.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">El inventario esta vacio.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.inventario.map(p => `
        <tr>
            <td><strong>${escaparHtml(p.id)}</strong></td>
            <td>${escaparHtml(p.name)}</td>
            <td>${Number(p.cantidad).toFixed(2)}</td>
            <td>${escaparHtml(formatearMoneda(p.precio))}</td>
        </tr>
    `).join("");
}

// ----------------------------------------------------------------------------
// PAPELERA (productos eliminados, recuperables) — solo la ve el admin.
// Cada fila tiene "Restaurar" y "Eliminar definitivo".
// ----------------------------------------------------------------------------
export function renderizarPapelera() {
    const tbody = document.getElementById("tbody-papelera");
    if (!tbody) return;

    if (state.papelera.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">La papelera esta vacia.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.papelera.map(p => `
        <tr>
            <td><strong>${escaparHtml(p.product_id)}</strong></td>
            <td>${escaparHtml(p.name)}</td>
            <td>${Number(p.cantidad).toFixed(2)}</td>
            <td>${escaparHtml(formatearMonto(p.precio, "USD"))}</td>
            <td>${escaparHtml(p.fecha_eliminado || "-")}</td>
            <td>
                <div class="acciones-celda">
                    <button class="btn btn-success btn-sm" data-action="restaurar" data-id="${escaparHtml(p.id)}">Restaurar</button>
                    <button class="btn btn-danger btn-sm" data-action="borrar-def" data-id="${escaparHtml(p.id)}">Eliminar definitivo</button>
                </div>
            </td>
        </tr>
    `).join("");
}

// ----------------------------------------------------------------------------
// SELECT de productos (para la lista de venta del admin).
// Muestra el precio convertido y la disponibilidad real.
// ----------------------------------------------------------------------------
export function renderizarSelectProductos() {
    const select = document.getElementById("lista-producto");
    if (!select) return;

    if (state.inventario.length === 0) {
        select.innerHTML = `<option value="">Sin productos disponibles</option>`;
        return;
    }

    const valorPrevio = select.value;
    select.innerHTML = state.inventario.map(p => {
        const enLista = state.listaVenta.find(i => i.id === p.id);
        const disp = p.cantidad - (enLista ? enLista.cantidad : 0);
        return `<option value="${escaparHtml(p.id)}">${escaparHtml(p.id)} - ${escaparHtml(p.name)} (${escaparHtml(formatearMoneda(p.precio))} | Disp: ${Number(disp).toFixed(2)})</option>`;
    }).join("");

    if (valorPrevio && state.inventario.some(p => p.id === valorPrevio)) {
        select.value = valorPrevio;
    }
}

// ----------------------------------------------------------------------------
// LISTA DE VENTA (carrito del admin antes de procesar una entrega).
// ----------------------------------------------------------------------------
export function renderizarListaVenta() {
    const tbody = document.getElementById("tbody-lista");
    const totalEl = document.getElementById("total-lista");
    if (!tbody) return;

    if (state.listaVenta.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">Lista vacia.</td></tr>`;
        if (totalEl) totalEl.textContent = formatearMonto(0, state.moneda);
        return;
    }

    let totalGeneral = 0;
    tbody.innerHTML = state.listaVenta.map(item => {
        const subtotal = item.cantidad * item.precio; // en USD
        totalGeneral += subtotal;
        return `
            <tr>
                <td>${escaparHtml(item.id)}</td>
                <td>${escaparHtml(item.name)}</td>
                <td>${item.cantidad}</td>
                <td>${escaparHtml(formatearMoneda(item.precio))}</td>
                <td><strong>${escaparHtml(formatearMoneda(subtotal))}</strong></td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="del-lista" data-id="${escaparHtml(item.id)}">Quitar</button>
                </td>
            </tr>
        `;
    }).join("");

    if (totalEl) totalEl.textContent = formatearMoneda(totalGeneral);
}

// ----------------------------------------------------------------------------
// HISTORIAL DE ENTREGAS (solo lo ve el admin).
// Muestra una etiqueta con el tipo de operacion y el total en moneda activa.
// ----------------------------------------------------------------------------
export function renderizarEntregas() {
    const tbody = document.getElementById("tbody-entregas");
    if (!tbody) return;

    if (state.entregas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No hay entregas registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.entregas.map(e => {
        const etiquetaTipo = etiquetaTipoEntrega(e.tipo);
        return `
            <tr>
                <td><strong>${escaparHtml(e.id)}</strong></td>
                <td>${escaparHtml(e.fecha)}</td>
                <td>
                    ${escaparHtml(e.cliente)}
                    <span class="sub-dato">C.I.: ${escaparHtml(e.cedula || "N/A")}</span>
                </td>
                <td>${escaparHtml(e.lugar_entrega || "No especificado")}</td>
                <td>${escaparHtml(e.detalle)}</td>
                <td>${etiquetaTipo}</td>
                <td><strong>${escaparHtml(formatearMoneda(e.total))}</strong></td>
                <td>
                    <div class="acciones-celda">
                        <button class="btn btn-primary btn-sm" data-action="pdf-ent" data-id="${escaparHtml(e.id)}">PDF</button>
                        <button class="btn btn-danger btn-sm" data-action="del-ent" data-id="${escaparHtml(e.id)}">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// Devuelve una etiqueta HTML con color segun el tipo de entrega.
// ----------------------------------------------------------------------------
function etiquetaTipoEntrega(tipo) {
    const mapa = {
        entrega:      { texto: "Entrega",       clase: "tag tag-azul" },
        otra:         { texto: "Otra persona",  clase: "tag tag-gris" },
        revendedora:  { texto: "Revendedora",   clase: "tag tag-verde" },
    };
    const info = mapa[tipo] || mapa.entrega;
    return `<span class="${info.clase}">${info.texto}</span>`;
}

// ----------------------------------------------------------------------------
// STOCK DE LA REVENDEDORA (lo disponible para revender).
// Lo ven tanto el admin como la revendedora.
// ----------------------------------------------------------------------------
export function renderizarStockRevendedora() {
    const tbody = document.getElementById("tbody-stock-revendedora");
    if (!tbody) return;

    if (state.stockRevendedora.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Todavia no hay stock asignado a la revendedora.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.stockRevendedora.map(s => `
        <tr>
            <td><strong>${escaparHtml(s.product_id)}</strong></td>
            <td>${escaparHtml(s.name)}</td>
            <td>${Number(s.cantidad).toFixed(2)}</td>
        </tr>
    `).join("");
}

// ----------------------------------------------------------------------------
// REVENTAS (historial). Se aplica el filtro guardado en state.filtrosReventas.
//   - Admin: ve TODAS las reventas con filtros.
//   - Revendedora: ve SOLO las suyas.
// ----------------------------------------------------------------------------
export function renderizarReventas() {
    const tbody = document.getElementById("tbody-reventas");
    if (!tbody) return;

    const lista = aplicarFiltrosReventas(state.reventas);

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">No hay reventas registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(r => {
        const estado = r.pendiente
            ? `<span class="tag tag-rojo">Pendiente</span>`
            : `<span class="tag tag-verde">Pagado</span>`;

        // El monto se muestra en la moneda en la que se cobro.
        const montoTexto = formatearMonto(r.monto, r.moneda || "USD");

        // Acciones: PDF siempre; "Editar" solo la revendedora para las SUYAS;
        // "Eliminar" el admin (cualquiera) o la revendedora (solo las suyas).
        const esAdminLocal = esAdmin();
        const esPropia = r.usuario === state.usuarioActual?.usuario;
        const puedeEditar = !esAdminLocal && esPropia;
        const puedeEliminar = esAdminLocal || esPropia;
        const acciones = `
            <div class="acciones-celda">
                <button class="btn btn-primary btn-sm" data-action="pdf-rev" data-id="${escaparHtml(r.id)}">PDF</button>
                ${puedeEditar ? `<button class="btn btn-warning btn-sm" data-action="edit-rev" data-id="${escaparHtml(r.id)}">Editar</button>` : ""}
                ${puedeEliminar ? `<button class="btn btn-danger btn-sm" data-action="del-rev" data-id="${escaparHtml(r.id)}">Eliminar</button>` : ""}
            </div>`;

        return `
            <tr>
                <td><strong>${escaparHtml(r.id)}</strong></td>
                <td>${escaparHtml(r.fecha)}</td>
                <td>
                    ${escaparHtml(r.cliente || "Sin nombre")}
                    <span class="sub-dato">C.I.: ${escaparHtml(r.cedula || "N/A")}</span>
                </td>
                <td>${escaparHtml(r.usuario || "-")}</td>
                <td>${escaparHtml(r.detalle || "-")}</td>
                <td><strong>${escaparHtml(montoTexto)}</strong></td>
                <td>${estado}</td>
                <td>${escaparHtml(r.fecha_pago || "-")}</td>
                <td>${acciones}</td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// Aplica los filtros guardados a la lista de reventas.
// Los montos se comparan en dolares para que el filtro sea consistente.
// ----------------------------------------------------------------------------
function aplicarFiltrosReventas(lista) {
    const f = state.filtrosReventas;
    const esAdminLocal = esAdmin();

    return lista.filter(r => {
        // La revendedora solo ve sus propias reventas.
        if (!esAdminLocal && r.usuario !== state.usuarioActual?.usuario) return false;

        // Filtro por usuario (solo lo usa el admin).
        if (esAdminLocal && f.usuario && r.usuario !== f.usuario) return false;

        // Filtro por rango de fechas (comparamos solo la parte YYYY-MM-DD).
        const dia = String(r.fecha || "").slice(0, 10);
        if (f.desde && dia < f.desde) return false;
        if (f.hasta && dia > f.hasta) return false;

        // Filtro por nombre del comprador (busqueda parcial, sin distinguir mayusculas).
        if (f.cliente && !String(r.cliente || "").toLowerCase().includes(f.cliente.toLowerCase())) return false;

        // Filtro por monto (convertimos el monto de la reventa a USD y comparamos).
        const usd = Number(r.total_usd ?? convertirDesdeUsd(r.monto, r.moneda));
        if (f.montoMin !== "" && usd < Number(f.montoMin)) return false;
        if (f.montoMax !== "" && usd > Number(f.montoMax)) return false;

        return true;
    });
}

// ----------------------------------------------------------------------------
// SESIONES (historial de entradas/salidas, solo admin).
// ----------------------------------------------------------------------------
export function renderizarSesiones() {
    const tbody = document.getElementById("tbody-sesiones");
    if (!tbody) return;

    if (state.sesiones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay sesiones registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.sesiones.map(s => {
        const rolEtiqueta = s.rol === "revendedora"
            ? `<span class="tag tag-verde">Revendedora</span>`
            : `<span class="tag tag-azul">Admin</span>`;
        return `
            <tr>
                <td>${escaparHtml(s.usuario || "-")}</td>
                <td>${rolEtiqueta}</td>
                <td>${escaparHtml(s.fecha_entrada || "-")}</td>
                <td>${escaparHtml(s.fecha_salida || "Sigue activa")}</td>
                <td>${escaparHtml(s.notas || "-")}</td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// CAJA: resumen de dinero (ingresos, gastos y saldo) + tabla de movimientos.
// ----------------------------------------------------------------------------
export function renderizarCaja() {
    const tbody = document.getElementById("tbody-caja");
    const resumen = document.getElementById("resumen-caja");
    if (!tbody) return;

    // Sumamos ingresos y gastos (todo en USD, que es la base).
    let ingresos = 0;
    let gastos = 0;
    state.caja.forEach(m => {
        const usd = Number(m.monto_usd ?? 0);
        if (m.tipo === "ingreso") ingresos += usd;
        else gastos += usd;
    });
    const saldo = ingresos - gastos;

    // Resumen de arriba (en USD y Bs).
    if (resumen) resumen.innerHTML = resumenCajaHTML(ingresos, gastos, saldo);

    // Tabla de movimientos.
    if (state.caja.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No hay movimientos de dinero registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.caja.map(m => {
        const tipoTag = m.tipo === "gasto"
            ? `<span class="tag tag-rojo">Gasto</span>`
            : `<span class="tag tag-verde">Ingreso</span>`;
        return `
            <tr>
                <td>${escaparHtml(m.fecha)}</td>
                <td>${tipoTag}</td>
                <td>${escaparHtml(m.nombre || "-")}</td>
                <td>${escaparHtml(m.motivo || "-")}</td>
                <td><strong>${escaparHtml(formatearMonto(m.monto_usd, "USD"))}</strong></td>
                <td>${escaparHtml(formatearMonto(m.monto_bs, "VES"))}</td>
                <td>${escaparHtml(m.usuario || "-")}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="del-caja" data-id="${escaparHtml(m.id)}">Eliminar</button>
                </td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// resumenCajaHTML()
// Construye las 3 tarjetas del resumen: ingresos, gastos y saldo (USD + Bs).
// ----------------------------------------------------------------------------
function resumenCajaHTML(ingresos, gastos, saldo) {
    const tasaVes = state.tasas.VES;
    // Convierte un monto en USD a Bs usando la tasa actual.
    const aBs = usd => (tasaVes ? formatearMonto(Number(usd) * tasaVes, "VES") : "—");

    return `
        <div class="resumen-item resumen-ingreso">
            <span class="resumen-label">Ingresos</span>
            <strong>${formatearMonto(ingresos, "USD")}</strong>
            <span class="resumen-bs">${aBs(ingresos)}</span>
        </div>
        <div class="resumen-item resumen-gasto">
            <span class="resumen-label">Gastos</span>
            <strong>${formatearMonto(gastos, "USD")}</strong>
            <span class="resumen-bs">${aBs(gastos)}</span>
        </div>
        <div class="resumen-item resumen-saldo">
            <span class="resumen-label">Saldo (queda)</span>
            <strong>${formatearMonto(saldo, "USD")}</strong>
            <span class="resumen-bs">${aBs(saldo)}</span>
        </div>
    `;
}

// ----------------------------------------------------------------------------
// TASAS: actualiza el texto informativo de la barra superior y el selector.
// ----------------------------------------------------------------------------
export function renderizarTasas() {
    const info = document.getElementById("tasa-info");
    if (info) {
        info.textContent = textoResumenTasas();
        info.title = `Fuente de la tasa Bs: ${state.tasas.fuente || "n/a"}`;
    }

    // Actualizamos el simbolo de la moneda elegida en el selector.
    const select = document.getElementById("select-moneda");
    if (select && !select.dataset.init) {
        select.innerHTML = MONEDAS.map(m =>
            `<option value="${m.codigo}" ${m.codigo === state.moneda ? "selected" : ""}>${m.nombre} (${m.simbolo})</option>`
        ).join("");
        select.dataset.init = "1";
    }
}

// ----------------------------------------------------------------------------
// inicializarSelectorMoneda()
// Crea el selector de moneda de la barra superior y lo deja escuchando.
// Al cambiar de moneda, se guarda en state y se vuelve a pintar todo.
// ----------------------------------------------------------------------------
export function inicializarSelectorMoneda() {
    const select = document.getElementById("select-moneda");
    if (!select) return;

    select.addEventListener("change", () => {
        state.moneda = select.value;
        renderizarTodo();
    });
}


