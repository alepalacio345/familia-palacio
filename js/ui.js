import { state } from "./state.js";

export function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatearMoneda(monto) {
    return `$${Number(monto || 0).toFixed(2)}`;
}

export function mostrarPantalla(pantalla) {
    document.getElementById("login-screen").classList.toggle("hidden", pantalla !== "login");
    document.getElementById("app-screen").classList.toggle("hidden", pantalla !== "app");
    document.getElementById("exit-screen").classList.toggle("hidden", pantalla !== "exit");
}

export function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById("alerta-global");
    alerta.textContent = mensaje;
    alerta.className = `alerta ${tipo}`;
    clearTimeout(alerta._timer);
    alerta._timer = setTimeout(() => alerta.classList.add("hidden"), 3800);
}

export function renderizarTodo() {
    renderizarInventario();
    renderizarSelectProductos();
    renderizarListaVenta();
    renderizarEntregas();
}

export function renderizarInventario() {
    const tbody = document.getElementById("tbody-inventario");
    if (state.inventario.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">El inventario esta vacio.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.inventario.map(p => `
        <tr>
            <td><strong>${escaparHtml(p.id)}</strong></td>
            <td>${escaparHtml(p.name)}</td>
            <td>${p.cantidad.toFixed(2)}</td>
            <td>${formatearMoneda(p.precio)}</td>
            <td>
                <div class="acciones-celda">
                    <button class="btn btn-warning btn-sm" data-action="edit-inv" data-id="${escaparHtml(p.id)}">Editar</button>
                    <button class="btn btn-danger btn-sm" data-action="del-inv" data-id="${escaparHtml(p.id)}">Eliminar</button>
                </div>
            </td>
        </tr>
    `).join("");
}

export function renderizarSelectProductos() {
    const select = document.getElementById("lista-producto");
    if (state.inventario.length === 0) {
        select.innerHTML = `<option value="">Sin productos disponibles</option>`;
        return;
    }

    const valorPrevio = select.value;
    select.innerHTML = state.inventario.map(p => {
        const enLista = state.listaVenta.find(i => i.id === p.id);
        const disp = p.cantidad - (enLista ? enLista.cantidad : 0);
        return `<option value="${escaparHtml(p.id)}">${escaparHtml(p.id)} - ${escaparHtml(p.name)} (${formatearMoneda(p.precio)} | Disp: ${disp.toFixed(2)})</option>`;
    }).join("");

    if (valorPrevio && state.inventario.some(p => p.id === valorPrevio)) {
        select.value = valorPrevio;
    }
}

export function renderizarListaVenta() {
    const tbody = document.getElementById("tbody-lista");
    const totalEl = document.getElementById("total-lista");

    if (state.listaVenta.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">Lista vacia.</td></tr>`;
        totalEl.textContent = "$0.00";
        return;
    }

    let totalGeneral = 0;
    tbody.innerHTML = state.listaVenta.map(item => {
        const subtotal = item.cantidad * item.precio;
        totalGeneral += subtotal;
        return `
            <tr>
                <td>${escaparHtml(item.id)}</td>
                <td>${escaparHtml(item.name)}</td>
                <td>${item.cantidad}</td>
                <td>${formatearMoneda(item.precio)}</td>
                <td><strong>${formatearMoneda(subtotal)}</strong></td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="del-lista" data-id="${escaparHtml(item.id)}">Quitar</button>
                </td>
            </tr>
        `;
    }).join("");

    totalEl.textContent = formatearMoneda(totalGeneral);
}

export function renderizarEntregas() {
    const tbody = document.getElementById("tbody-entregas");
    if (state.entregas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No hay entregas registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.entregas.map(e => `
        <tr>
            <td><strong>${escaparHtml(e.id)}</strong></td>
            <td>${escaparHtml(e.fecha)}</td>
            <td>
                ${escaparHtml(e.cliente)}
                <span class="sub-dato">C.I.: ${escaparHtml(e.cedula || "N/A")}</span>
            </td>
            <td>${escaparHtml(e.lugar_entrega || "No especificado")}</td>
            <td>${escaparHtml(e.detalle)}</td>
            <td><strong>${formatearMoneda(e.total)}</strong></td>
            <td>
                <div class="acciones-celda">
                    <button class="btn btn-primary btn-sm" data-action="pdf-ent" data-id="${escaparHtml(e.id)}">PDF</button>
                    <button class="btn btn-danger btn-sm" data-action="del-ent" data-id="${escaparHtml(e.id)}">Eliminar</button>
                </div>
            </td>
        </tr>
    `).join("");
}