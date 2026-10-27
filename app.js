/* =========================================================

   GESTIÓN DE ALBARANES

   APP.JS COMPLETO - V79 OFFLINE LOCAL PRIMERO + SYNC 1S + FIRMA 4PX

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

// V79 - Medición del arranque local. No interviene en los datos ni en la sincronización.
const inicioArranque = Date.now();


/* =========================================================
   ACCESO PRIVADO + GOOGLE DRIVE PERMANENTE - V11
========================================================= */

const WORKER_URL = "https://gestion-albaranes-drive.facturaselboqueron.workers.dev";
const CLAVE_SESION_APP = "gestionAlbaranesSesion";
let googleAccessToken = null;
let googleDriveNecesitaAutorizacion = false;

// V74 - Registro local de incidencias/rendimiento (máximo 7 días).
const CLAVE_REGISTRO_INCIDENCIAS = "gestionAlbaranesIncidenciasV74";
const CLAVE_ID_DISPOSITIVO = "gestionAlbaranesDispositivo";
function idDispositivo() {
    let id = localStorage.getItem(CLAVE_ID_DISPOSITIVO);
    if (!id) { id = "disp-" + Math.random().toString(36).slice(2, 8); localStorage.setItem(CLAVE_ID_DISPOSITIVO, id); }
    return id;
}
function registrarIncidencia(categoria, operacion, inicio = null, resultado = "ok", error = null) {
    try {
        const ahora = Date.now();
        const limite = ahora - 7 * 24 * 60 * 60 * 1000;
        const lista = JSON.parse(localStorage.getItem(CLAVE_REGISTRO_INCIDENCIAS) || "[]")
            .filter(x => Number(x.ts || 0) >= limite);
        lista.push({ ts: ahora, fecha: new Date(ahora).toISOString(), dispositivo: idDispositivo(), categoria, operacion, duracionMs: inicio ? Math.max(0, ahora - inicio) : null, resultado, error: error ? String(error.message || error).slice(0, 240) : null });
        localStorage.setItem(CLAVE_REGISTRO_INCIDENCIAS, JSON.stringify(lista.slice(-500)));
    } catch (_) {}
}
function pintarRegistroIncidencias() {
    const destino = document.getElementById("registroIncidencias");
    if (!destino) return;
    try {
        const lista = JSON.parse(localStorage.getItem(CLAVE_REGISTRO_INCIDENCIAS) || "[]").slice(-80).reverse();
        destino.textContent = lista.length ? lista.map(x => `${new Date(x.ts).toLocaleString()} · ${x.dispositivo} · ${x.categoria}/${x.operacion} · ${x.duracionMs ?? "-"} ms · ${x.resultado}${x.error ? " · " + x.error : ""}`).join("\n") : "Sin incidencias registradas en los últimos 7 días.";
    } catch (_) { destino.textContent = "No se pudo leer el registro."; }
}

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

// V79 - Para comprobaciones rápidas: una red "fantasma" no debe bloquear el modo local.
// Se usa solo donde abortar es seguro; las subidas de PDFs conservan su flujo normal.
async function peticionWorkerConTimeout(ruta, opciones = {}, requiereSesion = true, timeoutMs = 2500) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
        return await peticionWorker(
            ruta,
            { ...opciones, signal: controlador.signal },
            requiereSesion
        );
    } finally {
        clearTimeout(temporizador);
    }
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
        const respuesta = await peticionWorkerConTimeout("/session", { cache: "no-store" }, true, 2500);

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
    const respuesta = await peticionWorker("/token", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.status === 401 && datos.authenticated === false) {
        borrarTokenSesionApp();
        mostrarLogin();
        throw new Error("La sesión de la aplicación no es válida.");
    }

    if (!respuesta.ok || !datos.access_token) {
        googleAccessToken = null;
        googleDriveNecesitaAutorizacion = datos.connected === false;
        const error = new Error(datos.error || "No se pudo obtener acceso a Google Drive.");
        error.necesitaAutorizacionGoogle = googleDriveNecesitaAutorizacion;
        throw error;
    }

    googleDriveNecesitaAutorizacion = false;
    googleAccessToken = datos.access_token;
    return googleAccessToken;
}

async function prepararGoogleDriveAutomatico() {
    try {
        await obtenerTokenGoogleDesdeWorker();
        estadoGoogleDrive.textContent = "Google Drive: conectado automáticamente ✓";
        btnGoogleDrive.textContent = "☁️ Google Drive conectado ✓";

        // El canal rápido no depende de que la sincronización de Drive termine bien.
        iniciarSyncRapido();

        try {
            await sincronizarConGoogleDrive();
        } catch (errorDrive) {
            console.error("Sincronización inicial de Drive pendiente:", errorDrive);
            estadoGoogleDrive.textContent = "Google Drive: conectado · sincronización pendiente";
        }

    } catch (error) {
        console.error("Error obteniendo acceso a Google Drive:", error);

        if (error?.necesitaAutorizacionGoogle || googleDriveNecesitaAutorizacion) {
            estadoGoogleDrive.textContent = "Google Drive: necesita autorización";
            btnGoogleDrive.textContent = "☁️ Autorizar Google Drive";
        } else {
            estadoGoogleDrive.textContent = "Google Drive: conexión pendiente";
            btnGoogleDrive.textContent = "☁️ Reintentar Google Drive";
        }

        // El Durable Object sigue sincronizando estados aunque Drive necesite
        // una nueva autorización o tenga un fallo temporal.
        iniciarSyncRapido();
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
    // Si el Worker ya nos indicó que Google necesita autorización, abrimos
    // directamente el flujo OAuth. No borramos la sesión ni los datos locales.
    if (googleDriveNecesitaAutorizacion) {
        window.open(WORKER_URL + "/oauth/start", "_blank", "noopener,noreferrer");
        estadoGoogleDrive.textContent = "Autoriza Google Drive y después vuelve a pulsar este botón";
        btnGoogleDrive.textContent = "☁️ Comprobar Google Drive";
        googleDriveNecesitaAutorizacion = false;
        return;
    }

    btnGoogleDrive.disabled = true;
    estadoGoogleDrive.textContent = "Google Drive: conectando...";
    try {
        await prepararGoogleDriveAutomatico();
        if (googleAccessToken) {
            alert("Google Drive está conectado correctamente.");
        } else if (googleDriveNecesitaAutorizacion) {
            window.open(WORKER_URL + "/oauth/start", "_blank", "noopener,noreferrer");
            estadoGoogleDrive.textContent = "Autoriza Google Drive y después vuelve a pulsar este botón";
            btnGoogleDrive.textContent = "☁️ Comprobar Google Drive";
            googleDriveNecesitaAutorizacion = false;
        }
    } finally {
        btnGoogleDrive.disabled = false;
    }
});

