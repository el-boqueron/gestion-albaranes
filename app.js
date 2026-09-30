/* =========================================================

   GESTIÓN DE ALBARANES

   APP.JS COMPLETO

========================================================= */



import * as pdfjsLib from

    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";



import {

    PDFDocument

} from

    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";





pdfjsLib.GlobalWorkerOptions.workerSrc =

    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";


/* =========================================================
   ACCESO PRIVADO + GOOGLE DRIVE PERMANENTE - V11
========================================================= */

const WORKER_URL = "https://gestion-albaranes-drive.facturaselboqueron.workers.dev";
const CLAVE_SESION_APP = "gestionAlbaranesSesion";
let googleAccessToken = null;

const btnGoogleDrive = document.getElementById("btnGoogleDrive");
const estadoGoogleDrive = document.getElementById("estadoGoogleDrive");
const pantallaLogin = document.getElementById("pantallaLogin");
const formLogin = document.getElementById("formLogin");
const loginUsuario = document.getElementById("loginUsuario");
const loginPassword = document.getElementById("loginPassword");
const btnLogin = document.getElementById("btnLogin");
const estadoLogin = document.getElementById("estadoLogin");
const btnCerrarSesion = document.getElementById("btnCerrarSesion");

function obtenerTokenSesionApp() {
    return localStorage.getItem(CLAVE_SESION_APP) || "";
}

function guardarTokenSesionApp(token) {
    localStorage.setItem(CLAVE_SESION_APP, token);
}

function borrarTokenSesionApp() {
    localStorage.removeItem(CLAVE_SESION_APP);
    googleAccessToken = null;
}

async function peticionWorker(ruta, opciones = {}, requiereSesion = true) {
    const headers = new Headers(opciones.headers || {});
    if (requiereSesion) {
        const tokenSesion = obtenerTokenSesionApp();
        if (!tokenSesion) throw new Error("Sesión no iniciada.");
        headers.set("Authorization", "Bearer " + tokenSesion);
    }
    return fetch(WORKER_URL + ruta, { ...opciones, headers });
}

async function validarSesionApp() {
    const token = obtenerTokenSesionApp();
    if (!token) return false;
    try {
        const respuesta = await peticionWorker("/session");
        return respuesta.ok;
    } catch (error) {
        console.error("No se pudo comprobar la sesión:", error);
        return false;
    }
}

async function obtenerTokenGoogleDesdeWorker() {
    const respuesta = await peticionWorker("/token");
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401 && datos.authenticated === false) {
        borrarTokenSesionApp();
        mostrarLogin();
        throw new Error("La sesión de la aplicación no es válida.");
    }
    if (!respuesta.ok || !datos.access_token) {
        throw new Error(datos.error || "No se pudo obtener acceso a Google Drive.");
    }
    googleAccessToken = datos.access_token;
    return googleAccessToken;
}

async function prepararGoogleDriveAutomatico() {
    try {
        await obtenerTokenGoogleDesdeWorker();
        estadoGoogleDrive.textContent = "Google Drive: conectado automáticamente ✓";
        btnGoogleDrive.textContent = "☁️ Google Drive conectado ✓";
        await sincronizarConGoogleDrive();
    } catch (error) {
        console.error("Error preparando Google Drive:", error);
        estadoGoogleDrive.textContent = "Google Drive: no disponible";
        btnGoogleDrive.textContent = "☁️ Reintentar Google Drive";
    }
}

function mostrarLogin() {
    pantallaLogin.classList.remove("oculto");
    pantallaAccesoUsuario.classList.add("oculto");
}

function mostrarSeleccionAutonomo() {
    pantallaLogin.classList.add("oculto");
    pantallaAccesoUsuario.classList.remove("oculto");
}

formLogin.addEventListener("submit", async event => {
    event.preventDefault();
    estadoLogin.textContent = "";
    btnLogin.disabled = true;
    btnLogin.textContent = "Entrando...";
    try {
        const respuesta = await peticionWorker("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                usuario: loginUsuario.value.trim(),
                password: loginPassword.value
            })
        }, false);
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.token) throw new Error(datos.error || "No se pudo iniciar sesión.");
        guardarTokenSesionApp(datos.token);
        loginPassword.value = "";
        mostrarSeleccionAutonomo();
        await prepararGoogleDriveAutomatico();
    } catch (error) {
        estadoLogin.textContent = error.message || "Usuario o contraseña incorrectos.";
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Iniciar sesión";
    }
});

btnCerrarSesion.addEventListener("click", () => {
    menuSuperior.classList.add("oculto");
    if (!confirm("¿Quieres cerrar la sesión en este dispositivo?")) return;
    borrarTokenSesionApp();
    loginUsuario.value = "";
    loginPassword.value = "";
    estadoLogin.textContent = "";
    mostrarLogin();
});

btnGoogleDrive.addEventListener("click", async () => {
    btnGoogleDrive.disabled = true;
    estadoGoogleDrive.textContent = "Google Drive: conectando...";
    try {
        await prepararGoogleDriveAutomatico();
        if (googleAccessToken) alert("Google Drive está conectado correctamente.");
    } finally {
        btnGoogleDrive.disabled = false;
    }
});

async function iniciarAccesoPrivado() {
    if (await validarSesionApp()) {
        mostrarSeleccionAutonomo();
        await prepararGoogleDriveAutomatico();
    } else {
        borrarTokenSesionApp();
        mostrarLogin();
    }
}

/* =========================================================
   GOOGLE DRIVE - GUARDAR ALBARANES FIRMADOS
========================================================= */

function escaparConsultaDrive(valor) {
    return String(valor)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}

function limpiarNombreDrive(valor) {
    return String(valor || "Sin nombre")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim() || "Sin nombre";
}

async function peticionDrive(url, opciones = {}, reintento = true) {
    if (!googleAccessToken) {
        await obtenerTokenGoogleDesdeWorker();
    }

    const headers = new Headers(opciones.headers || {});
    headers.set("Authorization", "Bearer " + googleAccessToken);

    const respuesta = await fetch(url, { ...opciones, headers });

    if (respuesta.status === 401 && reintento) {
        googleAccessToken = null;
        await obtenerTokenGoogleDesdeWorker();
        return peticionDrive(url, opciones, false);
    }

    return respuesta;
}

async function buscarCarpetaDrive(nombre, parentId = "root") {
    const q = [
        `name = '${escaparConsultaDrive(nombre)}'`,
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false",
        `'${escaparConsultaDrive(parentId)}' in parents`
    ].join(" and ");

    const url =
        "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(q) +
        "&fields=files(id,name)&pageSize=10";

    const respuesta = await peticionDrive(url);

    if (!respuesta.ok) {
        throw new Error("No se pudo buscar la carpeta en Google Drive: " + await respuesta.text());
    }

    const datos = await respuesta.json();
    return datos.files?.[0] || null;
}

async function crearCarpetaDrive(nombre, parentId = "root") {
    const respuesta = await peticionDrive(
        "https://www.googleapis.com/drive/v3/files?fields=id,name",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: nombre,
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentId]
            })
        }
    );

    if (!respuesta.ok) {
        throw new Error("No se pudo crear la carpeta en Google Drive: " + await respuesta.text());
    }

    return respuesta.json();
}

async function obtenerOCrearCarpetaDrive(nombre, parentId = "root") {
    const nombreLimpio = limpiarNombreDrive(nombre);
    const existente = await buscarCarpetaDrive(nombreLimpio, parentId);
    if (existente) return existente.id;

    const creada = await crearCarpetaDrive(nombreLimpio, parentId);
    return creada.id;
}

async function buscarPDFDrive(nombre, parentId) {
    const q = [
        `name = '${escaparConsultaDrive(nombre)}'`,
        "mimeType = 'application/pdf'",
        "trashed = false",
        `'${escaparConsultaDrive(parentId)}' in parents`
    ].join(" and ");

    const url =
        "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(q) +
        "&fields=files(id,name)&pageSize=10";

    const respuesta = await peticionDrive(url);

    if (!respuesta.ok) {
        throw new Error("No se pudo buscar el PDF en Google Drive: " + await respuesta.text());
    }

    const datos = await respuesta.json();
    return datos.files?.[0] || null;
}

async function subirPDFDrive(albaran) {
    if (!googleAccessToken) {
        await obtenerTokenGoogleDesdeWorker();
    }

    const empresa = EMPRESAS[albaran.empresa]?.nombre || albaran.empresa || "Empresa";
    const cliente = albaran.cliente || "Cliente sin nombre";

    const carpetaRaiz = await obtenerOCrearCarpetaDrive("Gestión de Albaranes");
    const carpetaEmpresa = await obtenerOCrearCarpetaDrive(empresa, carpetaRaiz);
    const carpetaCliente = await obtenerOCrearCarpetaDrive(cliente, carpetaEmpresa);

    const nombrePDF = limpiarNombreDrive(albaran.numero || "Albarán") + ".pdf";
    const bytesPDF = dataURLAUint8Array(albaran.pdf);
    const archivoExistente = await buscarPDFDrive(nombrePDF, carpetaCliente);

    let respuesta;

    if (archivoExistente) {
        respuesta = await peticionDrive(
            `https://www.googleapis.com/upload/drive/v3/files/${archivoExistente.id}?uploadType=media&fields=id,name,webViewLink`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/pdf" },
                body: bytesPDF
            }
        );
    }
    else {
        const separador = "gestion_albaranes_" + Date.now();
        const metadata = {
            name: nombrePDF,
            mimeType: "application/pdf",
            parents: [carpetaCliente]
        };

        const cuerpo = new Blob([
            `--${separador}\r\n`,
            "Content-Type: application/json; charset=UTF-8\r\n\r\n",
            JSON.stringify(metadata),
            `\r\n--${separador}\r\n`,
            "Content-Type: application/pdf\r\n\r\n",
            bytesPDF,
            `\r\n--${separador}--`
        ]);

        respuesta = await peticionDrive(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
            {
                method: "POST",
                headers: {
                    "Content-Type": `multipart/related; boundary=${separador}`
                },
                body: cuerpo
            }
        );
    }

    if (!respuesta.ok) {
        throw new Error("No se pudo subir el PDF a Google Drive: " + await respuesta.text());
    }

    const archivoDrive = await respuesta.json();
    return {
        subido: true,
        id: archivoDrive.id,
        nombre: archivoDrive.name,
        enlace: archivoDrive.webViewLink || ""
    };
}

