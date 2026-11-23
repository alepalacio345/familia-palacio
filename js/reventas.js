// ============================================================================
//  reventas.js - MODULO DE LA REVENDEDORA (registrar reventas + historial)
// ============================================================================
//  Este modulo es el corazon del trabajo de la REVENDEDORA:
//
//   1) Registrar una reventa: arma un carrito de productos, elige como fue el
//      pago (divisa o bolivares), si queda pendiente, la posible fecha de pago
//      y como pagara. Solo puede vender productos y cantidades que el admin le
//      haya entregado (stock_revendedora).
//   2) Ver su propio historial de reventas.
//
//  El ADMIN usa este mismo modulo, pero en modo "solo lectura + filtros":
//  puede ver TODAS las reventas y filtrarlas por dia, fecha, monto y cliente.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { cargarStockRevendedora, sumarStock, restarStock } from "./stock.js";
import { convertirDesdeUsd, obtenerTasa, formatearMonto } from "./tasas.js";
import { generarReciboReventaPDF } from "./pdf.js";
import { mostrarAlerta, renderizarTodo, escaparHtml } from "./ui.js";

// ----------------------------------------------------------------------------
// Devuelve true si el usuario actual es ADMIN.
// ----------------------------------------------------------------------------
function esAdmin() {
    return state.usuarioActual && state.usuarioActual.rol !== "revendedora";
}

// ----------------------------------------------------------------------------
// cargarReventas()
// Trae todas las reventas desde Supabase (el render las filtra segun el rol).
// ----------------------------------------------------------------------------
export async function cargarReventas() {
    const { data, error } = await db
        .from("reventas")
        .select("id, fecha, usuario, cliente, cedula, tipo_pago, moneda, monto, monto_bs, tasa, total_usd, pendiente, fecha_pago, como_pagara, detalle, id_entrega")
        .order("creado_en", { ascending: false });

    if (error) {
        mostrarAlerta(`Error cargando reventas: ${error.message}`, "err");
        return false;
    }

    state.reventas = (data || []).map(r => ({
        ...r,
        monto: Number(r.monto ?? 0),
        monto_bs: Number(r.monto_bs ?? 0),
        total_usd: Number(r.total_usd ?? 0),
        pendiente: !!r.pendiente,
    }));

    return true;
}

