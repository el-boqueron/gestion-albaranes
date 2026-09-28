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
   GOOGLE DRIVE - CONEXIÓN OAUTH
========================================================= */

const GOOGLE_CLIENT_ID = "1025855069597-de3jfda4131darceicb76fqo442krc9j.apps.googleusercontent.com";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let googleTokenClient = null;
let googleAccessToken = null;

const btnGoogleDrive = document.getElementById("btnGoogleDrive");
const estadoGoogleDrive = document.getElementById("estadoGoogleDrive");

function cargarGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(
            new Error("No se ha podido cargar Google Identity Services.")
        );
        document.head.appendChild(script);
    });
}

async function prepararGoogleDrive() {
    await cargarGoogleIdentityServices();

    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: () => {}
    });
}

function solicitarTokenGoogle() {
    return new Promise(async (resolve, reject) => {
        try {
            if (!googleTokenClient) {
                await prepararGoogleDrive();
            }

            googleTokenClient.callback = respuesta => {
                if (respuesta.error) {
                    reject(new Error(respuesta.error));
                    return;
                }

                googleAccessToken = respuesta.access_token;
                resolve(googleAccessToken);
            };

            googleTokenClient.requestAccessToken({
                prompt: googleAccessToken ? "" : "consent"
            });
        }
        catch (error) {
            reject(error);
        }
    });
}

async function probarConexionGoogleDrive() {
    estadoGoogleDrive.textContent = "Google Drive: conectando...";

    const token = await solicitarTokenGoogle();

    const respuesta = await fetch(
        "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)",
        {
            headers: {
                Authorization: "Bearer " + token
            }
        }
    );

    if (!respuesta.ok) {
        throw new Error(
            "Google Drive respondió " +
            respuesta.status +
            ": " +
            await respuesta.text()
        );
    }

    estadoGoogleDrive.textContent = "Google Drive: conectado ✓";
    btnGoogleDrive.innerHTML =
        '<span class="icono-menu">☁️</span><span>Google Drive conectado ✓</span>';
}

btnGoogleDrive.addEventListener("click", async () => {
    btnGoogleDrive.disabled = true;

    try {
        await probarConexionGoogleDrive();
        alert("Conexión con Google Drive realizada correctamente.");
    }
    catch (error) {
        console.error("Error conectando Google Drive:", error);
        estadoGoogleDrive.textContent = "Google Drive: error de conexión";
        alert("No se ha podido conectar con Google Drive.");
    }
    finally {
        btnGoogleDrive.disabled = false;
    }
});

prepararGoogleDrive().catch(error => {
    console.error("No se pudo preparar Google Drive:", error);
});






/* =========================================================

   EMPRESAS

========================================================= */



const EMPRESAS = {



    boqueron: {

        id: "boqueron",

        nombre: "Pescados y Mariscos El Boquerón",



        firma: {

            x: 75,

            y: 40,

            ancho: 170

        }

    },



    empresa2: {

        id: "empresa2",

        nombre: "Empresa 2",



        firma: {

            x: 75,

            y: 40,

            ancho: 170

        }

    }



};





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



btnCambiarEmpresa.addEventListener(

    "click",

    () => {



        actualizarOpcionesEmpresa();



        pantallaEmpresas

            .classList

            .remove("oculto");



    }

);





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



}





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

                    pdfBase64



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



                <button

                    class="boton-abrir"

                    data-id="${albaran.id}"

                    type="button"

                >

                    Abrir y firmar

                </button>

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



}





/* =========================================================

   ABRIR ALBARÁN PENDIENTE

========================================================= */



function abrirAlbaranPendiente(

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





    iframePDF.src =

        albaran.pdf;





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



function abrirAlbaranFirmado(

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





    iframePDF.src =

        albaran.pdf;





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





            cerrarPantallaFirma();





            iframePDF.src = "";





            albaranAbierto = null;





            actualizarContadorPendientes();





            mostrarPantallaPendientes();





            alert(

                "Albarán " +

                numeroFirmado +

                " firmado correctamente."

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