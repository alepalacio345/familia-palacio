#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>
//saul
#define MAX_LETRAS_NOMBRE 30
#define MAX_LETRAS_DESCRIPCION 200
#define MAX_OBJETOS 1000
#define MAX_LISTA 1000
#define MAX_LINEA 512
#define ERROR_ARCHIVOS printf("error al abrir archivo\n");

typedef struct {
    char name[MAX_LETRAS_NOMBRE];
    char id[MAX_LETRAS_NOMBRE];
    float cantidad;
    char descripcion[MAX_LETRAS_DESCRIPCION];
} objetos;

typedef struct {
    objetos producto;
    int cantidad_producto_entregrar;
} entrega_objetos;

// Prototipos
void limpiar_consola();
bool validar_login(char usuario_ingresado[], char clave_ingresada[]);
void cargar_objetos(objetos vector_objetos[], int *i);
void guardar_objetos(objetos vector_objetos[], int cantidad_objetos);
void buscar_producto(objetos vector_objetos[], char id[], int cantidad, bool *encontrado, int *indice);
void registrar_producto(objetos vector_objetos[], int *cantidad_objetos);
void eliminar_producto_inventario(objetos vector_objetos[], int *cantidad_objetos);
void imprimir_inventario(objetos vector_objetos[], int cantidad_objetos);
void agregar_a_lista(objetos vector_objetos[], int cantidad_objetos, entrega_objetos lista_entregas[], int *cantidad_lista);
void imprimir_lista_venta(entrega_objetos lista_entregas[], int cantidad_lista);
void eliminar_producto_lista(entrega_objetos lista_entregas[], int *cantidad_lista);
int obtener_siguiente_id_entrega();
void procesar_entrega(objetos vector_objetos[], entrega_objetos lista_entregas[], int *cantidad_lista, int cantidad_objetos_vt);
void imprimir_entregas();
void eliminar_entrega();

int main() {
    // --- MINI-MENU DE LOGIN (SE EJECUTA UNA SOLA VEZ AL INICIO) ---
    bool sesion_iniciada = false;
    bool salir_programa = false;
    char opcion_login[MAX_LETRAS_NOMBRE];
    char usuario_in[MAX_LETRAS_NOMBRE];
    char clave_in[MAX_LETRAS_NOMBRE];

    while (!sesion_iniciada && !salir_programa) {
        printf("\n=== ACCESO AL SISTEMA ===\n");
        printf("Escriba 'login' para iniciar sesion\n");
        printf("Escriba 'salir' para cerrar el programa\n");
        printf("Opcion: ");
        scanf("%29s", opcion_login);

        if (strcmp(opcion_login, "salir") == 0) {
            salir_programa = true;
        } else if (strcmp(opcion_login, "login") == 0) {
            printf("Usuario (o escriba 'salir'): ");
            scanf("%29s", usuario_in);

            if (strcmp(usuario_in, "salir") == 0) {
                salir_programa = true;
            } else {
                printf("Clave: ");
                scanf("%29s", clave_in);

                if (validar_login(usuario_in, clave_in)) {
                    limpiar_consola();
                    printf("Acceso concedido. Bienvenido, %s.\n\n", usuario_in);
                    sesion_iniciada = true;
                } else {
                    limpiar_consola();
                    printf("Error: usuario o clave incorrectos.\n");
                }
            }
        } else {
            limpiar_consola();
            printf("Opcion invalida. Escriba 'login' o 'salir'.\n");
        }
    }

    if (salir_programa) {
        printf("Saliendo del sistema...\n");
        return 0;
    }

    // --- VARIABLES PRINCIPALES ---
    int cantidad_objetos = 0;
    int cantidad_productos = 0;
    int opciones = 0;
    objetos vector_objetos[MAX_OBJETOS];
    entrega_objetos lista_productos[MAX_LISTA];

    cargar_objetos(vector_objetos, &cantidad_objetos);

    // --- MENU PRINCIPAL ---
    do {
        printf("\n=== MENU DE INVENTARIO Y ENTREGAS ===\n");
        printf("1. Registrar producto en inventario\n");
        printf("2. Eliminar producto del inventario\n");
        printf("3. Imprimir productos en el inventario\n");
        printf("4. Agregar producto a la lista de venta\n");
        printf("5. Ver lista de venta actual\n");
        printf("6. Eliminar producto de la lista de venta\n");
        printf("7. Procesar entrega\n");
        printf("8. Ver historial de entregas\n");
        printf("9. Eliminar una entrega del historial\n");
        printf("10. Salir\n");
        printf("Seleccione una opcion: ");
        scanf("%i", &opciones);

        if (opciones != 3 && opciones != 5 && opciones != 8) {
            limpiar_consola();
        }

        switch (opciones) {
            case 1:
                registrar_producto(vector_objetos, &cantidad_objetos);
                break;
            case 2:
                eliminar_producto_inventario(vector_objetos, &cantidad_objetos);
                break;
            case 3:
                imprimir_inventario(vector_objetos, cantidad_objetos);
                break;
            case 4:
                agregar_a_lista(vector_objetos, cantidad_objetos, lista_productos, &cantidad_productos);
                break;
            case 5:
                imprimir_lista_venta(lista_productos, cantidad_productos);
                break;
            case 6:
                eliminar_producto_lista(lista_productos, &cantidad_productos);
                break;
            case 7:
                procesar_entrega(vector_objetos, lista_productos, &cantidad_productos, cantidad_objetos);
                break;
            case 8:
                imprimir_entregas();
                break;
            case 9:
                eliminar_entrega();
                break;
            case 10:
                printf("Cerrando el programa...\n");
                break;
            default:
                printf("Opcion no existe.\n");
                break;
        }
    } while (opciones != 10);

    return 0;
}

