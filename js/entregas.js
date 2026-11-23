// ============================================================================
//  entregas.js - VENTA / ENTREGA (modulo del admin)
// ============================================================================
//  Aqui el admin:
//    1) Arma una lista de productos (carrito).
//    2) Elige el TIPO de operacion:
//         - "entrega"      -> venta a un cliente final normal.
//         - "otra"         -> entrega a otra persona que TAMPOCO revende.
//         - "revendedora"  -> entrega a la revendedora (se suma a SU stock).
//    3) Procesa: descuenta del inventario, guarda el recibo y genera el PDF.
//       Si es "revendedora", ademas SUMA al stock de la revendedora.
//
//  Los montos se guardan en USD (base) y, ademas, se guarda la moneda y tasa
//  elegidas para que el recibo PDF muestre el precio convertido.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { cargarInventario } from "./inventario.js";
import { generarReciboPDF } from "./pdf.js";
import { sumarStock, restarStock } from "./stock.js";
import { convertirDesdeUsd, obtenerTasa } from "./tasas.js";
import { mostrarAlerta, renderizarListaVenta, renderizarSelectProductos, renderizarTodo, mostrarModal } from "./ui.js";

// ----------------------------------------------------------------------------
// cargarEntregas()
// Trae el historial de entregas desde Supabase.
// ----------------------------------------------------------------------------
export async function cargarEntregas() {
    const { data, error } = await db
        .from("entregas")
        .select("id, fecha, cliente, cedula, lugar_entrega, detalle, total, tipo, moneda, tasa, total_moneda, usuario")
        .order("creado_en", { ascending: false });

    if (error) {
        mostrarAlerta(`Error cargando entregas: ${error.message}`, "err");
        return false;
    }

    state.entregas = (data || []).map(e => ({
        ...e,
        total: Number(e.total ?? 0),
        total_moneda: Number(e.total_moneda ?? 0),
        tipo: e.tipo || "entrega",
        moneda: e.moneda || "USD",
    }));

    return true;
}

