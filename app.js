// ==========================================
// CONFIGURACION DE SUPABASE (PEGA TUS CLAVES)
// ==========================================
const SUPABASE_URL = "https://qpbiobyenospczawncbl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_If_rqLH0O3a17633ZIzZiA_09lW7feV";

let db = null;
let inventario = []; // [{ id, name, cantidad }]
let listaVenta = []; // [{ id, name, cantidad }]
let entregas = [];   // [{ id, fecha, cliente, detalle }]

// ==========================================
// INICIALIZACION DE CONEXION
// ==========================================
function iniciarSupabase() {
    const badge = document.getElementById("status-nube-login");
    const sinConfigurar =
        SUPABASE_URL.includes("TU-PROYECTO") ||
        SUPABASE_ANON_KEY.includes("TU-ANON-KEY");

    if (sinConfigurar || !window.supabase) {
        badge.textContent = "Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en app.js";
        return false;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    badge.textContent = "Conectado a Supabase";
    badge.classList.add("connected");
    return true;
}

// ==========================================
// LOGIN CONTRA TABLA 'usuarios' EN LA NUBE
// ==========================================
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = document.getElementById("login-usuario").value.trim();
    const clave = document.getElementById("login-clave").value.trim();
    const errorEl = document.getElementById("login-error");
    const btnEntrar = document.getElementById("btn-entrar");

    if (usuario.toLowerCase() === "salir") {
        mostrarPantalla("exit");
        return;
    }

    if (!db) {
        errorEl.textContent = "Configura primero tus credenciales de Supabase en app.js.";
        return;
    }

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Validando...";
    errorEl.textContent = "";

    const { data, error } = await db
        .from("usuarios")
        .select("usuario")
        .eq("usuario", usuario)
        .eq("clave", clave)
        .maybeSingle();

    btnEntrar.disabled = false;
    btnEntrar.textContent = "Iniciar sesion";

    if (error) {
        errorEl.textContent = `Error de conexion: ${error.message}`;
        return;
    }

    if (data) {
        document.getElementById("login-form").reset();
        mostrarPantalla("app");
        await cargarDatosNube();
    } else {
        errorEl.textContent = "Usuario o clave incorrectos.";
    }
});

document.getElementById("btn-salir-login").addEventListener("click", () => mostrarPantalla("exit"));
document.getElementById("btn-cerrar-sesion").addEventListener("click", () => mostrarPantalla("exit"));
document.getElementById("btn-volver-login").addEventListener("click", () => mostrarPantalla("login"));
document.getElementById("btn-sincronizar").addEventListener("click", async () => {
    await cargarDatosNube();
    mostrarAlerta("Datos actualizados desde la nube.", "ok");
});

function mostrarPantalla(pantalla) {
    document.getElementById("login-screen").classList.toggle("hidden", pantalla !== "login");
    document.getElementById("app-screen").classList.toggle("hidden", pantalla !== "app");
    document.getElementById("exit-screen").classList.toggle("hidden", pantalla !== "exit");
}

// ==========================================
// CARGAR INVENTARIO Y ENTREGAS DESDE LA NUBE
// ==========================================
async function cargarDatosNube() {
    const [resInv, resEnt] = await Promise.all([
        db.from("inventario").select("id, name, cantidad").order("id", { ascending: true }),
        db.from("entregas").select("id, fecha, cliente, detalle").order("creado_en", { ascending: false })
    ]);

    if (resInv.error) {
        mostrarAlerta(`Error cargando inventario: ${resInv.error.message}`, "err");
    } else {
        inventario = (resInv.data || []).map(p => ({
            id: p.id,
            name: p.name,
            cantidad: Number(p.cantidad)
        }));
    }

    if (resEnt.error) {
        mostrarAlerta(`Error cargando entregas: ${resEnt.error.message}`, "err");
    } else {
        entregas = resEnt.data || [];
    }

    renderizarTodo();
}

// ==========================================
// INVENTARIO: REGISTRAR Y ELIMINAR EN NUBE
// ==========================================
document.getElementById("form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("prod-id").value.trim().replace(/\s+/g, "");
    const name = document.getElementById("prod-nombre").value.trim().replace(/\s+/g, "_");
    const cantidad = parseFloat(document.getElementById("prod-cantidad").value);

    if (!id || !name || isNaN(cantidad) || cantidad < 0) {
        mostrarAlerta("Completa todos los campos correctamente.", "err");
        return;
    }

    if (inventario.some(p => p.id === id)) {
        mostrarAlerta(`Error: ya existe un producto con el ID ${id}.`, "err");
        return;
    }

    const { error } = await db
        .from("inventario")
        .insert([{ id, name, cantidad }]);

    if (error) {
        mostrarAlerta(`No se pudo guardar: ${error.message}`, "err");
        return;
    }

    e.target.reset();
    await cargarDatosNube();
    mostrarAlerta(`Producto ${name} (${id}) guardado en la nube.`, "ok");
});

