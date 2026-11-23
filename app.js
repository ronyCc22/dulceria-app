// ============================================================================
// APLICACIÓN DE GESTIÓN DE DULCERÍA (INVENTARIO, VENTAS Y CUADRE)
// ============================================================================
// Este archivo contiene toda la lógica de la aplicación en JavaScript puro:
// 1. Manejo del vendedor activo (login / cambio de vendedor).
// 2. Registro de compras a mayoristas.
// 3. Entrega de mercadería a cada vendedor.
// 4. Registro de ventas con control de stock propio, Efectivo/Yape y Deudas.
// 5. Cuadre del día y resumen de deudores.
// ============================================================================

// ----------------------------------------------------------------------------
// VARIABLES GLOBALES (ESTADO DE LA APLICACIÓN)
// ----------------------------------------------------------------------------
let vendedorActivo = null;        // Objeto con los datos del vendedor que inició sesión { id, nombre, email }
let listaProductos = [];          // Catálogo de todos los productos en la base de datos
let listaVendedores = [];         // Lista de los 2 vendedores registrados
let carritoVenta = [];            // Productos agregados a la venta en curso
let metodoPagoSeleccionado = 'efectivo'; // 'efectivo' o 'yape'
let estadoPagoSeleccionado = 'pagado';   // 'pagado' o 'debe'
let ventaEnCobroId = null;        // ID de la venta que se está cobrando en el modal de deudas
let metodoCobroSeleccionado = 'efectivo';

// ----------------------------------------------------------------------------
// INICIALIZACIÓN: Se ejecuta cuando el navegador termina de cargar el HTML
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    establecerFechasPorDefecto();

    // Verificamos si Supabase está listo con credenciales
    const conexionExitosa = inicializarSupabase();
    if (!conexionExitosa) {
        document.getElementById("configAlert").style.display = "flex";
        abrirModalConfig();
        return;
    }

    // Cargamos los datos iniciales desde la base de datos
    await cargarVendedores();
    await cargarProductos();
    verificarSesionGuardada();
    await cargarCuadreYStock();
    await cargarHistorialEntregas();
    await cargarHistorialCompras();
});

/**
 * Llena los campos de fecha con la fecha y hora actual local.
 */
function establecerFechasPorDefecto() {
    const ahora = new Date();
    // Formato YYYY-MM-DD para el filtro de fecha
    const hoyStr = ahora.toISOString().split("T")[0];
    document.getElementById("cuadreFechaInput").value = hoyStr;

    // Formato YYYY-MM-DDTHH:MM para inputs datetime-local
    const pad = (n) => String(n).padStart(2, "0");
    const fechaHoraLocal = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;

    if (document.getElementById("entregaFechaInput")) {
        document.getElementById("entregaFechaInput").value = fechaHoraLocal;
    }
    if (document.getElementById("compraFechaInput")) {
        document.getElementById("compraFechaInput").value = fechaHoraLocal;
    }
}

// ============================================================================
// SECCIÓN 1: VENDEDORES Y AUTENTICACIÓN (LOGIN)
// ============================================================================

/**
 * Obtiene la lista de vendedores de la tabla "vendedores" en Supabase.
 */
async function cargarVendedores() {
    try {
        const { data, error } = await db.from("vendedores").select("*").order("id", { ascending: true });
        if (error) throw error;

        listaVendedores = data || [];
        llenarSelectoresVendedores();
        renderizarBotonesAccesoRapido();
    } catch (error) {
        console.error("Error al cargar vendedores:", error);
        mostrarToast("Error al cargar vendedores de Supabase", "error");
    }
}

/**
 * Llena los selectores <select> de vendedores en las distintas pantallas.
 */
function llenarSelectoresVendedores() {
    const selectEntrega = document.getElementById("entregaVendedorSelect");
    const selectCuadre = document.getElementById("cuadreVendedorSelect");

    // Limpiamos opciones previas
    selectEntrega.innerHTML = '<option value="">-- Selecciona al vendedor --</option>';
    selectCuadre.innerHTML = '<option value="todos">-- Todos los Vendedores --</option>';

    listaVendedores.forEach(v => {
        // Opción para pantalla de entregas
        const opt1 = document.createElement("option");
        opt1.value = v.id;
        opt1.textContent = `${v.nombre} (${v.email})`;
        selectEntrega.appendChild(opt1);

        // Opción para filtro de cuadre
        const opt2 = document.createElement("option");
        opt2.value = v.id;
        opt2.textContent = v.nombre;
        selectCuadre.appendChild(opt2);
    });
}

/**
 * Renderiza los botones de acceso rápido para que los 2 vendedores
 * puedan cambiar de perfil con un solo clic en el modal.
 */
function renderizarBotonesAccesoRapido() {
    const contenedor = document.getElementById("botonesAccesoRapidoVendedores");
    contenedor.innerHTML = "";

    if (listaVendedores.length === 0) {
        contenedor.innerHTML = "<small style='color:var(--gray-600);'>No hay vendedores en la tabla. Ejecuta el archivo schema.sql en Supabase.</small>";
        return;
    }

    listaVendedores.forEach(v => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-secondary";
        btn.style.justifyContent = "flex-start";
        btn.innerHTML = `👤 Entrar como <strong>${v.nombre}</strong> (${v.email})`;
        btn.onclick = () => {
            seleccionarVendedorActivo(v);
            cerrarModalAuth();
        };
        contenedor.appendChild(btn);
    });
}

