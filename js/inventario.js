import { db } from "./config.js";
import { state } from "./state.js";
import { mostrarAlerta, renderizarTodo } from "./ui.js";

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
        precio: Number(p.precio ?? 0)
    }));

    return true;
}

function activarModoEdicion(id) {
    const prod = state.inventario.find(p => p.id === id);
    if (!prod) return;

    state.idEditando = prod.id;

    const inputId = document.getElementById("prod-id");
    inputId.value = prod.id;
    inputId.disabled = true;

    document.getElementById("prod-nombre").value = prod.name;
    document.getElementById("prod-cantidad").value = prod.cantidad;
    document.getElementById("prod-precio").value = prod.precio;

    document.getElementById("titulo-form-producto").textContent = `Editando Producto (${prod.id})`;
    document.getElementById("btn-guardar-producto").textContent = "Actualizar Producto";
    document.getElementById("btn-cancelar-edicion").classList.remove("hidden");
    document.getElementById("card-producto").classList.add("edit-mode");

    document.getElementById("card-producto").scrollIntoView({ behavior: "smooth", block: "center" });
}

function salirModoEdicion() {
    state.idEditando = null;
    document.getElementById("form-producto").reset();
    document.getElementById("prod-id").disabled = false;
    document.getElementById("titulo-form-producto").textContent = "Registrar Producto";
    document.getElementById("btn-guardar-producto").textContent = "Guardar en la Nube";
    document.getElementById("btn-cancelar-edicion").classList.add("hidden");
    document.getElementById("card-producto").classList.remove("edit-mode");
}

async function eliminarProductoInventario(id) {
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

export function inicializarInventario() {
    // Guardar nuevo producto o actualizar producto en edicion
    document.getElementById("form-producto").addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("prod-id").value.trim().replace(/\s+/g, "");
        const name = document.getElementById("prod-nombre").value.trim().replace(/\s+/g, "_");
        const cantidad = parseFloat(document.getElementById("prod-cantidad").value);
        const precio = parseFloat(document.getElementById("prod-precio").value);

        if (!id || !name || isNaN(cantidad) || cantidad < 0 || isNaN(precio) || precio < 0) {
            mostrarAlerta("Completa todos los campos con valores validos.", "err");
            return;
        }

        if (state.idEditando) {
            const { error } = await db
                .from("inventario")
                .update({ name, cantidad, precio })
                .eq("id", state.idEditando);

            if (error) {
                mostrarAlerta(`Error actualizando producto: ${error.message}`, "err");
                return;
            }

            // Mantener sincronizado el carrito si el producto editado ya estaba agregado
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

    document.getElementById("btn-cancelar-edicion").addEventListener("click", salirModoEdicion);

    // Clics en Editar / Eliminar de la tabla
    document.getElementById("tbody-inventario").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "edit-inv") {
            activarModoEdicion(btn.dataset.id);
        } else if (btn.dataset.action === "del-inv") {
            eliminarProductoInventario(btn.dataset.id);
        }
    });

    // Exportar .txt (formato compatible: cantidad nombre id precio)
    document.getElementById("btn-exportar-inv").addEventListener("click", () => {
        const txt = state.inventario
            .map(p => `${p.cantidad.toFixed(2)} ${p.name} ${p.id} ${p.precio.toFixed(2)}`)
            .join("\n") + (state.inventario.length ? "\n" : "");
        descargarTxt("objetos_inventario.txt", txt);
    });

    // Importar .txt (acepta tanto 3 columnas antiguas como 4 con precio)
    document.getElementById("btn-importar-inv").addEventListener("click", () => {
        document.getElementById("input-importar-inv").click();
    });

    document.getElementById("input-importar-inv").addEventListener("change", (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
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
                        precio
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