async function eliminarProductoInventario(id) {
    const { error } = await db
        .from("inventario")
        .delete()
        .eq("id", id);

    if (error) {
        mostrarAlerta(`Error al eliminar: ${error.message}`, "err");
        return;
    }

    listaVenta = listaVenta.filter(item => item.id !== id);
    await cargarDatosNube();
    mostrarAlerta(`Producto ${id} eliminado de la nube.`, "ok");
}

// ==========================================
// LISTA DE VENTA (CARRITO TEMPORAL)
// ==========================================
document.getElementById("form-lista").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("lista-producto").value;
    const cantidadLlevar = parseInt(document.getElementById("lista-cantidad").value, 10);

    const prod = inventario.find(p => p.id === id);
    if (!prod) {
        mostrarAlerta("No hay productos registrados en el inventario.", "err");
        return;
    }

    const existente = listaVenta.find(item => item.id === id);
    const yaApartado = existente ? existente.cantidad : 0;
    const disponibleReal = prod.cantidad - yaApartado;

    if (isNaN(cantidadLlevar) || cantidadLlevar <= 0 || cantidadLlevar > disponibleReal) {
        mostrarAlerta(`Cantidad invalida. Disponible real de ${prod.name}: ${disponibleReal.toFixed(2)}.`, "err");
        return;
    }

    if (existente) {
        existente.cantidad += cantidadLlevar;
    } else {
        listaVenta.push({ id: prod.id, name: prod.name, cantidad: cantidadLlevar });
    }

    document.getElementById("lista-cantidad").value = "";
    renderizarListaVenta();
    renderizarSelectProductos();
});

function eliminarProductoLista(id) {
    listaVenta = listaVenta.filter(item => item.id !== id);
    renderizarListaVenta();
    renderizarSelectProductos();
    mostrarAlerta(`Producto ${id} quitado de la lista de venta.`, "ok");
}

// ==========================================
// PROCESAR ENTREGA EN LA NUBE + RECIBO PDF
// ==========================================
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

document.getElementById("btn-procesar-entrega").addEventListener("click", async () => {
    if (listaVenta.length === 0) {
        mostrarAlerta("Agrega al menos un producto a la lista de venta.", "err");
        return;
    }

    const btn = document.getElementById("btn-procesar-entrega");
    btn.disabled = true;
    btn.textContent = "Guardando entrega en la nube...";

    try {
        // Sincronizar primero para evitar conflictos de stock o ID entre dispositivos
        await cargarDatosNube();

        for (const item of listaVenta) {
            const prodActual = inventario.find(p => p.id === item.id);
            if (!prodActual || prodActual.cantidad < item.cantidad) {
                mostrarAlerta(`Stock insuficiente para ${item.name} en la nube.`, "err");
                return;
            }
        }

        const clienteInput = document.getElementById("cliente-nombre").value.trim().replace(/\|/g, " ");
        const cliente = clienteInput || "Consumidor Final";

        const nuevaEntrega = {
            id: obtenerSiguienteIdEntrega(entregas),
            fecha: obtenerFechaFormateada(),
            cliente: cliente,
            detalle: listaVenta.map(i => `${i.cantidad}x ${i.name}(${i.id})`).join(", ")
        };

        // 1. Insertar entrega en Supabase
        const { error: errInsert } = await db
            .from("entregas")
            .insert([nuevaEntrega]);

        if (errInsert) {
            mostrarAlerta(`Error guardando entrega: ${errInsert.message}`, "err");
            return;
        }

        // 2. Actualizar stock en Supabase
        for (const item of listaVenta) {
            const prod = inventario.find(p => p.id === item.id);
            const nuevaCantidad = Math.max(0, prod.cantidad - item.cantidad);
            const { error: errUpd } = await db
                .from("inventario")
                .update({ cantidad: nuevaCantidad })
                .eq("id", item.id);

            if (errUpd) {
                mostrarAlerta(`Error actualizando stock de ${item.name}: ${errUpd.message}`, "err");
            }
        }

        const itemsParaPdf = [...listaVenta];

        // 3. Generar PDF y recargar datos desde la nube
        generarReciboPDF(nuevaEntrega, itemsParaPdf);

        listaVenta = [];
        document.getElementById("cliente-nombre").value = "";
        await cargarDatosNube();
        mostrarAlerta(`Entrega ${nuevaEntrega.id} guardada en la nube y recibo PDF generado.`, "ok");
    } finally {
        btn.disabled = false;
        btn.textContent = "Procesar Entrega y Generar Recibo PDF";
    }
});

