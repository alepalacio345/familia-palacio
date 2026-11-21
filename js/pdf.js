import { escaparHtml } from "./ui.js";

function parsearItemsDesdeDetalle(detalle) {
    return String(detalle || "").split(",").map(bloque => {
        const texto = bloque.trim();
        // Formato nuevo con precio: 3x aceite(P#01) @$2.50
        const conPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)\s+@\$([\d.]+)$/);
        if (conPrecio) {
            return {
                cantidad: parseFloat(conPrecio[1]),
                name: conPrecio[2],
                id: conPrecio[3],
                precio: parseFloat(conPrecio[4])
            };
        }
        // Formato anterior sin precio: 3x aceite(P#01)
        const sinPrecio = texto.match(/^([\d.]+)x\s+(.+)\((.+)\)$/);
        if (sinPrecio) {
            return {
                cantidad: parseFloat(sinPrecio[1]),
                name: sinPrecio[2],
                id: sinPrecio[3],
                precio: 0
            };
        }
        return { cantidad: 0, name: texto, id: "-", precio: 0 };
    });
}

export function generarReciboPDF(entrega, itemsArray = null) {
    const items = itemsArray || parsearItemsDesdeDetalle(entrega.detalle);
    const totalCalculado = items.reduce((acc, i) => acc + (Number(i.cantidad) * Number(i.precio || 0)), 0);
    const totalFinal = Number(entrega.total ?? totalCalculado);
    const cedula = entrega.cedula || "N/A";
    const lugar = entrega.lugar_entrega || "No especificado";

    if (window.jspdf && window.jspdf.jsPDF) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Encabezado oscuro
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 32, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont(undefined, "bold");
        doc.text("RECIBO DE ENTREGA", 14, 15);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        doc.text("Sistema de Inventario y Control de Entregas", 14, 23);

        doc.setFontSize(13);
        doc.setFont(undefined, "bold");
        doc.text(String(entrega.id), 196, 18, { align: "right" });

        // Recuadro de datos del cliente y entrega
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 38, 182, 34, 2, 2, "FD");

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);

        doc.setFont(undefined, "bold");
        doc.text("Cliente:", 18, 46);
        doc.text("Cedula:", 18, 54);
        doc.text("Lugar de Entrega:", 18, 62);
        doc.text("Fecha y Hora:", 125, 46);

        doc.setFont(undefined, "normal");
        doc.text(String(entrega.cliente), 36, 46);
        doc.text(String(cedula), 36, 54);
        doc.text(String(entrega.fecha), 152, 46);

        const lugarLineas = doc.splitTextToSize(String(lugar), 135);
        doc.text(lugarLineas.slice(0, 2), 52, 62);

        // Encabezado de tabla
        let y = 84;
        doc.setFillColor(226, 232, 240);
        doc.rect(14, y - 6, 182, 9, "F");
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("ID", 17, y);
        doc.text("Producto", 42, y);
        doc.text("Cant.", 112, y, { align: "right" });
        doc.text("P. Unit.", 148, y, { align: "right" });
        doc.text("Subtotal", 192, y, { align: "right" });

        // Filas de productos
        doc.setFont(undefined, "normal");
        y += 9;
        let totalUnidades = 0;

        items.forEach(item => {
            if (y > 255) {
                doc.addPage();
                y = 20;
            }
            const cant = Number(item.cantidad) || 0;
            const precio = Number(item.precio) || 0;
            const subtotal = cant * precio;
            totalUnidades += cant;

            doc.text(String(item.id), 17, y);
            doc.text(String(item.name).slice(0, 32), 42, y);
            doc.text(String(cant), 112, y, { align: "right" });
            doc.text(`$${precio.toFixed(2)}`, 148, y, { align: "right" });
            doc.text(`$${subtotal.toFixed(2)}`, 192, y, { align: "right" });

            doc.setDrawColor(226, 232, 240);
            doc.line(14, y + 3, 196, y + 3);
            y += 9;
        });

        // Bloque de totales
        y += 5;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        doc.text(`Total de articulos: ${totalUnidades}`, 14, y + 4);

        doc.setFillColor(15, 23, 42);
        doc.roundedRect(126, y - 3, 70, 12, 2, 2, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text("TOTAL:", 131, y + 5);
        doc.text(`$${totalFinal.toFixed(2)}`, 192, y + 5, { align: "right" });

        // Firmas
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
        const ventana = window.open("", "_blank", "width=750,height=650");
        const filas = items.map(i => {
            const sub = (Number(i.cantidad) || 0) * (Number(i.precio) || 0);
            return `<tr><td>${escaparHtml(i.id)}</td><td>${escaparHtml(i.name)}</td><td>${escaparHtml(i.cantidad)}</td><td>$${Number(i.precio || 0).toFixed(2)}</td><td>$${sub.toFixed(2)}</td></tr>`;
        }).join("");

        ventana.document.write(`
            <html><head><title>Recibo ${escaparHtml(entrega.id)}</title>
            <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.total{text-align:right;margin-top:14px;font-size:1.2rem;font-weight:bold}</style>
            </head><body>
            <h2>RECIBO DE ENTREGA - ${escaparHtml(entrega.id)}</h2>
            <p><strong>Fecha:</strong> ${escaparHtml(entrega.fecha)}</p>
            <p><strong>Cliente:</strong> ${escaparHtml(entrega.cliente)} | <strong>Cedula:</strong> ${escaparHtml(cedula)}</p>
            <p><strong>Lugar de Entrega:</strong> ${escaparHtml(lugar)}</p>
            <table><thead><tr><th>ID</th><th>Producto</th><th>Cantidad</th><th>P. Unit.</th><th>Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
            <p class="total">TOTAL: $${totalFinal.toFixed(2)}</p>
            <script>window.print();<\/script></body></html>
        `);
        ventana.document.close();
    }
}