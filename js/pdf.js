// ============================================================================
//  pdf.js - GENERACION DE RECIBOS EN PDF (jsPDF)
// ============================================================================
//  Genera dos tipos de recibo:
//    1) Recibo de ENTREGA (ventas que hace el admin).
//    2) Recibo de REVENTA (ventas que hace la revendedora, con datos de pago).
//
//  Los montos se imprimen en la MONEDA en la que se emitio el recibo
//  (USD, Bs, Euro, Rupia o Yuan), usando la tasa que quedo guardada en la
//  operacion. Asi, si la tasa cambia manana, el recibo viejo no se altera.
// ============================================================================

import { formatearMonto, obtenerMoneda } from "./tasas.js";
import { escaparHtml } from "./ui.js";

// ----------------------------------------------------------------------------
// Convierte un monto en USD a la moneda indicada usando una TASA CONCRETA
// (la que se guardo al momento de la operacion, no la actual).
// ----------------------------------------------------------------------------
function convertirConTasa(usd, moneda, tasa) {
    const base = Number(usd || 0);
    if (moneda === "USD" || !tasa) return base;
    return Number((base * Number(tasa)).toFixed(2));
}

// ----------------------------------------------------------------------------
// Devuelve el simbolo de una moneda (para el encabezado del PDF).
// ----------------------------------------------------------------------------
function simboloMoneda(codigo) {
    return obtenerMoneda(codigo).simbolo;
}

// ----------------------------------------------------------------------------
// Convierte el texto "2x arroz(P#01) @$3.50, ..." en una lista de items.
// Se usa cuando solo tenemos el texto guardado (reimprimir un recibo viejo).
// ----------------------------------------------------------------------------
function parsearItemsDesdeDetalle(detalle) {
    return String(detalle || "").split(",").map(bloque => {
        const texto = bloque.trim();
        const conPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)\s+@\$([\d.]+)$/);
        if (conPrecio) {
            return { cantidad: parseFloat(conPrecio[1]), name: conPrecio[2], id: conPrecio[3], precio: parseFloat(conPrecio[4]) };
        }
        const sinPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)$/);
        if (sinPrecio) {
            return { cantidad: parseFloat(sinPrecio[1]), name: sinPrecio[2], id: sinPrecio[3], precio: 0 };
        }
        return { cantidad: 0, name: texto, id: "-", precio: 0 };
    });
}

// ----------------------------------------------------------------------------
// Etiqueta amigable del tipo de operacion (para el titulo/encabezado).
// ----------------------------------------------------------------------------
function etiquetaTipo(tipo) {
    if (tipo === "revendedora") return "REMITO A REVENDEDORA";
    if (tipo === "otra") return "RECIBO DE ENTREGA (OTRA PERSONA)";
    return "RECIBO DE ENTREGA";
}

// ----------------------------------------------------------------------------
// Dibuja el ENCABEZADO comun de todo recibo.
// Sin barra de color: texto oscuro sobre fondo blanco, para ahorrar tinta
// cuando el recibo se imprime.
// ----------------------------------------------------------------------------
function dibujarEncabezado(doc, titulo, id) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text(titulo, 14, 16);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Sistema de Inventario y Control de Entregas", 14, 23);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(String(id), 196, 16, { align: "right" });

    // Linea delgada separadora (mucho menos tinta que la barra rellena).
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, 30, 196, 30);
    doc.setLineWidth(0.2);
}