async function eliminarEntrega(idEntrega) {
    const { error } = await db
        .from("entregas")
        .delete()
        .eq("id", idEntrega);

    if (error) {
        mostrarAlerta(`Error al eliminar entrega: ${error.message}`, "err");
        return;
    }

    await cargarDatosNube();
    mostrarAlerta(`Entrega ${idEntrega} eliminada de la nube.`, "ok");
}

// ==========================================
// IMPORTAR / EXPORTAR .TXT (COMPATIBLE CON C)
// ==========================================
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

document.getElementById("btn-exportar-inv").addEventListener("click", () => {
    const txt = inventario.map(p => `${p.cantidad.toFixed(2)} ${p.name} ${p.id}`).join("\n") + (inventario.length ? "\n" : "");
    descargarTxt("objetos_inventario.txt", txt);
});

document.getElementById("btn-exportar-ent").addEventListener("click", () => {
    const txt = entregas.map(e => `${e.id}|${e.fecha}|${e.cliente}|${e.detalle}`).join("\n") + (entregas.length ? "\n" : "");
    descargarTxt("entregas.txt", txt);
});

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
                return { cantidad: parseFloat(partes[0]), name: partes[1], id: partes[2] };
            })
            .filter(p => p && !isNaN(p.cantidad));

        if (filas.length === 0) {
            mostrarAlerta("El archivo no contiene productos validos.", "err");
        } else {
            const { error } = await db.from("inventario").upsert(filas, { onConflict: "id" });
            if (error) {
                mostrarAlerta(`Error subiendo inventario: ${error.message}`, "err");
            } else {
                await cargarDatosNube();
                mostrarAlerta(`${filas.length} productos sincronizados a la nube.`, "ok");
            }
        }
        e.target.value = "";
    };
    reader.readAsText(archivo, "UTF-8");
});

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
                if (p.length < 4) return null;
                return { id: p[0], fecha: p[1], cliente: p[2], detalle: p[3] };
            })
            .filter(Boolean);

        if (filas.length === 0) {
            mostrarAlerta("El archivo no contiene entregas validas.", "err");
        } else {
            const { error } = await db.from("entregas").upsert(filas, { onConflict: "id" });
            if (error) {
                mostrarAlerta(`Error subiendo entregas: ${error.message}`, "err");
            } else {
                await cargarDatosNube();
                mostrarAlerta(`${filas.length} entregas sincronizadas a la nube.`, "ok");
            }
        }
        e.target.value = "";
    };
    reader.readAsText(archivo, "UTF-8");
});

// ==========================================
// RECIBO PDF
// ==========================================
function generarReciboPDF(entrega, itemsArray = null) {
    const items = itemsArray || entrega.detalle.split(",").map(bloque => {
        const match = bloque.trim().match(/^(\d+)x\s+(.+)\((.+)\)$/);
        if (match) {
            return { cantidad: parseInt(match[1], 10), name: match[2], id: match[3] };
        }
        return { cantidad: "-", name: bloque.trim(), id: "-" };
    });

    if (window.jspdf && window.jspdf.jsPDF) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 32, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text("RECIBO DE ENTREGA", 14, 15);
        doc.setFontSize(10);
        doc.text("Sistema de Inventario y Control de Entregas", 14, 23);

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(11);
        doc.text(`Nro. de Entrega: ${entrega.id}`, 14, 44);
        doc.text(`Fecha y Hora: ${entrega.fecha}`, 14, 51);
        doc.text(`Cliente: ${entrega.cliente}`, 14, 58);

        let y = 72;
        doc.setFillColor(226, 232, 240);
        doc.rect(14, y - 6, 182, 9, "F");
        doc.setFont(undefined, "bold");
        doc.text("ID", 18, y);
        doc.text("Producto", 55, y);
        doc.text("Cantidad Entregada", 145, y);

        doc.setFont(undefined, "normal");
        y += 10;
        let totalUnidades = 0;

        items.forEach(item => {
            doc.text(String(item.id), 18, y);
            doc.text(String(item.name), 55, y);
            doc.text(String(item.cantidad), 160, y);
            if (!isNaN(item.cantidad)) totalUnidades += Number(item.cantidad);
            doc.setDrawColor(226, 232, 240);
            doc.line(14, y + 3, 196, y + 3);
            y += 10;
        });

        y += 6;
        doc.setFont(undefined, "bold");
        doc.text(`Total de articulos entregados: ${totalUnidades}`, 14, y);

        y += 28;
        doc.setFont(undefined, "normal");
        doc.setDrawColor(100, 116, 139);
        doc.line(14, y, 85, y);
        doc.line(120, y, 191, y);
        doc.setFontSize(9);
        doc.text("Firma de quien entrega", 30, y + 6);
        doc.text("Firma de quien recibe", 137, y + 6);

        doc.save(`Recibo_${entrega.id}.pdf`);
    } else {
        const ventana = window.open("", "_blank", "width=700,height=600");
        const filas = items.map(i => `<tr><td>${escaparHtml(i.id)}</td><td>${escaparHtml(i.name)}</td><td>${escaparHtml(i.cantidad)}</td></tr>`).join("");
        ventana.document.write(`
            <html><head><title>Recibo ${escaparHtml(entrega.id)}</title>
            <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}</style>
            </head><body>
            <h2>RECIBO DE ENTREGA - ${escaparHtml(entrega.id)}</h2>
            <p><strong>Fecha:</strong> ${escaparHtml(entrega.fecha)}</p>
            <p><strong>Cliente:</strong> ${escaparHtml(entrega.cliente)}</p>
            <table><thead><tr><th>ID</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>${filas}</tbody></table>
            <script>window.print();<\/script></body></html>
        `);
        ventana.document.close();
    }
}

