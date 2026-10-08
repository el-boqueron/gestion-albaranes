/* =========================================================

   GESTIÓN DE ALBARANES

   APP.JS COMPLETO

========================================================= */



import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

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

    if (!token) {
        return {
            valida: false,
            modoOffline: false
        };
    }

    /*
     * Si no hay conexión, conservamos la sesión ya iniciada en este
     * dispositivo y permitimos trabajar con los datos locales.
     */
    if (!navigator.onLine) {
        return {
            valida: true,
            modoOffline: true
        };
    }

    try {
        const respuesta = await peticionWorker("/session");

        if (respuesta.ok) {
            return {
                valida: true,
                modoOffline: false
            };
        }

        /*
         * Solo consideramos inválida la sesión cuando el servidor
         * responde expresamente que no está autorizada.
         */
        if (respuesta.status === 401 || respuesta.status === 403) {
            return {
                valida: false,
                modoOffline: false
            };
        }

        /*
         * Si el servidor o la red fallan temporalmente, no expulsamos
         * al usuario: entramos con la sesión local ya guardada.
         */
        return {
            valida: true,
            modoOffline: true
        };
    }
    catch (error) {
        console.error(
            "No se pudo comprobar la sesión. Se mantiene el acceso local:",
            error
        );

        return {
            valida: true,
            modoOffline: true
        };
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
        iniciarSincronizacionPeriodicaDispositivos();
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
    const sesion = await validarSesionApp();

    if (sesion.valida) {
        mostrarSeleccionAutonomo();

        if (!sesion.modoOffline && navigator.onLine) {
            estadoGoogleDrive.textContent =
                "Sincronizando pendientes entre dispositivos...";

            /*
             * Si este dispositivo arranca sin copia local, no mostramos un
             * 0 provisional que pueda confundirse con que no hay albaranes.
             * El contador definitivo se coloca al terminar la sincronización.
             */
            if (obtenerAlbaranes().length === 0) {
                contadorPendientes.textContent = "…";
            }
        }

        if (sesion.modoOffline || !navigator.onLine) {
            googleAccessToken = null;
            estadoGoogleDrive.textContent =
                "Sin cobertura · trabajando en modo local";
            btnGoogleDrive.textContent =
                "☁️ Google Drive pendiente de conexión";
            return;
        }

        await prepararGoogleDriveAutomatico();
        return;
    }

    borrarTokenSesionApp();
    mostrarLogin();
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

const creacionesCarpetaDriveEnCurso = new Map();

async function obtenerOCrearCarpetaDrive(nombre, parentId = "root") {
    const nombreLimpio = limpiarNombreDrive(nombre);
    const clave = `${parentId}::${nombreLimpio.toLocaleUpperCase("es")}`;

    /*
     * Evita que dos procesos de la propia app (subida del PDF y
     * sincronización) busquen la misma carpeta al mismo tiempo y ambos
     * terminen creándola.
     */
    if (creacionesCarpetaDriveEnCurso.has(clave)) {
        return creacionesCarpetaDriveEnCurso.get(clave);
    }

    const operacion = (async () => {
        const existente =
            await buscarCarpetaDrive(nombreLimpio, parentId);

        if (existente) {
            return existente.id;
        }

        const creada =
            await crearCarpetaDrive(nombreLimpio, parentId);

        return creada.id;
    })();

    creacionesCarpetaDriveEnCurso.set(clave, operacion);

    try {
        return await operacion;
    }
    finally {
        creacionesCarpetaDriveEnCurso.delete(clave);
    }
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
    albaranes[indice].pendienteSubidaDrive = false;
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
let revisionLocalSincronizacion = 0;
let intervaloSincronizacionDispositivos = null;
const CLAVE_SYNC_PENDIENTE = "gestionAlbaranesSyncPendiente";
const INTERVALO_SYNC_DISPOSITIVOS_MS = 2000;
let carpetaRaizSincronizacionCache = null;
let archivoSincronizacionCache = null;
let modifiedTimeSincronizacionConocido = null;
let consultaRemotaEnCurso = false;

function haySincronizacionLocalPendiente() {
    return localStorage.getItem(CLAVE_SYNC_PENDIENTE) === "1";
}

function marcarSincronizacionLocalPendiente() {
    localStorage.setItem(CLAVE_SYNC_PENDIENTE, "1");
    revisionLocalSincronizacion++;
    if (navigator.onLine && obtenerTokenSesionApp()) {
        estadoGoogleDrive.textContent = "Pendientes: sincronizando entre dispositivos...";
    } else if (obtenerTokenSesionApp()) {
        estadoGoogleDrive.textContent = "Sin cobertura · pendientes por sincronizar";
    }
}

function confirmarSincronizacionLocal() {
    localStorage.removeItem(CLAVE_SYNC_PENDIENTE);
}

function iniciarSincronizacionPeriodicaDispositivos() {
    if (intervaloSincronizacionDispositivos) return;
    intervaloSincronizacionDispositivos = setInterval(() => {
        if (!document.hidden && navigator.onLine && obtenerTokenSesionApp()) {
            comprobarCambiosRemotosRapido();
        }
    }, INTERVALO_SYNC_DISPOSITIVOS_MS);
}

async function obtenerReferenciaSincronizacionRapida() {
    if (!googleAccessToken) await obtenerTokenGoogleDesdeWorker();

    if (!carpetaRaizSincronizacionCache) {
        carpetaRaizSincronizacionCache = await obtenerOCrearCarpetaDrive("Gestión de Albaranes");
    }

    if (!archivoSincronizacionCache?.id) {
        archivoSincronizacionCache = await buscarArchivoSincronizacionDrive(carpetaRaizSincronizacionCache);
    }

    return archivoSincronizacionCache;
}

async function comprobarCambiosRemotosRapido(forzar = false) {
    if (!obtenerTokenSesionApp() || !navigator.onLine || consultaRemotaEnCurso || sincronizacionEnCurso) return false;

    consultaRemotaEnCurso = true;
    try {
        const archivo = await obtenerReferenciaSincronizacionRapida();
        if (!archivo?.id) return false;

        const respuestaMeta = await peticionDrive(
            `https://www.googleapis.com/drive/v3/files/${archivo.id}?fields=id,name,modifiedTime`
        );
        if (!respuestaMeta.ok) throw new Error("No se pudo comprobar la sincronización remota: " + await respuestaMeta.text());
        const meta = await respuestaMeta.json();

        if (!forzar && modifiedTimeSincronizacionConocido && meta.modifiedTime === modifiedTimeSincronizacionConocido) {
            return false;
        }

        const remoto = await descargarDatosSincronizacionDrive(meta);
        const combinados = combinarAlbaranes(
            obtenerAlbaranes(),
            Array.isArray(remoto?.albaranes) ? remoto.albaranes : []
        );

        omitirSincronizacionAutomatica = true;
        try {
            localStorage.setItem("albaranes", JSON.stringify(combinados));
        } finally {
            omitirSincronizacionAutomatica = false;
        }

        modifiedTimeSincronizacionConocido = meta.modifiedTime || remoto?.actualizado || new Date().toISOString();
        archivoSincronizacionCache = { ...archivo, ...meta };

        actualizarContadorPendientes();
        if (!pantallaPendientes.classList.contains("oculto")) mostrarPendientes();
        if (!pantallaClientes.classList.contains("oculto")) btnVolverAlbaranesCliente.click();

        if (!haySincronizacionLocalPendiente()) {
            estadoGoogleDrive.textContent = "Google Drive: conectado y sincronizado ✓";
        }
        return true;
    } catch (error) {
        console.error("Error comprobando cambios remotos:", error);
        archivoSincronizacionCache = null;
        return false;
    } finally {
        consultaRemotaEnCurso = false;
    }
}


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

async function subirFirmadosPendientesDrive() {
    const firmados = obtenerAlbaranes().filter(
        albaran =>
            albaran
            && albaran.estado === "firmado"
            && albaran.pdf
    );

    for (const albaran of firmados) {
        try {
            let necesitaSubida =
                albaran.pendienteSubidaDrive === true
                || !albaran.driveFileId
                || !albaran.fechaSubidaDrive;

            /*
             * Recuperación de registros antiguos: una copia sincronizada puede
             * conservar driveFileId/fechaSubidaDrive aunque el PDF real nunca
             * llegara a quedar guardado en la carpeta esperada de Drive.
             * Comprobamos el archivo real antes de darlo por subido.
             */
            if (!necesitaSubida) {
                const archivoReal = await localizarPDFDriveAlbaran(albaran);
                necesitaSubida = !archivoReal;

                if (archivoReal && archivoReal.id !== albaran.driveFileId) {
                    await registrarSubidaDrive(albaran, {
                        subido: true,
                        id: archivoReal.id,
                        nombre: archivoReal.name,
                        enlace: albaran.driveEnlace || ""
                    });
                }
            }

            if (!necesitaSubida) continue;

            const resultado = await subirPDFDrive(albaran);
            await registrarSubidaDrive(albaran, resultado);
        }
        catch (error) {
            console.error(
                "PDF firmado pendiente de sincronizar:",
                albaran.numero,
                error
            );
        }
    }
}



async function sincronizarConGoogleDrive() {
    if (!obtenerTokenSesionApp() || !navigator.onLine) return false;

    if (sincronizacionEnCurso) {
        clearTimeout(temporizadorSincronizacion);
        temporizadorSincronizacion = setTimeout(() => sincronizarConGoogleDrive(), 1200);
        return false;
    }

    sincronizacionEnCurso = true;
    const revisionAlEmpezar = revisionLocalSincronizacion;

    try {
        if (!googleAccessToken) await obtenerTokenGoogleDesdeWorker();

        await subirFirmadosPendientesDrive();

        const carpetaRaiz = await obtenerOCrearCarpetaDrive("Gestión de Albaranes");
        carpetaRaizSincronizacionCache = carpetaRaiz;
        let archivo = await buscarArchivoSincronizacionDrive(carpetaRaiz);
        if (archivo?.id) archivoSincronizacionCache = archivo;
        let remoto = archivo ? await descargarDatosSincronizacionDrive(archivo) : null;

        /*
         * Antes de mezclar, volvemos a consultar el archivo de Drive. Esto
         * reduce la ventana en la que otro móvil/ordenador puede haber escrito
         * un alta, una firma o un borrado después de nuestra primera lectura.
         */
        const archivoMasReciente = await buscarArchivoSincronizacionDrive(carpetaRaiz);
        if (archivoMasReciente?.id) {
            archivo = archivoMasReciente;
            remoto = await descargarDatosSincronizacionDrive(archivoMasReciente);
        }

        /*
         * Se vuelve a leer el estado local justo antes de combinar para no
         * perder un albarán que se haya guardado mientras la sincronización
         * estaba esperando respuestas de red.
         */
        const combinados = combinarAlbaranes(
            obtenerAlbaranes(),
            Array.isArray(remoto?.albaranes) ? remoto.albaranes : []
        );

        omitirSincronizacionAutomatica = true;
        try {
            localStorage.setItem("albaranes", JSON.stringify(combinados));
        }
        finally {
            omitirSincronizacionAutomatica = false;
        }

        const resultadoSubidaSync = await subirDatosSincronizacionDrive(carpetaRaiz, archivo, {
            version: 1,
            actualizado: new Date().toISOString(),
            albaranes: combinados
        });
        if (resultadoSubidaSync?.id) {
            archivoSincronizacionCache = resultadoSubidaSync;
            modifiedTimeSincronizacionConocido = resultadoSubidaSync.modifiedTime || modifiedTimeSincronizacionConocido;
        }

        /*
         * Verificación rápida: releemos el JSON después de escribir y volvemos
         * a mezclarlo con el estado local. Así un borrado/firma/alta recibido
         * durante la sincronización se refleja sin esperar al siguiente ciclo.
         */
        const archivoVerificacion = await buscarArchivoSincronizacionDrive(carpetaRaiz);
        if (archivoVerificacion?.id) {
            archivoSincronizacionCache = archivoVerificacion;
            modifiedTimeSincronizacionConocido = archivoVerificacion.modifiedTime || modifiedTimeSincronizacionConocido;
            const remotoVerificacion = await descargarDatosSincronizacionDrive(archivoVerificacion);
            const finales = combinarAlbaranes(
                obtenerAlbaranes(),
                Array.isArray(remotoVerificacion?.albaranes) ? remotoVerificacion.albaranes : []
            );
            omitirSincronizacionAutomatica = true;
            try {
                localStorage.setItem("albaranes", JSON.stringify(finales));
            }
            finally {
                omitirSincronizacionAutomatica = false;
            }
        }

        if (revisionLocalSincronizacion === revisionAlEmpezar) {
            confirmarSincronizacionLocal();
        } else {
            clearTimeout(temporizadorSincronizacion);
            temporizadorSincronizacion = setTimeout(() => sincronizarConGoogleDrive(), 500);
        }

        actualizarContadorPendientes();
        if (!pantallaPendientes.classList.contains("oculto")) mostrarPendientes();
        if (!pantallaClientes.classList.contains("oculto")) btnVolverAlbaranesCliente.click();

        estadoGoogleDrive.textContent = haySincronizacionLocalPendiente()
            ? "Pendientes: sincronizando entre dispositivos..."
            : "Google Drive: conectado y sincronizado ✓";

        return true;
    }
    catch (error) {
        console.error("Error sincronizando con Google Drive:", error);
        estadoGoogleDrive.textContent = haySincronizacionLocalPendiente()
            ? "⚠️ Hay cambios pendientes de sincronizar"
            : "Google Drive: conectado · sincronización pendiente";

        clearTimeout(temporizadorSincronizacion);
        temporizadorSincronizacion = setTimeout(() => {
            if (navigator.onLine) sincronizarConGoogleDrive();
        }, 5000);

        return false;
    }
    finally {
        sincronizacionEnCurso = false;
    }
}

function programarSincronizacionDrive() {
    if (omitirSincronizacionAutomatica || !obtenerTokenSesionApp()) return;

    marcarSincronizacionLocalPendiente();
    clearTimeout(temporizadorSincronizacion);

    if (!navigator.onLine) return;

    /* Los pendientes nuevos intentan salir prácticamente al instante. */
    temporizadorSincronizacion = setTimeout(() => sincronizarConGoogleDrive(), 150);
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

const btnCopiaSeguridad =
    document.getElementById("btnCopiaSeguridad");

const pantallaCopiaSeguridad =
    document.getElementById("pantallaCopiaSeguridad");

const btnCrearCopiaSeguridad =
    document.getElementById("btnCrearCopiaSeguridad");

const btnLiberarEspacioDrive =
    document.getElementById("btnLiberarEspacioDrive");

const btnCerrarCopiaSeguridad =
    document.getElementById("btnCerrarCopiaSeguridad");

const estadoCopiaSeguridad =
    document.getElementById("estadoCopiaSeguridad");

let idsUltimaCopiaSeguridad = [];






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


const btnAbrirEn =

    document.getElementById("btnAbrirEn");



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


const listaImportacionMultiple =

    document.getElementById("listaImportacionMultiple");



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
let loteImportacion = [];



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






/* =========================================================
   BOTÓN ATRÁS DEL SISTEMA
   - Dentro de una pantalla: vuelve atrás.
   - En Inicio: dos pulsaciones para salir.
========================================================= */

let ultimaPulsacionAtrasInicio = 0;
let avisoSalidaTimer = null;

function mostrarAvisoSalida() {
    let aviso = document.getElementById("avisoDobleAtrasSalir");

    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "avisoDobleAtrasSalir";
        aviso.textContent = "Pulsa Atrás otra vez para salir";
        Object.assign(aviso.style, {
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            zIndex: "5000",
            background: "rgba(20, 25, 30, 0.92)",
            color: "#fff",
            padding: "11px 16px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: "700",
            boxShadow: "0 4px 14px rgba(0,0,0,.25)",
            pointerEvents: "none"
        });
        document.body.appendChild(aviso);
    }

    aviso.style.display = "block";

    clearTimeout(avisoSalidaTimer);
    avisoSalidaTimer = setTimeout(() => {
        aviso.style.display = "none";
    }, 1800);
}

function registrarEstadoNavegacionApp() {
    if (!history.state?.gestionAlbaranes) {
        history.replaceState(
            { gestionAlbaranes: true, nivel: "inicio" },
            ""
        );
        history.pushState(
            { gestionAlbaranes: true, nivel: "app" },
            ""
        );
    }
}

function estamosEnPantallaInicio() {
    return !pantallaInicio.classList.contains("oculto");
}

function volverDentroDeLaApp() {
    if (!pantallaFirma.classList.contains("oculto")) {
        btnCancelarFirma.click();
        return true;
    }

    if (!pantallaVisor.classList.contains("oculto")) {
        btnVolverVisor.click();
        return true;
    }

    if (!pantallaAlbaranesCliente.classList.contains("oculto")) {
        btnVolverAlbaranesCliente.click();
        return true;
    }

    if (!pantallaClientes.classList.contains("oculto")) {
        mostrarInicio();
        return true;
    }

    if (!pantallaPendientes.classList.contains("oculto")) {
        mostrarInicio();
        return true;
    }

    if (!pantallaImportacion.classList.contains("oculto")) {
        mostrarInicio();
        return true;
    }

    if (!pantallaConfiguracion.classList.contains("oculto")) {
        pantallaConfiguracion.classList.add("oculto");
        return true;
    }

    if (!pantallaCopiaSeguridad.classList.contains("oculto")) {
        pantallaCopiaSeguridad.classList.add("oculto");
        return true;
    }

    if (!pantallaEmpresas.classList.contains("oculto")) {
        pantallaEmpresas.classList.add("oculto");
        return true;
    }

    return false;
}

window.addEventListener("popstate", () => {
    if (volverDentroDeLaApp()) {
        history.pushState(
            { gestionAlbaranes: true, nivel: "app" },
            ""
        );
        return;
    }

    if (estamosEnPantallaInicio()) {
        const ahora = Date.now();

        if (ahora - ultimaPulsacionAtrasInicio <= 1800) {
            ultimaPulsacionAtrasInicio = 0;
            history.back();
            return;
        }

        ultimaPulsacionAtrasInicio = ahora;
        mostrarAvisoSalida();

        history.pushState(
            { gestionAlbaranes: true, nivel: "app" },
            ""
        );
    }
});

window.addEventListener("DOMContentLoaded", () => {
    registrarEstadoNavegacionApp();
});


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
        loteImportacion = [];
        listaImportacionMultiple.innerHTML = "";
        listaImportacionMultiple.classList.add("oculto");
        btnGuardarPendiente.textContent = "Guardar en pendientes";
        btnGuardarPendiente.style.display = "";

        selectorPDF.click();



    }

);





