// ============================================================================
//  inventario.js - GESTION DEL INVENTARIO (solo admin)
// ============================================================================
//  Permite:
//    - Registrar un producto nuevo (id, nombre, cantidad, precio).
//    - Editar y eliminar productos existentes.
//    - Importar/exportar el inventario desde/hacia un archivo .txt.
//
//  IMPORTANTE: el PRECIO que se guarda aqui SIEMPRE es en DOLARES (USD).
//  Es la "base" sobre la cual se calculan Bs, Euro, Rupia y Yuan al mostrar.
//
//  Este modulo es SOLO del admin: la revendedora no ve estos botones.
//  Aun asi, cada funcion valida el rol por seguridad.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { mostrarAlerta, renderizarTodo, renderizarInventario } from "./ui.js";

// ----------------------------------------------------------------------------
// Devuelve true si el usuario actual es admin (y por lo tanto puede editar).
// ----------------------------------------------------------------------------
function esAdmin() {
    return state.usuarioActual && state.usuarioActual.rol !== "revendedora";
}

// ----------------------------------------------------------------------------
// cargarInventario()
// Trae el inventario desde Supabase y lo guarda en state.inventario.
// El campo `precio` llega en USD.
// ----------------------------------------------------------------------------
export async function cargarInventario() {
    const { data, error } = await db
        .from("inventario")
        .select("id, name, cantidad, precio")
        .order("id", { ascending: true });

    if (error) {
        mostrarAlerta(`Error cargando inventario: ${error.message}`, "err");
        return false;
    }

    state.inventario = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        cantidad: Number(p.cantidad),
        precio: Number(p.precio ?? 0),
    }));

    return true;
}