bool validar_login(char usuario_ingresado[], char clave_ingresada[]) {
    FILE *archivo = fopen("info_importante.txt", "r");
    char usuario_archivo[MAX_LETRAS_NOMBRE];
    char clave_archivo[MAX_LETRAS_NOMBRE];

    if (archivo == NULL) {
        ERROR_ARCHIVOS
        return false;
    }

    bool valido = false;
    while (fscanf(archivo, "%29s %29s", usuario_archivo, clave_archivo) == 2) {
        if (strcmp(usuario_ingresado, usuario_archivo) == 0 &&
            strcmp(clave_ingresada, clave_archivo) == 0) {
            valido = true;
            break;
        }
    }

    fclose(archivo);
    return valido;
}

void cargar_objetos(objetos vector_objetos[], int *i) {
    FILE *entrada;
    *i = 0;

    entrada = fopen("objetos_inventario.txt", "r");

    if (entrada == NULL) {
        ERROR_ARCHIVOS
    } else {
        while (*i < MAX_OBJETOS &&
               fscanf(entrada, "%f %29s %29s",
                      &vector_objetos[*i].cantidad,
                      vector_objetos[*i].name,
                      vector_objetos[*i].id) == 3) {
            vector_objetos[*i].descripcion[0] = '\0';
            (*i)++;
        }
        fclose(entrada);
    }
}

void guardar_objetos(objetos vector_objetos[], int cantidad_objetos) {
    FILE *salida = fopen("objetos_inventario.txt", "w");

    if (salida == NULL) {
        ERROR_ARCHIVOS
    } else {
        for (int i = 0; i < cantidad_objetos; i++) {
            fprintf(salida, "%.2f %s %s\n",
                    vector_objetos[i].cantidad,
                    vector_objetos[i].name,
                    vector_objetos[i].id);
        }
        fclose(salida);
    }
}

void buscar_producto(objetos vector_objetos[], char id[], int cantidad, bool *encontrado, int *indice) {
    int i = 0;
    *encontrado = false;
    *indice = -1;

    while (!(*encontrado) && (i < cantidad)) {
        if (strcmp(vector_objetos[i].id, id) == 0) {
            *encontrado = true;
            *indice = i;
        }
        i++;
    }
}