async function registrarSubidaDrive(albaran, resultado) {
    if (!resultado?.subido) return;

    const albaranes = obtenerAlbaranes();
    const indice = albaranes.findIndex(item =>
        item.id === albaran.id && item.empresa === albaran.empresa
    );

    if (indice === -1) return;

    albaranes[indice].driveFileId = resultado.id;
    albaranes[indice].driveNombre = resultado.nombre;
    albaranes[indice].driveEnlace = resultado.enlace;
    albaranes[indice].fechaSubidaDrive = new Date().toISOString();
    albaranes[indice].updatedAt = new Date().toISOString();
    guardarAlbaranes(albaranes);

    if (albaranAbierto && albaranAbierto.id === albaran.id) {
        albaranAbierto = albaranes[indice];
    }
}

/* =========================================================
   SINCRONIZACIÓN ENTRE DISPOSITIVOS - GOOGLE DRIVE
========================================================= */

const NOMBRE_ARCHIVO_SINCRONIZACION = "gestion-albaranes-data.json";
let sincronizacionEnCurso = false;
let temporizadorSincronizacion = null;
let omitirSincronizacionAutomatica = false;

function claveUnicaAlbaran(albaran) {
    return `${albaran.empresa || "boqueron"}::${albaran.numero || albaran.id}`;
}

function fechaActualizacionAlbaran(albaran) {
    const valor = albaran.updatedAt || albaran.fechaFirma || albaran.fechaSubidaDrive || "";
    const tiempo = Date.parse(valor);
    if (Number.isFinite(tiempo)) return tiempo;
    const idNumerico = Number(albaran.id);
    return Number.isFinite(idNumerico) ? idNumerico : 0;
}

function normalizarAlbaranSincronizado(albaran) {
    const copia = { ...albaran };
    if (!copia.empresa) copia.empresa = "boqueron";
    if (!copia.updatedAt) {
        const base = Number(copia.id);
        copia.updatedAt = copia.fechaFirma || copia.fechaSubidaDrive || new Date(Number.isFinite(base) ? base : Date.now()).toISOString();
    }
    return copia;
}

function combinarAlbaranes(locales, remotos) {
    const mapa = new Map();
    for (const original of [...(locales || []), ...(remotos || [])]) {
        if (!original || typeof original !== "object") continue;
        const albaran = normalizarAlbaranSincronizado(original);
        const clave = claveUnicaAlbaran(albaran);
        const existente = mapa.get(clave);
        if (!existente || fechaActualizacionAlbaran(albaran) >= fechaActualizacionAlbaran(existente)) {
            mapa.set(clave, albaran);
        }
    }
    return Array.from(mapa.values());
}

async function buscarArchivoSincronizacionDrive(carpetaRaiz) {
    const q = [
        `name = '${escaparConsultaDrive(NOMBRE_ARCHIVO_SINCRONIZACION)}'`,
        "mimeType = 'application/json'",
        "trashed = false",
        `'${escaparConsultaDrive(carpetaRaiz)}' in parents`
    ].join(" and ");
    const url = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name,modifiedTime)&pageSize=10";
    const respuesta = await peticionDrive(url);
    if (!respuesta.ok) throw new Error("No se pudo buscar el archivo de sincronización: " + await respuesta.text());
    const datos = await respuesta.json();
    return datos.files?.[0] || null;
}

async function descargarDatosSincronizacionDrive(archivo) {
    if (!archivo?.id) return null;
    const respuesta = await peticionDrive(`https://www.googleapis.com/drive/v3/files/${archivo.id}?alt=media`);
    if (!respuesta.ok) throw new Error("No se pudieron descargar los datos sincronizados: " + await respuesta.text());
    return respuesta.json();
}