/**
 * Asigna un vendedor como el usuario activo de la sesión actual.
 */
function seleccionarVendedorActivo(vendedor) {
    vendedorActivo = vendedor;
    localStorage.setItem("dulces_vendedor_activo", JSON.stringify(vendedor));

    // Actualizamos el encabezado
    document.getElementById("currentUserName").textContent = vendedor.nombre;
    document.getElementById("authBtn").textContent = "Cambiar Vendedor";
    document.getElementById("badgeVendedorActivo").textContent = `Vendedor: ${vendedor.nombre}`;

    mostrarToast(`Sesión activa: ${vendedor.nombre}`, "success");

    // Actualizamos las opciones de venta con el stock de este vendedor
    actualizarOpcionesProductosVenta();
    cargarUltimasVentasVendedor();
}

/**
 * Restaura la sesión del vendedor desde el almacenamiento local si ya existía.
 */
function verificarSesionGuardada() {
    const guardado = localStorage.getItem("dulces_vendedor_activo");
    if (guardado) {
        try {
            const v = JSON.parse(guardado);
            seleccionarVendedorActivo(v);
            return;
        } catch (e) {
            console.error("Error al leer sesión guardada:", e);
        }
    }

    // Si hay vendedores cargados pero nadie seleccionado, seleccionamos al primero
    if (listaVendedores.length > 0) {
        seleccionarVendedorActivo(listaVendedores[0]);
    } else {
        abrirModalAuth();
    }
}

/**
 * Login mediante Supabase Auth con Correo y Contraseña.
 */
async function iniciarSesionConAuth(event) {
    event.preventDefault();
    const email = document.getElementById("authEmailInput").value.trim();
    const password = document.getElementById("authPasswordInput").value;

    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Buscamos el vendedor con ese email
        const vendedor = listaVendedores.find(v => v.email.toLowerCase() === email.toLowerCase());
        if (vendedor) {
            seleccionarVendedorActivo(vendedor);
        } else {
            // Si no estaba en la tabla, lo creamos
            const { data: nuevoVendedor } = await db.from("vendedores")
                .insert({ nombre: email.split("@")[0], email: email })
                .select().single();
            await cargarVendedores();
            seleccionarVendedorActivo(nuevoVendedor);
        }

        cerrarModalAuth();
    } catch (error) {
        console.error("Error en login:", error);
        mostrarToast("Error en login: " + error.message, "error");
    }
}

/**
 * Registra un usuario nuevo en Supabase Auth si se desea usar contraseñas.
 */
async function registrarUsuarioEnAuth() {
    const email = document.getElementById("authEmailInput").value.trim();
    const password = document.getElementById("authPasswordInput").value;

    if (!email || !password) {
        alert("Por favor ingresa un correo y una contraseña.");
        return;
    }

    try {
        const { data, error } = await db.auth.signUp({ email, password });
        if (error) throw error;

        // Agregamos a la tabla vendedores
        await db.from("vendedores").insert({ nombre: email.split("@")[0], email }).select();
        await cargarVendedores();

        mostrarToast("Usuario registrado con éxito.", "success");
    } catch (error) {
        alert("Error al registrar: " + error.message);
    }
}

// ============================================================================
// SECCIÓN 2: CATÁLOGO DE PRODUCTOS (DULCES)
// ============================================================================

/**
 * Carga todos los productos de la tabla "productos".
 */
async function cargarProductos() {
    try {
        const { data, error } = await db.from("productos").select("*").order("nombre", { ascending: true });
        if (error) throw error;

        listaProductos = data || [];
        llenarSelectoresProductos();
        renderizarTablaCatalogo();
    } catch (error) {
        console.error("Error al cargar productos:", error);
        mostrarToast("Error al cargar productos de Supabase", "error");
    }
}

/**
 * Llena los menús desplegables de productos en compras y entregas.
 */
function llenarSelectoresProductos() {
    const selectCompra = document.getElementById("compraProductoSelect");
    const selectEntrega = document.getElementById("entregaProductoSelect");

    selectCompra.innerHTML = '<option value="">-- Selecciona el producto --</option>';
    selectEntrega.innerHTML = '<option value="">-- Selecciona el dulce --</option>';

    listaProductos.forEach(p => {
        const optText = `${p.nombre} (Precio: S/ ${parseFloat(p.precio).toFixed(2)})`;

        const opt1 = document.createElement("option");
        opt1.value = p.id;
        opt1.textContent = optText;
        selectCompra.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = p.id;
        opt2.textContent = optText;
        selectEntrega.appendChild(opt2);
    });

    actualizarOpcionesProductosVenta();
}

/**
 * Muestra el catálogo completo en la pestaña "Productos".
 */