void registrar_producto(objetos vector_objetos[], int *cantidad_objetos) {
    char id_nuevo[MAX_LETRAS_NOMBRE];
    bool encontrado;
    int indice;

    if (*cantidad_objetos >= MAX_OBJETOS) {
        printf("Error: el inventario esta lleno.\n");
        return;
    }

    printf("Ingrese el ID del producto: ");
    scanf("%29s", id_nuevo);

    buscar_producto(vector_objetos, id_nuevo, *cantidad_objetos, &encontrado, &indice);

    if (encontrado) {
        printf("Error: ya existe un producto con el ID %s.\n", id_nuevo);
        return;
    }

    strcpy(vector_objetos[*cantidad_objetos].id, id_nuevo);

    printf("Ingrese el nombre del producto (sin espacios): ");
    scanf("%29s", vector_objetos[*cantidad_objetos].name);

    printf("Ingrese la cantidad: ");
    scanf("%f", &vector_objetos[*cantidad_objetos].cantidad);

    vector_objetos[*cantidad_objetos].descripcion[0] = '\0';

    (*cantidad_objetos)++;
    guardar_objetos(vector_objetos, *cantidad_objetos);
    printf("Producto registrado correctamente.\n");
}

void eliminar_producto_inventario(objetos vector_objetos[], int *cantidad_objetos) {
    char id_eliminar[MAX_LETRAS_NOMBRE];
    bool encontrado;
    int indice;

    if (*cantidad_objetos == 0) {
        printf("El inventario esta vacio.\n");
        return;
    }

    imprimir_inventario(vector_objetos, *cantidad_objetos);
    printf("Ingrese el ID del producto a eliminar del inventario: ");
    scanf("%29s", id_eliminar);

    buscar_producto(vector_objetos, id_eliminar, *cantidad_objetos, &encontrado, &indice);

    if (!encontrado) {
        printf("Error: no se encontro el producto con ID %s.\n", id_eliminar);
        return;
    }

    for (int i = indice; i < *cantidad_objetos - 1; i++) {
        vector_objetos[i] = vector_objetos[i + 1];
    }

    (*cantidad_objetos)--;
    guardar_objetos(vector_objetos, *cantidad_objetos);
    printf("Producto %s eliminado del inventario.\n", id_eliminar);
}

void imprimir_inventario(objetos vector_objetos[], int cantidad_objetos) {
    printf("\n--- INVENTARIO DE PRODUCTOS ---\n");
    printf("%-15s %-25s %-10s\n", "ID", "NOMBRE", "CANTIDAD");
    printf("--------------------------------------------------\n");

    if (cantidad_objetos == 0) {
        printf("El inventario esta vacio.\n");
    } else {
        for (int i = 0; i < cantidad_objetos; i++) {
            printf("%-15s %-25s %.2f\n",
                   vector_objetos[i].id,
                   vector_objetos[i].name,
                   vector_objetos[i].cantidad);
        }
    }
    printf("--------------------------------------------------\n");
}

void agregar_a_lista(objetos vector_objetos[], int cantidad_objetos, entrega_objetos lista_entregas[], int *cantidad_lista) {
    char id_buscar[MAX_LETRAS_NOMBRE];
    bool encontrado;
    int indice;
    int cantidad_llevar;

    if (*cantidad_lista >= MAX_LISTA) {
        printf("Error: la lista de entregas esta llena.\n");
        return;
    }

    imprimir_inventario(vector_objetos, cantidad_objetos);
    printf("Ingrese el ID del producto que se lleva el cliente: ");
    scanf("%29s", id_buscar);

    buscar_producto(vector_objetos, id_buscar, cantidad_objetos, &encontrado, &indice);

    if (!encontrado) {
        printf("Error: no existe un producto con el ID %s.\n", id_buscar);
        return;
    }

    // Calcular cuanto ya esta apartado en la lista actual para este producto
    int ya_en_lista = 0;
    int idx_lista = -1;
    for (int i = 0; i < *cantidad_lista; i++) {
        if (strcmp(lista_entregas[i].producto.id, id_buscar) == 0) {
            ya_en_lista = lista_entregas[i].cantidad_producto_entregrar;
            idx_lista = i;
            break;
        }
    }

    float disponible_real = vector_objetos[indice].cantidad - ya_en_lista;
    printf("Producto: %s (Disponible real: %.2f)\n", vector_objetos[indice].name, disponible_real);
    printf("Ingrese la cantidad a llevar: ");
    scanf("%d", &cantidad_llevar);

    if (cantidad_llevar <= 0 || cantidad_llevar > disponible_real) {
        printf("Error: cantidad invalida o insuficiente en inventario.\n");
        return;
    }

    if (idx_lista != -1) {
        lista_entregas[idx_lista].cantidad_producto_entregrar += cantidad_llevar;
    } else {
        lista_entregas[*cantidad_lista].producto = vector_objetos[indice];
        lista_entregas[*cantidad_lista].cantidad_producto_entregrar = cantidad_llevar;
        (*cantidad_lista)++;
    }
    printf("Producto agregado a la lista de venta.\n");
}