async function subirDatosSincronizacionDrive(carpetaRaiz, archivoExistente, datos) {
    const contenido = JSON.stringify(datos);
    let respuesta;
    if (archivoExistente?.id) {
        respuesta = await peticionDrive(
            `https://www.googleapis.com/upload/drive/v3/files/${archivoExistente.id}?uploadType=media&fields=id,name,modifiedTime`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body: contenido }
        );
    } else {
        const separador = "gestion_albaranes_sync_" + Date.now();
        const metadata = { name: NOMBRE_ARCHIVO_SINCRONIZACION, mimeType: "application/json", parents: [carpetaRaiz] };
        const cuerpo = new Blob([
            `--${separador}\r\n`, "Content-Type: application/json; charset=UTF-8\r\n\r\n", JSON.stringify(metadata),
            `\r\n--${separador}\r\n`, "Content-Type: application/json; charset=UTF-8\r\n\r\n", contenido,
            `\r\n--${separador}--`
        ]);
        respuesta = await peticionDrive(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime",
            { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${separador}` }, body: cuerpo }
        );
    }
    if (!respuesta.ok) throw new Error("No se pudieron guardar los datos sincronizados: " + await respuesta.text());
    return respuesta.json();
}

async function sincronizarConGoogleDrive() {
    if (sincronizacionEnCurso || !obtenerTokenSesionApp()) return;
    sincronizacionEnCurso = true;
    try {
        if (!googleAccessToken) await obtenerTokenGoogleDesdeWorker();
        const carpetaRaiz = await obtenerOCrearCarpetaDrive("Gestión de Albaranes");
        const archivo = await buscarArchivoSincronizacionDrive(carpetaRaiz);
        const remoto = archivo ? await descargarDatosSincronizacionDrive(archivo) : null;
        const combinados = combinarAlbaranes(obtenerAlbaranes(), Array.isArray(remoto?.albaranes) ? remoto.albaranes : []);
        omitirSincronizacionAutomatica = true;
        try { localStorage.setItem("albaranes", JSON.stringify(combinados)); }
        finally { omitirSincronizacionAutomatica = false; }
        await subirDatosSincronizacionDrive(carpetaRaiz, archivo, {
            version: 1, actualizado: new Date().toISOString(), albaranes: combinados
        });
        actualizarContadorPendientes();
        if (!pantallaPendientes.classList.contains("oculto")) mostrarPendientes();
        if (!pantallaClientes.classList.contains("oculto")) mostrarClientes();
        estadoGoogleDrive.textContent = "Google Drive: conectado y sincronizado ✓";
    } catch (error) {
        console.error("Error sincronizando con Google Drive:", error);
        estadoGoogleDrive.textContent = "Google Drive: conectado · sincronización pendiente";
    } finally {
        sincronizacionEnCurso = false;
    }
}

function programarSincronizacionDrive() {
    if (omitirSincronizacionAutomatica || !obtenerTokenSesionApp()) return;
    clearTimeout(temporizadorSincronizacion);
    temporizadorSincronizacion = setTimeout(() => sincronizarConGoogleDrive(), 800);
}

/* =========================================================

   EMPRESAS

========================================================= */



const EMPRESAS = {



    boqueron: {

        id: "boqueron",

        nombre: "Carlos Eduardo",



        firma: {

            x: 75,

            y: 35,

            ancho: 170

        }

    },



    empresa2: {

        id: "empresa2",

        nombre: "Robinson Rojas Bustos",



        firma: {

            x: 75,

            y: 35,

            ancho: 170

        }

    }



};


const NOMBRE_NEGOCIO = "Pescados El Boquerón";
const CLAVE_CONFIG_EMPRESAS = "configEmpresas";

function cargarConfiguracionEmpresas() {
    try {
        const guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG_EMPRESAS) || "null");
        if (!guardada) return;

        if (typeof guardada.boqueron === "string" && guardada.boqueron.trim()) {
            EMPRESAS.boqueron.nombre = guardada.boqueron.trim();
        }

        if (typeof guardada.empresa2 === "string" && guardada.empresa2.trim()) {
            EMPRESAS.empresa2.nombre = guardada.empresa2.trim();
        }
    } catch (error) {
        console.warn("No se pudo cargar la configuración de autónomos:", error);
    }
}

function guardarConfiguracionEmpresas() {
    localStorage.setItem(
        CLAVE_CONFIG_EMPRESAS,
        JSON.stringify({
            boqueron: EMPRESAS.boqueron.nombre,
            empresa2: EMPRESAS.empresa2.nombre
        })
    );
}

cargarConfiguracionEmpresas();


/* =========================================================

   PANTALLAS

========================================================= */



const pantallaInicio =

    document.getElementById("pantallaInicio");



const pantallaImportacion =

    document.getElementById("pantallaImportacion");



const pantallaPendientes =

    document.getElementById("pantallaPendientes");



const pantallaClientes =

    document.getElementById("pantallaClientes");



const pantallaAlbaranesCliente =

    document.getElementById("pantallaAlbaranesCliente");



const pantallaVisor =

    document.getElementById("pantallaVisor");



const pantallaEmpresas =

    document.getElementById("pantallaEmpresas");

const pantallaConfiguracion =
    document.getElementById("pantallaConfiguracion");

const btnConfiguracion =
    document.getElementById("btnConfiguracion");

const btnCancelarConfiguracion =
    document.getElementById("btnCancelarConfiguracion");

const btnGuardarConfiguracion =
    document.getElementById("btnGuardarConfiguracion");

const nombreAutonomo1 =
    document.getElementById("nombreAutonomo1");

const nombreAutonomo2 =
    document.getElementById("nombreAutonomo2");





/* =========================================================

   CABECERA

========================================================= */



const btnInicio =

    document.getElementById("btnInicio");



const nombreEmpresaActiva =

    document.getElementById("nombreEmpresaActiva");



const empresaDestinoImportacion =

    document.getElementById("empresaDestinoImportacion");



const btnCambiarEmpresa =

    document.getElementById("btnCambiarEmpresa");

const menuSuperior = document.getElementById("menuSuperior");
const pantallaAccesoUsuario = document.getElementById("pantallaAccesoUsuario");
const btnAccesoRobinson = document.getElementById("btnAccesoRobinson");
const btnAccesoCarlos = document.getElementById("btnAccesoCarlos");
const btnUsuarioRobinson = document.getElementById("btnUsuarioRobinson");
const btnUsuarioCarlos = document.getElementById("btnUsuarioCarlos");



const btnCancelarEmpresa =

    document.getElementById("btnCancelarEmpresa");





/* =========================================================

   BOTONES PRINCIPALES

========================================================= */



const btnAnadir =

    document.getElementById("btnAnadir");



const btnAlbaranes =

    document.getElementById("btnAlbaranes");



const btnPendientes =

    document.getElementById("btnPendientes");



const btnVolverImportacion =

    document.getElementById("btnVolverImportacion");



const btnVolverPendientes =

    document.getElementById("btnVolverPendientes");



const btnVolverClientes =

    document.getElementById("btnVolverClientes");



const btnVolverAlbaranesCliente =

    document.getElementById("btnVolverAlbaranesCliente");



const btnVolverVisor =

    document.getElementById("btnVolverVisor");



const btnGuardarPendiente =

    document.getElementById("btnGuardarPendiente");



const btnFirmar =

    document.getElementById("btnFirmar");



const accionesVisor =

    document.getElementById("accionesVisor");





/* =========================================================

   IMPORTACIÓN

========================================================= */



const selectorPDF =

    document.getElementById("selectorPDF");



const estadoLectura =

    document.getElementById("estadoLectura");



const datosAlbaran =

    document.getElementById("datosAlbaran");



const numeroAlbaran =

    document.getElementById("numeroAlbaran");



const clienteAlbaran =

    document.getElementById("clienteAlbaran");



const fechaAlbaran =

    document.getElementById("fechaAlbaran");





/* =========================================================

   PENDIENTES

========================================================= */



const contadorPendientes =

    document.getElementById("contadorPendientes");



const listaPendientes =

    document.getElementById("listaPendientes");



const textoCantidadPendientes =

    document.getElementById("textoCantidadPendientes");





/* =========================================================

   ALBARANES / CLIENTES

========================================================= */



const listaClientes =

    document.getElementById("listaClientes");



const tituloCliente =

    document.getElementById("tituloCliente");



const cantidadAlbaranesCliente =

    document.getElementById("cantidadAlbaranesCliente");



const listaAlbaranesCliente =

    document.getElementById("listaAlbaranesCliente");





/* =========================================================

   VISOR

========================================================= */



const visorNumero =

    document.getElementById("visorNumero");



const visorCliente =

    document.getElementById("visorCliente");



const iframePDF =

    document.getElementById("iframePDF");



let visorPDFRenderizado = null;



function esDispositivoMovil() {

    return (
        window.matchMedia("(max-width: 768px)").matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );

}



function limpiarVisorPDFRenderizado() {

    if (visorPDFRenderizado) {
        visorPDFRenderizado.innerHTML = "";
        visorPDFRenderizado.style.display = "none";
    }

}



async function mostrarPDFEnVisor(pdfDataURL) {

    if (esDispositivoMovil()) {

        iframePDF.style.display = "none";

        if (visorPDFRenderizado) {
            visorPDFRenderizado.style.display = "";
        }

        await mostrarPDFEnVisorMovil(pdfDataURL);
        return;
    }

    limpiarVisorPDFRenderizado();

    iframePDF.style.display = "";
    iframePDF.src = pdfDataURL;
}



async function mostrarPDFEnVisorMovil(pdfDataURL) {

    if (!pdfDataURL) {
        throw new Error("No se encuentra el PDF.");
    }

    const contenedor = iframePDF.parentElement;

    iframePDF.style.display = "none";
    iframePDF.src = "";

    if (!visorPDFRenderizado) {
        visorPDFRenderizado = document.createElement("div");
        visorPDFRenderizado.id = "visorPDFRenderizado";
        visorPDFRenderizado.className = "visor-pdf-renderizado";
        contenedor.appendChild(visorPDFRenderizado);
    }

    visorPDFRenderizado.style.display = "";
    visorPDFRenderizado.innerHTML = "";

    const mensaje = document.createElement("div");
    mensaje.className = "visor-pdf-cargando";
    mensaje.textContent = "Cargando PDF...";
    visorPDFRenderizado.appendChild(mensaje);

    try {
        const bytesPDF = dataURLAUint8Array(pdfDataURL);
        const tarea = pdfjsLib.getDocument({ data: bytesPDF });
        const pdf = await tarea.promise;

        visorPDFRenderizado.innerHTML = "";

        const anchoDisponible = Math.max(
            280,
            contenedor.clientWidth - 20
        );

        for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina++) {
            const pagina = await pdf.getPage(numeroPagina);
            const viewportBase = pagina.getViewport({ scale: 1 });
            const escalaCSS = Math.min(
                2,
                anchoDisponible / viewportBase.width
            );
            const pixelRatio = Math.min(
                window.devicePixelRatio || 1,
                2
            );
            const viewportRender = pagina.getViewport({
                scale: escalaCSS * pixelRatio
            });

            const canvas = document.createElement("canvas");
            canvas.className = "pagina-pdf-renderizada";
            canvas.width = Math.floor(viewportRender.width);
            canvas.height = Math.floor(viewportRender.height);
            canvas.style.width =
                Math.floor(viewportRender.width / pixelRatio) + "px";
            canvas.style.height =
                Math.floor(viewportRender.height / pixelRatio) + "px";

            visorPDFRenderizado.appendChild(canvas);

            const contexto = canvas.getContext("2d", { alpha: false });

            await pagina.render({
                canvasContext: contexto,
                viewport: viewportRender
            }).promise;
        }
    }
    catch (error) {
        console.error("Error mostrando PDF:", error);
        visorPDFRenderizado.innerHTML = "";

        const mensajeError = document.createElement("div");
        mensajeError.className = "visor-pdf-error";
        mensajeError.textContent =
            "No se ha podido visualizar el PDF.";
        visorPDFRenderizado.appendChild(mensajeError);

        throw error;
    }
}





/* =========================================================

   FIRMA

========================================================= */



const pantallaFirma =

    document.getElementById("pantallaFirma");



const canvasFirma =

    document.getElementById("canvasFirma");



const btnBorrarFirma =

    document.getElementById("btnBorrarFirma");



const btnCancelarFirma =

    document.getElementById("btnCancelarFirma");



const btnConfirmarFirma =

    document.getElementById("btnConfirmarFirma");



const textoFirmaAlbaran =

    document.getElementById("textoFirmaAlbaran");





/* =========================================================

   VARIABLES

========================================================= */



let empresaActiva =

    localStorage.getItem("empresaActiva") ||

    "boqueron";



let albaranActual = null;



let archivoActual = null;



let albaranAbierto = null;



let clienteSeleccionado = null;



let origenVisor = "inicio";



let dibujandoFirma = false;



let firmaTieneTrazos = false;



let ultimoPuntoFirma = null;





/* =========================================================

   INICIO

========================================================= */



migrarAlbaranesAntiguos();



actualizarEmpresaVisual();



actualizarContadorPendientes();





/* =========================================================

   BOTÓN INICIO

========================================================= */



btnInicio.addEventListener(

    "click",

    () => {



        pantallaEmpresas

            .classList

            .add("oculto");

        pantallaConfiguracion
            .classList
            .add("oculto");



        pantallaFirma

            .classList

            .add("oculto");



        dibujandoFirma = false;



        ultimoPuntoFirma = null;



        iframePDF.src = "";



        albaranAbierto = null;



        clienteSeleccionado = null;



        origenVisor = "inicio";



        mostrarInicio();



    }

);





/* =========================================================

   EMPRESAS

========================================================= */



btnCambiarEmpresa.addEventListener("click", event => {
    event.stopPropagation();
    menuSuperior.classList.toggle("oculto");
});

document.addEventListener("click", event => {
    if (!event.target.closest(".menu-superior-contenedor")) {
        menuSuperior.classList.add("oculto");
    }
});

function iniciarConUsuario(idEmpresa) {
    if (!EMPRESAS[idEmpresa]) return;
    empresaActiva = idEmpresa;
    localStorage.setItem("empresaActiva", empresaActiva);
    pantallaAccesoUsuario.classList.add("oculto");
    actualizarEmpresaVisual();
    actualizarContadorPendientes();
    mostrarInicio();
}

function solicitarCambioUsuario(idEmpresa) {
    if (!EMPRESAS[idEmpresa] || idEmpresa === empresaActiva) return;
    const nombre = EMPRESAS[idEmpresa].nombre;
    if (confirm("¿Quieres cambiar de usuario a " + nombre + "?")) {
        seleccionarEmpresa(idEmpresa);
    }
}

btnAccesoRobinson.addEventListener("click", () => iniciarConUsuario("empresa2"));
btnAccesoCarlos.addEventListener("click", () => iniciarConUsuario("boqueron"));
btnUsuarioRobinson.addEventListener("click", () => solicitarCambioUsuario("empresa2"));
btnUsuarioCarlos.addEventListener("click", () => solicitarCambioUsuario("boqueron"));

btnCancelarEmpresa.addEventListener(

    "click",

    cerrarSelectorEmpresa

);





const botonesEmpresa =

    document.querySelectorAll(

        ".opcion-empresa"

    );





botonesEmpresa.forEach(

    boton => {



        boton.addEventListener(

            "click",

            () => {



                seleccionarEmpresa(

                    boton.dataset.empresa

                );



            }

        );



    }

);





function seleccionarEmpresa(idEmpresa) {



    if (!EMPRESAS[idEmpresa]) {

        return;

    }



    empresaActiva = idEmpresa;



    clienteSeleccionado = null;



    localStorage.setItem(

        "empresaActiva",

        empresaActiva

    );



    actualizarEmpresaVisual();



    actualizarContadorPendientes();



    cerrarSelectorEmpresa();



    mostrarInicio();



}





function cerrarSelectorEmpresa() {



    pantallaEmpresas

        .classList

        .add("oculto");



}





function actualizarOpcionesEmpresa() {



    botonesEmpresa.forEach(

        boton => {



            boton.classList.toggle(

                "activa",

                boton.dataset.empresa ===

                    empresaActiva

            );



        }

    );



}





function actualizarEmpresaVisual() {



    const empresa =

        EMPRESAS[empresaActiva];



    nombreEmpresaActiva.textContent =

        empresa.nombre;



    empresaDestinoImportacion.textContent =

        empresa.nombre;

    btnUsuarioRobinson.textContent = EMPRESAS.empresa2.nombre;
    btnUsuarioCarlos.textContent = EMPRESAS.boqueron.nombre;
    btnAccesoRobinson.textContent = EMPRESAS.empresa2.nombre;
    btnAccesoCarlos.textContent = EMPRESAS.boqueron.nombre;
    btnUsuarioRobinson.classList.toggle("activo", empresaActiva === "empresa2");
    btnUsuarioCarlos.classList.toggle("activo", empresaActiva === "boqueron");

}





/* =========================================================
   CONFIGURACIÓN DE AUTÓNOMOS
========================================================= */

btnConfiguracion.addEventListener("click", () => {
    menuSuperior.classList.add("oculto");
    nombreAutonomo1.value = EMPRESAS.boqueron.nombre;
    nombreAutonomo2.value = EMPRESAS.empresa2.nombre;
    pantallaConfiguracion.classList.remove("oculto");
});

btnCancelarConfiguracion.addEventListener("click", () => {
    pantallaConfiguracion.classList.add("oculto");
});

btnGuardarConfiguracion.addEventListener("click", () => {
    const nombre1 = nombreAutonomo1.value.trim();
    const nombre2 = nombreAutonomo2.value.trim();

    if (!nombre1 || !nombre2) {
        alert("Los dos autónomos deben tener un nombre.");
        return;
    }

    EMPRESAS.boqueron.nombre = nombre1;
    EMPRESAS.empresa2.nombre = nombre2;
    guardarConfiguracionEmpresas();
    actualizarTextosEmpresas();
    actualizarEmpresaVisual();
    actualizarContadorPendientes();
    pantallaConfiguracion.classList.add("oculto");
    alert("Configuración guardada correctamente.");
});

function actualizarTextosEmpresas() {
    document.querySelectorAll(".opcion-empresa").forEach(boton => {
        const empresa = EMPRESAS[boton.dataset.empresa];
        const texto = boton.querySelector("strong");
        if (empresa && texto) texto.textContent = empresa.nombre;
    });
}

actualizarTextosEmpresas();


/* =========================================================

   NAVEGACIÓN

========================================================= */



function ocultarPantallas() {



    pantallaInicio

        .classList

        .add("oculto");



    pantallaImportacion

        .classList

        .add("oculto");



    pantallaPendientes

        .classList

        .add("oculto");



    pantallaClientes

        .classList

        .add("oculto");



    pantallaAlbaranesCliente

        .classList

        .add("oculto");



    pantallaVisor

        .classList

        .add("oculto");



}





function mostrarInicio() {



    ocultarPantallas();



    iframePDF.src = "";



    albaranAbierto = null;



    origenVisor = "inicio";



    accionesVisor.style.display = "";



    btnFirmar.style.display = "";



    pantallaInicio

        .classList

        .remove("oculto");



    actualizarEmpresaVisual();



    actualizarContadorPendientes();



}





function mostrarImportacion() {



    ocultarPantallas();



    actualizarEmpresaVisual();



    pantallaImportacion

        .classList

        .remove("oculto");



}





function mostrarPantallaPendientes() {



    ocultarPantallas();



    pantallaPendientes

        .classList

        .remove("oculto");



    cargarListaPendientes();



}





function mostrarPantallaClientes() {



    ocultarPantallas();



    pantallaClientes

        .classList

        .remove("oculto");



    cargarClientes();



}





function mostrarPantallaAlbaranesCliente() {



    if (!clienteSeleccionado) {



        mostrarPantallaClientes();



        return;



    }



    ocultarPantallas();



    pantallaAlbaranesCliente

        .classList

        .remove("oculto");



    cargarAlbaranesCliente();



}





function mostrarVisor() {



    ocultarPantallas();



    pantallaVisor

        .classList

        .remove("oculto");



}





/* =========================================================

   BOTONES VOLVER

========================================================= */



btnVolverImportacion.addEventListener(

    "click",

    mostrarInicio

);





btnVolverPendientes.addEventListener(

    "click",

    mostrarInicio

);





btnVolverClientes.addEventListener(

    "click",

    mostrarInicio

);





btnVolverAlbaranesCliente.addEventListener(

    "click",

    mostrarPantallaClientes

);





btnVolverVisor.addEventListener(

    "click",

    () => {



        iframePDF.src = "";



        albaranAbierto = null;



        accionesVisor.style.display = "";



        btnFirmar.style.display = "";





        if (origenVisor === "cliente") {



            mostrarPantallaAlbaranesCliente();



            return;



        }





        if (origenVisor === "pendientes") {



            mostrarPantallaPendientes();



            return;



        }





        mostrarInicio();



    }

);





/* =========================================================

   AÑADIR ALBARÁN

========================================================= */



btnAnadir.addEventListener(

    "click",

    () => {



        selectorPDF.value = "";



        selectorPDF.click();



    }

);





selectorPDF.addEventListener(

    "change",

    async event => {



        const archivo =

            event.target.files[0];



        if (!archivo) {

            return;

        }





        const esPDF =

            archivo.type ===

                "application/pdf"

            ||

            archivo.name

                .toLowerCase()

                .endsWith(".pdf");





        if (!esPDF) {



            alert(

                "Selecciona un archivo PDF."

            );



            return;



        }





        archivoActual = archivo;



        mostrarImportacion();



        await leerAlbaranPDF(

            archivo

        );



    }

);





/* =========================================================

   LEER PDF

========================================================= */



async function leerAlbaranPDF(archivo) {



    try {



        estadoLectura

            .classList

            .remove("error");



        estadoLectura.textContent =

            "Leyendo albarán...";



        datosAlbaran

            .classList

            .add("oculto");





        const buffer =

            await archivo.arrayBuffer();





        const pdf =

            await pdfjsLib

                .getDocument({

                    data: buffer

                })

                .promise;





        let textoCompleto = "";





        for (

            let paginaNumero = 1;

            paginaNumero <= pdf.numPages;

            paginaNumero++

        ) {



            const pagina =

                await pdf.getPage(

                    paginaNumero

                );





            const contenido =

                await pagina

                    .getTextContent();





            /*

               IMPORTANTE:



               Conservamos mejor la estructura del PDF.



               Antes uníamos todo con espacios y eso hacía

               difícil saber dónde terminaba el cliente.



               Ahora detectamos los cambios verticales

               entre los elementos del PDF y añadimos

               saltos de línea.

            */



            let ultimaY = null;



            let textoPagina = "";





            contenido.items.forEach(

                item => {



                    const y =

                        item.transform

                            ? item.transform[5]

                            : null;





                    if (

                        ultimaY !== null &&

                        y !== null &&

                        Math.abs(

                            y - ultimaY

                        ) > 4

                    ) {



                        textoPagina += "\n";



                    }

                    else if (

                        textoPagina.length > 0

                    ) {



                        textoPagina += " ";



                    }





                    textoPagina +=

                        item.str;





                    if (y !== null) {



                        ultimaY = y;



                    }



                }

            );





            textoCompleto +=

                textoPagina +

                "\n";



        }





        const datos =

            extraerDatosAlbaran(

                textoCompleto

            );





        albaranActual = {



            ...datos,



            nombreArchivo:

                archivo.name,



            estado:

                "pendiente",



            empresa:

                empresaActiva



        };





        mostrarDatos(

            datos

        );



    }

    catch (error) {



        console.error(error);



        estadoLectura.textContent =

            "No se ha podido leer el albarán.";



        estadoLectura

            .classList

            .add("error");



    }



}





/* =========================================================

   EXTRAER DATOS

========================================================= */



function extraerDatosAlbaran(texto) {

    if (empresaActiva === "empresa2") {
        return extraerDatosAlbaranRobinson(texto);
    }

    return extraerDatosAlbaranCarlos(texto);

}


/* =========================================================

   EXTRAER DATOS - ROBINSON ROJAS BUSTOS

========================================================= */

function extraerDatosAlbaranRobinson(texto) {

    const lineas = texto
        .split(/\r?\n/)
        .map(linea => linea.replace(/\s+/g, " ").trim())
        .filter(linea => linea.length > 0);

    const textoLimpio = lineas.join(" ");

    const coincidenciaNumero = textoLimpio.match(
        /Número\s+de\s+albarán\s*:\s*(AL-\d{4}-\d+)/i
    );

    const numero = coincidenciaNumero
        ? coincidenciaNumero[1]
        : "No detectado";

    const coincidenciaFecha = textoLimpio.match(
        /Fecha\s*:\s*(\d{2}\/\d{2}\/\d{4})/i
    ) || textoLimpio.match(
        /\b(\d{2}\/\d{2}\/\d{4})\b/
    );

    const fecha = coincidenciaFecha
        ? coincidenciaFecha[1]
        : "No detectada";

    let cliente = "No detectado";

    /*
       En el formato de Robinson el cliente está delimitado
       por "Cliente:" y el NIF del propio cliente. Usamos
       primero esa estructura para evitar que la fecha, que
       internamente puede aparecer justo después de Cliente,
       sea confundida con el nombre.
    */
    const posicionCliente = textoLimpio.search(/Cliente\s*:/i);

    if (posicionCliente !== -1) {
        const zonaCliente = textoLimpio.substring(posicionCliente);
        const coincidenciaCliente = zonaCliente.match(
            /Cliente\s*:\s*(?:Fecha\s*:\s*\d{2}\/\d{2}\/\d{4}\s*)?(.+?)\s+NIF\s*:/i
        );

        if (coincidenciaCliente && coincidenciaCliente[1]) {
            let candidato = coincidenciaCliente[1]
                .replace(/^Fecha\s*:\s*\d{2}\/\d{2}\/\d{4}\s*/i, "")
                .trim();

            candidato = limpiarNombreCliente(candidato);

            if (esNombreClienteValido(candidato)) {
                cliente = candidato;
            }
        }
    }

    /*
       Respaldo por líneas: ignoramos expresamente Fecha,
       NIF, direcciones y otros campos que no son cliente.
    */
    if (cliente === "No detectado") {
        const indiceCliente = lineas.findIndex(
            linea => /^Cliente\s*:/i.test(linea)
        );

        if (indiceCliente !== -1) {
            const mismaLinea = lineas[indiceCliente]
                .replace(/^Cliente\s*:\s*/i, "")
                .trim();

            if (
                mismaLinea &&
                !/^Fecha\s*:/i.test(mismaLinea) &&
                esNombreClienteValido(mismaLinea)
            ) {
                cliente = limpiarNombreCliente(mismaLinea);
            }

            if (cliente === "No detectado") {
                for (
                    let i = indiceCliente + 1;
                    i < Math.min(indiceCliente + 10, lineas.length);
                    i++
                ) {
                    const candidato = limpiarNombreCliente(lineas[i]);

                    if (/^Fecha\s*:/i.test(candidato)) continue;

                    if (esNombreClienteValido(candidato)) {
                        cliente = candidato;
                        break;
                    }
                }
            }
        }
    }

    return {
        numero,
        cliente,
        fecha
    };

}


/* =========================================================

   EXTRAER DATOS - CARLOS EDUARDO

========================================================= */

function extraerDatosAlbaranCarlos(texto) {



    /*

       Conservamos las líneas porque en los albaranes

       de El Boquerón el nombre del cliente aparece

       en una línea propia después del número.

    */



    const lineas =

        texto

            .split(/\r?\n/)

            .map(

                linea =>

                    linea

                        .replace(

                            /\s+/g,

                            " "

                        )

                        .trim()

            )

            .filter(

                linea =>

                    linea.length > 0

            );





    const textoLimpio =

        lineas.join(" ");





    /* -----------------------------------------------------

       NÚMERO DE ALBARÁN

    ----------------------------------------------------- */



    const coincidenciaNumero =

        textoLimpio.match(

            /Número\s+de\s+albarán\s*:\s*(AL-\d{4}-\d+)/i

        );





    const numero =

        coincidenciaNumero

            ? coincidenciaNumero[1]

            : "No detectado";





    /* -----------------------------------------------------

       FECHA

    ----------------------------------------------------- */



    const coincidenciaFecha =

        textoLimpio.match(

            /\b(\d{2}\/\d{2}\/\d{4})\b/

        );





    const fecha =

        coincidenciaFecha

            ? coincidenciaFecha[1]

            : "No detectada";





    /* -----------------------------------------------------

       CLIENTE

    ----------------------------------------------------- */



    let cliente =

        "No detectado";





    /*

       PRIMER MÉTODO:

       buscar la línea donde está "Número de albarán".



       El cliente normalmente aparece justo después.

    */



    const indiceNumero =

        lineas.findIndex(

            linea =>

                /Número\s+de\s+albarán/i

                    .test(linea)

        );





    if (

        indiceNumero !== -1

    ) {



        const lineaNumero =

            lineas[indiceNumero];





        /*

           Caso 1:

           el propio PDF puede haber colocado texto

           después del número en la misma línea.

        */



        const despuesDelNumero =

            lineaNumero.match(

                /Número\s+de\s+albarán\s*:\s*AL-\d{4}-\d+\s+(.+)$/i

            );





        if (

            despuesDelNumero &&

            despuesDelNumero[1]

        ) {



            const candidato =

                limpiarNombreCliente(

                    despuesDelNumero[1]

                );





            if (

                esNombreClienteValido(

                    candidato

                )

            ) {



                cliente =

                    candidato;



            }



        }





        /*

           Caso 2:

           cliente en la siguiente línea.



           Este es el caso del PDF:

           DON RICARMA 2021 SL.

        */



        if (

            cliente ===

            "No detectado"

        ) {



            for (

                let i =

                    indiceNumero + 1;



                i <

                    Math.min(

                        indiceNumero + 6,

                        lineas.length

                    );



                i++

            ) {



                const candidato =

                    limpiarNombreCliente(

                        lineas[i]

                    );





                if (

                    esNombreClienteValido(

                        candidato

                    )

                ) {



                    cliente =

                        candidato;



                    break;



                }



            }



        }



    }





    /*

       MÉTODO ALTERNATIVO:



       Si por la estructura interna de otro PDF

       no se han conservado bien las líneas,

       usamos una búsqueda adicional.

    */



    if (

        cliente ===

        "No detectado" &&

        coincidenciaNumero

    ) {



        const posicion =

            textoLimpio.indexOf(

                coincidenciaNumero[0]

            );





        const despuesNumero =

            textoLimpio

                .substring(

                    posicion +

                    coincidenciaNumero[0].length

                )

                .trim();





        /*

           Buscamos el nombre hasta encontrar

           el comienzo típico de una dirección.



           Se incluyen:

           Calle

           C/

           Avenida

           Avda

           Paseo

           Plaza

           Camino

           Carretera

           Ronda

           etc.

        */



        const coincidenciaCliente =

            despuesNumero.match(

                /^(.+?)(?=\s+(?:Calle|C\/|C\.|Avenida|Avda\.?|Av\.?|Paseo|Pº|Plaza|Pza\.?|Camino|Carretera|Ctra\.?|Ronda|Traves[ií]a|Pol[ií]gono|Pol\.?|Urbanizaci[oó]n|Urb\.?|Glorieta|Gta\.?)\b)/i

            );





        if (

            coincidenciaCliente &&

            coincidenciaCliente[1]

        ) {



            const candidato =

                limpiarNombreCliente(

                    coincidenciaCliente[1]

                );





            if (

                esNombreClienteValido(

                    candidato

                )

            ) {



                cliente =

                    candidato;



            }



        }



    }





    return {

        numero,

        cliente,

        fecha

    };



}





/* =========================================================

   LIMPIAR NOMBRE DE CLIENTE

========================================================= */



function limpiarNombreCliente(

    nombre

) {



    return String(nombre)



        .replace(

            /\s+/g,

            " "

        )



        .trim();



}





/* =========================================================

   COMPROBAR POSIBLE CLIENTE

========================================================= */



function esNombreClienteValido(

    nombre

) {



    if (!nombre) {

        return false;

    }





    const texto =

        nombre.trim();





    if (

        texto.length < 2 ||

        texto.length > 100

    ) {



        return false;



    }





    /*

       Evitamos confundir otros campos

       con el nombre del cliente.

    */



    const camposNoCliente = [



        /^ALBARÁN$/i,



        /^CONCEPTO\b/i,



        /^UDS\.?$/i,



        /^BASE\b/i,



        /^IVA\b/i,



        /^TOTAL\b/i,



        /^NIF\s*:/i,



        /^Telf\s*:/i,



        /^Tel[eé]fono\s*:/i,



        /^Número\s+de\s+albarán/i,



        /^Fecha\s*:/i,



        /^\d{2}\/\d{2}\/\d{4}$/,



        /^\d{5}\s+/,



        /@/



    ];





    if (

        camposNoCliente.some(

            patron =>

                patron.test(texto)

        )

    ) {



        return false;



    }





    /*

       Evitamos tomar una dirección

       como nombre de cliente.

    */



    if (

        /^(?:Calle|C\/|C\.|Avenida|Avda\.?|Av\.?|Paseo|Pº|Plaza|Pza\.?|Camino|Carretera|Ctra\.?|Ronda|Traves[ií]a|Pol[ií]gono|Pol\.?|Urbanizaci[oó]n|Urb\.?|Glorieta|Gta\.?)\b/i

            .test(texto)

    ) {



        return false;



    }





    return true;



}





/* =========================================================

   MOSTRAR DATOS

========================================================= */



function mostrarDatos(datos) {



    numeroAlbaran.textContent =

        datos.numero;



    clienteAlbaran.textContent =

        datos.cliente;



    fechaAlbaran.textContent =

        datos.fecha;



    estadoLectura.textContent =

        "Documento leído correctamente.";



    datosAlbaran

        .classList

        .remove("oculto");



}





/* =========================================================

   GUARDAR PENDIENTE

========================================================= */



btnGuardarPendiente.addEventListener(

    "click",

    async () => {



        if (

            !albaranActual ||

            !archivoActual

        ) {

            return;

        }





        if (

            albaranActual.numero ===

            "No detectado"

        ) {



            alert(

                "No se ha podido detectar el número del albarán."

            );



            return;



        }





        const albaranes =

            obtenerAlbaranes();





        const yaExiste =

            albaranes.some(

                albaran =>



                    albaran.numero ===

                        albaranActual.numero



                    &&



                    albaran.empresa ===

                        empresaActiva

                    &&

                    albaran.estado !==

                        "eliminado"

            );





        if (yaExiste) {



            alert(

                "El albarán " +

                albaranActual.numero +

                " ya está guardado en " +

                EMPRESAS[

                    empresaActiva

                ].nombre +

                "."

            );



            return;



        }





        try {



            estadoLectura.textContent =

                "Guardando albarán...";





            const pdfBase64 =

                await convertirArchivoBase64(

                    archivoActual

                );





            const nuevoAlbaran = {



                id:

                    Date.now(),



                numero:

                    albaranActual.numero,



                cliente:

                    albaranActual.cliente,



                fecha:

                    albaranActual.fecha,



                estado:

                    "pendiente",



                empresa:

                    empresaActiva,



                nombreArchivo:

                    archivoActual.name,



                pdf:

                    pdfBase64,

                updatedAt:
                    new Date().toISOString()



            };





            albaranes.push(

                nuevoAlbaran

            );





            guardarAlbaranes(

                albaranes

            );





            actualizarContadorPendientes();





            alert(

                "Albarán " +

                nuevoAlbaran.numero +

                " guardado en pendientes."

            );





            albaranActual = null;



            archivoActual = null;



            mostrarInicio();



        }

        catch (error) {



            console.error(error);



            estadoLectura.textContent =

                "No se ha podido guardar.";



            estadoLectura

                .classList

                .add("error");



            alert(

                "Ha ocurrido un error al guardar el albarán."

            );



        }



    }

);





/* =========================================================

   ARCHIVO → BASE64

========================================================= */



function convertirArchivoBase64(

    archivo

) {



    return new Promise(

        (

            resolve,

            reject

        ) => {



            const lector =

                new FileReader();





            lector.onload =

                () => {



                    resolve(

                        lector.result

                    );



                };





            lector.onerror =

                () => {



                    reject(

                        new Error(

                            "Error leyendo el PDF."

                        )

                    );



                };





            lector.readAsDataURL(

                archivo

            );



        }

    );



}





/* =========================================================

   ALMACENAMIENTO

========================================================= */



function obtenerAlbaranes() {



    try {



        const datos =

            localStorage.getItem(

                "albaranes"

            );





        if (!datos) {

            return [];

        }





        return JSON.parse(

            datos

        );



    }

    catch (error) {



        console.error(

            "Error leyendo albaranes:",

            error

        );



        return [];



    }



}





function guardarAlbaranes(

    albaranes

) {



    localStorage.setItem(

        "albaranes",

        JSON.stringify(

            albaranes

        )

    );




    programarSincronizacionDrive();

}





/* =========================================================

   MIGRAR ALBARANES ANTIGUOS

========================================================= */



function migrarAlbaranesAntiguos() {



    const albaranes =

        obtenerAlbaranes();



    let hayCambios =

        false;





    albaranes.forEach(

        albaran => {



            if (!albaran.empresa) {



                albaran.empresa =

                    "boqueron";



                hayCambios =

                    true;



            }



        }

    );





    if (hayCambios) {



        guardarAlbaranes(

            albaranes

        );



    }



}





/* =========================================================

   PENDIENTES

========================================================= */



function obtenerPendientes() {



    return obtenerAlbaranes()



        .filter(

            albaran =>



                albaran.estado ===

                    "pendiente"



                &&



                albaran.empresa ===

                    empresaActiva

        )



        .sort(

            compararNumerosAlbaran

        );



}





function actualizarContadorPendientes() {



    contadorPendientes.textContent =

        obtenerPendientes().length;



}





function compararNumerosAlbaran(

    a,

    b

) {



    return (

        obtenerParteNumerica(

            a.numero

        )

        -

        obtenerParteNumerica(

            b.numero

        )

    );



}





function obtenerParteNumerica(

    numero

) {



    const partes =

        String(numero)

            .split("-");



    const ultimo =

        partes[

            partes.length - 1

        ];



    const valor =

        parseInt(

            ultimo,

            10

        );



    return Number.isNaN(valor)

        ? 0

        : valor;



}





/* =========================================================

   ABRIR PENDIENTES

========================================================= */



btnPendientes.addEventListener(

    "click",

    mostrarPantallaPendientes

);





/* =========================================================

   LISTA PENDIENTES

========================================================= */



function cargarListaPendientes() {



    const pendientes =

        obtenerPendientes();





    listaPendientes.innerHTML = "";





    textoCantidadPendientes.textContent =

        pendientes.length === 1

            ? "1 albarán pendiente"

            : pendientes.length +

              " albaranes pendientes";





    if (

        pendientes.length === 0

    ) {



        listaPendientes.innerHTML = `

            <div class="sin-pendientes">

                No hay albaranes pendientes

                de firma en esta empresa.

            </div>

        `;



        return;



    }





    pendientes.forEach(

        albaran => {



            const tarjeta =

                document.createElement(

                    "article"

                );





            tarjeta.className =

                "tarjeta-albaran";





            tarjeta.innerHTML = `



                <div class="fila-tarjeta">



                    <div>



                        <p class="numero-tarjeta">

                            ${escaparHTML(

                                albaran.numero

                            )}

                        </p>



                        <p class="cliente-tarjeta">

                            ${escaparHTML(

                                albaran.cliente

                            )}

                        </p>



                        <p class="fecha-tarjeta">

                            ${escaparHTML(

                                albaran.fecha

                            )}

                        </p>



                    </div>



                    <span class="etiqueta-pendiente">

                        Pendiente

                    </span>



                </div>



                <div class="acciones-pendiente">

                    <button

                        class="boton-abrir"

                        data-id="${albaran.id}"

                        type="button"

                    >

                        Abrir y firmar

                    </button>

                    <button

                        class="boton-borrar-pendiente"

                        data-id="${albaran.id}"

                        type="button"

                        title="Borrar albarán"

                        aria-label="Borrar albarán ${escaparHTML(albaran.numero)}"

                    >

                        🗑️

                    </button>

                </div>

            `;





            listaPendientes.appendChild(

                tarjeta

            );



        }

    );





    listaPendientes

        .querySelectorAll(

            ".boton-abrir"

        )

        .forEach(

            boton => {



                boton.addEventListener(

                    "click",

                    () => {



                        abrirAlbaranPendiente(

                            Number(

                                boton.dataset.id

                            )

                        );



                    }

                );



            }

        );






    listaPendientes

        .querySelectorAll(

            ".boton-borrar-pendiente"

        )

        .forEach(

            boton => {



                boton.addEventListener(

                    "click",

                    () => {



                        borrarAlbaranPendiente(

                            Number(

                                boton.dataset.id

                            )

                        );



                    }

                );



            }

        );



}



function borrarAlbaranPendiente(id) {

    const albaranes = obtenerAlbaranes();

    const indice = albaranes.findIndex(
        albaran =>
            albaran.id === id
            &&
            albaran.empresa === empresaActiva
            &&
            albaran.estado === "pendiente"
    );

    if (indice === -1) return;

    const albaran = albaranes[indice];

    const confirmado = confirm(
        "¿Seguro que quieres borrar el albarán "
        + albaran.numero
        + "?\n\nPodrás corregirlo y volverlo a subir después."
    );

    if (!confirmado) return;

    /*
       Se conserva una marca mínima de borrado para sincronizarla.
       Así Google Drive u otro dispositivo no puede resucitar
       una copia antigua del albarán.
    */
    const ahora = new Date().toISOString();

    albaranes[indice] = {
        id: albaran.id,
        numero: albaran.numero,
        cliente: albaran.cliente,
        fecha: albaran.fecha,
        empresa: albaran.empresa,
        estado: "eliminado",
        eliminadoAt: ahora,
        updatedAt: ahora
    };

    guardarAlbaranes(albaranes);
    actualizarContadorPendientes();
    cargarListaPendientes();
}





/* =========================================================

   ABRIR ALBARÁN PENDIENTE

========================================================= */



async function abrirAlbaranPendiente(

    id

) {



    const albaran =

        obtenerAlbaranes()

            .find(

                elemento =>



                    elemento.id === id



                    &&



                    elemento.empresa ===

                        empresaActiva

            );





    if (!albaran) {



        alert(

            "No se ha encontrado el albarán."

        );



        return;



    }





    if (!albaran.pdf) {



        alert(

            "No se encuentra el PDF de este albarán."

        );



        return;



    }





    albaranAbierto = albaran;



    origenVisor = "pendientes";





    visorNumero.textContent =

        albaran.numero;





    visorCliente.textContent =

        albaran.cliente +

        " · " +

        albaran.fecha;





    try {

        await mostrarPDFEnVisor(
            albaran.pdf
        );

    }
    catch (error) {

        alert(
            "No se ha podido visualizar el PDF."
        );

        return;

    }





    accionesVisor.style.display = "";



    btnFirmar.style.display = "";





    mostrarVisor();



}





/* =========================================================

   ALBARANES FIRMADOS

========================================================= */



btnAlbaranes.addEventListener(

    "click",

    mostrarPantallaClientes

);





function obtenerFirmadosEmpresa() {



    return obtenerAlbaranes()

        .filter(

            albaran =>



                albaran.estado ===

                    "firmado"



                &&



                albaran.empresa ===

                    empresaActiva

        );



}





/* =========================================================

   LISTA DE CLIENTES

========================================================= */



function cargarClientes() {



    const firmados =

        obtenerFirmadosEmpresa();





    listaClientes.innerHTML = "";





    if (

        firmados.length === 0

    ) {



        listaClientes.innerHTML = `

            <div class="sin-pendientes">

                Todavía no hay albaranes firmados

                en esta empresa.

            </div>

        `;



        return;



    }





    const clientes =

        new Map();





    firmados.forEach(

        albaran => {



            const nombre =

                albaran.cliente ||

                "Cliente sin nombre";





            if (

                !clientes.has(

                    nombre

                )

            ) {



                clientes.set(

                    nombre,

                    []

                );



            }





            clientes

                .get(nombre)

                .push(albaran);



        }

    );





    const nombresClientes =

        Array.from(

            clientes.keys()

        )

        .sort(

            (a, b) =>

                a.localeCompare(

                    b,

                    "es",

                    {

                        sensitivity:

                            "base"

                    }

                )

        );





    nombresClientes.forEach(

        nombre => {



            const albaranesCliente =

                clientes.get(

                    nombre

                );





            const tarjeta =

                document.createElement(

                    "button"

                );





            tarjeta.type = "button";



            tarjeta.className =

                "tarjeta-cliente";





            tarjeta.innerHTML = `



                <span class="icono-cliente">

                    👤

                </span>



                <span class="datos-cliente">



                    <strong>

                        ${escaparHTML(

                            nombre

                        )}

                    </strong>



                    <small>

                        ${

                            albaranesCliente.length === 1

                                ? "1 albarán firmado"

                                : albaranesCliente.length +

                                  " albaranes firmados"

                        }

                    </small>



                </span>



                <span class="flecha-cliente">

                    ›

                </span>

            `;





            tarjeta.addEventListener(

                "click",

                () => {



                    clienteSeleccionado =

                        nombre;



                    mostrarPantallaAlbaranesCliente();



                }

            );





            listaClientes.appendChild(

                tarjeta

            );



        }

    );



}





/* =========================================================

   ALBARANES DE UN CLIENTE

========================================================= */



function cargarAlbaranesCliente() {



    if (!clienteSeleccionado) {

        return;

    }





    const albaranes =

        obtenerFirmadosEmpresa()

            .filter(

                albaran =>

                    albaran.cliente ===

                    clienteSeleccionado

            )

            .sort(

                (a, b) => {



                    const numeroA =

                        obtenerParteNumerica(

                            a.numero

                        );



                    const numeroB =

                        obtenerParteNumerica(

                            b.numero

                        );



                    return numeroB -

                        numeroA;



                }

            );





    tituloCliente.textContent =

        clienteSeleccionado;





    cantidadAlbaranesCliente.textContent =

        albaranes.length === 1

            ? "1 albarán firmado"

            : albaranes.length +

              " albaranes firmados";





    listaAlbaranesCliente.innerHTML = "";





    if (

        albaranes.length === 0

    ) {



        listaAlbaranesCliente.innerHTML = `

            <div class="sin-pendientes">

                No hay albaranes firmados

                para este cliente.

            </div>

        `;



        return;



    }





    albaranes.forEach(

        albaran => {



            const tarjeta =

                document.createElement(

                    "article"

                );





            tarjeta.className =

                "tarjeta-albaran";





            tarjeta.innerHTML = `



                <div class="fila-tarjeta">



                    <div>



                        <p class="numero-tarjeta">

                            ${escaparHTML(

                                albaran.numero

                            )}

                        </p>



                        <p class="fecha-tarjeta">

                            ${escaparHTML(

                                albaran.fecha

                            )}

                        </p>



                    </div>



                    <span class="etiqueta-firmado">

                        ✓ Firmado

                    </span>



                </div>



                <button

                    class="boton-abrir boton-ver-firmado"

                    data-id="${albaran.id}"

                    type="button"

                >

                    Ver albarán

                </button>

            `;





            listaAlbaranesCliente.appendChild(

                tarjeta

            );



        }

    );





    listaAlbaranesCliente

        .querySelectorAll(

            ".boton-ver-firmado"

        )

        .forEach(

            boton => {



                boton.addEventListener(

                    "click",

                    () => {



                        abrirAlbaranFirmado(

                            Number(

                                boton.dataset.id

                            )

                        );



                    }

                );



            }

        );



}





/* =========================================================

   ABRIR ALBARÁN FIRMADO

========================================================= */



async function abrirAlbaranFirmado(

    id

) {



    const albaran =

        obtenerAlbaranes()

            .find(

                elemento =>



                    elemento.id === id



                    &&



                    elemento.empresa ===

                        empresaActiva



                    &&



                    elemento.estado ===

                        "firmado"

            );





    if (!albaran) {



        alert(

            "No se ha encontrado el albarán firmado."

        );



        return;



    }





    if (!albaran.pdf) {



        alert(

            "No se encuentra el PDF firmado."

        );



        return;



    }





    albaranAbierto = albaran;



    origenVisor = "cliente";





    visorNumero.textContent =

        albaran.numero;





    visorCliente.textContent =

        albaran.cliente +

        " · " +

        albaran.fecha +

        " · FIRMADO";





    try {

        await mostrarPDFEnVisor(
            albaran.pdf
        );

    }
    catch (error) {

        alert(
            "No se ha podido visualizar el PDF."
        );

        return;

    }





    accionesVisor.style.display =

        "none";





    mostrarVisor();



}





/* =========================================================

   ABRIR FIRMA

========================================================= */



btnFirmar.addEventListener(

    "click",

    () => {



        if (!albaranAbierto) {

            return;

        }





        if (

            albaranAbierto.estado ===

            "firmado"

        ) {



            return;



        }





        abrirPantallaFirma();



    }

);





function abrirPantallaFirma() {



    limpiarFirma();





    textoFirmaAlbaran.textContent =

        albaranAbierto.numero +

        " · " +

        albaranAbierto.cliente;





    pantallaFirma

        .classList

        .remove("oculto");



}





function cerrarPantallaFirma() {



    dibujandoFirma = false;



    ultimoPuntoFirma = null;





    pantallaFirma

        .classList

        .add("oculto");



}





/* =========================================================

   CANVAS FIRMA

========================================================= */



canvasFirma.width = 900;



canvasFirma.height = 300;





const contextoFirma =

    canvasFirma.getContext(

        "2d"

    );





contextoFirma.lineWidth = 6;



contextoFirma.lineCap = "round";



contextoFirma.lineJoin = "round";



contextoFirma.strokeStyle = "#111111";





canvasFirma.addEventListener(

    "pointerdown",

    iniciarFirma

);





canvasFirma.addEventListener(

    "pointermove",

    dibujarFirma

);





canvasFirma.addEventListener(

    "pointerup",

    terminarFirma

);





canvasFirma.addEventListener(

    "pointercancel",

    terminarFirma

);





canvasFirma.addEventListener(

    "pointerleave",

    event => {



        if (

            event.pointerType ===

            "mouse"

        ) {



            terminarFirma(

                event

            );



        }



    }

);





/* =========================================================

   DIBUJAR FIRMA

========================================================= */



function iniciarFirma(event) {



    event.preventDefault();





    dibujandoFirma = true;



    firmaTieneTrazos = true;





    ultimoPuntoFirma =

        obtenerPuntoCanvas(

            event

        );





    try {



        canvasFirma

            .setPointerCapture(

                event.pointerId

            );



    }

    catch (error) {

    }





    const contexto =

        canvasFirma.getContext(

            "2d"

        );





    contexto.beginPath();



    contexto.arc(

        ultimoPuntoFirma.x,

        ultimoPuntoFirma.y,

        3,

        0,

        Math.PI * 2

    );



    contexto.fillStyle =

        "#111111";



    contexto.fill();



}





function dibujarFirma(event) {



    if (

        !dibujandoFirma ||

        !ultimoPuntoFirma

    ) {

        return;

    }





    event.preventDefault();





    const punto =

        obtenerPuntoCanvas(

            event

        );





    const contexto =

        canvasFirma.getContext(

            "2d"

        );





    contexto.beginPath();



    contexto.moveTo(

        ultimoPuntoFirma.x,

        ultimoPuntoFirma.y

    );



    contexto.lineTo(

        punto.x,

        punto.y

    );



    contexto.stroke();





    ultimoPuntoFirma = punto;



}





function terminarFirma(event) {



    dibujandoFirma = false;



    ultimoPuntoFirma = null;





    if (

        event &&

        event.pointerId !==

            undefined

    ) {



        try {



            canvasFirma

                .releasePointerCapture(

                    event.pointerId

                );



        }

        catch (error) {

        }



    }



}





function obtenerPuntoCanvas(

    event

) {



    const rectangulo =

        canvasFirma

            .getBoundingClientRect();





    const escalaX =

        canvasFirma.width /

        rectangulo.width;





    const escalaY =

        canvasFirma.height /

        rectangulo.height;





    return {



        x:

            (

                event.clientX -

                rectangulo.left

            )

            *

            escalaX,



        y:

            (

                event.clientY -

                rectangulo.top

            )

            *

            escalaY



    };



}





/* =========================================================

   LIMPIAR FIRMA

========================================================= */



function limpiarFirma() {



    const contexto =

        canvasFirma.getContext(

            "2d"

        );





    contexto.clearRect(

        0,

        0,

        canvasFirma.width,

        canvasFirma.height

    );





    firmaTieneTrazos = false;



    dibujandoFirma = false;



    ultimoPuntoFirma = null;



}





btnBorrarFirma.addEventListener(

    "click",

    limpiarFirma

);





btnCancelarFirma.addEventListener(

    "click",

    cerrarPantallaFirma

);





/* =========================================================

   CONFIRMAR FIRMA

========================================================= */



btnConfirmarFirma.addEventListener(

    "click",

    async () => {



        if (!albaranAbierto) {

            return;

        }





        if (!firmaTieneTrazos) {



            alert(

                "Primero tienes que realizar la firma."

            );



            return;



        }





        btnConfirmarFirma.disabled = true;





        const textoAnterior =

            btnConfirmarFirma.textContent;





        btnConfirmarFirma.textContent =

            "Guardando firma...";





        try {



            await firmarPDFActual();





            const numeroFirmado =

                albaranAbierto.numero;



            let mensajeDrive = "";
            btnConfirmarFirma.textContent = "Subiendo a Google Drive...";

            try {
                const resultadoDrive = await subirPDFDrive(albaranAbierto);
                await registrarSubidaDrive(albaranAbierto, resultadoDrive);
                if (resultadoDrive.subido) {
                    mensajeDrive = "\nGuardado también en Google Drive.";
                }
            } catch (errorDrive) {
                console.error("Error subiendo a Google Drive:", errorDrive);
                mensajeDrive = "\nEl PDF quedó guardado en la aplicación, pero no se pudo subir a Google Drive.";
            }





            cerrarPantallaFirma();





            iframePDF.src = "";





            albaranAbierto = null;





            actualizarContadorPendientes();





            mostrarPantallaPendientes();





            alert(

                "Albarán " +

                numeroFirmado +

                " firmado correctamente." +

                mensajeDrive

            );



        }

        catch (error) {



            console.error(

                "Error firmando PDF:",

                error

            );





            alert(

                "No se ha podido guardar la firma en el PDF."

            );



        }

        finally {



            btnConfirmarFirma.disabled =

                false;





            btnConfirmarFirma.textContent =

                textoAnterior;



        }



    }

);





/* =========================================================

   INSERTAR FIRMA EN EL PDF

========================================================= */



async function firmarPDFActual() {



    if (

        !albaranAbierto ||

        !albaranAbierto.pdf

    ) {



        throw new Error(

            "No hay ningún PDF abierto."

        );



    }





    const bytesPDF =

        dataURLAUint8Array(

            albaranAbierto.pdf

        );





    const documentoPDF =

        await PDFDocument.load(

            bytesPDF

        );





    const firmaDataURL =

        canvasFirma.toDataURL(

            "image/png"

        );





    const bytesFirma =

        dataURLAUint8Array(

            firmaDataURL

        );





    const imagenFirma =

        await documentoPDF.embedPng(

            bytesFirma

        );





    const paginas =

        documentoPDF.getPages();





    if (

        paginas.length === 0

    ) {



        throw new Error(

            "El PDF no contiene páginas."

        );



    }





    const pagina =

        paginas[

            paginas.length - 1

        ];





    const {

        width: anchoPagina,

        height: altoPagina

    } =

        pagina.getSize();





    const configuracion =

        EMPRESAS[

            albaranAbierto.empresa

        ]?.firma

        ||

        {

            x: 75,

            y: 82,

            ancho: 170

        };





    const anchoDeseado =

        Math.min(

            configuracion.ancho,

            anchoPagina * 0.32

        );





    const escala =

        anchoDeseado /

        imagenFirma.width;





    let altoFirma =

        imagenFirma.height *

        escala;





    const altoMaximo =

        altoPagina * 0.10;





    let anchoFirma =

        anchoDeseado;





    if (

        altoFirma >

        altoMaximo

    ) {



        const nuevaEscala =

            altoMaximo /

            imagenFirma.height;





        altoFirma =

            altoMaximo;





        anchoFirma =

            imagenFirma.width *

            nuevaEscala;



    }





    const posicionX =

        Math.max(

            10,

            Math.min(

                configuracion.x,

                anchoPagina -

                anchoFirma -

                10

            )

        );





    const posicionY =

        Math.max(

            10,

            Math.min(

                configuracion.y,

                altoPagina -

                altoFirma -

                10

            )

        );





    pagina.drawImage(

        imagenFirma,

        {

            x: posicionX,

            y: posicionY,

            width: anchoFirma,

            height: altoFirma

        }

    );





    const pdfFirmadoBytes =

        await documentoPDF.save();





    const pdfFirmadoBase64 =

        uint8ArrayADataURL(

            pdfFirmadoBytes,

            "application/pdf"

        );





    const albaranes =

        obtenerAlbaranes();





    const indice =

        albaranes.findIndex(

            albaran =>



                albaran.id ===

                    albaranAbierto.id



                &&



                albaran.empresa ===

                    albaranAbierto.empresa

        );





    if (

        indice === -1

    ) {



        throw new Error(

            "No se ha encontrado el albarán almacenado."

        );



    }





    albaranes[indice].pdf =

        pdfFirmadoBase64;





    albaranes[indice].estado =

        "firmado";





    albaranes[indice].fechaFirma =

        new Date().toISOString();



    albaranes[indice].updatedAt =

        new Date().toISOString();





    guardarAlbaranes(

        albaranes

    );





    albaranAbierto =

        albaranes[indice];



}





/* =========================================================

   DATA URL → UINT8ARRAY

========================================================= */



function dataURLAUint8Array(

    dataURL

) {



    const partes =

        dataURL.split(",");





    if (

        partes.length < 2

    ) {



        throw new Error(

            "Formato de archivo incorrecto."

        );



    }





    const binario =

        atob(

            partes[1]

        );





    const bytes =

        new Uint8Array(

            binario.length

        );





    for (

        let i = 0;

        i < binario.length;

        i++

    ) {



        bytes[i] =

            binario.charCodeAt(i);



    }





    return bytes;



}





/* =========================================================

   UINT8ARRAY → DATA URL

========================================================= */



function uint8ArrayADataURL(

    bytes,

    tipoMime

) {



    const tamanoBloque =

        0x8000;





    let binario = "";





    for (

        let i = 0;

        i < bytes.length;

        i += tamanoBloque

    ) {



        const bloque =

            bytes.subarray(

                i,

                Math.min(

                    i + tamanoBloque,

                    bytes.length

                )

            );





        binario +=

            String.fromCharCode.apply(

                null,

                bloque

            );



    }





    return (

        "data:" +

        tipoMime +

        ";base64," +

        btoa(binario)

    );



}





/* =========================================================

   ESCAPAR HTML

========================================================= */



function escaparHTML(valor) {



    return String(valor)



        .replaceAll(

            "&",

            "&amp;"

        )



        .replaceAll(

            "<",

            "&lt;"

        )



        .replaceAll(

            ">",

            "&gt;"

        )



        .replaceAll(

            '"',

            "&quot;"

        )



        .replaceAll(

            "'",

            "&#039;"

        );



}





/* =========================================================

   FIN APP.JS

========================================================= */

window.addEventListener("DOMContentLoaded", () => { iniciarAccesoPrivado(); });