// ----------------------------------------------------------------------------
// GENERAR RECIBO DE ENTREGA
//  entrega:  objeto con los datos (incluye moneda, tasa y total_moneda).
//  itemsArray: lista opcional de items [{id, name, cantidad, precio}].
// ----------------------------------------------------------------------------
export function generarReciboPDF(entrega, itemsArray = null) {
    const items = itemsArray || parsearItemsDesdeDetalle(entrega.detalle);
    const moneda = entrega.moneda || "USD";
    const tasa = entrega.tasa || (moneda === "USD" ? 1 : null);
    const cedula = entrega.cedula || "N/A";
    const lugar = entrega.lugar_entrega || "No especificado";

    // Total en la moneda del recibo (guardado) o calculado como respaldo.
    const totalMoneda = Number(entrega.total_moneda ?? 0);
    let totalFinal = totalMoneda > 0 ? totalMoneda : 0;
    let totalCalculado = 0;

    if (window.jspdf && window.jspdf.jsPDF) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        dibujarEncabezado(doc, etiquetaTipo(entrega.tipo), entrega.id);

        // Recuadro de datos del cliente y entrega.
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 38, 182, 40, 2, 2, "FD");

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);

        doc.setFont(undefined, "bold");
        doc.text("Cliente:", 18, 46);
        doc.text("Cedula:", 18, 54);
        doc.text("Lugar de Entrega:", 18, 62);
        doc.text("Fecha y Hora:", 125, 46);
        doc.text("Moneda:", 125, 54);

        doc.setFont(undefined, "normal");
        doc.text(String(entrega.cliente), 36, 46);
        doc.text(String(cedula), 36, 54);
        doc.text(String(entrega.fecha), 152, 46);
        doc.text(`${moneda} (1 USD = ${moneda === "USD" ? "1" : Number(tasa || 0).toFixed(2)} ${moneda})`, 152, 54);

        const lugarLineas = doc.splitTextToSize(String(lugar), 135);
        doc.text(lugarLineas.slice(0, 2), 52, 62);

        // Encabezado de tabla de productos.
        let y = 90;
        doc.setFillColor(226, 232, 240);
        doc.rect(14, y - 6, 182, 9, "F");
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("ID", 17, y);
        doc.text("Producto", 42, y);
        doc.text("Cant.", 112, y, { align: "right" });
        doc.text("P. Unit.", 148, y, { align: "right" });
        doc.text("Subtotal", 192, y, { align: "right" });

        // Filas de productos (convertidas a la moneda del recibo).
        doc.setFont(undefined, "normal");
        y += 9;
        let totalUnidades = 0;

        items.forEach(item => {
            if (y > 255) {
                doc.addPage();
                y = 20;
            }
            const cant = Number(item.cantidad) || 0;
            const precioMoneda = convertirConTasa(item.precio, moneda, tasa);
            const subtotal = cant * precioMoneda;
            totalUnidades += cant;
            totalCalculado += subtotal;

            doc.text(String(item.id), 17, y);
            doc.text(String(item.name).slice(0, 32), 42, y);
            doc.text(String(cant), 112, y, { align: "right" });
            doc.text(formatearMonto(precioMoneda, moneda), 148, y, { align: "right" });
            doc.text(formatearMonto(subtotal, moneda), 192, y, { align: "right" });

            doc.setDrawColor(226, 232, 240);
            doc.line(14, y + 3, 196, y + 3);
            y += 9;
        });

        // Si no habia total guardado, usamos el calculado.
        if (totalFinal <= 0) totalFinal = totalCalculado;

        // Bloque de totales.
        y += 5;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        doc.text(`Total de articulos: ${totalUnidades}`, 14, y + 4);

        // Recuadro del total solo con borde (sin relleno oscuro).
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.4);
        doc.roundedRect(126, y - 3, 70, 12, 2, 2, "S");
        doc.setLineWidth(0.2);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text("TOTAL:", 131, y + 5);
        doc.text(formatearMonto(totalFinal, moneda), 192, y + 5, { align: "right" });

        // Firmas.
        y += 32;
        if (y > 275) {
            doc.addPage();
            y = 35;
        }
        doc.setTextColor(71, 85, 105);
        doc.setFont(undefined, "normal");
        doc.setDrawColor(100, 116, 139);
        doc.line(14, y, 86, y);
        doc.line(120, y, 192, y);
        doc.setFontSize(9);
        doc.text("Firma de quien entrega", 31, y + 6);
        doc.text(`Firma de quien recibe (${cedula})`, 125, y + 6);

        doc.save(`Recibo_${entrega.id}.pdf`);
    } else {
        // Respaldo sin jsPDF: abrimos una ventana imprimible.
        const filas = items.map(i => {
            const precioMoneda = convertirConTasa(i.precio, moneda, tasa);
            const sub = (Number(i.cantidad) || 0) * precioMoneda;
            totalCalculado += sub;
            return `<tr><td>${escaparHtml(i.id)}</td><td>${escaparHtml(i.name)}</td><td>${escaparHtml(i.cantidad)}</td><td>${escaparHtml(formatearMonto(precioMoneda, moneda))}</td><td>${escaparHtml(formatearMonto(sub, moneda))}</td></tr>`;
        }).join("");
        if (totalFinal <= 0) totalFinal = totalCalculado;

        const ventana = window.open("", "_blank", "width=750,height=650");
        ventana.document.write(`
            <html><head><title>Recibo ${escaparHtml(entrega.id)}</title>
            <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.total{text-align:right;margin-top:14px;font-size:1.2rem;font-weight:bold}</style>
            </head><body>
            <h2>${escaparHtml(etiquetaTipo(entrega.tipo))} - ${escaparHtml(entrega.id)}</h2>
            <p><strong>Fecha:</strong> ${escaparHtml(entrega.fecha)}</p>
            <p><strong>Cliente:</strong> ${escaparHtml(entrega.cliente)} | <strong>Cedula:</strong> ${escaparHtml(cedula)}</p>
            <p><strong>Lugar de Entrega:</strong> ${escaparHtml(lugar)}</p>
            <table><thead><tr><th>ID</th><th>Producto</th><th>Cantidad</th><th>P. Unit.</th><th>Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
            <p class="total">TOTAL: ${escaparHtml(formatearMonto(totalFinal, moneda))}</p>
            <script>window.print();<\/script></body></html>
        `);
        ventana.document.close();
    }
}