// ----------------------------------------------------------------------------
// obtenerSiguienteIdReventa()
// Calcula el siguiente id de reventa (REV-001, REV-002, ...).
// ----------------------------------------------------------------------------
function obtenerSiguienteIdReventa() {
    let maxNum = 0;
    state.reventas.forEach(r => {
        const match = String(r.id).match(/^REV-(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    return `REV-${String(maxNum + 1).padStart(3, "0")}`;
}

// ----------------------------------------------------------------------------
// obtenerFechaFormateada()
// Fecha y hora actual "YYYY-MM-DD HH:mm".
// ----------------------------------------------------------------------------
function obtenerFechaFormateada() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ----------------------------------------------------------------------------
// monedaReventa()
// Devuelve la moneda elegida en el selector de pago de la reventa.
// Si aun no hay selector, usa la moneda activa de la aplicacion.
// ----------------------------------------------------------------------------
function monedaReventa() {
    return document.getElementById("rev-moneda")?.value || state.moneda;
}

// ----------------------------------------------------------------------------
// renderizarSelectReventaProductos()
// Llena el <select> de productos con lo disponible en el stock de la revendedora.
// Muestra el precio (convertido a la moneda de pago) y la cantidad disponible.
// ----------------------------------------------------------------------------
export function renderizarSelectReventaProductos() {
    const select = document.getElementById("rev-producto");
    if (!select) return;

    if (state.stockRevendedora.length === 0) {
        select.innerHTML = `<option value="">Sin stock para revender</option>`;
        return;
    }

    const moneda = monedaReventa();
    const valorPrevio = select.value;
    select.innerHTML = state.stockRevendedora.map(s => {
        // Buscamos el precio en USD en el inventario principal.
        const prod = state.inventario.find(p => p.id === s.product_id);
        const precioUsd = prod ? prod.precio : 0;
        const precioMostrado = formatearMonto(convertirDesdeUsd(precioUsd, moneda), moneda);

        // Disponible real = stock - lo ya puesto en el carrito actual.
        const enCarrito = state.listaReventa.find(i => i.id === s.product_id);
        const disp = s.cantidad - (enCarrito ? enCarrito.cantidad : 0);

        return `<option value="${escaparHtml(s.product_id)}">${escaparHtml(s.product_id)} - ${escaparHtml(s.name)} (${escaparHtml(precioMostrado)} | Disp: ${Number(disp).toFixed(2)})</option>`;
    }).join("");

    if (valorPrevio && state.stockRevendedora.some(s => s.product_id === valorPrevio)) {
        select.value = valorPrevio;
    }
}

// ----------------------------------------------------------------------------
// renderizarFormularioReventa()
// Redibuja el formulario de reventa completo (select de productos + carrito).
// Se usa al cargar el modulo y despues de cada cambio de stock/carrito.
// ----------------------------------------------------------------------------
export function renderizarFormularioReventa() {
    renderizarSelectReventaProductos();
    renderizarListaReventa();
}

// ----------------------------------------------------------------------------
// renderizarListaReventa()
// Dibuja el carrito de la reventa en curso y actualiza el total.
// ----------------------------------------------------------------------------
function renderizarListaReventa() {
    const tbody = document.getElementById("tbody-reventa-cart");
    const totalEl = document.getElementById("total-reventa");
    if (!tbody) return;

    if (state.listaReventa.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">Carrito vacio.</td></tr>`;
        if (totalEl) totalEl.textContent = formatearMonto(0, monedaReventa());
        return;
    }

    const moneda = monedaReventa();
    let totalUsd = 0;
    tbody.innerHTML = state.listaReventa.map(item => {
        const subtotal = item.cantidad * item.precio;
        totalUsd += subtotal;
        return `
            <tr>
                <td>${escaparHtml(item.id)}</td>
                <td>${escaparHtml(item.name)}</td>
                <td>${item.cantidad}</td>
                <td>${escaparHtml(formatearMonto(convertirDesdeUsd(item.precio, moneda), moneda))}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="del-rev-cart" data-id="${escaparHtml(item.id)}">Quitar</button>
                </td>
            </tr>
        `;
    }).join("");

    // El total se muestra en la moneda elegida en el selector de pago.
    if (totalEl) totalEl.textContent = formatearMonto(convertirDesdeUsd(totalUsd, moneda), moneda);
}

// ----------------------------------------------------------------------------
// actualizarBloquePago()
// Muestra/oculta el bloque "posible fecha de pago" segun si el pago esta pendiente.
// ----------------------------------------------------------------------------
function actualizarBloquePago() {
    const pendiente = document.getElementById("rev-pendiente")?.checked;
    const bloque = document.getElementById("rev-pago-block");
    if (bloque) bloque.classList.toggle("hidden", !pendiente);
}

function ajustarMonedaPorTipoPago() {
    const tipoPago = document.getElementById("rev-tipo-pago")?.value;
    const selectMoneda = document.getElementById("rev-moneda");
    if (!selectMoneda) return;

    // Si paga en bolivares, la moneda pasa a VES. Si paga en divisa y estaba
    // en VES, la pasamos a USD por defecto (puede cambiarla despues).
    if (tipoPago === "bolivares" && selectMoneda.value !== "VES") {
        selectMoneda.value = "VES";
    } else if (tipoPago === "divisa" && selectMoneda.value === "VES") {
        selectMoneda.value = "USD";
    }
    renderizarFormularioReventa();
}

// ----------------------------------------------------------------------------
// inicializarReventas()
// Conecta todos los controles del modulo de reventas.
// ----------------------------------------------------------------------------
export function inicializarReventas() {
    // --- Agregar producto al carrito de la reventa ---
    document.getElementById("btn-agregar-reventa").addEventListener("click", () => {
        const id = document.getElementById("rev-producto").value;
        const cantidad = parseFloat(document.getElementById("rev-cantidad").value);

        const stock = state.stockRevendedora.find(s => s.product_id === id);
        if (!stock) {
            mostrarAlerta("Selecciona un producto del stock disponible.", "err");
            return;
        }

        const prod = state.inventario.find(p => p.id === id);
        const precioUsd = prod ? prod.precio : 0;

        const existente = state.listaReventa.find(i => i.id === id);
        const yaEnCarrito = existente ? existente.cantidad : 0;
        const disponible = stock.cantidad - yaEnCarrito;

        if (isNaN(cantidad) || cantidad <= 0 || cantidad > disponible) {
            mostrarAlerta(`Cantidad invalida. Disponible de ${stock.name}: ${disponible.toFixed(2)}.`, "err");
            return;
        }

        if (existente) {
            existente.cantidad = Number((existente.cantidad + cantidad).toFixed(2));
        } else {
            state.listaReventa.push({ id, name: stock.name, cantidad, precio: precioUsd });
        }

        document.getElementById("rev-cantidad").value = "";
        renderizarFormularioReventa();
    });

    // --- Quitar producto del carrito ---
    document.getElementById("tbody-reventa-cart").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action='del-rev-cart']");
        if (!btn) return;
        state.listaReventa = state.listaReventa.filter(i => i.id !== btn.dataset.id);
        renderizarFormularioReventa();
    });

    // --- Controles de pago ---
    document.getElementById("rev-pendiente").addEventListener("change", actualizarBloquePago);
    document.getElementById("rev-tipo-pago").addEventListener("change", ajustarMonedaPorTipoPago);
    document.getElementById("rev-moneda").addEventListener("change", renderizarFormularioReventa);

    // --- Registrar la reventa ---
    document.getElementById("btn-registrar-reventa").addEventListener("click", async () => {
        if (state.listaReventa.length === 0) {
            mostrarAlerta("Agrega al menos un producto al carrito de la reventa.", "err");
            return;
        }

        const cliente = document.getElementById("rev-cliente").value.trim().replace(/\|/g, " ");
        const cedula = document.getElementById("rev-cedula").value.trim().replace(/\|/g, " ");
        const tipoPago = document.getElementById("rev-tipo-pago").value;   // divisa | bolivares
        const moneda = document.getElementById("rev-moneda").value;       // USD, VES, EUR...
        const pendiente = document.getElementById("rev-pendiente").checked;
        const fechaPago = document.getElementById("rev-fecha-pago").value;
        const comoPagara = document.getElementById("rev-como-pagara").value;

        if (!cliente) {
            mostrarAlerta("Escribe el nombre de a quien le vendiste.", "err");
            return;
        }

        // Revalidamos stock fresco antes de registrar.
        await cargarStockRevendedora();
        const itemsConfirmados = [];
        for (const item of state.listaReventa) {
            const stock = state.stockRevendedora.find(s => s.product_id === item.id);
            if (!stock || stock.cantidad < item.cantidad) {
                mostrarAlerta(`Stock insuficiente de ${item.name} en la nube.`, "err");
                return;
            }
            itemsConfirmados.push({ ...item });
        }

        // Totales.
        const totalUsd = Number(itemsConfirmados.reduce((acc, i) => acc + i.cantidad * i.precio, 0).toFixed(2));
        const tasa = obtenerTasa(moneda);
        const monto = convertirDesdeUsd(totalUsd, moneda);      // Monto en la moneda elegida.
        const montoBs = convertirDesdeUsd(totalUsd, "VES");     // Equivalente en bolivares.

        const nuevaReventa = {
            id: obtenerSiguienteIdReventa(),
            fecha: obtenerFechaFormateada(),
            usuario: state.usuarioActual?.usuario || "master02",
            cliente,
            cedula,
            tipo_pago: tipoPago,
            moneda,
            monto,
            monto_bs: montoBs,
            tasa: tasa ?? 0,
            total_usd: totalUsd,
            pendiente,
            fecha_pago: pendiente ? fechaPago : "",
            como_pagara: pendiente ? comoPagara : "",
            detalle: itemsConfirmados.map(i => `${i.cantidad}x ${i.name}(${i.id}) @$${i.precio.toFixed(2)}`).join(", "),
            id_entrega: "",
        };

        // Guardar la reventa.
        const { error: errInsert } = await db.from("reventas").insert([nuevaReventa]);
        if (errInsert) {
            mostrarAlerta(`Error guardando la reventa: ${errInsert.message}`, "err");
            return;
        }

        // Descontar del stock de la revendedora.
        for (const item of itemsConfirmados) {
            await restarStock(item.id, item.cantidad);
        }

        // Generar el recibo PDF de la reventa.
        generarReciboReventaPDF(nuevaReventa, itemsConfirmados);

        // Limpiar y recargar.
        state.listaReventa = [];
        document.getElementById("rev-cliente").value = "";
        document.getElementById("rev-cedula").value = "";
        document.getElementById("rev-fecha-pago").value = "";
        document.getElementById("rev-pendiente").checked = false;
        actualizarBloquePago();

        await Promise.all([cargarReventas(), cargarStockRevendedora()]);
        renderizarTodo();
        renderizarFormularioReventa();
        mostrarAlerta(`Reventa ${nuevaReventa.id} registrada y stock descontado.`, "ok");
    });

    // --- Acciones del historial (PDF / Eliminar) ---
    document.getElementById("tbody-reventas").addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        if (btn.dataset.action === "pdf-rev") {
            const reventa = state.reventas.find(r => r.id === btn.dataset.id);
            if (reventa) generarReciboReventaPDF(reventa);
        } else if (btn.dataset.action === "del-rev") {
            await eliminarReventa(btn.dataset.id);
        }
    });

    // --- Filtros del historial de reventas ---
    document.getElementById("btn-filtrar-rev").addEventListener("click", aplicarFiltrosDesdeUI);
    document.getElementById("btn-limpiar-rev").addEventListener("click", limpiarFiltrosReventas);
}

