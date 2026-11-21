import { iniciarSupabase } from "./config.js";
import { inicializarAuth } from "./auth.js";
import { cargarInventario, inicializarInventario } from "./inventario.js";
import { cargarEntregas, inicializarEntregas } from "./entregas.js";
import { mostrarAlerta, renderizarTodo } from "./ui.js";

async function cargarDatosNube() {
    await Promise.all([cargarInventario(), cargarEntregas()]);
    renderizarTodo();
}

iniciarSupabase();
inicializarAuth(cargarDatosNube);
inicializarInventario();
inicializarEntregas();

document.getElementById("btn-sincronizar").addEventListener("click", async () => {
    await cargarDatosNube();
    mostrarAlerta("Datos actualizados desde la nube.", "ok");
});