function renderizarTablaCatalogo() {
    const tbody = document.getElementById("tablaProductosCatalogoBody");
    tbody.innerHTML = "";

    if (listaProductos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--gray-400);">No hay productos registrados aún.</td></tr>';
        return;
    }

    listaProductos.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>#${p.id}</td>
            <td><strong>${p.nombre}</strong></td>
            <td>S/ ${parseFloat(p.precio).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Guarda un nuevo dulce en la tabla "productos".
 */
async function guardarNuevoProducto(event) {
    event.preventDefault();
    const nombre = document.getElementById("productoNombreInput").value.trim();
    const precio = parseFloat(document.getElementById("productoPrecioInput").value);

    if (!nombre || isNaN(precio) || precio < 0) {
        mostrarToast("Ingresa un nombre y precio válido", "error");
        return;
    }

    try {
        const { data, error } = await db.from("productos").insert([{ nombre, precio }]).select();
        if (error) throw error;

        mostrarToast(`Producto "${nombre}" registrado con éxito`, "success");
        document.getElementById("formNuevoProducto").reset();
        await cargarProductos();
    } catch (error) {
        console.error("Error al guardar producto:", error);
        mostrarToast("Error al guardar producto: " + error.message, "error");
    }
}

// ============================================================================
// SECCIÓN 3: REGISTRAR COMPRA (ABASTECIMIENTO AL POR MAYOR)
// ============================================================================

/**
 * Guarda una nueva compra mayorista en la tabla "compras".
 */
async function registrarCompra(event) {
    event.preventDefault();

    const producto_id = parseInt(document.getElementById("compraProductoSelect").value);
    const cantidad = parseInt(document.getElementById("compraCantidadInput").value);
    const costo = parseFloat(document.getElementById("compraCostoInput").value);
    const fecha = document.getElementById("compraFechaInput").value || new Date().toISOString();

    if (!producto_id || isNaN(cantidad) || cantidad <= 0 || isNaN(costo) || costo < 0) {
        mostrarToast("Verifica los datos de la compra", "error");
        return;
    }

    try {
        const { error } = await db.from("compras").insert([{
            producto_id,
            cantidad,
            costo,
            fecha
        }]);

        if (error) throw error;

        mostrarToast("Compra registrada en almacén correctamente", "success");
        document.getElementById("formCompra").reset();
        establecerFechasPorDefecto();
        await cargarHistorialCompras();
        actualizarInfoAlmacenEntrega();
    } catch (error) {
        console.error("Error al registrar compra:", error);
        mostrarToast("Error al registrar compra: " + error.message, "error");
    }
}

/**
 * Carga el historial de compras recientes de la tabla "compras".
 */
async function cargarHistorialCompras() {
    const tbody = document.getElementById("tablaHistorialComprasBody");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">Cargando compras...</td></tr>';

    try {
        const { data, error } = await db.from("compras")
            .select("id, cantidad, costo, fecha, productos ( nombre )")
            .order("fecha", { ascending: false })
            .limit(10);

        if (error) throw error;

        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">No hay compras registradas aún.</td></tr>';
            return;
        }

        data.forEach(c => {
            const tr = document.createElement("tr");
            const fechaFormateada = new Date(c.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
            const nombreProd = c.productos ? c.productos.nombre : `Producto #${c.producto_id}`;

            tr.innerHTML = `
                <td>${fechaFormateada}</td>
                <td><strong>${nombreProd}</strong></td>
                <td>${c.cantidad} unids</td>
                <td>S/ ${parseFloat(c.costo).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar historial compras:", error);
    }
}

// ============================================================================
// SECCIÓN 4: ENTREGAR MERCADERÍA A UN VENDEDOR
// ============================================================================

/**
 * Muestra el stock disponible en almacén general para el producto seleccionado.
 * Almacén = Total Comprado - Total Entregado a vendedores
 */
async function actualizarInfoAlmacenEntrega() {
    const productoId = parseInt(document.getElementById("entregaProductoSelect").value);
    const labelStock = document.getElementById("entregaAlmacenStockInfo");

    if (!productoId) {
        labelStock.textContent = "Stock en almacén: -";
        return;
    }

    try {
        // Consultamos total comprado
        const { data: compras } = await db.from("compras").select("cantidad").eq("producto_id", productoId);
        const totalComprado = (compras || []).reduce((sum, item) => sum + item.cantidad, 0);

        // Consultamos total entregado previamente
        const { data: entregas } = await db.from("entregas").select("cantidad").eq("producto_id", productoId);
        const totalEntregado = (entregas || []).reduce((sum, item) => sum + item.cantidad, 0);

        const stockAlmacen = totalComprado - totalEntregado;
        labelStock.innerHTML = `Stock disponible en almacén: <strong>${stockAlmacen} unidades</strong> (Comprado: ${totalComprado}, Ya entregado: ${totalEntregado})`;
    } catch (error) {
        console.error("Error al calcular stock almacén:", error);
    }
}

/**
 * Guarda una nueva entrega en la tabla "entregas".
 */
async function registrarEntrega(event) {
    event.preventDefault();

    const vendedor_id = parseInt(document.getElementById("entregaVendedorSelect").value);
    const producto_id = parseInt(document.getElementById("entregaProductoSelect").value);
    const cantidad = parseInt(document.getElementById("entregaCantidadInput").value);
    const fecha = document.getElementById("entregaFechaInput").value || new Date().toISOString();

    if (!vendedor_id || !producto_id || isNaN(cantidad) || cantidad <= 0) {
        mostrarToast("Completa todos los datos de la entrega", "error");
        return;
    }

    try {
        const { error } = await db.from("entregas").insert([{
            vendedor_id,
            producto_id,
            cantidad,
            fecha
        }]);

        if (error) throw error;

        mostrarToast("Mercadería entregada al vendedor con éxito", "success");
        document.getElementById("formEntrega").reset();
        establecerFechasPorDefecto();
        await cargarHistorialEntregas();
        await actualizarOpcionesProductosVenta();
        await cargarCuadreYStock();
    } catch (error) {
        console.error("Error al registrar entrega:", error);
        mostrarToast("Error al registrar entrega: " + error.message, "error");
    }
}

/**
 * Carga el historial de las últimas 10 entregas realizadas.
 */
async function cargarHistorialEntregas() {
    const tbody = document.getElementById("tablaHistorialEntregasBody");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">Cargando entregas...</td></tr>';

    try {
        const { data, error } = await db.from("entregas")
            .select("id, cantidad, fecha, vendedores ( nombre ), productos ( nombre )")
            .order("fecha", { ascending: false })
            .limit(10);

        if (error) throw error;

        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">No hay entregas registradas aún.</td></tr>';
            return;
        }

        data.forEach(e => {
            const tr = document.createElement("tr");
            const fechaFormateada = new Date(e.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
            const nombreVend = e.vendedores ? e.vendedores.nombre : `Vendedor #${e.vendedor_id}`;
            const nombreProd = e.productos ? e.productos.nombre : `Producto #${e.producto_id}`;

            tr.innerHTML = `
                <td>${fechaFormateada}</td>
                <td><strong>${nombreVend}</strong></td>
                <td>${nombreProd}</td>
                <td><span class="badge badge-stock">${e.cantidad} unids</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar historial entregas:", error);
    }
}

// ============================================================================
// SECCIÓN 5: REGISTRAR VENTA (CADA VENDEDOR TIENE SU PROPIO STOCK)
// ============================================================================

/**
 * Calcula el stock que tiene el vendedor activo para un producto específico:
 * Stock = Entregas a este vendedor - Ventas hechas por este vendedor
 */
async function obtenerStockVendedorActivo(productoId) {
    if (!vendedorActivo) return 0;

    try {
        // 1. Total entregado al vendedor
        const { data: entregas } = await db.from("entregas")
            .select("cantidad")
            .eq("vendedor_id", vendedorActivo.id)
            .eq("producto_id", productoId);

        const totalEntregado = (entregas || []).reduce((sum, item) => sum + item.cantidad, 0);

        // 2. Total vendido por el vendedor
        // Buscamos las ventas del vendedor
        const { data: ventas } = await db.from("ventas")
            .select("id")
            .eq("vendedor_id", vendedorActivo.id);

        const idsVentas = (ventas || []).map(v => v.id);
        let totalVendido = 0;

        if (idsVentas.length > 0) {
            const { data: detalles } = await db.from("detalle_ventas")
                .select("cantidad")
                .eq("producto_id", productoId)
                .in("venta_id", idsVentas);

            totalVendido = (detalles || []).reduce((sum, item) => sum + item.cantidad, 0);
        }

        return totalEntregado - totalVendido;
    } catch (error) {
        console.error("Error al calcular stock del vendedor:", error);
        return 0;
    }
}

/**
 * Actualiza el selector de productos en la pantalla de ventas
 * mostrando el stock disponible que tiene el vendedor conectado.
 */
async function actualizarOpcionesProductosVenta() {
    const select = document.getElementById("ventaProductoSelect");
    select.innerHTML = '<option value="">-- Elige un producto --</option>';

    if (!vendedorActivo) {
        select.innerHTML = '<option value="">(Inicia sesión como vendedor primero)</option>';
        return;
    }

    for (const p of listaProductos) {
        const stock = await obtenerStockVendedorActivo(p.id);
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.dataset.precio = p.precio;
        opt.dataset.stock = stock;
        opt.dataset.nombre = p.nombre;

        opt.textContent = `${p.nombre} - S/ ${parseFloat(p.precio).toFixed(2)} [Stock: ${stock}]`;
        if (stock <= 0) {
            opt.textContent += " (Agotado)";
            opt.style.color = "#991b1b";
        }
        select.appendChild(opt);
    }

    actualizarPrecioProductoVenta();
}

/**
 * Muestra el stock disponible debajo del selector al cambiar de producto.
 */
function actualizarPrecioProductoVenta() {
    const select = document.getElementById("ventaProductoSelect");
    const stockMsg = document.getElementById("stockDisponibleMsg");
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
        stockMsg.textContent = "Stock disponible: -";
        return;
    }

    const stock = parseInt(selectedOption.dataset.stock || 0);
    const precio = parseFloat(selectedOption.dataset.precio || 0);

    if (stock <= 0) {
        stockMsg.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ No tienes stock de este producto (${stock} unids). Solicita una entrega.</span>`;
    } else {
        stockMsg.innerHTML = `Stock en tu poder: <strong>${stock} unidades</strong> (Precio unitario: S/ ${precio.toFixed(2)})`;
    }
}

/**
 * Agrega un producto seleccionado al carrito temporal de la venta.
 */
function agregarAlCarrito() {
    if (!vendedorActivo) {
        mostrarToast("Debes seleccionar un vendedor activo primero", "error");
        abrirModalAuth();
        return;
    }

    const select = document.getElementById("ventaProductoSelect");
    const cantidadInput = document.getElementById("ventaCantidadInput");
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
        mostrarToast("Elige un dulce para vender", "error");
        return;
    }

    const producto_id = parseInt(selectedOption.value);
    const nombre = selectedOption.dataset.nombre;
    const precio = parseFloat(selectedOption.dataset.precio);
    const stockDisponible = parseInt(selectedOption.dataset.stock);
    const cantidad = parseInt(cantidadInput.value);

    if (isNaN(cantidad) || cantidad <= 0) {
        mostrarToast("Ingresa una cantidad válida mayor a 0", "error");
        return;
    }

    // Calculamos cuánto ya hay en el carrito de este producto
    const yaEnCarrito = carritoVenta
        .filter(item => item.producto_id === producto_id)
        .reduce((sum, item) => sum + item.cantidad, 0);

    if (yaEnCarrito + cantidad > stockDisponible) {
        mostrarToast(`Stock insuficiente. Tienes ${stockDisponible} unids y ya tienes ${yaEnCarrito} en el carrito.`, "error");
        return;
    }

    // Buscamos si ya estaba en el carrito para sumar la cantidad
    const indexExistente = carritoVenta.findIndex(item => item.producto_id === producto_id);
    if (indexExistente >= 0) {
        carritoVenta[indexExistente].cantidad += cantidad;
        carritoVenta[indexExistente].subtotal = carritoVenta[indexExistente].cantidad * precio;
    } else {
        carritoVenta.push({
            producto_id,
            nombre,
            precio,
            cantidad,
            subtotal: cantidad * precio
        });
    }

    // Reseteamos input de cantidad a 1
    cantidadInput.value = 1;
    renderizarCarrito();
}

/**
 * Elimina un elemento del carrito.
 */
function eliminarDelCarrito(index) {
    carritoVenta.splice(index, 1);
    renderizarCarrito();
}

/**
 * Dibuja los productos que están actualmente en el carrito de venta.
 */
function renderizarCarrito() {
    const contenedor = document.getElementById("carritoContainer");
    const totalText = document.getElementById("cartTotalText");

    if (carritoVenta.length === 0) {
        contenedor.innerHTML = '<p style="text-align: center; color: var(--gray-400); padding: 1rem; font-size: 0.85rem;">No has agregado ningún dulce a la venta todavía.</p>';
        totalText.textContent = "S/ 0.00";
        return;
    }

    contenedor.innerHTML = "";
    let total = 0;

    carritoVenta.forEach((item, index) => {
        total += item.subtotal;
        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
            <div>
                <div class="cart-item-name">${item.nombre}</div>
                <div class="cart-item-sub">${item.cantidad} unids x S/ ${item.precio.toFixed(2)} = <strong>S/ ${item.subtotal.toFixed(2)}</strong></div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="eliminarDelCarrito(${index})" title="Quitar">
                🗑️
            </button>
        `;
        contenedor.appendChild(div);
    });

    totalText.textContent = `S/ ${total.toFixed(2)}`;
}

/**
 * Selecciona el método de pago: 'efectivo' o 'yape'.
 */
function seleccionarMetodoPago(metodo) {
    metodoPagoSeleccionado = metodo;
    const cardEfectivo = document.getElementById("labelEfectivo");
    const cardYape = document.getElementById("labelYape");

    if (metodo === 'efectivo') {
        cardEfectivo.className = "radio-card selected-efectivo";
        cardYape.className = "radio-card";
    } else {
        cardEfectivo.className = "radio-card";
        cardYape.className = "radio-card selected-yape";
    }
}

/**
 * Selecciona el estado del pago: 'pagado' o 'debe'.
 */
function seleccionarEstadoPago(estado) {
    estadoPagoSeleccionado = estado;
    const cardPagado = document.getElementById("labelPagado");
    const cardDebe = document.getElementById("labelDebe");
    const deudorField = document.getElementById("deudorFieldGroup");

    if (estado === 'pagado') {
        cardPagado.className = "radio-card selected-pagado";
        cardDebe.className = "radio-card";
        deudorField.style.display = "none";
    } else {
        cardPagado.className = "radio-card";
        cardDebe.className = "radio-card selected-debe";
        deudorField.style.display = "block";
    }
}

/**
 * Procesa la venta e inserta los registros en las tablas "ventas" y "detalle_ventas".
 */
async function procesarVenta() {
    if (!vendedorActivo) {
        mostrarToast("Debes iniciar sesión con un vendedor", "error");
        abrirModalAuth();
        return;
    }

    if (carritoVenta.length === 0) {
        mostrarToast("Agrega al menos un producto al carrito", "error");
        return;
    }

    const nombreDeudor = document.getElementById("nombreDeudorInput").value.trim();
    if (estadoPagoSeleccionado === "debe" && !nombreDeudor) {
        mostrarToast("Ingresa el nombre de quien queda debiendo", "error");
        document.getElementById("nombreDeudorInput").focus();
        return;
    }

    const totalVenta = carritoVenta.reduce((sum, item) => sum + item.subtotal, 0);

    try {
        // 1. Insertamos en la tabla principal "ventas"
        const { data: ventaCreada, error: errorVenta } = await db.from("ventas").insert([{
            vendedor_id: vendedorActivo.id,
            metodo_pago: metodoPagoSeleccionado,
            estado: estadoPagoSeleccionado,
            nombre_deudor: estadoPagoSeleccionado === "debe" ? nombreDeudor : null,
            total: totalVenta,
            fecha: new Date().toISOString()
        }]).select().single();

        if (errorVenta) throw errorVenta;

        // 2. Preparamos las filas para la tabla "detalle_ventas"
        const detalles = carritoVenta.map(item => ({
            venta_id: ventaCreada.id,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio,
            subtotal: item.subtotal
        }));

        const { error: errorDetalle } = await db.from("detalle_ventas").insert(detalles);
        if (errorDetalle) throw errorDetalle;

        mostrarToast(`¡Venta de S/ ${totalVenta.toFixed(2)} guardada exitosamente!`, "success");

        // Limpiamos formulario y carrito
        carritoVenta = [];
        renderizarCarrito();
        document.getElementById("nombreDeudorInput").value = "";
        seleccionarEstadoPago("pagado");
        seleccionarMetodoPago("efectivo");

        // Actualizamos los stocks y las tablas
        await actualizarOpcionesProductosVenta();
        await cargarUltimasVentasVendedor();
        await cargarCuadreYStock();

    } catch (error) {
        console.error("Error al procesar la venta:", error);
        mostrarToast("Error al procesar venta: " + error.message, "error");
    }
}

/**
 * Carga las últimas ventas del vendedor activo para la columna derecha de ventas.
 */
async function cargarUltimasVentasVendedor() {
    const tbody = document.getElementById("tablaUltimasVentasBody");
    if (!vendedorActivo) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">Sin sesión activa.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">Cargando ventas...</td></tr>';

    try {
        const { data, error } = await db.from("ventas")
            .select(`
                id, metodo_pago, estado, nombre_deudor, total, fecha,
                detalle_ventas ( cantidad, productos ( nombre ) )
            `)
            .eq("vendedor_id", vendedorActivo.id)
            .order("fecha", { ascending: false })
            .limit(5);

        if (error) throw error;

        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">No tienes ventas registradas hoy.</td></tr>';
            return;
        }

        data.forEach(v => {
            const tr = document.createElement("tr");
            const hora = new Date(v.fecha).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
            const badgeMetodo = v.metodo_pago === "yape" 
                ? '<span class="badge badge-yape">Yape</span>' 
                : '<span class="badge badge-efectivo">Efectivo</span>';
            const badgeEstado = v.estado === "pagado"
                ? '<span class="badge badge-pagado">Pagado</span>'
                : `<span class="badge badge-debe">Debe (${v.nombre_deudor || 'Cliente'})</span>`;

            // Resumen de productos vendidos
            const prods = (v.detalle_ventas || [])
                .map(d => `${d.cantidad}x ${d.productos ? d.productos.nombre : 'Dulce'}`)
                .join(", ");

            tr.innerHTML = `
                <td>${hora}</td>
                <td><strong>S/ ${parseFloat(v.total).toFixed(2)}</strong></td>
                <td>${badgeMetodo}</td>
                <td>${badgeEstado}</td>
                <td style="font-size:0.8rem; color:var(--gray-600);">${prods || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar últimas ventas:", error);
    }
}

// ============================================================================
// SECCIÓN 6: CUADRE DEL DÍA, DEUDAS Y STOCK POR VENDEDOR
// ============================================================================

/**
 * Carga todo el resumen del cuadre del día:
 * - Efectivo total del día.
 * - Yape total del día.
 * - Total de deudas pendientes.
 * - Stock de cada vendedor.
 * - Listado de deudores.
 */
async function cargarCuadreYStock() {
    const fechaFiltro = document.getElementById("cuadreFechaInput").value;
    const vendedorFiltro = document.getElementById("cuadreVendedorSelect").value;

    if (!fechaFiltro) return;

    // Rango de fechas: inicio y fin del día seleccionado
    const inicioDia = `${fechaFiltro}T00:00:00.000Z`;
    const finDia = `${fechaFiltro}T23:59:59.999Z`;

    try {
        // -------------------------------------------------------------
        // 1. OBTENEMOS LAS VENTAS DEL DÍA
        // -------------------------------------------------------------
        let queryVentas = db.from("ventas")
            .select(`
                id, vendedor_id, metodo_pago, estado, nombre_deudor, total, fecha,
                vendedores ( nombre ),
                detalle_ventas ( cantidad, precio_unitario, subtotal, productos ( nombre ) )
            `)
            .gte("fecha", inicioDia)
            .lte("fecha", finDia);

        if (vendedorFiltro !== "todos") {
            queryVentas = queryVentas.eq("vendedor_id", parseInt(vendedorFiltro));
        }

        const { data: ventasDia, error: errorVentas } = await queryVentas.order("fecha", { ascending: false });
        if (errorVentas) throw errorVentas;

        // Calculamos métricas del cuadre
        let totalEfectivo = 0;
        let totalYape = 0;
        let totalDeuda = 0;

        (ventasDia || []).forEach(v => {
            const monto = parseFloat(v.total) || 0;
            if (v.estado === "debe") {
                totalDeuda += monto;
            } else if (v.metodo_pago === "efectivo") {
                totalEfectivo += monto;
            } else if (v.metodo_pago === "yape") {
                totalYape += monto;
            }
        });

        // Actualizamos tarjetas de métricas
        document.getElementById("cuadreEfectivoText").textContent = `S/ ${totalEfectivo.toFixed(2)}`;
        document.getElementById("cuadreYapeText").textContent = `S/ ${totalYape.toFixed(2)}`;
        document.getElementById("cuadreDeudaText").textContent = `S/ ${totalDeuda.toFixed(2)}`;

        // Renderizamos detalle de ventas del día
        renderizarTablaVentasDetalladas(ventasDia || []);

        // -------------------------------------------------------------
        // 2. OBTENEMOS TODAS LAS DEUDAS PENDIENTES (SIN IMPORTAR LA FECHA)
        // -------------------------------------------------------------
        await cargarTablaDeudores(vendedorFiltro);

        // -------------------------------------------------------------
        // 3. OBTENEMOS EL STOCK ACTUAL DE CADA VENDEDOR
        // -------------------------------------------------------------
        await cargarTablaStockVendedores(vendedorFiltro);

    } catch (error) {
        console.error("Error al cargar cuadre:", error);
    }
}

/**
 * Muestra el listado detallado de todas las ventas realizadas en la fecha.
 */
function renderizarTablaVentasDetalladas(ventas) {
    const tbody = document.getElementById("tablaVentasDetalladasBody");
    tbody.innerHTML = "";

    if (ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--gray-400);">No se registraron ventas en la fecha seleccionada.</td></tr>';
        return;
    }

    ventas.forEach(v => {
        const tr = document.createElement("tr");
        const hora = new Date(v.fecha).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
        const vendedorNombre = v.vendedores ? v.vendedores.nombre : `Vendedor #${v.vendedor_id}`;
        
        const badgeMetodo = v.metodo_pago === "yape" 
            ? '<span class="badge badge-yape">Yape</span>' 
            : '<span class="badge badge-efectivo">Efectivo</span>';

        const badgeEstado = v.estado === "pagado"
            ? '<span class="badge badge-pagado">Pagado</span>'
            : '<span class="badge badge-debe">Debe</span>';

        const productosTexto = (v.detalle_ventas || [])
            .map(d => `${d.cantidad}x ${d.productos ? d.productos.nombre : 'Dulce'}`)
            .join("<br>");

        tr.innerHTML = `
            <td>${hora}</td>
            <td><strong>${vendedorNombre}</strong></td>
            <td>${productosTexto || '-'}</td>
            <td>${badgeMetodo}</td>
            <td>${badgeEstado}</td>
            <td>${v.nombre_deudor || '-'}</td>
            <td><strong>S/ ${parseFloat(v.total).toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Muestra las deudas pendientes (estado = 'debe') con botón para cobrar.
 */
async function cargarTablaDeudores(vendedorFiltro) {
    const tbody = document.getElementById("tablaDeudoresBody");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">Cargando deudas...</td></tr>';

    try {
        let query = db.from("ventas")
            .select("id, vendedor_id, total, nombre_deudor, fecha, vendedores ( nombre )")
            .eq("estado", "debe")
            .order("fecha", { ascending: false });

        if (vendedorFiltro !== "todos") {
            query = query.eq("vendedor_id", parseInt(vendedorFiltro));
        }

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray-400);">🎉 No hay deudas pendientes registradas.</td></tr>';
            return;
        }

        data.forEach(d => {
            const tr = document.createElement("tr");
            const nombreVend = d.vendedores ? d.vendedores.nombre : `Vendedor #${d.vendedor_id}`;

            tr.innerHTML = `
                <td>${nombreVend}</td>
                <td><strong>${d.nombre_deudor || 'Cliente anónimo'}</strong></td>
                <td><strong style="color:var(--warning);">S/ ${parseFloat(d.total).toFixed(2)}</strong></td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="abrirModalCobrarDeuda(${d.id}, '${d.nombre_deudor || 'Cliente'}', ${d.total})">
                        💵 Cobrar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar deudores:", error);
    }
}

/**
 * Calcula y muestra el stock por vendedor:
 * Para cada vendedor y producto: Total Entregas - Total Ventas
 */
async function cargarTablaStockVendedores(vendedorFiltro) {
    const tbody = document.getElementById("tablaStockVendedoresBody");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">Calculando stock...</td></tr>';

    try {
        // Primero intentamos consultar la vista SQL si existe
        let query = db.from("vista_stock_vendedores").select("*");
        if (vendedorFiltro !== "todos") {
            query = query.eq("vendedor_id", parseInt(vendedorFiltro));
        }

        const { data: stockVista, error: errorVista } = await query;

        // Si la vista existe y devolvió datos, la usamos
        if (!errorVista && stockVista && stockVista.length > 0) {
            renderizarFilasStock(stockVista);
            return;
        }

        // Si la vista aún no fue creada en Supabase, calculamos manualmente en JavaScript
        const vendedoresAConsultar = vendedorFiltro === "todos" 
            ? listaVendedores 
            : listaVendedores.filter(v => v.id === parseInt(vendedorFiltro));

        const filasStockManual = [];

        for (const v of vendedoresAConsultar) {
            for (const p of listaProductos) {
                // Entregas al vendedor
                const { data: ent } = await db.from("entregas")
                    .select("cantidad")
                    .eq("vendedor_id", v.id)
                    .eq("producto_id", p.id);
                const totalEntregado = (ent || []).reduce((s, i) => s + i.cantidad, 0);

                // Ventas del vendedor
                const { data: vts } = await db.from("ventas")
                    .select("id")
                    .eq("vendedor_id", v.id);
                const ids = (vts || []).map(x => x.id);

                let totalVendido = 0;
                if (ids.length > 0) {
                    const { data: det } = await db.from("detalle_ventas")
                        .select("cantidad")
                        .eq("producto_id", p.id)
                        .in("venta_id", ids);
                    totalVendido = (det || []).reduce((s, i) => s + i.cantidad, 0);
                }

                filasStockManual.push({
                    vendedor_nombre: v.nombre,
                    producto_nombre: p.nombre,
                    entregado: totalEntregado,
                    vendido: totalVendido,
                    stock_actual: totalEntregado - totalVendido
                });
            }
        }

        renderizarFilasStock(filasStockManual);

    } catch (error) {
        console.error("Error al cargar stock de vendedores:", error);
    }
}

/**
 * Genera el HTML de las filas de la tabla de stock por vendedor.
 */
function renderizarFilasStock(filas) {
    const tbody = document.getElementById("tablaStockVendedoresBody");
    tbody.innerHTML = "";

    if (!filas || filas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">No hay datos de inventario.</td></tr>';
        return;
    }

    filas.forEach(f => {
        const tr = document.createElement("tr");
        const stock = f.stock_actual;
        let badgeClass = "badge-stock";

        if (stock <= 0) {
            badgeClass = "badge-stock-zero";
        }

        tr.innerHTML = `
            <td><strong>${f.vendedor_nombre}</strong></td>
            <td>${f.producto_nombre}</td>
            <td>${f.entregado} unids</td>
            <td>${f.vendido} unids</td>
            <td><span class="badge ${badgeClass}">${stock} unids</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================================
// SECCIÓN 7: MODAL DE COBRO DE DEUDAS
// ============================================================================

function abrirModalCobrarDeuda(ventaId, cliente, total) {
    ventaEnCobroId = ventaId;
    document.getElementById("cobrarDeudaInfo").innerHTML = `
        Registrar pago de <strong>${cliente}</strong> por el monto de 
        <strong style="color:var(--success);">S/ ${parseFloat(total).toFixed(2)}</strong>:
    `;
    seleccionarMetodoCobro('efectivo');
    document.getElementById("modalCobrarDeuda").classList.add("active");
}

function cerrarModalCobrarDeuda() {
    document.getElementById("modalCobrarDeuda").classList.remove("active");
    ventaEnCobroId = null;
}

function seleccionarMetodoCobro(metodo) {
    metodoCobroSeleccionado = metodo;
    const cardEfectivo = document.getElementById("cobrarLabelEfectivo");
    const cardYape = document.getElementById("cobrarLabelYape");

    if (metodo === 'efectivo') {
        cardEfectivo.className = "radio-card selected-efectivo";
        cardYape.className = "radio-card";
    } else {
        cardEfectivo.className = "radio-card";
        cardYape.className = "radio-card selected-yape";
    }
}

/**
 * Actualiza la venta en la base de datos marcándola como pagada con el método elegido.
 */
async function confirmarCobroDeuda() {
    if (!ventaEnCobroId) return;

    try {
        const { error } = await db.from("ventas")
            .update({
                estado: "pagado",
                metodo_pago: metodoCobroSeleccionado
            })
            .eq("id", ventaEnCobroId);

        if (error) throw error;

        mostrarToast("Deuda cancelada y registrada en el cuadre", "success");
        cerrarModalCobrarDeuda();
        await cargarCuadreYStock();
        await cargarUltimasVentasVendedor();
    } catch (error) {
        console.error("Error al cobrar deuda:", error);
        mostrarToast("Error al registrar cobro: " + error.message, "error");
    }
}

// ============================================================================
// SECCIÓN 8: CONTROL DE NAVEGACIÓN Y MODALES
// ============================================================================

/**
 * Cambia la pestaña activa en la interfaz.
 */
function cambiarPestana(targetId, btnElement) {
    // Desactivamos todas las secciones
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
    // Quitamos clase active a todos los botones
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    // Activamos la seleccionada
    document.getElementById(targetId).classList.add("active");
    if (btnElement) btnElement.classList.add("active");

    // Recargar datos frescos según la pestaña
    if (targetId === "cuadreTab") {
        cargarCuadreYStock();
    } else if (targetId === "ventasTab") {
        actualizarOpcionesProductosVenta();
        cargarUltimasVentasVendedor();
    } else if (targetId === "entregasTab") {
        actualizarInfoAlmacenEntrega();
        cargarHistorialEntregas();
    } else if (targetId === "comprasTab") {
        cargarHistorialCompras();
    } else if (targetId === "productosTab") {
        cargarProductos();
    }
}

// Modales
function abrirModalAuth() {
    document.getElementById("modalAuth").classList.add("active");
}

function cerrarModalAuth() {
    document.getElementById("modalAuth").classList.remove("active");
}

function abrirModalConfig() {
    // Si ya hay valores guardados, los mostramos en los inputs
    document.getElementById("configUrlInput").value = localStorage.getItem("dulces_supabase_url") || "";
    document.getElementById("configKeyInput").value = localStorage.getItem("dulces_supabase_anon_key") || "";
    document.getElementById("modalConfig").classList.add("active");
}

function cerrarModalConfig() {
    document.getElementById("modalConfig").classList.remove("active");
}

/**
 * Guarda las credenciales de Supabase ingresadas desde el modal.
 */
function guardarConfiguracionSupabaseForm(event) {
    event.preventDefault();
    const url = document.getElementById("configUrlInput").value.trim();
    const key = document.getElementById("configKeyInput").value.trim();

    if (!url || !key) {
        alert("Por favor llena ambos campos (URL y Anon Key).");
        return;
    }

    guardarCredencialesSupabase(url, key);
    cerrarModalConfig();
    document.getElementById("configAlert").style.display = "none";
    mostrarToast("Conexión con Supabase guardada", "success");
    window.location.reload();
}

/**
 * Muestra una notificación flotante (Toast) en pantalla.
 */
function mostrarToast(mensaje, tipo = "success") {
    const toast = document.getElementById("toastNotification");
    const msgEl = document.getElementById("toastMessage");
    const iconEl = document.getElementById("toastIcon");

    msgEl.textContent = mensaje;
    toast.className = `toast ${tipo === "success" ? "toast-success" : "toast-error"} show`;
    iconEl.textContent = tipo === "success" ? "✅" : "⚠️";

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}