// ----------------------------------------------------------------------------
// Devuelve el siguiente id de entrega (ENT-001, ENT-002, ...).
// ----------------------------------------------------------------------------
function obtenerSiguienteIdEntrega(listaEntregas) {
    let maxNum = 0;
    listaEntregas.forEach(e => {
        const match = e.id.match(/^ENT-(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    return `ENT-${String(maxNum + 1).padStart(3, "0")}`;
}

// ----------------------------------------------------------------------------
// Devuelve la fecha y hora actual en formato "YYYY-MM-DD HH:mm".
// ----------------------------------------------------------------------------
function obtenerFechaFormateada() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ----------------------------------------------------------------------------
// descargarTxt(nombre, contenido)
// Descarga un texto como archivo .txt.
// ----------------------------------------------------------------------------
function descargarTxt(nombreArchivo, contenido) {
    const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------------
// parsearItemsDesdeDetalle(detalle)
// Convierte el texto "2x arroz(P#01) @$3.50, 1x aceite(P#02) @$2.00"
// en una lista de objetos [{ id, name, cantidad, precio }].
// Se usa para poder revertir el stock si se elimina una entrega.
// ----------------------------------------------------------------------------
function parsearItemsDesdeDetalle(detalle) {
    return String(detalle || "").split(",").map(bloque => {
        const texto = bloque.trim();
        const conPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)\s+@\$([\d.]+)$/);
        if (conPrecio) {
            return { id: conPrecio[3], name: conPrecio[2], cantidad: parseFloat(conPrecio[1]), precio: parseFloat(conPrecio[4]) };
        }
        const sinPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)$/);
        if (sinPrecio) {
            return { id: sinPrecio[3], name: sinPrecio[2], cantidad: parseFloat(sinPrecio[1]), precio: 0 };
        }
        return null;
    }).filter(Boolean);
}

// ----------------------------------------------------------------------------
// eliminarEntrega(idEntrega)
// Al borrar una entrega, PREGUNTA que paso con la mercancia:
//   * "Devolver al almacen" -> suma las cantidades de vuelta al inventario.
//   * "Error de registro"  -> solo borra el registro, sin tocar stock.
// La decision la toma el admin con un modal de confirmacion.
// ----------------------------------------------------------------------------
function eliminarEntrega(idEntrega) {
    const entrega = state.entregas.find(e => e.id === idEntrega);
    if (!entrega) return;

    mostrarModal({
        titulo: `Eliminar entrega ${idEntrega}`,
        texto: "¿Qué pasó con esta venta?\n\nElige qué hacer con las existencias.",
        botones: [
            {
                texto: "Devolver al almacén",
                clase: "btn-success",
                onClick: () => confirmarEliminarEntrega(idEntrega, true),
            },
            {
                texto: "Fue un error de registro",
                clase: "btn-secondary",
                onClick: () => confirmarEliminarEntrega(idEntrega, false),
            },
            {
                texto: "Cancelar",
                clase: "btn-outline",
                onClick: () => {},
            },
        ],
    });
}

// ----------------------------------------------------------------------------
// confirmarEliminarEntrega(idEntrega, devolver)
// Ejecuta el borrado real de la entrega.
//   - devolver=true  -> devuelve las existencias al inventario principal.
//   - devolver=false -> solo borra el registro (la mercancia ya salio).
// Si la entrega era de tipo "revendedora" y se devuelve, tambien se quita
// de su stock.
// ----------------------------------------------------------------------------
async function confirmarEliminarEntrega(idEntrega, devolver) {
    const entrega = state.entregas.find(e => e.id === idEntrega);
    if (!entrega) return;

    const items = parsearItemsDesdeDetalle(entrega.detalle);
    const tipo = entrega.tipo || "entrega";

    if (devolver) {
        // 1. Devolver las cantidades al inventario principal.
        for (const item of items) {
            await devolverAlInventario(item.id, item.cantidad);
        }
        // 2. Si era entrega a la revendedora, quitar de su stock.
        if (tipo === "revendedora") {
            for (const item of items) {
                await restarStock(item.id, item.cantidad);
            }
        }
    }
    // Si devolver=false, no tocamos ningun stock (solo se corrige el registro).

    // 3. Borrar el registro de la entrega.
    const { error } = await db
        .from("entregas")
        .delete()
        .eq("id", idEntrega);

    if (error) {
        mostrarAlerta(`Error al eliminar entrega: ${error.message}`, "err");
        return;
    }

    await Promise.all([cargarEntregas(), cargarInventario()]);
    renderizarTodo();

    if (devolver) {
        mostrarAlerta(`Entrega ${idEntrega} eliminada y existencias devueltas al almacén.`, "ok");
    } else {
        mostrarAlerta(`Entrega ${idEntrega} eliminada (solo se corrigió el registro).`, "ok");
    }
}

// ----------------------------------------------------------------------------
// devolverAlInventario(id, cantidad)
// Suma una cantidad de vuelta al inventario principal de un producto.
// ----------------------------------------------------------------------------
async function devolverAlInventario(id, cantidad) {
    const prod = state.inventario.find(p => p.id === id);
    const nueva = Number(((prod ? prod.cantidad : 0) + cantidad).toFixed(2));

    const { error } = await db
        .from("inventario")
        .update({ cantidad: nueva })
        .eq("id", id);

    if (error) {
        console.warn(`No se pudo devolver ${id} al inventario:`, error.message);
    }
}

// ----------------------------------------------------------------------------
// inicializarEntregas()
// Conecta todos los botones y formularios de la seccion de venta/entrega.
// ----------------------------------------------------------------------------
export function inicializarEntregas() {
    // --- Agregar producto a la lista de venta ---
    document.getElementById("form-lista").addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("lista-producto").value;
        const cantidadLlevar = parseFloat(document.getElementById("lista-cantidad").value);

        const prod = state.inventario.find(p => p.id === id);
        if (!prod) {
            mostrarAlerta("No hay productos registrados en el inventario.", "err");
            return;
        }

        const existente = state.listaVenta.find(item => item.id === id);
        const yaApartado = existente ? existente.cantidad : 0;
        const disponibleReal = prod.cantidad - yaApartado;

        if (isNaN(cantidadLlevar) || cantidadLlevar <= 0 || cantidadLlevar > disponibleReal) {
            mostrarAlerta(`Cantidad invalida. Disponible real de ${prod.name}: ${disponibleReal.toFixed(2)}.`, "err");
            return;
        }

        if (existente) {
            existente.cantidad = Number((existente.cantidad + cantidadLlevar).toFixed(2));
            existente.precio = prod.precio;
        } else {
            state.listaVenta.push({
                id: prod.id,
                name: prod.name,
                cantidad: cantidadLlevar,
                precio: prod.precio,
            });
        }

        document.getElementById("lista-cantidad").value = "";
        renderizarListaVenta();
        renderizarSelectProductos();
    });

    // --- Quitar producto de la lista temporal ---
    document.getElementById("tbody-lista").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action='del-lista']");
        if (!btn) return;
        const id = btn.dataset.id;
        state.listaVenta = state.listaVenta.filter(item => item.id !== id);
        renderizarListaVenta();
        renderizarSelectProductos();
        mostrarAlerta(`Producto ${id} quitado de la lista de venta.`, "ok");
    });

    // --- Procesar entrega ---
    document.getElementById("btn-procesar-entrega").addEventListener("click", async () => {
        if (state.listaVenta.length === 0) {
            mostrarAlerta("Agrega al menos un producto a la lista de venta.", "err");
            return;
        }

        const cliente = document.getElementById("cliente-nombre").value.trim().replace(/\|/g, " ");
        const cedula = document.getElementById("cliente-cedula").value.trim().replace(/\|/g, " ");
        const lugarEntrega = document.getElementById("cliente-lugar").value.trim().replace(/\|/g, " ");
        const tipo = document.getElementById("entrega-tipo").value; // entrega | otra | revendedora

        if (!cliente || !cedula || !lugarEntrega) {
            mostrarAlerta("Completa nombre del cliente, cedula y lugar de entrega para el recibo.", "err");
            return;
        }

        const btn = document.getElementById("btn-procesar-entrega");
        btn.disabled = true;
        btn.textContent = "Procesando entrega y actualizando inventario...";

        try {
            // 1. Traer datos frescos de la nube antes de descontar.
            await Promise.all([cargarInventario(), cargarEntregas()]);

            // Confirmamos stock para cada producto de la lista.
            const itemsConfirmados = [];
            for (const item of state.listaVenta) {
                const prodActual = state.inventario.find(p => p.id === item.id);
                if (!prodActual || prodActual.cantidad < item.cantidad) {
                    mostrarAlerta(`Stock insuficiente para ${item.name} en la nube.`, "err");
                    renderizarTodo();
                    return;
                }
                itemsConfirmados.push({
                    id: prodActual.id,
                    name: prodActual.name,
                    cantidad: item.cantidad,
                    precio: prodActual.precio,
                });
            }

            // 2. Descontar automaticamente del inventario principal.
            for (const item of itemsConfirmados) {
                const prod = state.inventario.find(p => p.id === item.id);
                const nuevaCantidad = Math.max(0, Number((prod.cantidad - item.cantidad).toFixed(2)));
                const { error: errUpd } = await db
                    .from("inventario")
                    .update({ cantidad: nuevaCantidad })
                    .eq("id", item.id);

                if (errUpd) {
                    mostrarAlerta(`Error descontando ${item.name}: ${errUpd.message}`, "err");
                    return;
                }
            }

            // 3. Si es entrega a la REVENDEDORA, sumamos a su stock.
            if (tipo === "revendedora") {
                for (const item of itemsConfirmados) {
                    await sumarStock(item.id, item.name, item.cantidad);
                }
            }

            // 4. Calculamos totales: en USD (base) y en la moneda activa.
            const totalUsd = Number(
                itemsConfirmados.reduce((acc, i) => acc + i.cantidad * i.precio, 0).toFixed(2)
            );
            const moneda = state.moneda;                  // Moneda elegida para el recibo.
            const tasa = obtenerTasa(moneda);             // Tasa usada.
            const totalMoneda = convertirDesdeUsd(totalUsd, moneda);

            const nuevaEntrega = {
                id: obtenerSiguienteIdEntrega(state.entregas),
                fecha: obtenerFechaFormateada(),
                cliente,
                cedula,
                lugar_entrega: lugarEntrega,
                detalle: itemsConfirmados.map(i => `${i.cantidad}x ${i.name}(${i.id}) @$${i.precio.toFixed(2)}`).join(", "),
                total: totalUsd,
                tipo,
                moneda,
                tasa: tasa ?? 0,
                total_moneda: totalMoneda,
                usuario: state.usuarioActual?.usuario || "admin",
            };

            // 5. Guardar la entrega en Supabase.
            const { error: errInsert } = await db
                .from("entregas")
                .insert([nuevaEntrega]);

            if (errInsert) {
                mostrarAlerta(`Error guardando entrega: ${errInsert.message}`, "err");
                return;
            }

            // 6. Generar el PDF con la moneda elegida.
            generarReciboPDF(nuevaEntrega, itemsConfirmados);

            // 7. Limpiar y recargar.
            state.listaVenta = [];
            document.getElementById("cliente-nombre").value = "";
            document.getElementById("cliente-cedula").value = "";
            document.getElementById("cliente-lugar").value = "";

            await Promise.all([cargarInventario(), cargarEntregas()]);
            renderizarTodo();
            mostrarAlerta(`Entrega ${nuevaEntrega.id} procesada (${tipo}), inventario actualizado y recibo PDF generado.`, "ok");
        } finally {
            btn.disabled = false;
            btn.textContent = "Procesar Entrega y Generar Recibo PDF";
        }
    });

    // --- Reimprimir PDF o eliminar entrega del historial ---
    document.getElementById("tbody-entregas").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "del-ent") {
            eliminarEntrega(btn.dataset.id);
        } else if (btn.dataset.action === "pdf-ent") {
            const entrega = state.entregas.find(item => item.id === btn.dataset.id);
            if (entrega) generarReciboPDF(entrega);
        }
    });

    // --- Exportar entregas.txt ---
    document.getElementById("btn-exportar-ent").addEventListener("click", () => {
        const txt = state.entregas
            .map(e => `${e.id}|${e.fecha}|${e.cliente}|${e.cedula || "N/A"}|${e.lugar_entrega || "No especificado"}|${Number(e.total || 0).toFixed(2)}|${e.tipo || "entrega"}|${e.detalle}`)
            .join("\n") + (state.entregas.length ? "\n" : "");
        descargarTxt("entregas.txt", txt);
    });

    // --- Importar entregas.txt ---
    document.getElementById("btn-importar-ent").addEventListener("click", () => {
        document.getElementById("input-importar-ent").click();
    });

    document.getElementById("input-importar-ent").addEventListener("change", (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const filas = ev.target.result
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => {
                    const p = l.split("|");
                    if (p.length >= 8) {
                        return {
                            id: p[0], fecha: p[1], cliente: p[2], cedula: p[3],
                            lugar_entrega: p[4], total: parseFloat(p[5]) || 0,
                            tipo: p[6] || "entrega", detalle: p[7],
                        };
                    }
                    if (p.length >= 7) {
                        return {
                            id: p[0], fecha: p[1], cliente: p[2], cedula: p[3],
                            lugar_entrega: p[4], total: parseFloat(p[5]) || 0,
                            tipo: "entrega", detalle: p[6],
                        };
                    }
                    if (p.length >= 4) {
                        return {
                            id: p[0], fecha: p[1], cliente: p[2], cedula: "N/A",
                            lugar_entrega: "No especificado", total: 0,
                            tipo: "entrega", detalle: p[3],
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            if (filas.length === 0) {
                mostrarAlerta("El archivo no contiene entregas validas.", "err");
            } else {
                const { error } = await db.from("entregas").upsert(filas, { onConflict: "id" });
                if (error) {
                    mostrarAlerta(`Error subiendo entregas: ${error.message}`, "err");
                } else {
                    await cargarEntregas();
                    renderizarTodo();
                    mostrarAlerta(`${filas.length} entregas sincronizadas a la nube.`, "ok");
                }
            }
            e.target.value = "";
        };
        reader.readAsText(archivo, "UTF-8");
    });
}
