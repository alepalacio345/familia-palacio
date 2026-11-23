// ============================================================================
//  main.js - PUNTO DE ENTRADA DE LA APLICACION
// ============================================================================
//  Aqui se arranca todo: se conecta Supabase, se configuran el login, los
//  modulos y el boton de sincronizar. Cada modulo se inicializa una sola vez
//  al cargar la pagina.
// ============================================================================

import { iniciarSupabase } from "./config.js";
import { inicializarAuth } from "./auth.js";
import { cargarInventario, inicializarInventario, cargarPapelera } from "./inventario.js";
import { cargarEntregas, inicializarEntregas } from "./entregas.js";
import { cargarReventas, inicializarReventas, aplicarVistaReventasPorRol, renderizarFormularioReventa } from "./reventas.js";
import { cargarStockRevendedora } from "./stock.js";
import { cargarCaja, inicializarCaja } from "./caja.js";
import { cargarTasas } from "./tasas.js";
import { construirSidebar, cargarSesiones, inicializarSesion } from "./sesion.js";
import { mostrarAlerta, renderizarTodo, inicializarSelectorMoneda } from "./ui.js";

// ----------------------------------------------------------------------------
// cargarDatosNube()
// Carga TODA la informacion desde Supabase y deja la interfaz lista.
// Se ejecuta despues de iniciar sesion y al pulsar "Actualizar datos".
// ----------------------------------------------------------------------------
async function cargarDatosNube() {
    // 1. Tasas de cambio (Bs/BCV, Euro, Rupia, Yuan).
    await cargarTasas();

    // 2. Todos los datos de la nube, en paralelo.
    await Promise.all([
        cargarInventario(),       // Inventario principal.
        cargarPapelera(),         // Papelera (productos eliminados).
        cargarEntregas(),         // Entregas del admin.
        cargarReventas(),         // Reventas de la revendedora.
        cargarStockRevendedora(), // Stock disponible para revender.
        cargarSesiones(),         // Registro de entradas/salidas.
        cargarCaja(),             // Movimientos de dinero (ingresos/gastos).
    ]);

    // 3. Construir el menu lateral segun el rol y ajustar vistas.
    construirSidebar();
    aplicarVistaReventasPorRol();

    // 4. Pintar todo en pantalla (incluye el formulario de reventa).
    renderizarTodo();
    renderizarFormularioReventa();
}

// ----------------------------------------------------------------------------
// Arranque de la aplicacion (se ejecuta una sola vez).
// ----------------------------------------------------------------------------
iniciarSupabase();

// Login por rol. Al validar, llama a cargarDatosNube.
inicializarAuth(cargarDatosNube);

// Inicializar cada modulo (conecta botones y formularios).
inicializarInventario();
inicializarEntregas();
inicializarReventas();
inicializarCaja();
inicializarSesion();

// Selector de moneda de la barra superior.
inicializarSelectorMoneda();

// Boton "Actualizar datos": recarga tasas + datos y avisa.
document.getElementById("btn-sincronizar").addEventListener("click", async () => {
    await cargarDatosNube();
    mostrarAlerta("Datos y tasas de cambio actualizados desde la nube.", "ok");
});