void imprimir_lista_venta(entrega_objetos lista_entregas[], int cantidad_lista) {
    printf("\n--- LISTA DE VENTA / ENTREGA ACTUAL ---\n");
    printf("%-15s %-25s %-10s\n", "ID", "NOMBRE", "CANTIDAD");
    printf("--------------------------------------------------\n");

    if (cantidad_lista == 0) {
        printf("La lista de venta esta vacia.\n");
    } else {
        for (int i = 0; i < cantidad_lista; i++) {
            printf("%-15s %-25s %d\n",
                   lista_entregas[i].producto.id,
                   lista_entregas[i].producto.name,
                   lista_entregas[i].cantidad_producto_entregrar);
        }
    }
    printf("--------------------------------------------------\n");
}

void eliminar_producto_lista(entrega_objetos lista_entregas[], int *cantidad_lista) {
    char id_eliminar[MAX_LETRAS_NOMBRE];
    int indice = -1;

    if (*cantidad_lista == 0) {
        printf("La lista de venta esta vacia.\n");
        return;
    }

    imprimir_lista_venta(lista_entregas, *cantidad_lista);
    printf("Ingrese el ID del producto a eliminar de la lista de venta: ");
    scanf("%29s", id_eliminar);

    for (int i = 0; i < *cantidad_lista; i++) {
        if (strcmp(lista_entregas[i].producto.id, id_eliminar) == 0) {
            indice = i;
            break;
        }
    }

    if (indice == -1) {
        printf("Error: el producto %s no esta en la lista de venta.\n", id_eliminar);
        return;
    }

    for (int i = indice; i < *cantidad_lista - 1; i++) {
        lista_entregas[i] = lista_entregas[i + 1];
    }

    (*cantidad_lista)--;
    printf("Producto %s eliminado de la lista de venta.\n", id_eliminar);
}

int obtener_siguiente_id_entrega() {
    FILE *archivo = fopen("entregas.txt", "r");
    char linea[MAX_LINEA];
    int max_id = 0;

    if (archivo == NULL) {
        return 1;
    }

    while (fgets(linea, sizeof(linea), archivo) != NULL) {
        int num = 0;
        if (sscanf(linea, "ENT-%d|", &num) == 1) {
            if (num > max_id) {
                max_id = num;
            }
        }
    }

    fclose(archivo);
    return max_id + 1;
}