// ==========================================
// RENDERIZADO Y EVENTOS DE TABLAS
// ==========================================
function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderizarTodo() {
    renderizarInventario();
    renderizarSelectProductos();
    renderizarListaVenta();
    renderizarEntregas();
}

function renderizarInventario() {
    const tbody = document.getElementById("tbody-inventario");
    if (inventario.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">El inventario esta vacio.</td></tr>`;
        return;
    }
    tbody.innerHTML = inventario.map(p => `
        <tr>
            <td><strong>${escaparHtml(p.id)}</strong></td>
            <td>${escaparHtml(p.name)}</td>
            <td>${p.cantidad.toFixed(2)}</td>
            <td>
                <button class="btn btn-danger btn-sm" data-action="del-inv" data-id="${escaparHtml(p.id)}">Eliminar</button>
            </td>
        </tr>
    `).join("");
}

function renderizarSelectProductos() {
    const select = document.getElementById("lista-producto");
    if (inventario.length === 0) {
        select.innerHTML = `<option value="">Sin productos disponibles</option>`;
        return;
    }
    select.innerHTML = inventario.map(p => {
        const enLista = listaVenta.find(i => i.id === p.id);
        const disp = p.cantidad - (enLista ? enLista.cantidad : 0);
        return `<option value="${escaparHtml(p.id)}">${escaparHtml(p.id)} - ${escaparHtml(p.name)} (Disp: ${disp.toFixed(2)})</option>`;
    }).join("");
}

function renderizarListaVenta() {
    const tbody = document.getElementById("tbody-lista");
    if (listaVenta.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Lista vacia.</td></tr>`;
        return;
    }
    tbody.innerHTML = listaVenta.map(item => `
        <tr>
            <td>${escaparHtml(item.id)}</td>
            <td>${escaparHtml(item.name)}</td>
            <td>${item.cantidad}</td>
            <td>
                <button class="btn btn-danger btn-sm" data-action="del-lista" data-id="${escaparHtml(item.id)}">Quitar</button>
            </td>
        </tr>
    `).join("");
}

function renderizarEntregas() {
    const tbody = document.getElementById("tbody-entregas");
    if (entregas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregas registradas.</td></tr>`;
        return;
    }
    tbody.innerHTML = entregas.map(e => `
        <tr>
            <td><strong>${escaparHtml(e.id)}</strong></td>
            <td>${escaparHtml(e.fecha)}</td>
            <td>${escaparHtml(e.cliente)}</td>
            <td>${escaparHtml(e.detalle)}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-primary btn-sm" data-action="pdf-ent" data-id="${escaparHtml(e.id)}">PDF</button>
                <button class="btn btn-danger btn-sm" data-action="del-ent" data-id="${escaparHtml(e.id)}">Eliminar</button>
            </td>
        </tr>
    `).join("");
}

// Delegacion de clics en las tablas (evita errores con caracteres especiales en los IDs)
document.getElementById("tbody-inventario").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='del-inv']");
    if (btn) eliminarProductoInventario(btn.dataset.id);
});

document.getElementById("tbody-lista").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='del-lista']");
    if (btn) eliminarProductoLista(btn.dataset.id);
});

document.getElementById("tbody-entregas").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "del-ent") {
        eliminarEntrega(btn.dataset.id);
    } else if (btn.dataset.action === "pdf-ent") {
        const entrega = entregas.find(item => item.id === btn.dataset.id);
        if (entrega) generarReciboPDF(entrega);
    }
});

function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById("alerta-global");
    alerta.textContent = mensaje;
    alerta.className = `alerta ${tipo}`;
    clearTimeout(alerta._timer);
    alerta._timer = setTimeout(() => alerta.classList.add("hidden"), 3500);
}

// Arrancar conexion al cargar la pagina
iniciarSupabase();