// ----------------------------------------------------------------------------
// activarModoEdicion(id)
// Rellena el formulario con los datos de un producto para poder editarlo.
// ----------------------------------------------------------------------------
function activarModoEdicion(id) {
    if (!esAdmin()) return;

    const prod = state.inventario.find(p => p.id === id);
    if (!prod) return;

    state.idEditando = prod.id;

    const inputId = document.getElementById("prod-id");
    inputId.value = prod.id;
    inputId.disabled = true; // No dejamos cambiar el ID al editar.

    document.getElementById("prod-nombre").value = prod.name;
    document.getElementById("prod-cantidad").value = prod.cantidad;
    document.getElementById("prod-precio").value = prod.precio;

    document.getElementById("titulo-form-producto").textContent = `Editando Producto (${prod.id})`;
    document.getElementById("btn-guardar-producto").textContent = "Actualizar Producto";
    document.getElementById("btn-cancelar-edicion").classList.remove("hidden");
    document.getElementById("card-producto").classList.add("edit-mode");

    document.getElementById("card-producto").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ----------------------------------------------------------------------------
// salirModoEdicion()
// Restaura el formulario al estado "registrar producto nuevo".
// ----------------------------------------------------------------------------
function salirModoEdicion() {
    state.idEditando = null;
    document.getElementById("form-producto").reset();
    document.getElementById("prod-id").disabled = false;
    document.getElementById("titulo-form-producto").textContent = "Registrar Producto";
    document.getElementById("btn-guardar-producto").textContent = "Guardar en la Nube";
    document.getElementById("btn-cancelar-edicion").classList.add("hidden");
    document.getElementById("card-producto").classList.remove("edit-mode");
}

// ----------------------------------------------------------------------------
// eliminarProductoInventario(id)
// Borra un producto del inventario en Supabase y refresca la pantalla.
// ----------------------------------------------------------------------------
async function eliminarProductoInventario(id) {
    if (!esAdmin()) return;

    const { error } = await db
        .from("inventario")
        .delete()
        .eq("id", id);

    if (error) {
        mostrarAlerta(`Error al eliminar: ${error.message}`, "err");
        return;
    }

    if (state.idEditando === id) salirModoEdicion();
    state.listaVenta = state.listaVenta.filter(item => item.id !== id);
    await cargarInventario();
    renderizarTodo();
    mostrarAlerta(`Producto ${id} eliminado de la nube.`, "ok");
}

// ----------------------------------------------------------------------------
// descargarTxt(nombre, contenido)
// Descarga un texto como archivo .txt en el navegador.
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
// inicializarInventario()
// Conecta todos los botones y formularios de la seccion de inventario.
// ----------------------------------------------------------------------------
export function inicializarInventario() {
    // --- Busqueda en vivo del inventario (por nombre o ID) ---
    // Al escribir, se filtra la tabla y se actualiza el resumen de totales.
    const inputBusqueda = document.getElementById("buscar-inventario");
    if (inputBusqueda) {
        inputBusqueda.addEventListener("input", () => {
            state.busquedaInventario = inputBusqueda.value;
            renderizarInventario();
        });
    }

    // --- Guardar producto nuevo o actualizar el que se esta editando ---
    document.getElementById("form-producto").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!esAdmin()) return;

        const id = document.getElementById("prod-id").value.trim().replace(/\s+/g, "");
        const name = document.getElementById("prod-nombre").value.trim().replace(/\s+/g, "_");
        const cantidad = parseFloat(document.getElementById("prod-cantidad").value);
        const precio = parseFloat(document.getElementById("prod-precio").value); // USD

        // Validamos que todos los campos sean correctos.
        if (!id || !name || isNaN(cantidad) || cantidad < 0 || isNaN(precio) || precio < 0) {
            mostrarAlerta("Completa todos los campos con valores validos.", "err");
            return;
        }

        // --- Caso A: estamos EDITANDO un producto ---
        if (state.idEditando) {
            const { error } = await db
                .from("inventario")
                .update({ name, cantidad, precio })
                .eq("id", state.idEditando);

            if (error) {
                mostrarAlerta(`Error actualizando producto: ${error.message}`, "err");
                return;
            }

            // Mantener el carrito coherente si el producto editado ya estaba.
            state.listaVenta = state.listaVenta
                .map(item => {
                    if (item.id !== state.idEditando) return item;
                    return { ...item, name, precio, cantidad: Math.min(item.cantidad, cantidad) };
                })
                .filter(item => item.cantidad > 0);

            const idEditado = state.idEditando;
            salirModoEdicion();
            await cargarInventario();
            renderizarTodo();
            mostrarAlerta(`Producto ${idEditado} actualizado correctamente.`, "ok");
            return;
        }

        // --- Caso B: producto NUEVO ---
        // No permitir IDs duplicados.
        if (state.inventario.some(p => p.id === id)) {
            mostrarAlerta(`Error: ya existe un producto con el ID ${id}.`, "err");
            return;
        }

        const { error } = await db
            .from("inventario")
            .insert([{ id, name, cantidad, precio }]);

        if (error) {
            mostrarAlerta(`No se pudo guardar: ${error.message}`, "err");
            return;
        }

        e.target.reset();
        await cargarInventario();
        renderizarTodo();
        mostrarAlerta(`Producto ${name} (${id}) guardado en la nube.`, "ok");
    });

    // --- Cancelar edicion ---
    document.getElementById("btn-cancelar-edicion").addEventListener("click", salirModoEdicion);

    // --- Clics en Editar / Eliminar de la tabla ---
    document.getElementById("tbody-inventario").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "edit-inv") {
            activarModoEdicion(btn.dataset.id);
        } else if (btn.dataset.action === "del-inv") {
            eliminarProductoInventario(btn.dataset.id);
        }
    });

    // --- Exportar .txt (formato: cantidad nombre id precio) ---
    document.getElementById("btn-exportar-inv").addEventListener("click", () => {
        if (!esAdmin()) return;
        const txt = state.inventario
            .map(p => `${p.cantidad.toFixed(2)} ${p.name} ${p.id} ${p.precio.toFixed(2)}`)
            .join("\n") + (state.inventario.length ? "\n" : "");
        descargarTxt("objetos_inventario.txt", txt);
    });

    // --- Importar .txt ---
    document.getElementById("btn-importar-inv").addEventListener("click", () => {
        if (!esAdmin()) return;
        document.getElementById("input-importar-inv").click();
    });

    document.getElementById("input-importar-inv").addEventListener("change", (e) => {
        if (!esAdmin()) return;
        const archivo = e.target.files[0];
        if (!archivo) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            // Parseamos cada linea: "cantidad nombre id [precio]".
            const filas = ev.target.result
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => {
                    const partes = l.split(/\s+/);
                    if (partes.length < 3) return null;
                    const precio = partes.length >= 4 && !isNaN(parseFloat(partes[3]))
                        ? parseFloat(partes[3])
                        : 0;
                    return {
                        cantidad: parseFloat(partes[0]),
                        name: partes[1],
                        id: partes[2],
                        precio,
                    };
                })
                .filter(p => p && !isNaN(p.cantidad));

            if (filas.length === 0) {
                mostrarAlerta("El archivo no contiene productos validos.", "err");
            } else {
                const { error } = await db.from("inventario").upsert(filas, { onConflict: "id" });
                if (error) {
                    mostrarAlerta(`Error subiendo inventario: ${error.message}`, "err");
                } else {
                    await cargarInventario();
                    renderizarTodo();
                    mostrarAlerta(`${filas.length} productos sincronizados a la nube.`, "ok");
                }
            }
            e.target.value = "";
        };
        reader.readAsText(archivo, "UTF-8");
    });
}