void procesar_entrega(objetos vector_objetos[], entrega_objetos lista_entregas[], int *cantidad_lista, int cantidad_objetos_vt) {
    if (*cantidad_lista == 0) {
        printf("No hay productos en la lista de venta para procesar.\n");
        return;
    }

    char cliente[50];
    printf("Ingrese el nombre del cliente: ");
    scanf(" %49[^\n]", cliente);

    // Quitar '|' si el usuario lo escribio por accidente
    for (int i = 0; cliente[i] != '\0'; i++) {
        if (cliente[i] == '|') cliente[i] = ' ';
    }

    // Obtener fecha y hora actual
    time_t ahora = time(NULL);
    struct tm *t = localtime(&ahora);
    char fecha[25];
    strftime(fecha, sizeof(fecha), "%Y-%m-%d %H:%M", t);

    int id_num = obtener_siguiente_id_entrega();
    char id_entrega[20];
    sprintf(id_entrega, "ENT-%03d", id_num);

    FILE *entrada = fopen("entregas.txt", "a");
    if (entrada == NULL) {
        ERROR_ARCHIVOS
        return;
    }

    char detalle[350] = "";
    char item_buf[80];
    bool encontrar;
    int indice_objeto;

    for (int i = 0; i < *cantidad_lista; i++) {
        buscar_producto(vector_objetos, lista_entregas[i].producto.id, cantidad_objetos_vt, &encontrar, &indice_objeto);

        if (encontrar) {
            vector_objetos[indice_objeto].cantidad -= lista_entregas[i].cantidad_producto_entregrar;

            snprintf(item_buf, sizeof(item_buf), "%s%dx %s(%s)",
                     (strlen(detalle) > 0) ? ", " : "",
                     lista_entregas[i].cantidad_producto_entregrar,
                     lista_entregas[i].producto.name,
                     lista_entregas[i].producto.id);

            if (strlen(detalle) + strlen(item_buf) < sizeof(detalle) - 1) {
                strcat(detalle, item_buf);
            }
        }
    }

    // Guardar inventario actualizado y registrar entrega con nuevo formato
    guardar_objetos(vector_objetos, cantidad_objetos_vt);
    fprintf(entrada, "%s|%s|%s|%s\n", id_entrega, fecha, cliente, detalle);
    fclose(entrada);

    *cantidad_lista = 0;
    printf("Entrega %s procesada y guardada correctamente.\n", id_entrega);
}

void imprimir_entregas() {
    FILE *archivo = fopen("entregas.txt", "r");
    char linea[MAX_LINEA];
    int contador = 0;

    printf("\n--- HISTORIAL DE ENTREGAS ---\n");
    if (archivo == NULL) {
        printf("No existe historial de entregas todavia.\n");
        return;
    }

    printf("%-10s %-18s %-20s %s\n", "ID", "FECHA", "CLIENTE", "PRODUCTOS");
    printf("--------------------------------------------------------------------------------\n");

    while (fgets(linea, sizeof(linea), archivo) != NULL) {
        linea[strcspn(linea, "\r\n")] = '\0';
        if (strlen(linea) == 0) continue;

        char *id = strtok(linea, "|");
        char *fecha = strtok(NULL, "|");
        char *cliente = strtok(NULL, "|");
        char *productos = strtok(NULL, "|");

        if (id && fecha && cliente && productos) {
            printf("%-10s %-18s %-20s %s\n", id, fecha, cliente, productos);
            contador++;
        }
    }

    if (contador == 0) {
        printf("No hay entregas registradas.\n");
    }
    printf("--------------------------------------------------------------------------------\n");
    fclose(archivo);
}

void eliminar_entrega() {
    char id_eliminar[20];
    char linea[MAX_LINEA];
    char copia[MAX_LINEA];
    bool eliminada = false;

    imprimir_entregas();

    printf("Ingrese el ID de la entrega a eliminar (ej. ENT-001): ");
    scanf("%19s", id_eliminar);

    FILE *origen = fopen("entregas.txt", "r");
    if (origen == NULL) {
        ERROR_ARCHIVOS
        return;
    }

    FILE *temporal = fopen("entregas_temp.txt", "w");
    if (temporal == NULL) {
        fclose(origen);
        ERROR_ARCHIVOS
        return;
    }

    while (fgets(linea, sizeof(linea), origen) != NULL) {
        strcpy(copia, linea);
        copia[strcspn(copia, "\r\n")] = '\0';

        char *id_actual = strtok(copia, "|");
        if (id_actual != NULL && strcmp(id_actual, id_eliminar) == 0) {
            eliminada = true;
        } else {
            fputs(linea, temporal);
        }
    }

    fclose(origen);
    fclose(temporal);

    remove("entregas.txt");
    rename("entregas_temp.txt", "entregas.txt");

    if (eliminada) {
        printf("Entrega %s eliminada correctamente.\n", id_eliminar);
    } else {
        printf("No se encontro ninguna entrega con el ID %s.\n", id_eliminar);
    }
}

void limpiar_consola() {
    #ifdef _WIN32
        system("cls");
    #else
        system("clear");
    #endif
}