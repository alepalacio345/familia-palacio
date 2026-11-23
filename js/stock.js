// ============================================================================
//  stock.js - STOCK DISPONIBLE PARA REVENDER (stock de la revendedora)
// ============================================================================
//  La revendedora solo puede vender productos que el ADMIN le haya entregado
//  previamente. Ese "stock de la revendedora" se guarda en la tabla
//  `stock_revendedora` y aqui estan las funciones para leerlo y modificarlo.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { mostrarAlerta } from "./ui.js";

// ----------------------------------------------------------------------------
// cargarStockRevendedora()
// Trae desde Supabase todo el stock disponible de la revendedora.
// ----------------------------------------------------------------------------
export async function cargarStockRevendedora() {
    const { data, error } = await db
        .from("stock_revendedora")
        .select("product_id, name, cantidad")
        .order("product_id", { ascending: true });

    if (error) {
        console.warn("Error cargando stock de la revendedora:", error.message);
        return false;
    }

    state.stockRevendedora = (data || []).map(s => ({
        product_id: s.product_id,
        name: s.name,
        cantidad: Number(s.cantidad || 0),
    }));

    return true;
}

// ----------------------------------------------------------------------------
// sumarStock(product_id, name, cantidad)
// Agrega `cantidad` al stock de la revendedora para un producto.
// Se usa cuando el admin hace una entrega de tipo "revendedora".
// ----------------------------------------------------------------------------
export async function sumarStock(product_id, name, cantidad) {
    const existente = state.stockRevendedora.find(s => s.product_id === product_id);
    const nueva = Number(((existente ? existente.cantidad : 0) + cantidad).toFixed(2));

    // Si el producto ya existe, conservamos su nombre original.
    const nombreFinal = existente ? existente.name : name;

    const { error } = await db
        .from("stock_revendedora")
        .upsert({ product_id, name: nombreFinal, cantidad: nueva }, { onConflict: "product_id" });

    if (error) {
        mostrarAlerta(`Error sumando stock de ${product_id}: ${error.message}`, "err");
        console.warn(`Error sumando stock de ${product_id}:`, error.message);
        return false;
    }

    await cargarStockRevendedora();
    return true;
}

// ----------------------------------------------------------------------------
// restarStock(product_id, cantidad)
// Descuenta `cantidad` del stock de la revendedora.
// Si la cantidad llega a CERO, se BORRA la fila para que el producto
// desaparezca de la lista de "Disponibilidad".
// Se usa cuando la revendedora registra una reventa o cuando se deshace algo.
// ----------------------------------------------------------------------------
export async function restarStock(product_id, cantidad) {
    const existente = state.stockRevendedora.find(s => s.product_id === product_id);
    const actual = existente ? existente.cantidad : 0;
    const nueva = Math.max(0, Number((actual - cantidad).toFixed(2)));

    let resultado;
    if (nueva <= 0) {
        // Ya no queda nada: eliminamos la fila del stock.
        resultado = await db
            .from("stock_revendedora")
            .delete()
            .eq("product_id", product_id);
    } else {
        // Todavia queda algo: actualizamos la cantidad.
        resultado = await db
            .from("stock_revendedora")
            .upsert({ product_id, name: existente ? existente.name : product_id, cantidad: nueva }, { onConflict: "product_id" });
    }

    if (resultado.error) {
        mostrarAlerta(`Error quitando stock de ${product_id}: ${resultado.error.message}`, "err");
        console.warn(`Error restando stock de ${product_id}:`, resultado.error.message);
        return false;
    }

    await cargarStockRevendedora();
    return true;
}