// ----------------------------------------------------------------------------
// eliminarReventa(id)
// Borra una reventa y DEVUELVE las cantidades al stock de la revendedora.
//   - Admin: puede eliminar cualquiera.
//   - Revendedora: solo puede eliminar las SUYAS.
// ----------------------------------------------------------------------------
async function eliminarReventa(id) {
    const reventa = state.reventas.find(r => r.id === id);
    if (!reventa) return;

    // Permiso: admin o la propia revendedora.
    const puede = esAdmin() || reventa.usuario === state.usuarioActual?.usuario;
    if (!puede) {
        mostrarAlerta("No tienes permiso para eliminar esta reventa.", "err");
        return;
    }

    const { error } = await db.from("reventas").delete().eq("id", id);
    if (error) {
        mostrarAlerta(`Error eliminando reventa: ${error.message}`, "err");
        return;
    }

    // Devolvemos las cantidades al stock de la revendedora.
    const items = reventa.detalle.split(",").map(t => {
        const m = t.trim().match(/^([\d.]+)x\s+(.+)\((.+)\)/);
        return m ? { id: m[3], name: m[2], cantidad: parseFloat(m[1]) } : null;
    }).filter(Boolean);

    for (const item of items) {
        await sumarStock(item.id, item.name, item.cantidad);
    }

    await Promise.all([cargarReventas(), cargarStockRevendedora()]);
    renderizarTodo();
    renderizarFormularioReventa();
    mostrarAlerta(`Reventa ${id} eliminada y stock devuelto.`, "ok");
}