selectorPDF.addEventListener(
    "change",
    async event => {

        const archivos =
            Array.from(event.target.files || []);

        if (!archivos.length) {
            return;
        }

        const noPDF =
            archivos.find(
                archivo =>
                    !(
                        archivo.type === "application/pdf"
                        ||
                        archivo.name.toLowerCase().endsWith(".pdf")
                    )
            );

        if (noPDF) {
            alert("Todos los archivos seleccionados deben ser PDF.");
            return;
        }

        mostrarImportacion();

        loteImportacion = [];
        listaImportacionMultiple.innerHTML = "";
        listaImportacionMultiple.classList.add("oculto");
        datosAlbaran.classList.add("oculto");

        if (archivos.length === 1) {
            archivoActual = archivos[0];
            btnGuardarPendiente.textContent = "Guardar en pendientes";
            await leerAlbaranPDF(archivos[0]);
            return;
        }

        archivoActual = null;
        albaranActual = null;
        btnGuardarPendiente.textContent = "Añadir todos a pendientes";

        const existentes = obtenerAlbaranes();
        const numerosLote = new Set();

        for (let i = 0; i < archivos.length; i++) {
            const archivo = archivos[i];

            estadoLectura.classList.remove("error");
            estadoLectura.textContent =
                "Leyendo " + (i + 1) + " de " + archivos.length + "...";

            albaranActual = null;
            await leerAlbaranPDF(archivo);

            if (!albaranActual) {
                loteImportacion.push({
                    archivo,
                    valido: false,
                    error: estadoLectura.textContent
                });
                continue;
            }

            const datos = { ...albaranActual };
            let error = "";

            if (datos.numero === "No detectado") {
                error = "No se ha podido detectar el número del albarán.";
            }
            else if (
                existentes.some(
                    item =>
                        item.numero === datos.numero
                        &&
                        item.empresa === empresaActiva
                        &&
                        item.estado !== "eliminado"
                )
            ) {
                error = "Ya está guardado.";
            }
            else if (numerosLote.has(datos.numero)) {
                error = "Está repetido dentro de esta selección.";
            }

            if (!error) {
                numerosLote.add(datos.numero);
            }

            loteImportacion.push({
                archivo,
                datos,
                valido: !error,
                error
            });
        }

        albaranActual = null;
        datosAlbaran.classList.add("oculto");
        mostrarResultadoLoteImportacion();
    }
);


