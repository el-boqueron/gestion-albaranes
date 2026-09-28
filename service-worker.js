const CACHE_NAME = "gestion-albaranes-v1";

const ARCHIVOS_APP = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json"
];

self.addEventListener("install", event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(ARCHIVOS_APP);
            })
    );

    self.skipWaiting();
});


self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys()
            .then(nombres => {

                return Promise.all(
                    nombres.map(nombre => {

                        if (nombre !== CACHE_NAME) {
                            return caches.delete(nombre);
                        }

                    })
                );

            })
    );

    self.clients.claim();
});


self.addEventListener("fetch", event => {

    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(

        caches.match(event.request)
            .then(respuestaCache => {

                if (respuestaCache) {
                    return respuestaCache;
                }

                return fetch(event.request)
                    .then(respuestaRed => {

                        if (
                            !respuestaRed ||
                            respuestaRed.status !== 200 ||
                            respuestaRed.type === "opaque"
                        ) {
                            return respuestaRed;
                        }

                        const copia =
                            respuestaRed.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(
                                    event.request,
                                    copia
                                );
                            });

                        return respuestaRed;

                    })
                    .catch(() => {

                        if (
                            event.request.mode ===
                            "navigate"
                        ) {
                            return caches.match(
                                "./index.html"
                            );
                        }

                    });

            })
    );

});