const CACHE_NAME = "gestion-albaranes-v72-sin-borrado-firmados";

const ARCHIVOS_APP = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];

// Dependencias que app.js necesita incluso antes de poder arrancar.
// Las precargamos mientras hay conexión para que la PWA pueda abrir
// posteriormente sin cobertura.
const DEPENDENCIAS_EXTERNAS = [
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm"
];

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // El núcleo local sí es obligatorio para considerar instalada esta versión.
        await cache.addAll(ARCHIVOS_APP);

        // Las librerías externas se intentan precargar una a una. Un fallo temporal
        // de un CDN no impide actualizar la PWA; además el fetch normal las volverá
        // a guardar en caché cuando estén disponibles.
        await Promise.allSettled(
            DEPENDENCIAS_EXTERNAS.map(async url => {
                const respuesta = await fetch(url, { cache: "reload" });
                if (!respuesta || (!respuesta.ok && respuesta.type !== "opaque")) {
                    throw new Error("No se pudo precargar " + url);
                }
                await cache.put(url, respuesta.clone());
            })
        );
    })());

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres.map(nombre => {
                if (nombre !== CACHE_NAME) return caches.delete(nombre);
            })
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    const esNavegacion = event.request.mode === "navigate";
    const esArchivoApp = url.origin === self.location.origin;
    const esDependencia = DEPENDENCIAS_EXTERNAS.includes(url.href);

    // V61: con cobertura, los archivos propios se piden primero a la red.
    // Así una publicación nueva llega al móvil inmediatamente. Si no hay
    // cobertura, se conserva el arranque offline usando la caché local.
    if (esNavegacion || esArchivoApp) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);

            try {
                const respuesta = await fetch(event.request, { cache: "no-store" });
                if (respuesta && respuesta.ok) {
                    const clave = esNavegacion ? "./index.html" : event.request;
                    await cache.put(clave, respuesta.clone());
                }
                return respuesta;
            } catch (error) {
                const clave = esNavegacion ? "./index.html" : event.request;
                const guardado = await cache.match(clave) || await cache.match(event.request);
                if (guardado) return guardado;
                return new Response("Sin conexión", { status: 503 });
            }
        })());
        return;
    }

    // Las librerías PDF/ZIP deben poder cargarse desde caché sin Internet.
    if (esDependencia) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const guardado = await cache.match(event.request) || await cache.match(url.href);
            if (guardado) return guardado;

            const respuesta = await fetch(event.request);
            if (respuesta && (respuesta.ok || respuesta.type === "opaque")) {
                await cache.put(url.href, respuesta.clone());
            }
            return respuesta;
        })());
        return;
    }

    // Resto de GET: red primero y caché como respaldo.
    event.respondWith(
        fetch(event.request)
            .then(async respuesta => {
                if (respuesta && (respuesta.ok || respuesta.type === "opaque")) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(event.request, respuesta.clone());
                }
                return respuesta;
            })
            .catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                return (await cache.match(event.request)) || new Response("Sin conexión", { status: 503 });
            })
    );
});