// ----------------------------------------------------------------------------
// aplicarFiltrosDesdeUI()
// Lee los filtros de la pantalla y los guarda en state para luego renderizar.
// ----------------------------------------------------------------------------
function aplicarFiltrosDesdeUI() {
    state.filtrosReventas = {
        usuario: document.getElementById("filtro-rev-usuario")?.value || "",
        desde: document.getElementById("filtro-rev-desde")?.value || "",
        hasta: document.getElementById("filtro-rev-hasta")?.value || "",
        cliente: document.getElementById("filtro-rev-cliente")?.value || "",
        montoMin: document.getElementById("filtro-rev-monto-min")?.value || "",
        montoMax: document.getElementById("filtro-rev-monto-max")?.value || "",
        moneda: "USD",
    };
    renderizarTodo();
}

// ----------------------------------------------------------------------------
// limpiarFiltrosReventas()
// Vacia todos los filtros y vuelve a mostrar todas las reventas.
// ----------------------------------------------------------------------------
function limpiarFiltrosReventas() {
    state.filtrosReventas = { usuario: "", desde: "", hasta: "", cliente: "", montoMin: "", montoMax: "", moneda: "USD" };
    const campos = ["filtro-rev-usuario", "filtro-rev-desde", "filtro-rev-hasta", "filtro-rev-cliente", "filtro-rev-monto-min", "filtro-rev-monto-max"];
    campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    renderizarTodo();
}

// ----------------------------------------------------------------------------
// cargarOpcionesUsuariosRevendedoras()
// Llena el filtro de "usuario" con las revendedoras que aparecen en reventas
// (por ahora solo master02, pero queda listo para mas revendedoras).
// ----------------------------------------------------------------------------
export function cargarOpcionesUsuariosRevendedoras() {
    const select = document.getElementById("filtro-rev-usuario");
    if (!select) return;

    // Sacamos los usuarios unicos de las reventas.
    const usuarios = [...new Set(state.reventas.map(r => r.usuario).filter(Boolean))].sort();
    const previo = select.value;

    select.innerHTML = `<option value="">Todas</option>` +
        usuarios.map(u => `<option value="${escaparHtml(u)}">${escaparHtml(u)}</option>`).join("");

    if (previo && usuarios.includes(previo)) select.value = previo;
}

// ----------------------------------------------------------------------------
// inicializarVisualReventas()
// Ajusta lo que ve cada rol al cargar el modulo (formulario para revendedora,
// filtros para admin).
// ----------------------------------------------------------------------------
export function aplicarVistaReventasPorRol() {
    const formWrap = document.getElementById("reventa-form-wrap");
    const filtrosWrap = document.getElementById("reventa-filtros-wrap");

    if (esAdmin()) {
        // Admin: ve filtros + todas las reventas. No necesita el formulario.
        if (formWrap) formWrap.classList.add("hidden");
        if (filtrosWrap) filtrosWrap.classList.remove("hidden");
        cargarOpcionesUsuariosRevendedoras();
    } else {
        // Revendedora: ve el formulario + sus propias reventas. Sin filtros.
        if (formWrap) formWrap.classList.remove("hidden");
        if (filtrosWrap) filtrosWrap.classList.add("hidden");
    }
}