// ----------------------------------------------------------------------------
// GENERAR RECIBO DE REVENTA
//  reventa: objeto con los datos de la reventa (incluye datos de pago).
//  itemsArray: lista opcional de items.
// ----------------------------------------------------------------------------
export function generarReciboReventaPDF(reventa, itemsArray = null) {
    const items = itemsArray || parsearItemsDesdeDetalle(reventa.detalle);
    const moneda = reventa.moneda || "USD";
    const tasa = reventa.tasa || (moneda === "USD" ? 1 : null);
    const cedula = reventa.cedula || "N/A";
    const tipoPagoTexto = reventa.tipo_pago === "bolivares" ? "Bolivares" : "Divisa";
    const pendienteTexto = reventa.pendiente ? "PENDIENTE" : "PAGADO";

    let totalFinal = Number(reventa.monto ?? 0);
    let totalCalculado = 0;

    if (window.jspdf && window.jspdf.jsPDF) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        dibujarEncabezado(doc, "RECIBO DE REVENTA", reventa.id);

        // Recuadro de datos del comprador y del pago.
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 38, 182, 48, 2, 2, "FD");

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);

        doc.setFont(undefined, "bold");
        doc.text("Comprador:", 18, 46);
        doc.text("Cedula:", 18, 54);
        doc.text("Como fue:", 18, 62);
        doc.text("Moneda:", 18, 70);
        doc.text("Estado:", 18, 78);
        doc.text("Fecha:", 125, 46);
        doc.text("Revendedora:", 125, 54);

        doc.setFont(undefined, "normal");
        doc.text(String(reventa.cliente), 40, 46);
        doc.text(String(cedula), 40, 54);
        doc.text(tipoPagoTexto, 40, 62);
        doc.text(moneda, 40, 70);
        doc.text(pendienteTexto, 40, 78);
        doc.text(String(reventa.fecha), 152, 46);
        doc.text(String(reventa.usuario || "-"), 152, 54);

        // Si esta pendiente, mostramos la posible fecha de pago y como pagara.
        if (reventa.pendiente) {
            doc.setFont(undefined, "bold");
            doc.text("Pago posible:", 125, 62);
            doc.text("Como pagara:", 125, 70);
            doc.setFont(undefined, "normal");
            doc.text(String(reventa.fecha_pago || "N/A"), 152, 62);
            doc.text(reventa.como_pagara === "bolivares" ? "Bolivares" : "Divisa", 152, 70);
        }

        // Encabezado de tabla.
        let y = 98;
        doc.setFillColor(226, 232, 240);
        doc.rect(14, y - 6, 182, 9, "F");
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("ID", 17, y);
        doc.text("Producto", 42, y);
        doc.text("Cant.", 112, y, { align: "right" });
        doc.text("P. Unit.", 148, y, { align: "right" });
        doc.text("Subtotal", 192, y, { align: "right" });

        doc.setFont(undefined, "normal");
        y += 9;
        let totalUnidades = 0;

        items.forEach(item => {
            if (y > 255) {
                doc.addPage();
                y = 20;
            }
            const cant = Number(item.cantidad) || 0;
            const precioMoneda = convertirConTasa(item.precio, moneda, tasa);
            const subtotal = cant * precioMoneda;
            totalUnidades += cant;
            totalCalculado += subtotal;

            doc.text(String(item.id), 17, y);
            doc.text(String(item.name).slice(0, 32), 42, y);
            doc.text(String(cant), 112, y, { align: "right" });
            doc.text(formatearMonto(precioMoneda, moneda), 148, y, { align: "right" });
            doc.text(formatearMonto(subtotal, moneda), 192, y, { align: "right" });

            doc.setDrawColor(226, 232, 240);
            doc.line(14, y + 3, 196, y + 3);
            y += 9;
        });

        if (totalFinal <= 0) totalFinal = totalCalculado;

        // Bloque de totales.
        y += 5;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        doc.text(`Total de articulos: ${totalUnidades}`, 14, y + 4);
        doc.text(`Equivalente: ${formatearMonto(reventa.monto_bs || 0, "VES")}`, 14, y + 12);

        // Recuadro del total solo con borde (sin relleno oscuro).
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.4);
        doc.roundedRect(126, y - 3, 70, 12, 2, 2, "S");
        doc.setLineWidth(0.2);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text("TOTAL:", 131, y + 5);
        doc.text(formatearMonto(totalFinal, moneda), 192, y + 5, { align: "right" });

        doc.save(`Reventa_${reventa.id}.pdf`);
    } else {
        const filas = items.map(i => {
            const precioMoneda = convertirConTasa(i.precio, moneda, tasa);
            const sub = (Number(i.cantidad) || 0) * precioMoneda;
            totalCalculado += sub;
            return `<tr><td>${escaparHtml(i.id)}</td><td>${escaparHtml(i.name)}</td><td>${escaparHtml(i.cantidad)}</td><td>${escaparHtml(formatearMonto(precioMoneda, moneda))}</td><td>${escaparHtml(formatearMonto(sub, moneda))}</td></tr>`;
        }).join("");
        if (totalFinal <= 0) totalFinal = totalCalculado;

        const ventana = window.open("", "_blank", "width=750,height=650");
        ventana.document.write(`
            <html><head><title>Reventa ${escaparHtml(reventa.id)}</title>
            <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.total{text-align:right;margin-top:14px;font-size:1.2rem;font-weight:bold}</style>
            </head><body>
            <h2>RECIBO DE REVENTA - ${escaparHtml(reventa.id)}</h2>
            <p><strong>Fecha:</strong> ${escaparHtml(reventa.fecha)} | <strong>Estado:</strong> ${escaparHtml(pendienteTexto)}</p>
            <p><strong>Comprador:</strong> ${escaparHtml(reventa.cliente)} | <strong>Cedula:</strong> ${escaparHtml(cedula)}</p>
            <p><strong>Como fue:</strong> ${escaparHtml(tipoPagoTexto)} | <strong>Moneda:</strong> ${escaparHtml(moneda)}</p>
            <table><thead><tr><th>ID</th><th>Producto</th><th>Cantidad</th><th>P. Unit.</th><th>Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
            <p class="total">TOTAL: ${escaparHtml(formatearMonto(totalFinal, moneda))}</p>
            <script>window.print();<\/script></body></html>
        `);
        ventana.document.close();
    }
}
