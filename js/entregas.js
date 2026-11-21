import { db } from "./config.js";
import { state } from "./state.js";
import { cargarInventario } from "./inventario.js";
import { generarReciboPDF } from "./pdf.js";
import { mostrarAlerta, renderizarListaVenta, renderizarSelectProductos, renderizarTodo } from "./ui.js";

export async function cargarEntregas() {
    const { data, error } = await db
        .from("entregas")
        .select("id, fecha, cliente, cedula, lugar_entrega, detalle, total")
        .order("creado_en", { ascending: false });

    if (error) {
        mostrarAlerta(`Error cargando entregas: ${error.message}`, "err");
        return false;
    }

    state.entregas = (data || []).map(e => ({
        ...e,
        total: Number(e.total ?? 0)
    }));

    return true;
}

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

function obtenerFechaFormateada() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

async function eliminarEntrega(idEntrega) {
    const { error } = await db
        .from("entregas")
        .delete()
        .eq("id", idEntrega);

    if (error) {
        mostrarAlerta(`Error al eliminar entrega: ${error.message}`, "err");
        return;
    }

    await cargarEntregas();
    renderizarTodo();
    mostrarAlerta(`Entrega ${idEntrega} eliminada de la nube.`, "ok");
}

export function inicializarEntregas() {
    // Agregar producto a la lista de venta
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
                precio: prod.precio
            });
        }

        document.getElementById("lista-cantidad").value = "";
        renderizarListaVenta();
        renderizarSelectProductos();
    });

    // Quitar producto de la lista temporal
    document.getElementById("tbody-lista").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action='del-lista']");
        if (!btn) return;
        const id = btn.dataset.id;
        state.listaVenta = state.listaVenta.filter(item => item.id !== id);
        renderizarListaVenta();
        renderizarSelectProductos();
        mostrarAlerta(`Producto ${id} quitado de la lista de venta.`, "ok");
    });

    // Procesar entrega: resta stock en Supabase, guarda recibo, genera PDF y actualiza tabla inventario
    document.getElementById("btn-procesar-entrega").addEventListener("click", async () => {
        if (state.listaVenta.length === 0) {
            mostrarAlerta("Agrega al menos un producto a la lista de venta.", "err");
            return;
        }

        const cliente = document.getElementById("cliente-nombre").value.trim().replace(/\|/g, " ");
        const cedula = document.getElementById("cliente-cedula").value.trim().replace(/\|/g, " ");
        const lugarEntrega = document.getElementById("cliente-lugar").value.trim().replace(/\|/g, " ");

        if (!cliente || !cedula || !lugarEntrega) {
            mostrarAlerta("Completa nombre del cliente, cedula y lugar de entrega para el recibo.", "err");
            return;
        }

        const btn = document.getElementById("btn-procesar-entrega");
        btn.disabled = true;
        btn.textContent = "Procesando entrega y actualizando inventario...";

        try {
            // 1. Traer datos frescos de la nube antes de descontar
            await Promise.all([cargarInventario(), cargarEntregas()]);

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
                    precio: prodActual.precio
                });
            }

            // 2. Descontar automaticamente del inventario en Supabase
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

            const totalGeneral = Number(
                itemsConfirmados.reduce((acc, i) => acc + i.cantidad * i.precio, 0).toFixed(2)
            );

            const nuevaEntrega = {
                id: obtenerSiguienteIdEntrega(state.entregas),
                fecha: obtenerFechaFormateada(),
                cliente,
                cedula,
                lugar_entrega: lugarEntrega,
                detalle: itemsConfirmados.map(i => `${i.cantidad}x ${i.name}(${i.id}) @$${i.precio.toFixed(2)}`).join(", "),
                total: totalGeneral
            };

            // 3. Guardar entrega en Supabase
            const { error: errInsert } = await db
                .from("entregas")
                .insert([nuevaEntrega]);

            if (errInsert) {
                mostrarAlerta(`Error guardando entrega: ${errInsert.message}`, "err");
                return;
            }

            // 4. Generar PDF
            generarReciboPDF(nuevaEntrega, itemsConfirmados);

            // 5. Limpiar lista y recargar inventario + entregas actualizados
            state.listaVenta = [];
            document.getElementById("cliente-nombre").value = "";
            document.getElementById("cliente-cedula").value = "";
            document.getElementById("cliente-lugar").value = "";

            await Promise.all([cargarInventario(), cargarEntregas()]);
            renderizarTodo();
            mostrarAlerta(`Entrega ${nuevaEntrega.id} procesada, inventario descontado y recibo PDF generado.`, "ok");
        } finally {
            btn.disabled = false;
            btn.textContent = "Procesar Entrega y Generar Recibo PDF";
        }
    });

    // Reimprimir PDF o eliminar entrega del historial
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

    // Exportar entregas.txt
    document.getElementById("btn-exportar-ent").addEventListener("click", () => {
        const txt = state.entregas
            .map(e => `${e.id}|${e.fecha}|${e.cliente}|${e.cedula || "N/A"}|${e.lugar_entrega || "No especificado"}|${Number(e.total || 0).toFixed(2)}|${e.detalle}`)
            .join("\n") + (state.entregas.length ? "\n" : "");
        descargarTxt("entregas.txt", txt);
    });

    // Importar entregas.txt (compatible con formato de 4 o 7 columnas)
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
                    if (p.length >= 7) {
                        return {
                            id: p[0],
                            fecha: p[1],
                            cliente: p[2],
                            cedula: p[3],
                            lugar_entrega: p[4],
                            total: parseFloat(p[5]) || 0,
                            detalle: p[6]
                        };
                    }
                    if (p.length >= 4) {
                        return {
                            id: p[0],
                            fecha: p[1],
                            cliente: p[2],
                            cedula: "N/A",
                            lugar_entrega: "No especificado",
                            total: 0,
                            detalle: p[3]
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