async function iniciarAccesoPrivado() {
    const token = obtenerTokenSesionApp();

    if (!token) {
        mostrarLogin();
        return;
    }

    /*
     * V79 - ARRANQUE LOCAL PRIMERO.
     * Una cobertura muy débil puede hacer que Android diga que hay Internet
     * aunque las peticiones tarden muchísimo en responder. La interfaz y los
     * datos locales NO esperan a la red: se muestran inmediatamente.
     */
    mostrarSeleccionAutonomo();

    if (!navigator.onLine) {
        googleAccessToken = null;
        estadoGoogleDrive.textContent =
            "Sin cobertura · trabajando en modo local";
        btnGoogleDrive.textContent =
            "☁️ Google Drive pendiente de conexión";
        return;
    }

    estadoGoogleDrive.textContent =
        "Datos locales listos · comprobando conexión...";

    // La validación remota se hace en segundo plano y con timeout corto.
    void (async () => {
        const sesion = await validarSesionApp();

        if (!sesion.valida) {
            borrarTokenSesionApp();
            mostrarLogin();
            return;
        }

        if (sesion.modoOffline || !navigator.onLine) {
            googleAccessToken = null;
            estadoGoogleDrive.textContent =
                "Conexión insuficiente · trabajando en modo local";
            btnGoogleDrive.textContent =
                "☁️ Google Drive pendiente de conexión";
            return;
        }

        await prepararGoogleDriveAutomatico();
    })().catch(error => {
        console.error("Arranque remoto en segundo plano:", error);
        googleAccessToken = null;
        estadoGoogleDrive.textContent =
            "Conexión insuficiente · trabajando en modo local";
        btnGoogleDrive.textContent =
            "☁️ Google Drive pendiente de conexión";
    });
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

const subidasPDFDriveEnCurso = new Map();

async function subirPDFDrive(albaran) {
    // Evita que dos reintentos simultáneos de ESTE dispositivo hagan a la vez
    // el ciclo buscar->crear para el mismo albarán. El segundo espera y vuelve
    // a buscar, por lo que actualizará el archivo que haya creado el primero.
    if (!albaran || albaran.estado !== "firmado") {
        throw new Error("Bloqueada subida a Drive: el albarán no está firmado.");
    }

    const empresaClave = albaran.empresa || "boqueron";
    const clienteClave = limpiarNombreDrive(albaran.cliente || "Cliente sin nombre").toLocaleUpperCase("es");
    const numeroClave = limpiarNombreDrive(albaran.numero || "Albarán").toLocaleUpperCase("es");
    const clave = `${empresaClave}::${clienteClave}::${numeroClave}`;

    const anterior = subidasPDFDriveEnCurso.get(clave) || Promise.resolve();
    const operacion = anterior.catch(() => {}).then(() => subirPDFDriveSinBloqueo(albaran));
    subidasPDFDriveEnCurso.set(clave, operacion);

    try {
        return await operacion;
    } finally {
        if (subidasPDFDriveEnCurso.get(clave) === operacion) {
            subidasPDFDriveEnCurso.delete(clave);
        }
    }
}

async function subirPDFDriveSinBloqueo(albaran) {
    // BLINDAJE: Google Drive solo puede recibir PDFs cuyo estado sea firmado.
    // Aunque otra rutina llame a esta función por error, un pendiente nunca se sube.
    if (!albaran || albaran.estado !== "firmado") {
        throw new Error("Bloqueada subida a Drive: el albarán no está firmado.");
    }

    // V65: si este dispositivo sabe expresamente que su copia local todavía
    // es la original (recibió el estado firmado desde el otro móvil), jamás
    // puede usarla para crear o sustituir el archivo definitivo de Drive.
    if (albaran.pdfFirmadoVerificado !== true) {
        throw new Error("Bloqueada subida a Drive: la copia firmada no está verificada.");
    }
    if (albaran.pdfFirmadoOrigen !== "local") {
        throw new Error("Bloqueada subida a Drive: este dispositivo no creó esta firma.");
    }
    if (!albaran.pdfFirmadoHash) {
        throw new Error("Bloqueada subida a Drive: falta la huella del PDF firmado.");
    }
    if (albaran.pendienteSubidaDrive !== true) {
        return { subido: false, yaConfirmado: true, id: albaran.driveFileId || null };
    }

    const pdfDisponible = await obtenerPDFFirmadoInmutable(albaran);
    if (!pdfDisponible) throw new Error("No se encuentra la copia firmada inmutable.");
    const hashLocal = await sha256HexDataURL(pdfDisponible);
    if (hashLocal !== albaran.pdfFirmadoHash) {
        throw new Error("Bloqueada subida a Drive: la copia inmutable no coincide con la huella firmada.");
    }
    albaran = { ...albaran, pdf: pdfDisponible };

    if (!googleAccessToken) {
        await obtenerTokenGoogleDesdeWorker();
    }

    const empresa = albaran.empresa === "boqueron"
        ? "Carlos Eduardo Rojas Bustos"
        : (EMPRESAS[albaran.empresa]?.nombre || albaran.empresa || "Empresa");
    const cliente = albaran.cliente || "Cliente sin nombre";

    const carpetaRaiz = await obtenerOCrearCarpetaDrive("Gestión de Albaranes");
    const carpetaEmpresa = await obtenerOCrearCarpetaDrive(empresa, carpetaRaiz);
    const carpetaCliente = await obtenerOCrearCarpetaDrive(cliente, carpetaEmpresa);

    const nombrePDF = limpiarNombreDrive(albaran.numero || "Albarán") + ".pdf";
    const bytesPDF = dataURLAUint8Array(albaran.pdf);
    const archivoExistente = await buscarPDFDrive(nombrePDF, carpetaCliente);

    let respuesta;

    if (archivoExistente) {
        // V76: Drive es inmutable. Si el archivo ya existe, NUNCA se sustituye.
        // Solo lo aceptamos como definitivo si sus bytes coinciden con la huella
        // creada por el dispositivo firmante.
        const existenteResp = await peticionDrive(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(archivoExistente.id)}?alt=media`,
            { cache: "no-store" }
        );
        if (!existenteResp.ok) {
            throw new Error("Drive ya contiene el albarán y no se pudo verificar; no se modifica.");
        }
        const bytesExistentes = new Uint8Array(await existenteResp.arrayBuffer());
        const hashExistente = await sha256HexBytes(bytesExistentes);
        if (hashExistente !== albaran.pdfFirmadoHash) {
            throw new Error("Drive ya contiene un archivo distinto para este albarán. Por seguridad no se sustituye.");
        }
        return { subido: true, yaExistia: true, id: archivoExistente.id, nombre: archivoExistente.name, enlace: "" };
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
const CLAVE_SYNC_PENDIENTE = "gestionAlbaranesSyncPendiente";
let carpetaRaizSincronizacionCache = null;
let archivoSincronizacionCache = null;
let modifiedTimeSincronizacionConocido = null;
let consultaRemotaEnCurso = false;

async function buscarPDFDriveGlobalPorAlbaran(albaran) {
    const nombrePDF = limpiarNombreDrive(albaran.numero || "Albarán") + ".pdf";
    const empresaEsperada = albaran.empresa === "boqueron"
        ? "Carlos Eduardo Rojas Bustos"
        : (EMPRESAS[albaran.empresa]?.nombre || albaran.empresa || "Empresa");

    const q = [
        `name = '${escaparConsultaDrive(nombrePDF)}'`,
        "mimeType = 'application/pdf'",
        "trashed = false"
    ].join(" and ");

    const url =
        "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(q) +
        "&fields=files(id,name,parents,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=100";

    const respuesta = await peticionDrive(url);
    if (!respuesta.ok) return null;

    const datos = await respuesta.json();
    const candidatos = datos.files || [];
    if (!candidatos.length) return null;
    if (candidatos.length === 1) return candidatos[0];

    // Si existe el mismo número en ambos autónomos, comprobamos la carpeta
    // de empresa para no recuperar el PDF equivocado.
    for (const archivo of candidatos) {
        const carpetaClienteId = archivo.parents?.[0];
        if (!carpetaClienteId) continue;

        const respuestaCliente = await peticionDrive(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(carpetaClienteId)}?fields=id,name,parents`
        );
        if (!respuestaCliente.ok) continue;
        const carpetaCliente = await respuestaCliente.json();
        const carpetaEmpresaId = carpetaCliente.parents?.[0];
        if (!carpetaEmpresaId) continue;

        const respuestaEmpresa = await peticionDrive(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(carpetaEmpresaId)}?fields=id,name`
        );
        if (!respuestaEmpresa.ok) continue;
        const carpetaEmpresa = await respuestaEmpresa.json();

        if (carpetaEmpresa.name === empresaEsperada) return archivo;
    }

    return null;
}

async function resolverDriveFileIdAlbaran(albaran, forzarBusqueda = false) {
    if (!albaran || albaran.estado === "eliminado") return null;
    if (albaran.driveFileId && !forzarBusqueda) return albaran.driveFileId;

    if (!googleAccessToken) {
        await obtenerTokenGoogleDesdeWorker();
    }

    const nombreEmpresa = albaran.empresa === "boqueron"
        ? "Carlos Eduardo Rojas Bustos"
        : (EMPRESAS[albaran.empresa]?.nombre || albaran.empresa || "Empresa");
    const cliente = albaran.cliente || "Cliente sin nombre";
    const nombrePDF = limpiarNombreDrive(albaran.numero || "Albarán") + ".pdf";

    // Primero intentamos la ruta normal empresa/cliente/número.
    let archivo = null;
    const carpetaRaiz = await buscarCarpetaDrive("Gestión de Albaranes");
    if (carpetaRaiz?.id) {
        const carpetaEmpresa = await buscarCarpetaDrive(nombreEmpresa, carpetaRaiz.id);
        if (carpetaEmpresa?.id) {
            const carpetaCliente = await buscarCarpetaDrive(cliente, carpetaEmpresa.id);
            if (carpetaCliente?.id) {
                archivo = await buscarPDFDrive(nombrePDF, carpetaCliente.id);
            }
        }
    }

    // Si el cliente cambió de nombre, el registro llegó antes que el PDF o la
    // ruta no coincide exactamente, buscamos el número en todo Drive y
    // verificamos la carpeta del autónomo.
    if (!archivo?.id) {
        archivo = await buscarPDFDriveGlobalPorAlbaran(albaran);
    }
    if (!archivo?.id) return null;

    albaran.driveFileId = archivo.id;
    albaran.driveNombre = archivo.name || nombrePDF;
    return archivo.id;
}

async function descargarPDFDriveAIndexedDB(albaran) {
    if (!albaran || albaran.estado === "eliminado") return false;

    const existente = albaran.estado === "firmado"
        ? await obtenerPDFFirmadoInmutable(albaran)
        : await obtenerPDFAlbaran(albaran);

    if (existente && albaran.estado === "firmado" && albaran.pdfFirmadoHash) {
        const hashExistente = await sha256HexDataURL(existente);
        if (hashExistente === albaran.pdfFirmadoHash) {
            albaran.pdfFirmadoVerificado = true;
            albaran.pdfKey = clavePDFFirmadoLocal(albaran.empresa, albaran.id);
            return true;
        }
    }
    if (existente && albaran.estado !== "firmado") return true;

    let driveFileId = await resolverDriveFileIdAlbaran(albaran);
    if (!driveFileId) return false;

    let respuesta = await peticionDrive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
        { cache: "no-store" }
    );

    // Un driveFileId antiguo o todavía no visible no debe bloquear el albarán:
    // volvemos a localizar el PDF real por número y autónomo.
    if (!respuesta.ok) {
        const idAnterior = driveFileId;
        albaran.driveFileId = null;
        driveFileId = await resolverDriveFileIdAlbaran(albaran, true);
        if (!driveFileId) {
            albaran.driveFileId = idAnterior;
            return false;
        }
        respuesta = await peticionDrive(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
            { cache: "no-store" }
        );
        if (!respuesta.ok) return false;
    }

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    if (!bytes.length) return false;

    const pdfDataURL = uint8ArrayADataURL(bytes, "application/pdf");

    // V67: si el dispositivo firmante publicó una huella, una copia de Drive que
    // no coincida NO se acepta y NO puede sustituir ningún PDF local.
    if (albaran.estado === "firmado" && albaran.pdfFirmadoHash) {
        const hashDrive = await sha256HexBytes(bytes);
        if (hashDrive !== albaran.pdfFirmadoHash) {
            albaran.pdfFirmadoVerificado = false;
            albaran.pendienteSubidaDrive = false;
            console.error("Drive contiene una copia distinta del firmado:", albaran.numero);
            return false;
        }
    }

    const clave = albaran.estado === "firmado"
        ? clavePDFFirmadoLocal(albaran.empresa, albaran.id)
        : (albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id));
    await guardarPDFIndexedDB(clave, pdfDataURL);
    albaran.pdfKey = clave;
    if (albaran.estado === "firmado") albaran.pdfFirmadoKey = clave;
    albaran.driveFileId = driveFileId;
    if (albaran.estado === "firmado") {
        albaran.pdfFirmadoVerificado = true;
        albaran.pdfFirmadoBytes = bytes.byteLength;
        albaran.pendienteSubidaDrive = false;
    }
    return true;
}

// V76: los PDFs firmados ya no viajan por Cloudflare.
// Cloudflare conserva metadatos/estado y PDFs PENDIENTES; Drive es la fuente definitiva del firmado.

async function subirPDFPendienteCloudflare(albaran) {
    if (!albaran || albaran.estado !== "pendiente") return false;
    const pdf = await obtenerPDFAlbaran(albaran);
    if (!pdf) return false;

    const bytes = dataURLAUint8Array(pdf);
    const ruta = "/sync/pdf?empresa=" + encodeURIComponent(albaran.empresa)
        + "&id=" + encodeURIComponent(albaran.id);
    const respuesta = await peticionWorker(ruta, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: bytes
    });
    if (!respuesta.ok) throw new Error("No se pudo guardar el PDF pendiente en Cloudflare.");
    return true;
}

async function descargarPDFPendienteCloudflareAIndexedDB(albaran) {
    if (!albaran || albaran.estado !== "pendiente") return false;
    const existente = await obtenerPDFAlbaran(albaran);
    if (existente) return true;
    if (!navigator.onLine || !obtenerTokenSesionApp()) return false;

    const ruta = "/sync/pdf?empresa=" + encodeURIComponent(albaran.empresa)
        + "&id=" + encodeURIComponent(albaran.id);
    const respuesta = await peticionWorker(ruta, { method: "GET", cache: "no-store" });
    if (!respuesta.ok) return false;

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    if (!bytes.length) return false;
    const pdfDataURL = uint8ArrayADataURL(bytes, "application/pdf");
    const clave = albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
    await guardarPDFIndexedDB(clave, pdfDataURL);
    albaran.pdfKey = clave;
    return true;
}

async function borrarPDFPendienteCloudflare(albaran) {
    if (!albaran || !albaran.id || !albaran.empresa || !navigator.onLine || !obtenerTokenSesionApp()) return false;
    const ruta = "/sync/pdf?empresa=" + encodeURIComponent(albaran.empresa)
        + "&id=" + encodeURIComponent(albaran.id);
    const respuesta = await peticionWorker(ruta, { method: "DELETE" });
    return respuesta.ok;
}

let temporizadorPDFsPendientesCloudflare = null;
let sincronizandoPDFsPendientesCloudflare = false;

function programarPDFsPendientesCloudflare() {
    if (!navigator.onLine || !obtenerTokenSesionApp()) return;
    clearTimeout(temporizadorPDFsPendientesCloudflare);
    temporizadorPDFsPendientesCloudflare = setTimeout(() => {
        sincronizarPDFsPendientesCloudflare().catch(error =>
            console.error("PDFs pendientes Cloudflare:", error)
        );
    }, 120);
}

async function sincronizarPDFsPendientesCloudflare() {
    if (sincronizandoPDFsPendientesCloudflare || !navigator.onLine || !obtenerTokenSesionApp()) return false;
    sincronizandoPDFsPendientesCloudflare = true;
    try {
        const albaranes = obtenerAlbaranes();
        let cambiosLocales = false;
        for (const albaran of albaranes) {
            if (!albaran || albaran.estado !== "pendiente") continue;
            const pdfLocal = await obtenerPDFAlbaran(albaran);
            try {
                if (pdfLocal) {
                    if (albaran.pdfCloudflareUpdatedAt !== albaran.updatedAt) {
                        await subirPDFPendienteCloudflare(albaran);
                        albaran.pdfCloudflareUpdatedAt = albaran.updatedAt;
                        cambiosLocales = true;
                    }
                } else {
                    const recuperado = await descargarPDFPendienteCloudflareAIndexedDB(albaran);
                    if (recuperado) cambiosLocales = true;
                }
            } catch (error) {
                console.error("PDF pendiente Cloudflare:", albaran.numero, error);
            }
        }
        if (cambiosLocales) guardarAlbaranesSoloLocal(albaranes);
        return true;
    } finally {
        sincronizandoPDFsPendientesCloudflare = false;
    }
}

async function recuperarPDFsRemotos(albaranes) {
    let cambios = false;
    for (const albaran of albaranes || []) {
        if (!albaran || albaran.estado === "eliminado") continue;
        try {
            const antes = JSON.stringify([
                albaran.pdfKey || "",
                albaran.driveFileId || null,
                albaran.pdfFirmadoVerificado === true,
                albaran.fechaSubidaDrive || null,
                albaran.pendienteSubidaDrive === true
            ]);
            let recuperado;
            if (albaran.estado === "pendiente") {
                recuperado = await descargarPDFPendienteCloudflareAIndexedDB(albaran);
            } else {
                // V74: un firmado ya verificado en este dispositivo no se vuelve a consultar.
                // Esto evita recorrer Drive una y otra vez y bloqueos de minutos.
                if (albaran.pdfFirmadoVerificado === true) continue;
                // V76: el estado/hash llega por Cloudflare, pero los bytes firmados
                // se descargan exclusivamente desde Drive. La descarga verifica SHA-256
                // antes de guardar nada en IndexedDB.
                recuperado = await descargarPDFDriveAIndexedDB(albaran);
            }
            const despues = JSON.stringify([
                albaran.pdfKey || "",
                albaran.driveFileId || null,
                albaran.pdfFirmadoVerificado === true,
                albaran.fechaSubidaDrive || null,
                albaran.pendienteSubidaDrive === true
            ]);
            if (recuperado && despues !== antes) cambios = true;
        } catch (error) {
            console.error("PDF remoto todavía no disponible:", albaran.numero, error);
        }
    }
    if (cambios) guardarAlbaranesSoloLocal(albaranes);
    return cambios;
}

/* =========================================================
   SINCRONIZACIÓN RÁPIDA - DURABLE OBJECT
========================================================= */

const INTERVALO_SYNC_RAPIDO_MS = 1000;
let intervaloSyncRapido = null;
let syncRapidoEnCurso = false;
let revisionSyncRapido = null;
let temporizadorEnvioSyncRapido = null;
let aplicandoSyncRapidoRemoto = false;

function albaranParaSyncRapido(albaran) {
    if (!albaran || !albaran.id || !albaran.empresa) return null;
    return {
        id: String(albaran.id),
        numero: albaran.numero || String(albaran.id),
        cliente: albaran.cliente || "",
        fecha: albaran.fecha || "",
        empresa: albaran.empresa,
        estado: albaran.estado || "pendiente",
        driveFileId: albaran.driveFileId || null,
        driveNombre: albaran.driveNombre || null,
        driveEnlace: albaran.driveEnlace || null,
        fechaSubidaDrive: albaran.fechaSubidaDrive || null,
        pdfFirmadoHash: albaran.pdfFirmadoHash || null,
        updatedAt: albaran.updatedAt || new Date().toISOString(),
        fechaFirma: albaran.fechaFirma || null,
        eliminadoAt: albaran.eliminadoAt || null
    };
}

function combinarSyncRapidoConLocal(locales, remotos) {
    const mapa = new Map((locales || []).map(a => [claveUnicaAlbaran(a), a]));
    let hayPendienteRemotoSinPDF = false;

    for (const remotoOriginal of remotos || []) {
        if (!remotoOriginal) continue;
        const remoto = normalizarAlbaranSincronizado(remotoOriginal);
        const clave = claveUnicaAlbaran(remoto);
        const local = mapa.get(clave);

        if (!local) {
            // Si llega ya firmado, este dispositivo aún NO posee una copia
            // firmada verificada. La recuperará de Drive cuando esté disponible.
            if (remoto.estado === "firmado") {
                remoto.pdfFirmadoVerificado = false;
                remoto.pendienteSubidaDrive = false;
                remoto.pdfFirmadoOrigen = "remoto";
            }
            mapa.set(clave, remoto);
            if (remoto.estado === "pendiente") hayPendienteRemotoSinPDF = true;
            continue;
        }

        if (!local.driveFileId && remoto.driveFileId && local.estado !== "eliminado") {
            local.driveFileId = remoto.driveFileId;
        }

        // V65: un estado pendiente jamás puede degradar un firmado. Y un firmado
        // remoto siempre gana a un pendiente local aunque los relojes de los
        // móviles difieran. Así la firma se propaga en una sola dirección.
        if (local.estado === "firmado" && remoto.estado === "pendiente") {
            continue;
        }

        const remotoConvierteAFirmado =
            local.estado === "pendiente" && remoto.estado === "firmado";
        const remotoDebeGanar =
            remotoConvierteAFirmado
            || fechaActualizacionAlbaran(remoto) >= fechaActualizacionAlbaran(local);

        if (remotoDebeGanar) {
            const combinado = {
                ...local,
                ...remoto,
                pdfKey: local.pdfKey || remoto.pdfKey,
                nombreArchivo: local.nombreArchivo || remoto.nombreArchivo,
                driveNombre: remoto.driveNombre || local.driveNombre,
                driveEnlace: remoto.driveEnlace || local.driveEnlace,
                fechaSubidaDrive: remoto.fechaSubidaDrive || local.fechaSubidaDrive,
                pdfFirmadoHash: remoto.pdfFirmadoHash || local.pdfFirmadoHash
            };

            if (remotoConvierteAFirmado) {
                // El PDF que ya había en IndexedDB es el original pendiente.
                // No se puede subir a Drive ni mostrar como copia firmada hasta
                // reemplazarlo por la copia definitiva del dispositivo firmante.
                combinado.pdfFirmadoVerificado = false;
                combinado.pendienteSubidaDrive = false;
                combinado.pdfFirmadoOrigen = "remoto";
                combinado.pdfFirmadoKey = clavePDFFirmadoLocal(combinado.empresa, combinado.id);
                combinado.pdfKey = combinado.pdfFirmadoKey;
                delete combinado.pdfFirmadoBytes;
            }

            mapa.set(clave, combinado);
            if (remoto.estado === "pendiente" && !local.pdfKey) hayPendienteRemotoSinPDF = true;
        }
    }

    return { albaranes: Array.from(mapa.values()), hayPendienteRemotoSinPDF };
}

async function enviarEstadoSyncRapido(albaranes = obtenerAlbaranes()) {
    if (!navigator.onLine || !obtenerTokenSesionApp()) return false;
    const cambios = (albaranes || []).map(albaranParaSyncRapido).filter(Boolean);
    if (!cambios.length) return true;

    const respuesta = await peticionWorker("/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambios })
    });
    if (!respuesta.ok) throw new Error("No se pudo enviar el estado rápido.");
    const datos = await respuesta.json();
    revisionSyncRapido = datos.revision ?? revisionSyncRapido;
    return true;
}

function programarEnvioSyncRapido() {
    if (aplicandoSyncRapidoRemoto || !navigator.onLine || !obtenerTokenSesionApp()) return;
    clearTimeout(temporizadorEnvioSyncRapido);
    temporizadorEnvioSyncRapido = setTimeout(() => {
        enviarEstadoSyncRapido().catch(error => console.error("Sync rápido (envío):", error));
    }, 80);
}

async function comprobarSyncRapido(forzar = false) {
    const inicioSyncRapido = Date.now();
    if (syncRapidoEnCurso || !navigator.onLine || !obtenerTokenSesionApp()) return false;
    syncRapidoEnCurso = true;
    try {
        const respuesta = await peticionWorkerConTimeout("/sync", { cache: "no-store" }, true, 4000);
        if (!respuesta.ok) throw new Error("No se pudo consultar el estado rápido.");
        const datos = await respuesta.json();
        const revision = datos.revision ?? 0;
        if (!forzar && revisionSyncRapido !== null && revision === revisionSyncRapido) {
            // V73: aunque los metadatos no hayan cambiado, el PDF firmado puede
            // haber llegado al puente temporal unos milisegundos después. Reintentamos
            // recuperar los bytes pendientes sin esperar a una nueva revisión.
            const recuperados = await recuperarPDFsRemotos(obtenerAlbaranes());
            if (recuperados) {
                actualizarContadorPendientes();
                if (!pantallaPendientes.classList.contains("oculto")) cargarListaPendientes();
                if (!pantallaClientes.classList.contains("oculto")) cargarClientes();
                if (!pantallaAlbaranesCliente.classList.contains("oculto")) cargarAlbaranesCliente();
            }
            return false;
        }

        const resultado = combinarSyncRapidoConLocal(
            obtenerAlbaranes(),
            Array.isArray(datos.albaranes) ? datos.albaranes : []
        );

        aplicandoSyncRapidoRemoto = true;
        try {
            guardarAlbaranesSoloLocal(resultado.albaranes);
            await limpiarPDFsEliminadosIndexedDB(resultado.albaranes);
            /* Si el registro viene de otro dispositivo y ya trae driveFileId,
               recuperamos el PDF directamente a IndexedDB. */
            await recuperarPDFsRemotos(resultado.albaranes);
        } finally {
            aplicandoSyncRapidoRemoto = false;
        }

        revisionSyncRapido = revision;
        actualizarContadorPendientes();
        if (!pantallaPendientes.classList.contains("oculto")) cargarListaPendientes();
        if (!pantallaClientes.classList.contains("oculto")) cargarClientes();
        if (!pantallaAlbaranesCliente.classList.contains("oculto")) cargarAlbaranesCliente();
        registrarIncidencia("sync", "lectura", inicioSyncRapido, "ok");
        return true;
    } catch (error) {
        registrarIncidencia("sync", "lectura", inicioSyncRapido, "error", error);
        console.error("Sync rápido (lectura):", error);
        return false;
    } finally {
        syncRapidoEnCurso = false;
    }
}

function iniciarSyncRapido() {
    if (intervaloSyncRapido) return;

    // Primero leemos el estado central. Así un dispositivo recién abierto no
    // publica un estado local vacío o antiguo antes de conocer el remoto.
    void comprobarSyncRapido(true)
        .then(() => enviarEstadoSyncRapido())
        .catch(error => console.error("Inicio sync rápido:", error));

    intervaloSyncRapido = setInterval(() => {
        if (!document.hidden && navigator.onLine && obtenerTokenSesionApp()) {
            void comprobarSyncRapido();
        }
    }, INTERVALO_SYNC_RAPIDO_MS);
}

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

        await guardarPDFsIncluidosEnIndexedDB(combinados);
        omitirSincronizacionAutomatica = true;
        try {
            guardarAlbaranesSoloLocal(combinados);
            await limpiarPDFsEliminadosIndexedDB(combinados);
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

    /* El Durable Object serializa el id como texto. La aplicación histórica
       usa ids numéricos en botones, firma y borrado. Lo normalizamos aquí para
       que un albarán recibido de otro dispositivo se comporte igual que uno local. */
    const idNumerico = Number(copia.id);
    if (Number.isFinite(idNumerico) && String(copia.id).trim() !== "") {
        copia.id = idNumerico;
    }

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
    // V68: una sola cola. Solo sube una copia firmada inmutable, verificada,
    // con huella y marcada explícitamente como pendiente. Tras confirmar, se acabó.
    const candidatos = obtenerAlbaranes().filter(albaran =>
        albaran &&
        albaran.estado === "firmado" &&
        albaran.pendienteSubidaDrive === true &&
        albaran.pdfFirmadoVerificado === true &&
        albaran.pdfFirmadoOrigen === "local" &&
        !!albaran.pdfFirmadoHash
    );

    for (const albaran of candidatos) {
        try {
            // V76: el PDF firmado va directamente a Drive. Cloudflare solo recibe
            // el estado/hash mediante /sync, nunca los bytes del firmado.
            const resultado = await subirPDFDrive(albaran);
            await registrarSubidaDrive(albaran, resultado);
            // V72 PRUEBA: NO borrar la copia firmada temporal de Cloudflare.
            // Se conserva para que los demás dispositivos puedan descargarla
            // y verificarla por SHA-256 incluso después de que Drive confirme la subida.
            // El borrado se reintroducirá solo cuando tengamos una confirmación segura
            // de que los dispositivos receptores ya poseen la copia firmada.
        } catch (error) {
            console.error("PDF firmado pendiente de Drive:", albaran.numero, error);
        }
    }
}


// Recuperación histórica finalizada: herramienta temporal eliminada.

async function sincronizarConGoogleDrive() {
    /*
     * V59: Drive deja de ser el canal de sincronización de albaranes/PDFs.
     * Los estados y pendientes se sincronizan por Cloudflare Durable Object.
     * Drive se usa EXCLUSIVAMENTE para archivar PDFs ya firmados.
     */
    if (!obtenerTokenSesionApp() || !navigator.onLine) return false;

    if (sincronizacionEnCurso) {
        clearTimeout(temporizadorSincronizacion);
        temporizadorSincronizacion = setTimeout(() => sincronizarConGoogleDrive(), 500);
        return false;
    }

    sincronizacionEnCurso = true;

    try {
        if (!googleAccessToken) await obtenerTokenGoogleDesdeWorker();

        // Primero publica/recoge estados por Cloudflare y después recupera
        // inmediatamente cualquier firmado que siga pendiente de Drive.
        await enviarEstadoSyncRapido().catch(error =>
            console.error("Sync rápido antes de Drive:", error)
        );
        await comprobarSyncRapido(true).catch(error =>
            console.error("Sync rápido al recuperar Drive:", error)
        );

        await subirFirmadosPendientesDrive();

        confirmarSincronizacionLocal();
        actualizarContadorPendientes();
        if (!pantallaPendientes.classList.contains("oculto")) cargarListaPendientes();

        estadoGoogleDrive.textContent =
            "Google Drive: firmados sincronizados ✓";

        return true;
    }
    catch (error) {
        console.error("Error sincronizando firmados con Google Drive:", error);
        estadoGoogleDrive.textContent =
            "Google Drive: hay firmados pendientes de subir";

        clearTimeout(temporizadorSincronizacion);
        temporizadorSincronizacion = setTimeout(() => {
            if (navigator.onLine) sincronizarConGoogleDrive();
        }, 3000);

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

        nombre: "Carlos Eduardo Rojas Bustos",



        firma: {

            x: 130,

            y: 20,

            ancho: 170

        }

    },



    empresa2: {

        id: "empresa2",

        nombre: "Robinson Rojas Bustos",



        firma: {

            x: 130,

            y: 20,

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
            EMPRESAS.boqueron.nombre = "Carlos Eduardo Rojas Bustos";
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

// V75: retirada definitiva del mecanismo manual antiguo, incluso si quedó HTML en caché.
const btnCopiaFirmadaAntiguo = document.getElementById("btnUsarCopiaFirmada");
if (btnCopiaFirmadaAntiguo) btnCopiaFirmadaAntiguo.remove();



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
    if (!pdfDataURL) throw new Error("No se encuentra el PDF.");

    const contenedor = iframePDF.parentElement;
    iframePDF.style.display = "none";
    iframePDF.src = "";

    if (!visorPDFRenderizado) {
        visorPDFRenderizado = document.createElement("div");
        visorPDFRenderizado.id = "visorPDFRenderizado";
        visorPDFRenderizado.className = "visor-pdf-renderizado visor-pdf-miniatura";
        contenedor.appendChild(visorPDFRenderizado);
    }

    visorPDFRenderizado.className = "visor-pdf-renderizado visor-pdf-miniatura";
    visorPDFRenderizado.style.display = "";
    visorPDFRenderizado.innerHTML = '<div class="visor-pdf-cargando">Cargando albarán...</div>';

    try {
        const bytesPDF = dataURLAUint8Array(pdfDataURL);
        const pdf = await pdfjsLib.getDocument({ data: bytesPDF }).promise;
        const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);

        async function renderizarPaginas(destino, anchoCSS, zoom = 1) {
            destino.innerHTML = "";
            for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina++) {
                const pagina = await pdf.getPage(numeroPagina);
                const viewportBase = pagina.getViewport({ scale: 1 });
                const escalaCSS = (anchoCSS / viewportBase.width) * zoom;
                const viewportRender = pagina.getViewport({ scale: escalaCSS * pixelRatio });
                const canvas = document.createElement("canvas");
                canvas.className = "pagina-pdf-renderizada";
                canvas.width = Math.floor(viewportRender.width);
                canvas.height = Math.floor(viewportRender.height);
                canvas.style.width = Math.floor(viewportRender.width / pixelRatio) + "px";
                canvas.style.height = Math.floor(viewportRender.height / pixelRatio) + "px";
                destino.appendChild(canvas);
                await pagina.render({
                    canvasContext: canvas.getContext("2d", { alpha: false }),
                    viewport: viewportRender
                }).promise;
            }
        }

        // Vista normal: el albarán se comporta como una imagen/previsualización.
        const anchoMiniatura = Math.max(260, contenedor.clientWidth - 16);
        await renderizarPaginas(visorPDFRenderizado, anchoMiniatura, 1);
        visorPDFRenderizado.setAttribute("role", "button");
        visorPDFRenderizado.setAttribute("aria-label", "Abrir albarán a pantalla completa");
        visorPDFRenderizado.title = "Pulsa para ampliar";

        visorPDFRenderizado.onclick = async () => {
            if (document.getElementById("visorPDFFullscreen")) return;

            const capa = document.createElement("div");
            capa.id = "visorPDFFullscreen";
            capa.className = "visor-pdf-fullscreen";
            capa.innerHTML = `
                <button type="button" class="visor-pdf-fullscreen-volver" aria-label="Volver">← Volver</button>
                <div class="visor-pdf-fullscreen-scroll">
                    <div class="visor-pdf-fullscreen-paginas"><div class="visor-pdf-cargando">Cargando albarán...</div></div>
                </div>`;
            document.body.appendChild(capa);
            document.body.classList.add("visor-pdf-fullscreen-abierto");

            const scroll = capa.querySelector(".visor-pdf-fullscreen-scroll");
            const paginas = capa.querySelector(".visor-pdf-fullscreen-paginas");
            const volver = capa.querySelector(".visor-pdf-fullscreen-volver");
            let zoom = 1;
            let distanciaInicial = 0;
            let zoomInicial = 1;
            let escalaTemporal = 1;
            let anclaContenidoX = 0;
            let anclaContenidoY = 0;
            let anclaVistaX = 0;
            let anclaVistaY = 0;
            let cerrando = false;

            const anchoBase = () => Math.max(280, window.innerWidth - 8);
            const renderFull = async () => {
                const x = scroll.scrollLeft;
                const y = scroll.scrollTop;
                await renderizarPaginas(paginas, anchoBase(), zoom);
                scroll.scrollLeft = x;
                scroll.scrollTop = y;
            };
            await renderFull();

            const cerrar = () => {
                if (cerrando) return;
                // Si el visor creó una entrada de historial, Atrás debe consumir SOLO
                // esa entrada. El propio popstate cerrará la capa sin abandonar
                // la pantalla del albarán donde está el botón Firmar.
                if (history.state?.visorPDFFullscreen) {
                    history.back();
                    return;
                }
                cerrando = true;
                window.removeEventListener("popstate", alAtras);
                capa.remove();
                document.body.classList.remove("visor-pdf-fullscreen-abierto");
            };
            const alAtras = () => {
                if (!document.getElementById("visorPDFFullscreen")) return;
                cerrando = true;
                capa.remove();
                document.body.classList.remove("visor-pdf-fullscreen-abierto");
                window.removeEventListener("popstate", alAtras);
            };
            history.pushState({ ...(history.state || {}), visorPDFFullscreen: true }, "");
            window.addEventListener("popstate", alAtras);
            volver.addEventListener("click", cerrar);

            const distancia = touches => Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            const puntoMedio = touches => ({
                x: (touches[0].clientX + touches[1].clientX) / 2,
                y: (touches[0].clientY + touches[1].clientY) / 2
            });
            scroll.addEventListener("touchstart", e => {
                if (e.touches.length === 2) {
                    distanciaInicial = distancia(e.touches);
                    zoomInicial = zoom;
                    escalaTemporal = 1;

                    // Guardamos el punto exacto del PDF que queda entre los dos dedos.
                    // Ese punto será el ancla del zoom, como en una fotografía.
                    const medio = puntoMedio(e.touches);
                    const rect = scroll.getBoundingClientRect();
                    anclaVistaX = medio.x - rect.left;
                    anclaVistaY = medio.y - rect.top;
                    anclaContenidoX = scroll.scrollLeft + anclaVistaX;
                    anclaContenidoY = scroll.scrollTop + anclaVistaY;
                }
            }, { passive: true });
            scroll.addEventListener("touchmove", e => {
                if (e.touches.length !== 2 || !distanciaInicial) return;
                e.preventDefault();
                escalaTemporal = distancia(e.touches) / distanciaInicial;
                const destino = Math.min(4, Math.max(1, zoomInicial * escalaTemporal));
                const factor = destino / zoomInicial;

                // La previsualización durante el gesto crece alrededor del punto
                // situado entre los dedos, en vez de alrededor del borde izquierdo.
                paginas.style.transformOrigin = `${anclaContenidoX}px ${anclaContenidoY}px`;
                paginas.style.transform = `scale(${factor})`;
            }, { passive: false });
            scroll.addEventListener("touchend", e => {
                if (!distanciaInicial || e.touches.length >= 2) return;
                const zoomAnterior = zoomInicial;
                const zoomNuevo = Math.min(4, Math.max(1, zoomInicial * escalaTemporal));
                const factorFinal = zoomNuevo / zoomAnterior;
                const scrollDestinoX = anclaContenidoX * factorFinal - anclaVistaX;
                const scrollDestinoY = anclaContenidoY * factorFinal - anclaVistaY;

                zoom = zoomNuevo;
                distanciaInicial = 0;
                escalaTemporal = 1;
                paginas.style.transform = "";
                paginas.style.transformOrigin = "";

                // PDF.js vuelve a dibujar nítido al nuevo zoom y después recolocamos
                // el scroll para que el mismo punto permanezca bajo los dedos.
                void (async () => {
                    await renderFull();
                    scroll.scrollLeft = Math.max(0, scrollDestinoX);
                    scroll.scrollTop = Math.max(0, scrollDestinoY);
                })();
            }, { passive: true });
        };
    } catch (error) {
        console.error("Error mostrando PDF:", error);
        visorPDFRenderizado.innerHTML = '<div class="visor-pdf-error">No se ha podido visualizar el PDF.</div>';
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
let ultimoPuntoDibujadoFirma = null;





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
    pintarRegistroIncidencias();
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


    if (typeof actualizarBloqueoPullRefresh === "function") {
        actualizarBloqueoPullRefresh();
    }

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
    // La pantalla completa del PDF gestiona su propia entrada de historial.
    // No dejamos que el manejador general retroceda además desde el albarán
    // hasta la lista de pendientes en la misma pulsación de Atrás.
    if (document.getElementById("visorPDFFullscreen")) {
        return;
    }

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





function actualizarBloqueoPullRefresh() {
    const bloquear =
        !pantallaFirma.classList.contains("oculto") ||
        !pantallaVisor.classList.contains("oculto") ||
        Boolean(document.getElementById("visorPDFFullscreen"));

    document.documentElement.classList.toggle(
        "sin-pull-refresh",
        bloquear
    );
    document.body.classList.toggle(
        "sin-pull-refresh",
        bloquear
    );
}


function mostrarVisor() {

    ocultarPantallas();

    pantallaVisor
        .classList
        .remove("oculto");

    actualizarBloqueoPullRefresh();
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

        const idNuevo = Date.now();
        const pdfKey = clavePDFLocal(empresaActiva, idNuevo);
        await guardarPDFIndexedDB(pdfKey, pdfBase64);

        albaranes.push({
            id: idNuevo,
            numero: item.datos.numero,
            cliente: item.datos.cliente,
            fecha: item.datos.fecha,
            estado: "pendiente",
            empresa: empresaActiva,
            nombreArchivo: item.archivo.name,
            pdfKey: pdfKey,
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

                    const idNuevo = Date.now() + guardados;
                    const pdfKey = clavePDFLocal(empresaActiva, idNuevo);
                    await guardarPDFIndexedDB(pdfKey, pdfBase64);

                    albaranes.push({
                        id:
                            idNuevo,
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
                        pdfKey:
                            pdfKey,
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

            const idNuevo = Date.now();
            const pdfKey = clavePDFLocal(empresaActiva, idNuevo);
            await guardarPDFIndexedDB(pdfKey, pdfBase64);

            const nuevoAlbaran = {
                id:
                    idNuevo,
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
                pdfKey:
                    pdfKey,
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

            const pdf = await obtenerPDFAlbaran(albaran);
            if (!pdf) continue;
            const bytes = dataURLAUint8Array(pdf);

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
        `Vas a eliminar ${incluidos.length} albarán(es) firmados de Google Drive y liberar también su PDF del almacenamiento de los dispositivos.\n\n`
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

            const pdfKey =
                albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
            await eliminarPDFIndexedDB(pdfKey);
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
            `Espacio liberado: ${incluidos.length} albarán(es) eliminados de Drive y sus PDFs locales marcados para limpieza en los dispositivos.`;

        alert(
            "Espacio liberado correctamente en Drive y en este dispositivo.\n\n"
            + "Los demás dispositivos limpiarán esos PDFs cuando reciban la sincronización. La copia ZIP queda como archivo histórico."
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





const DB_PDFS_NOMBRE = "gestion-albaranes-pdfs";
const DB_PDFS_VERSION = 1;
const DB_PDFS_STORE = "pdfs";

function abrirDBPDFs() {
    return new Promise((resolve, reject) => {
        const solicitud = indexedDB.open(DB_PDFS_NOMBRE, DB_PDFS_VERSION);
        solicitud.onupgradeneeded = () => {
            const db = solicitud.result;
            if (!db.objectStoreNames.contains(DB_PDFS_STORE)) {
                db.createObjectStore(DB_PDFS_STORE);
            }
        };
        solicitud.onsuccess = () => resolve(solicitud.result);
        solicitud.onerror = () => reject(solicitud.error || new Error("No se pudo abrir el almacenamiento de PDFs."));
    });
}

function clavePDFLocal(empresa, id) {
    return `${empresa || "empresa"}::${id}`;
}

// V67: el PDF firmado vive en una clave distinta del pendiente.
// Así una recuperación del original pendiente nunca puede sobrescribir la firma.
function clavePDFFirmadoLocal(empresa, id) {
    return `${empresa || "empresa"}::${id}::firmado`;
}

async function sha256HexBytes(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexDataURL(dataURL) {
    return sha256HexBytes(dataURLAUint8Array(dataURL));
}

async function guardarPDFIndexedDB(clave, pdf) {
    if (!clave || !pdf) return;
    const db = await abrirDBPDFs();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_PDFS_STORE, "readwrite");
        tx.objectStore(DB_PDFS_STORE).put(pdf, clave);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo guardar el PDF."));
        tx.onabort = () => reject(tx.error || new Error("No se pudo guardar el PDF."));
    });
    db.close();
}

async function leerPDFIndexedDB(clave) {
    if (!clave) return null;
    const db = await abrirDBPDFs();
    const resultado = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_PDFS_STORE, "readonly");
        const solicitud = tx.objectStore(DB_PDFS_STORE).get(clave);
        solicitud.onsuccess = () => resolve(solicitud.result || null);
        solicitud.onerror = () => reject(solicitud.error || new Error("No se pudo leer el PDF."));
    });
    db.close();
    return resultado;
}

async function eliminarPDFIndexedDB(clave) {
    if (!clave) return;
    const db = await abrirDBPDFs();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_PDFS_STORE, "readwrite");
        tx.objectStore(DB_PDFS_STORE).delete(clave);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo eliminar el PDF local."));
        tx.onabort = () => reject(tx.error || new Error("No se pudo eliminar el PDF local."));
    });
    db.close();
}

async function limpiarPDFsEliminadosIndexedDB(albaranes) {
    for (const albaran of albaranes || []) {
        if (!albaran || albaran.estado !== "eliminado") continue;
        const clave = albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
        await eliminarPDFIndexedDB(clave);
    }
}

async function obtenerPDFAlbaran(albaran) {
    if (!albaran) return null;
    if (albaran.pdf) return albaran.pdf;
    const clave = albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
    return leerPDFIndexedDB(clave);
}

// V68: Drive nunca lee desde la ruta genérica. Solo desde la copia firmada inmutable.
async function obtenerPDFFirmadoInmutable(albaran) {
    if (!albaran || albaran.estado !== "firmado") return null;
    const clave = albaran.pdfFirmadoKey || clavePDFFirmadoLocal(albaran.empresa, albaran.id);
    return leerPDFIndexedDB(clave);
}

async function guardarPDFsIncluidosEnIndexedDB(albaranes) {
    for (const albaran of albaranes || []) {
        if (!albaran || !albaran.pdf) continue;
        const clave = albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
        await guardarPDFIndexedDB(clave, albaran.pdf);
        albaran.pdfKey = clave;
    }
}

async function hidratarAlbaranesConPDF(albaranes) {
    const resultado = [];
    for (const albaran of albaranes || []) {
        if (!albaran) continue;
        const copia = { ...albaran };
        const pdf = await obtenerPDFAlbaran(copia);
        if (pdf) copia.pdf = pdf;
        resultado.push(copia);
    }
    return resultado;
}

function albaranesSinPDFEmbebido(albaranes) {
    return (albaranes || []).map(albaran => {
        if (!albaran) return albaran;
        const copia = { ...albaran };
        if (copia.pdf) {
            copia.pdfKey = copia.pdfKey || clavePDFLocal(copia.empresa, copia.id);
            delete copia.pdf;
        }
        return copia;
    });
}

function guardarAlbaranesSoloLocal(albaranes) {
    localStorage.setItem("albaranes", JSON.stringify(albaranesSinPDFEmbebido(albaranes)));
}

function guardarAlbaranes(albaranes) {
    guardarAlbaranesSoloLocal(albaranes);
    programarEnvioSyncRapido();
    programarPDFsPendientesCloudflare();
    programarSincronizacionDrive();
}

async function migrarPDFsLocalStorageAIndexedDB() {
    const albaranes = obtenerAlbaranes();
    let cambios = false;
    for (const albaran of albaranes) {
        if (!albaran || !albaran.pdf) continue;
        const clave = albaran.pdfKey || clavePDFLocal(albaran.empresa, albaran.id);
        await guardarPDFIndexedDB(clave, albaran.pdf);
        albaran.pdfKey = clave;
        delete albaran.pdf;
        cambios = true;
    }
    if (cambios) guardarAlbaranesSoloLocal(albaranes);
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

    // Si era pendiente, limpiamos también su copia temporal de Cloudflare.
    void borrarPDFPendienteCloudflare(albaran).catch(error =>
        console.error("No se pudo limpiar el PDF pendiente de Cloudflare:", error)
    );

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





    let pdfAlbaran = await obtenerPDFAlbaran(albaran);

    // Los albaranes pendientes recuperan su PDF desde Cloudflare, no desde Drive.
    if (!pdfAlbaran && navigator.onLine) {
        try {
            const recuperado = await descargarPDFPendienteCloudflareAIndexedDB(albaran);
            if (recuperado) {
                pdfAlbaran = await obtenerPDFAlbaran(albaran);
                guardarAlbaranesSoloLocal(obtenerAlbaranes().map(item =>
                    item.id === albaran.id && item.empresa === albaran.empresa
                        ? { ...item, pdfKey: albaran.pdfKey }
                        : item
                ));
            }
        } catch (error) {
            console.error("No se pudo recuperar el PDF pendiente desde Cloudflare:", error);
        }
    }

    if (!pdfAlbaran) {

        alert(

            "El PDF todavía no está disponible en este dispositivo. Comprueba la conexión y vuelve a intentarlo."

        );

        return;

    }

    albaran.pdf = pdfAlbaran;





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





    const pdfAlbaran = await obtenerPDFAlbaran(albaran);

    if (!pdfAlbaran) {

        alert(

            "No se encuentra el PDF firmado."

        );

        return;

    }

    albaran.pdf = pdfAlbaran;





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





    accionesVisor.style.display = "";
    btnFirmar.style.display = "none";
    btnAbrirEn.style.display = "";

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

    textoFirmaAlbaran.textContent =
        albaranAbierto.numero +
        " · " +
        albaranAbierto.cliente;

    pantallaFirma
        .classList
        .remove("oculto");

    actualizarBloqueoPullRefresh();

    // El canvas oculto no tiene un tamaño CSS fiable. Lo ajustamos cuando
    // ya está visible para conservar el mismo grosor en cualquier dirección.
    requestAnimationFrame(() => {
        ajustarCanvasFirmaAlTamanoReal();
        limpiarFirma();
    });
}


function cerrarPantallaFirma() {

    dibujandoFirma = false;
    ultimoPuntoFirma = null;
    ultimoPuntoDibujadoFirma = null;
    vectorAnteriorFirma = null;
    puntoFiltradoFirma = null;

    pantallaFirma
        .classList
        .add("oculto");

    actualizarBloqueoPullRefresh();
}


/* =========================================================

   CANVAS FIRMA - V79.4 · LÁPIZ FINO ESTABILIZADO

   Resolución adaptada al tamaño real del móvil y al DPR.
   Trazo fino (2.5 px CSS) y estabilización ligeramente mayor de microtemblores,
   manteniendo la respuesta en movimientos rápidos y cambios de dirección.

========================================================= */

let escalaPixelFirma = 1;
let anchoCanvasFirmaCSS = 1;
let altoCanvasFirmaCSS = 1;
let vectorAnteriorFirma = null;
let puntoFiltradoFirma = null;

const GROSOR_FIRMA_CSS = 2.5;
const DISTANCIA_MINIMA_FIRMA = 0.55;

function configurarContextoFirma() {
    const contexto = canvasFirma.getContext("2d");

    contexto.setTransform(
        escalaPixelFirma,
        0,
        0,
        escalaPixelFirma,
        0,
        0
    );

    contexto.lineWidth = GROSOR_FIRMA_CSS;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
    contexto.miterLimit = 2;
    contexto.strokeStyle = "#111111";
    contexto.fillStyle = "#111111";

    return contexto;
}

function ajustarCanvasFirmaAlTamanoReal() {
    const rectangulo = canvasFirma.getBoundingClientRect();
    const ancho = Math.max(1, Math.round(rectangulo.width));
    const alto = Math.max(1, Math.round(rectangulo.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const anchoInterno = Math.max(1, Math.round(ancho * dpr));
    const altoInterno = Math.max(1, Math.round(alto * dpr));

    anchoCanvasFirmaCSS = ancho;
    altoCanvasFirmaCSS = alto;
    escalaPixelFirma = dpr;

    if (
        canvasFirma.width !== anchoInterno ||
        canvasFirma.height !== altoInterno
    ) {
        canvasFirma.width = anchoInterno;
        canvasFirma.height = altoInterno;
    }

    configurarContextoFirma();
}

// Tamaño de seguridad hasta que la ventana de firma sea visible.
canvasFirma.width = 900;
canvasFirma.height = 300;
configurarContextoFirma();

canvasFirma.addEventListener("pointerdown", iniciarFirma);
canvasFirma.addEventListener("pointermove", dibujarFirma);
canvasFirma.addEventListener("pointerup", terminarFirma);
canvasFirma.addEventListener("pointercancel", terminarFirma);

canvasFirma.addEventListener(
    "pointerleave",
    event => {
        if (event.pointerType === "mouse") {
            terminarFirma(event);
        }
    }
);

/* =========================================================

   DIBUJAR FIRMA - V79.4 · LÁPIZ TÁCTIL ESTABILIZADO

   - Usa los puntos coalesced del navegador.
   - Filtra un poco más las microoscilaciones del lápiz sobre cristal.
   - Reduce el filtro automáticamente cuando el movimiento es rápido.
   - Conserva cambios de dirección reales sin redondear en exceso la firma.

========================================================= */

function iniciarFirma(event) {
    event.preventDefault();

    dibujandoFirma = true;
    firmaTieneTrazos = true;

    const puntoInicial = obtenerPuntoCanvas(event);
    ultimoPuntoFirma = puntoInicial;
    ultimoPuntoDibujadoFirma = puntoInicial;
    puntoFiltradoFirma = puntoInicial;
    vectorAnteriorFirma = null;

    try {
        canvasFirma.setPointerCapture(event.pointerId);
    }
    catch (error) {
    }

    const contexto = configurarContextoFirma();
    const radio = Math.max(1.15, contexto.lineWidth / 2);

    contexto.beginPath();
    contexto.arc(
        puntoInicial.x,
        puntoInicial.y,
        radio,
        0,
        Math.PI * 2
    );
    contexto.fill();
}

function filtrarPuntoFirma(puntoCrudo) {
    if (!puntoFiltradoFirma) {
        puntoFiltradoFirma = puntoCrudo;
        return puntoCrudo;
    }

    const dx = puntoCrudo.x - puntoFiltradoFirma.x;
    const dy = puntoCrudo.y - puntoFiltradoFirma.y;
    const distancia = Math.hypot(dx, dy);

    // Cuanto más rápido se mueve el lápiz, menos filtramos para evitar retraso.
    let factor;
    if (distancia >= 7) factor = 0.90;
    else if (distancia >= 3) factor = 0.76;
    else if (distancia >= 1.2) factor = 0.54;
    else factor = 0.30;

    const filtrado = {
        x: puntoFiltradoFirma.x + dx * factor,
        y: puntoFiltradoFirma.y + dy * factor
    };

    puntoFiltradoFirma = filtrado;
    return filtrado;
}

function esCambioDireccionRealFirma(desde, hasta) {
    if (!vectorAnteriorFirma) return false;

    const vx = hasta.x - desde.x;
    const vy = hasta.y - desde.y;
    const longitud = Math.hypot(vx, vy);
    const longitudAnterior = Math.hypot(
        vectorAnteriorFirma.x,
        vectorAnteriorFirma.y
    );

    // Los cambios de dirección de segmentos diminutos suelen ser temblor.
    if (longitud < 1.45 || longitudAnterior < 1.45) return false;

    const coseno = Math.max(
        -1,
        Math.min(
            1,
            (vx * vectorAnteriorFirma.x + vy * vectorAnteriorFirma.y) /
            (longitud * longitudAnterior)
        )
    );

    return Math.acos(coseno) > (72 * Math.PI / 180);
}

function dibujarSegmentoFirma(event) {
    if (!ultimoPuntoFirma) return;

    const puntoCrudo = obtenerPuntoCanvas(event);
    const puntoFinal = filtrarPuntoFirma(puntoCrudo);
    const dx = puntoFinal.x - ultimoPuntoFirma.x;
    const dy = puntoFinal.y - ultimoPuntoFirma.y;
    const distancia = Math.hypot(dx, dy);

    // Elimina solo microoscilaciones propias del digitalizador/lápiz.
    if (distancia < DISTANCIA_MINIMA_FIRMA) return;

    const contexto = configurarContextoFirma();
    const cambioDireccion = esCambioDireccionRealFirma(
        ultimoPuntoFirma,
        puntoFinal
    );

    contexto.beginPath();
    contexto.moveTo(
        ultimoPuntoDibujadoFirma
            ? ultimoPuntoDibujadoFirma.x
            : ultimoPuntoFirma.x,
        ultimoPuntoDibujadoFirma
            ? ultimoPuntoDibujadoFirma.y
            : ultimoPuntoFirma.y
    );

    if (cambioDireccion) {
        // Acerca la curva al vértice real, pero sin dibujar dos líneas rígidas
        // que puedan convertir el pequeño temblor en un pico visible.
        const entrada = {
            x: ultimoPuntoFirma.x * 0.82 + puntoFinal.x * 0.18,
            y: ultimoPuntoFirma.y * 0.82 + puntoFinal.y * 0.18
        };

        contexto.quadraticCurveTo(
            ultimoPuntoFirma.x,
            ultimoPuntoFirma.y,
            entrada.x,
            entrada.y
        );
        ultimoPuntoDibujadoFirma = entrada;
    }
    else {
        const puntoMedio = {
            x: (ultimoPuntoFirma.x + puntoFinal.x) / 2,
            y: (ultimoPuntoFirma.y + puntoFinal.y) / 2
        };

        contexto.quadraticCurveTo(
            ultimoPuntoFirma.x,
            ultimoPuntoFirma.y,
            puntoMedio.x,
            puntoMedio.y
        );
        ultimoPuntoDibujadoFirma = puntoMedio;
    }

    contexto.stroke();

    vectorAnteriorFirma = { x: dx, y: dy };
    ultimoPuntoFirma = puntoFinal;
}

function completarTrazoFirma() {
    if (!ultimoPuntoFirma || !ultimoPuntoDibujadoFirma) return;

    const contexto = configurarContextoFirma();

    contexto.beginPath();
    contexto.moveTo(
        ultimoPuntoDibujadoFirma.x,
        ultimoPuntoDibujadoFirma.y
    );
    contexto.lineTo(
        ultimoPuntoFirma.x,
        ultimoPuntoFirma.y
    );
    contexto.stroke();
}

function dibujarFirma(event) {
    if (!dibujandoFirma || !ultimoPuntoFirma) return;

    event.preventDefault();

    let eventos = [event];

    if (typeof event.getCoalescedEvents === "function") {
        const eventosAgrupados = event.getCoalescedEvents();
        if (eventosAgrupados && eventosAgrupados.length) {
            eventos = eventosAgrupados;
        }
    }

    for (const evento of eventos) {
        dibujarSegmentoFirma(evento);
    }

    // Algunos Android no incluyen el evento principal como último coalesced.
    const puntoPrincipal = obtenerPuntoCanvas(event);
    if (
        puntoFiltradoFirma &&
        Math.hypot(
            puntoPrincipal.x - puntoFiltradoFirma.x,
            puntoPrincipal.y - puntoFiltradoFirma.y
        ) > 0.32
    ) {
        dibujarSegmentoFirma(event);
    }
}

function terminarFirma(event) {
    if (dibujandoFirma && event) {
        event.preventDefault();

        try {
            dibujarSegmentoFirma(event);
            completarTrazoFirma();
        }
        catch (error) {
        }
    }

    dibujandoFirma = false;
    ultimoPuntoFirma = null;
    ultimoPuntoDibujadoFirma = null;
    vectorAnteriorFirma = null;
    puntoFiltradoFirma = null;

    if (event && event.pointerId !== undefined) {
        try {
            canvasFirma.releasePointerCapture(event.pointerId);
        }
        catch (error) {
        }
    }
}

function obtenerPuntoCanvas(event) {
    const rectangulo = canvasFirma.getBoundingClientRect();
    const margenTrazo = 3;

    // Las coordenadas están en píxeles CSS. El contexto ya aplica el DPR,
    // evitando la deformación horizontal/vertical del canvas antiguo 900x300.
    const xCalculada = event.clientX - rectangulo.left;
    const yCalculada = event.clientY - rectangulo.top;

    return {
        x: Math.max(
            margenTrazo,
            Math.min(
                Math.max(margenTrazo, anchoCanvasFirmaCSS - margenTrazo),
                xCalculada
            )
        ),
        y: Math.max(
            margenTrazo,
            Math.min(
                Math.max(margenTrazo, altoCanvasFirmaCSS - margenTrazo),
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





    // clearRect debe usar coordenadas físicas porque el contexto trabaja
    // escalado por devicePixelRatio.
    contexto.save();
    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
    contexto.restore();
    configurarContextoFirma();





    firmaTieneTrazos = false;



    dibujandoFirma = false;



    ultimoPuntoFirma = null;
    ultimoPuntoDibujadoFirma = null;
    vectorAnteriorFirma = null;

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
        // V71: NO se borra aquí la copia temporal. Si se eliminase justo al
        // terminar Drive, otro dispositivo podría no haber tenido tiempo de
        // descargarla. El Worker la conserva temporalmente y la limpieza
        // diferida se encarga de retirarla después.

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

            // Ya firmado: deja de ser un PDF pendiente en Cloudflare.
            void borrarPDFPendienteCloudflare(albaranParaDrive).catch(error =>
                console.error("No se pudo limpiar el PDF pendiente de Cloudflare:", error)
            );

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

            x: 130,

            y: 20,

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





    // V71: recuperamos literalmente el comportamiento local que ya funcionaba:
    // la firma sustituye el PDF local del propio albarán y se relee antes de
    // cambiar su estado. Cloudflare/Drive no intervienen en esta fase.
    const pdfKeyLocal = albaranes[indice].pdfKey || clavePDFLocal(albaranes[indice].empresa, albaranes[indice].id);
    await guardarPDFIndexedDB(pdfKeyLocal, pdfFirmadoBase64);

    const pdfFirmadoVerificado = await leerPDFIndexedDB(pdfKeyLocal);
    if (!pdfFirmadoVerificado || pdfFirmadoVerificado !== pdfFirmadoBase64) {
        throw new Error(
            "No se pudo verificar el PDF firmado en el almacenamiento del dispositivo. " +
            "El albarán seguirá pendiente y no se subirá a Drive."
        );
    }

    // Solo DESPUÉS de verificar el guardado local creamos una segunda copia
    // inmutable para transporte entre dispositivos y subida a Drive.
    const pdfFirmadoKey = clavePDFFirmadoLocal(albaranes[indice].empresa, albaranes[indice].id);
    await guardarPDFIndexedDB(pdfFirmadoKey, pdfFirmadoVerificado);
    const copiaInmutable = await leerPDFIndexedDB(pdfFirmadoKey);
    if (!copiaInmutable || copiaInmutable !== pdfFirmadoVerificado) {
        throw new Error("No se pudo crear la copia firmada inmutable de transporte.");
    }

    albaranes[indice].pdfKey = pdfKeyLocal;
    albaranes[indice].pdfFirmadoKey = pdfFirmadoKey;
    albaranes[indice].pdfFirmadoVerificado = true;
    albaranes[indice].pdfFirmadoBytes = dataURLAUint8Array(copiaInmutable).byteLength;
    albaranes[indice].pdfFirmadoHash = await sha256HexDataURL(copiaInmutable);
    albaranes[indice].pdfFirmadoOrigen = "local";
    delete albaranes[indice].pdf;





    albaranes[indice].estado =

        "firmado";





    albaranes[indice].fechaFirma =

        new Date().toISOString();



    // Se guarda ANTES de depender de Internet. Si la app se cierra o no hay
    // cobertura, al volver a abrir/conectar se recuperará automáticamente.
    albaranes[indice].pendienteSubidaDrive = true;

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


/* =========================================================
   V64 - BLOQUEO VERTICAL EN PWA ANDROID
========================================================= */
async function bloquearOrientacionVertical() {
    try {
        if (
            window.matchMedia("(display-mode: standalone)").matches
            &&
            screen.orientation
            &&
            typeof screen.orientation.lock === "function"
        ) {
            await screen.orientation.lock("portrait");
        }
    }
    catch (error) {
        // Android/Chrome puede rechazar temporalmente el bloqueo si todavía
        // no considera la PWA en un estado apto. Se vuelve a intentar al
        // recuperar foco, visibilidad y pageshow.
        console.warn("Android no permitió bloquear orientación todavía:", error);
    }
}

window.addEventListener("pageshow", () => {
    void bloquearOrientacionVertical();
});

window.addEventListener("online", () => {

    estadoGoogleDrive.textContent =
        "Cobertura recuperada · subiendo firmados pendientes...";

    // Sin espera artificial: en cuanto el navegador confirma cobertura,
    // reanudamos Cloudflare y la subida de firmados a Drive.
    void (async () => {
        try {
            await prepararGoogleDriveAutomatico();
            await sincronizarPDFsPendientesCloudflare().catch(error =>
                console.error("PDFs pendientes Cloudflare al recuperar cobertura:", error)
            );
            await sincronizarConGoogleDrive();
        }
        catch (error) {
            console.error(
                "No se pudo recuperar la conexión con Google Drive:",
                error
            );
        }
    })();

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
    if (!document.hidden) {
        void bloquearOrientacionVertical();
    }
    if (!document.hidden && navigator.onLine && obtenerTokenSesionApp()) {
        void comprobarSyncRapido(true);
        void sincronizarConGoogleDrive();
    }
});

window.addEventListener("focus", () => {
    void bloquearOrientacionVertical();
    if (navigator.onLine && obtenerTokenSesionApp()) {
        void comprobarSyncRapido(true);
        void sincronizarConGoogleDrive();
    }
});

window.addEventListener("beforeunload", event => {
    if (!haySincronizacionLocalPendiente()) return;
    event.preventDefault();
    event.returnValue = "";
});

// V79 - Pide al navegador conservar el almacenamiento local de la PWA cuando sea posible.
// Si Android/Chrome no lo concede, la aplicación sigue funcionando normalmente.
async function solicitarAlmacenamientoPersistente() {
    try {
        if (!navigator.storage?.persist) return false;
        if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
    } catch (error) {
        console.warn("No se pudo solicitar almacenamiento persistente:", error);
        return false;
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    void bloquearOrientacionVertical();
    try {
        await migrarPDFsLocalStorageAIndexedDB();
    } catch (error) {
        console.error("No se pudieron migrar los PDFs al almacenamiento ampliado:", error);
    }
    actualizarContadorPendientes();
    void solicitarAlmacenamientoPersistente();
    void iniciarAccesoPrivado();
    registrarIncidencia("arranque", "local-listo", inicioArranque, "ok");
});