function escaparHTMLImportacion(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function mostrarResultadoLoteImportacion() {
    const validos =
        loteImportacion.filter(item => item.valido).length;

    const errores =
        loteImportacion.length - validos;

    estadoLectura.classList.toggle("error", validos === 0);
    estadoLectura.textContent =
        validos + " albarán" + (validos === 1 ? "" : "es") +
        " listo" + (validos === 1 ? "" : "s") +
        " para añadir" +
        (errores ? " · " + errores + " con error" : "") +
        ".";

    listaImportacionMultiple.innerHTML =
        loteImportacion.map((item, indice) => {
            const datos = item.datos || {};
            const clase = item.valido
                ? "item-importacion-multiple valido"
                : "item-importacion-multiple error";

            const detalle = item.valido
                ? `
                    <div class="contenido-item-importacion">
                        <div><strong>${escaparHTMLImportacion(datos.numero)}</strong></div>
                        <div>${escaparHTMLImportacion(datos.cliente)}</div>
                        <div>${escaparHTMLImportacion(datos.fecha)}</div>
                    </div>
                    <div class="acciones-item-importacion">
                        <button
                            type="button"
                            class="boton-anadir-individual"
                            data-indice="${indice}"
                        >Añadir</button>
                        <button
                            type="button"
                            class="boton-eliminar-lote"
                            data-indice="${indice}"
                            aria-label="Quitar de la lista"
                            title="Quitar de la lista"
                        >🗑️</button>
                    </div>
                  `
                : `
                    <div class="contenido-item-importacion">
                        <div><strong>${escaparHTMLImportacion(item.archivo.name)}</strong></div>
                        <div class="texto-error-importacion">${escaparHTMLImportacion(item.error)}</div>
                    </div>
                    <div class="acciones-item-importacion">
                        <button
                            type="button"
                            class="boton-eliminar-lote"
                            data-indice="${indice}"
                            aria-label="Quitar de la lista"
                            title="Quitar de la lista"
                        >🗑️</button>
                    </div>
                  `;

            return `<div class="${clase}">${detalle}</div>`;
        }).join("");

    listaImportacionMultiple.classList.toggle(
        "oculto",
        loteImportacion.length === 0
    );

    btnGuardarPendiente.textContent =
        "Añadir todos a pendientes";

    btnGuardarPendiente.style.display =
        validos > 0 ? "" : "none";
}


async function guardarItemLote(indice) {
    const item = loteImportacion[indice];

    if (!item || !item.valido) {
        return;
    }

    try {
        const albaranes = obtenerAlbaranes();

        const yaExiste =
            albaranes.some(
                albaran =>
                    albaran.numero === item.datos.numero
                    &&
                    albaran.empresa === empresaActiva
                    &&
                    albaran.estado !== "eliminado"
            );

        if (yaExiste) {
            item.valido = false;
            item.error = "Ya está guardado.";
            mostrarResultadoLoteImportacion();
            return;
        }

        const pdfBase64 =
            await convertirArchivoBase64(item.archivo);

        albaranes.push({
            id: Date.now(),
            numero: item.datos.numero,
            cliente: item.datos.cliente,
            fecha: item.datos.fecha,
            estado: "pendiente",
            empresa: empresaActiva,
            nombreArchivo: item.archivo.name,
            pdf: pdfBase64,
            updatedAt: new Date().toISOString()
        });

        guardarAlbaranes(albaranes);
        actualizarContadorPendientes();

        loteImportacion.splice(indice, 1);
        mostrarResultadoLoteImportacion();

        if (!loteImportacion.length) {
            mostrarInicio();
        }
    }
    catch (error) {
        console.error(error);
        alert("No se ha podido guardar este albarán.");
    }
}


listaImportacionMultiple.addEventListener("click", async event => {
    const botonEliminar =
        event.target.closest(".boton-eliminar-lote");

    if (botonEliminar) {
        const indice =
            Number(botonEliminar.dataset.indice);

        loteImportacion.splice(indice, 1);
        mostrarResultadoLoteImportacion();
        return;
    }

    const botonAnadir =
        event.target.closest(".boton-anadir-individual");

    if (botonAnadir) {
        botonAnadir.disabled = true;
        const indice =
            Number(botonAnadir.dataset.indice);
        await guardarItemLote(indice);
    }
});


/* =========================================================

   LEER PDF

========================================================= */



async function leerAlbaranPDF(archivo) {

    btnGuardarPendiente.style.display = "";

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





        const propietarioDetectado =

            detectarPropietarioAlbaran(

                textoCompleto

            );


        if (!propietarioDetectado) {

            albaranActual = null;

            estadoLectura.textContent =

                "No se ha podido identificar con seguridad el autónomo del albarán. No se puede añadir.";

            estadoLectura

                .classList

                .add("error");

            datosAlbaran

                .classList

                .add("oculto");

            return;

        }


        if (

            propietarioDetectado !==

            empresaActiva

        ) {

            albaranActual = null;

            estadoLectura.textContent =

                "Este albarán pertenece a " +

                EMPRESAS[propietarioDetectado].nombre +

                ". Estás trabajando en " +

                EMPRESAS[empresaActiva].nombre +

                ". No se puede añadir.";

            estadoLectura

                .classList

                .add("error");

            datosAlbaran

                .classList

                .add("oculto");

            return;

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



function normalizarIdentidadAlbaran(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}


function detectarPropietarioAlbaran(texto) {

    const normalizado =
        normalizarIdentidadAlbaran(texto);

    const compacto =
        normalizado.replace(/[^A-Z0-9]/g, "");


    const esCarlos =
        compacto.includes("60213789L")
        ||
        normalizado.includes(
            "CARLOS EDUARDO ROJAS BUSTOS"
        );


    const esRobinson =
        compacto.includes("60804545C")
        ||
        normalizado.includes(
            "ROBINSON ROJAS BUSTOS"
        );


    if (esCarlos && !esRobinson) {
        return "boqueron";
    }

    if (esRobinson && !esCarlos) {
        return "empresa2";
    }

    return null;

}


function puntuacionDatosAlbaran(datos) {

    let puntos = 0;

    if (
        datos.numero &&
        datos.numero !== "No detectado"
    ) {
        puntos += 3;
    }

    if (
        datos.cliente &&
        datos.cliente !== "No detectado"
    ) {
        puntos += 3;
    }

    if (
        datos.fecha &&
        datos.fecha !== "No detectada"
    ) {
        puntos += 1;
    }

    return puntos;

}


function extraerDatosAlbaran(texto) {

    /*
       El intérprete depende del FORMATO DEL PDF,
       nunca del autónomo seleccionado.

       Los dos perfiles pueden usar cualquiera de
       los dos formatos.
    */

    const formatoConCliente =
        /Cliente\s*:/i.test(texto);

    const datosCarlos =
        extraerDatosAlbaranCarlos(texto);

    const datosRobinson =
        extraerDatosAlbaranRobinson(texto);


    if (formatoConCliente) {

        if (
            puntuacionDatosAlbaran(datosRobinson) >= 4
        ) {
            return datosRobinson;
        }

        return datosCarlos;

    }


    if (
        puntuacionDatosAlbaran(datosCarlos) >= 4
    ) {
        return datosCarlos;
    }

    return datosRobinson;

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

        /* IMPORTACIÓN MÚLTIPLE */
        if (loteImportacion.length > 0) {
            const validos =
                loteImportacion.filter(item => item.valido);

            if (!validos.length) {
                return;
            }

            try {
                estadoLectura.classList.remove("error");
                estadoLectura.textContent =
                    "Guardando " + validos.length + " albaranes...";

                const albaranes = obtenerAlbaranes();
                let guardados = 0;

                for (const item of validos) {
                    const pdfBase64 =
                        await convertirArchivoBase64(item.archivo);

                    albaranes.push({
                        id:
                            Date.now() + guardados,
                        numero:
                            item.datos.numero,
                        cliente:
                            item.datos.cliente,
                        fecha:
                            item.datos.fecha,
                        estado:
                            "pendiente",
                        empresa:
                            empresaActiva,
                        nombreArchivo:
                            item.archivo.name,
                        pdf:
                            pdfBase64,
                        updatedAt:
                            new Date().toISOString()
                    });

                    guardados++;
                }

                guardarAlbaranes(albaranes);
                actualizarContadorPendientes();

                alert(
                    guardados +
                    " albarán" +
                    (guardados === 1 ? "" : "es") +
                    " guardado" +
                    (guardados === 1 ? "" : "s") +
                    " en pendientes."
                );

                loteImportacion = [];
                albaranActual = null;
                archivoActual = null;
                btnGuardarPendiente.textContent =
                    "Guardar en pendientes";
                btnGuardarPendiente.style.display = "";
                mostrarInicio();
            }
            catch (error) {
                console.error(error);
                estadoLectura.textContent =
                    "No se han podido guardar todos los albaranes.";
                estadoLectura.classList.add("error");
                alert(
                    "Ha ocurrido un error al guardar los albaranes."
                );
            }

            return;
        }

        /* IMPORTACIÓN INDIVIDUAL: conserva el funcionamiento anterior */
        if (!albaranActual || !archivoActual) {
            return;
        }

        const propietarioActual =
            albaranActual.empresa;

        if (propietarioActual !== empresaActiva) {
            alert(
                "El albarán no pertenece al autónomo seleccionado. No se puede guardar."
            );
            return;
        }

        if (albaranActual.numero === "No detectado") {
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
                    albaran.numero === albaranActual.numero
                    &&
                    albaran.empresa === empresaActiva
                    &&
                    albaran.estado !== "eliminado"
            );

        if (yaExiste) {
            alert(
                "El albarán " +
                albaranActual.numero +
                " ya está guardado en " +
                EMPRESAS[empresaActiva].nombre +
                "."
            );
            return;
        }

        try {
            estadoLectura.textContent =
                "Guardando albarán...";

            const pdfBase64 =
                await convertirArchivoBase64(archivoActual);

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

            albaranes.push(nuevoAlbaran);
            guardarAlbaranes(albaranes);
            actualizarContadorPendientes();

            alert(
                "Albarán " +
                nuevoAlbaran.numero +
                " guardado en pendientes."
            );

            albaranActual = null;
            archivoActual = null;
            loteImportacion = [];
            mostrarInicio();
        }
        catch (error) {
            console.error(error);
            estadoLectura.textContent =
                "No se ha podido guardar.";
            estadoLectura.classList.add("error");
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
   COPIA DE SEGURIDAD + LIBERAR ESPACIO
========================================================= */

function nombreSeguroArchivo(valor) {
    return String(valor || "Sin nombre")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim() || "Sin nombre";
}

function fechaNombreCopia() {
    const ahora = new Date();
    const dos = valor => String(valor).padStart(2, "0");
    return [
        ahora.getFullYear(),
        dos(ahora.getMonth() + 1),
        dos(ahora.getDate())
    ].join("-")
    + "_"
    + [
        dos(ahora.getHours()),
        dos(ahora.getMinutes())
    ].join("-");
}

function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function albaranesFirmadosParaCopia() {
    return obtenerAlbaranes().filter(
        albaran =>
            albaran
            &&
            albaran.estado === "firmado"
            &&
            albaran.pdf
    );
}

async function crearCopiaSeguridadLocal() {
    const firmados = albaranesFirmadosParaCopia();

    if (!firmados.length) {
        alert("No hay albaranes firmados para incluir en la copia.");
        return;
    }

    btnCrearCopiaSeguridad.disabled = true;
    btnLiberarEspacioDrive.disabled = true;
    estadoCopiaSeguridad.textContent = "Creando copia de seguridad...";

    try {
        const zip = new JSZip();

        for (const albaran of firmados) {
            const empresa =
                nombreSeguroArchivo(
                    EMPRESAS[albaran.empresa]?.nombre
                    || albaran.empresa
                    || "Empresa"
                );

            const cliente =
                nombreSeguroArchivo(
                    albaran.cliente || "Cliente sin nombre"
                );

            const numero =
                nombreSeguroArchivo(
                    albaran.numero || "Albarán"
                );

            const bytes = dataURLAUint8Array(albaran.pdf);

            zip.file(
                `${empresa}/${cliente}/${numero}.pdf`,
                bytes
            );
        }

        const resumen = {
            creado: new Date().toISOString(),
            cantidad: firmados.length,
            albaranes: firmados.map(albaran => ({
                empresa:
                    EMPRESAS[albaran.empresa]?.nombre
                    || albaran.empresa
                    || "Empresa",
                cliente: albaran.cliente || "",
                numero: albaran.numero || "",
                fecha: albaran.fecha || "",
                fechaFirma: albaran.fechaFirma || ""
            }))
        };

        zip.file(
            "resumen-copia.json",
            JSON.stringify(resumen, null, 2)
        );

        const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        descargarBlob(
            blob,
            `copia-albaranes-${fechaNombreCopia()}.zip`
        );

        idsUltimaCopiaSeguridad = firmados.map(
            albaran => `${albaran.empresa || "boqueron"}::${albaran.id}`
        );

        btnLiberarEspacioDrive.disabled = false;
        estadoCopiaSeguridad.textContent =
            `Copia creada: ${firmados.length} albarán(es). Comprueba el ZIP antes de liberar espacio.`;
    }
    catch (error) {
        console.error("Error creando copia:", error);
        idsUltimaCopiaSeguridad = [];
        estadoCopiaSeguridad.textContent =
            "No se pudo crear la copia de seguridad.";
        alert("No se pudo crear la copia. No se ha borrado nada.");
    }
    finally {
        btnCrearCopiaSeguridad.disabled = false;
    }
}

async function borrarArchivoDrivePorId(fileId) {
    if (!fileId) return;

    const respuesta = await peticionDrive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE" }
    );

    if (!respuesta.ok && respuesta.status !== 404) {
        throw new Error(
            "No se pudo borrar un PDF de Google Drive: "
            + await respuesta.text()
        );
    }
}

async function localizarPDFDriveAlbaran(albaran) {
    const empresa =
        EMPRESAS[albaran.empresa]?.nombre
        || albaran.empresa
        || "Empresa";

    const carpetaRaiz =
        await buscarCarpetaDrive("Gestión de Albaranes");

    if (!carpetaRaiz) return null;

    const carpetaEmpresa =
        await buscarCarpetaDrive(empresa, carpetaRaiz.id);

    if (!carpetaEmpresa) return null;

    const carpetaCliente =
        await buscarCarpetaDrive(
            albaran.cliente || "Cliente sin nombre",
            carpetaEmpresa.id
        );

    if (!carpetaCliente) return null;

    const nombrePDF =
        limpiarNombreDrive(albaran.numero || "Albarán") + ".pdf";

    return buscarPDFDrive(nombrePDF, carpetaCliente.id);
}

async function liberarEspacioDriveTrasCopia() {
    if (!idsUltimaCopiaSeguridad.length) {
        alert("Primero crea una copia de seguridad en esta sesión.");
        return;
    }

    const albaranes = obtenerAlbaranes();

    const incluidos = albaranes.filter(albaran =>
        idsUltimaCopiaSeguridad.includes(
            `${albaran.empresa || "boqueron"}::${albaran.id}`
        )
        &&
        albaran.estado === "firmado"
    );

    if (!incluidos.length) {
        alert("No quedan albaranes de esa copia para eliminar.");
        return;
    }

    const confirmado = confirm(
        `Vas a eliminar ${incluidos.length} albarán(es) firmados de Google Drive y de la aplicación.\n\n`
        + "Comprueba antes que el ZIP se ha descargado correctamente.\n\n"
        + "Esta acción no se puede deshacer desde la aplicación.\n\n"
        + "¿Continuar?"
    );

    if (!confirmado) return;

    btnLiberarEspacioDrive.disabled = true;
    btnCrearCopiaSeguridad.disabled = true;
    estadoCopiaSeguridad.textContent =
        "Liberando espacio. No cierres la aplicación...";

    try {
        if (!googleAccessToken) {
            await obtenerTokenGoogleDesdeWorker();
        }

        for (const albaran of incluidos) {
            let fileId = albaran.driveFileId || "";

            if (!fileId) {
                const encontrado =
                    await localizarPDFDriveAlbaran(albaran);
                fileId = encontrado?.id || "";
            }

            if (fileId) {
                await borrarArchivoDrivePorId(fileId);
            }
        }

        const ahora = new Date().toISOString();
        const claves = new Set(
            incluidos.map(
                albaran =>
                    `${albaran.empresa || "boqueron"}::${albaran.numero || albaran.id}`
            )
        );

        const actualizados = albaranes.map(albaran => {
            const clave =
                `${albaran.empresa || "boqueron"}::${albaran.numero || albaran.id}`;

            if (!claves.has(clave)) return albaran;

            return {
                id: albaran.id,
                numero: albaran.numero,
                cliente: albaran.cliente,
                fecha: albaran.fecha,
                empresa: albaran.empresa || "boqueron",
                estado: "eliminado",
                eliminadoAt: ahora,
                motivoEliminacion: "copia_seguridad",
                updatedAt: ahora
            };
        });

        guardarAlbaranes(actualizados);
        await sincronizarConGoogleDrive();

        idsUltimaCopiaSeguridad = [];
        actualizarContadorPendientes();

        if (!pantallaClientes.classList.contains("oculto")) {
            btnVolverAlbaranesCliente.click();
        }

        estadoCopiaSeguridad.textContent =
            `Espacio liberado: ${incluidos.length} albarán(es) eliminados de Drive y de la aplicación.`;

        alert(
            "Espacio liberado correctamente.\n\n"
            + "La copia ZIP queda como archivo histórico."
        );
    }
    catch (error) {
        console.error("Error liberando espacio:", error);
        estadoCopiaSeguridad.textContent =
            "No se pudo completar el borrado. No vuelvas a borrar hasta revisar la conexión.";
        alert(
            "No se pudo completar la liberación de espacio.\n\n"
            + "La copia local no se ha modificado."
        );
    }
    finally {
        btnCrearCopiaSeguridad.disabled = false;
    }
}

btnCopiaSeguridad.addEventListener("click", () => {
    menuSuperior.classList.add("oculto");
    idsUltimaCopiaSeguridad = [];
    btnLiberarEspacioDrive.disabled = true;
    estadoCopiaSeguridad.textContent = "";
    pantallaCopiaSeguridad.classList.remove("oculto");
});

btnCerrarCopiaSeguridad.addEventListener("click", () => {
    pantallaCopiaSeguridad.classList.add("oculto");
});

btnCrearCopiaSeguridad.addEventListener(
    "click",
    crearCopiaSeguridadLocal
);

btnLiberarEspacioDrive.addEventListener(
    "click",
    liberarEspacioDriveTrasCopia
);



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



    btnAbrirEn.style.display = "";





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

   ABRIR PDF EN OTRA APLICACIÓN

========================================================= */

btnAbrirEn.addEventListener(
    "click",
    () => {
        if (!albaranAbierto || !albaranAbierto.pdf) {
            alert("No se encuentra el PDF de este albarán.");
            return;
        }

        try {
            const bytes = dataURLAUint8Array(albaranAbierto.pdf);
            const blobPDF = new Blob([bytes], { type: "application/pdf" });
            const urlTemporal = URL.createObjectURL(blobPDF);

            const enlace = document.createElement("a");
            enlace.href = urlTemporal;
            enlace.target = "_blank";
            enlace.rel = "noopener noreferrer";
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            setTimeout(() => URL.revokeObjectURL(urlTemporal), 120000);
        }
        catch (error) {
            console.error("No se pudo abrir el PDF:", error);
            alert(
                "No se ha podido abrir el PDF. Revisa que el móvil tenga una aplicación configurada para abrir archivos PDF."
            );
        }
    }
);


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





    const margenTrazo = 8;



    const xCalculada =

        (

            event.clientX -

            rectangulo.left

        )

        *

        escalaX;



    const yCalculada =

        (

            event.clientY -

            rectangulo.top

        )

        *

        escalaY;



    return {



        x: Math.max(

            margenTrazo,

            Math.min(

                canvasFirma.width - margenTrazo,

                xCalculada

            )

        ),



        y: Math.max(

            margenTrazo,

            Math.min(

                canvasFirma.height - margenTrazo,

                yCalculada

            )

        )



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



let temporizadorEstadoDriveFondo = null;

function mostrarEstadoDriveFondo(mensaje, duracion = 0) {
    let aviso = document.getElementById("estadoDriveFondo");

    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "estadoDriveFondo";
        aviso.className = "estado-drive-fondo";
        document.body.appendChild(aviso);
    }

    aviso.textContent = mensaje;
    aviso.classList.add("visible");
    clearTimeout(temporizadorEstadoDriveFondo);

    if (duracion > 0) {
        temporizadorEstadoDriveFondo = setTimeout(() => {
            aviso.classList.remove("visible");
        }, duracion);
    }
}

async function marcarSubidaDrivePendiente(albaran) {
    try {
        const albaranes = obtenerAlbaranes();
        const indice = albaranes.findIndex(
            item =>
                item.id === albaran.id
                &&
                item.empresa === albaran.empresa
        );

        if (indice !== -1) {
            albaranes[indice].pendienteSubidaDrive = true;
            albaranes[indice].updatedAt = new Date().toISOString();
            guardarAlbaranes(albaranes);
        }
    }
    catch (error) {
        console.error("No se pudo marcar la subida pendiente:", error);
    }
}

async function subirFirmaDriveEnFondo(albaran) {
    try {
        const resultadoDrive = await subirPDFDrive(albaran);
        await registrarSubidaDrive(albaran, resultadoDrive);

        if (resultadoDrive.subido) {
            mostrarEstadoDriveFondo(
                "✓ " + albaran.numero + " subido a Drive",
                2500
            );
            return;
        }

        await marcarSubidaDrivePendiente(albaran);
        mostrarEstadoDriveFondo(
            "⚠️ " + albaran.numero + " pendiente de subir a Drive",
            4000
        );
    }
    catch (error) {
        console.error("Error subiendo firma a Drive en segundo plano:", error);
        await marcarSubidaDrivePendiente(albaran);
        mostrarEstadoDriveFondo(
            "⚠️ " + albaran.numero + " pendiente de subir a Drive",
            4000
        );
    }
}


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



            const albaranParaDrive = { ...albaranAbierto };
            albaranParaDrive.pendienteSubidaDrive = true;

            cerrarPantallaFirma();
            iframePDF.src = "";
            albaranAbierto = null;
            actualizarContadorPendientes();
            mostrarPantallaPendientes();

            mostrarEstadoDriveFondo(
                "☁️ Subiendo " + numeroFirmado + " a Drive…"
            );

            void subirFirmaDriveEnFondo(albaranParaDrive);



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

window.addEventListener("online", () => {

    estadoGoogleDrive.textContent =
        "Cobertura recuperada · conectando con Google Drive...";

    setTimeout(
        async () => {
            try {
                await prepararGoogleDriveAutomatico();
            }
            catch (error) {
                console.error(
                    "No se pudo recuperar la conexión con Google Drive:",
                    error
                );
            }
        },
        1000
    );

});


window.addEventListener("offline", () => {

    googleAccessToken = null;

    if (obtenerTokenSesionApp()) {
        estadoGoogleDrive.textContent =
            "Sin cobertura · trabajando en modo local";
        btnGoogleDrive.textContent =
            "☁️ Google Drive pendiente de conexión";
    }

});



document.addEventListener("visibilitychange", () => {
    if (!document.hidden && navigator.onLine && obtenerTokenSesionApp()) {
        comprobarCambiosRemotosRapido(true);
    }
});

window.addEventListener("focus", () => {
    if (navigator.onLine && obtenerTokenSesionApp()) {
        comprobarCambiosRemotosRapido(true);
    }
});

window.addEventListener("beforeunload", event => {
    if (!haySincronizacionLocalPendiente()) return;
    event.preventDefault();
    event.returnValue = "";
});

window.addEventListener("DOMContentLoaded", () => {
    iniciarSincronizacionPeriodicaDispositivos();
    iniciarAccesoPrivado();
});
