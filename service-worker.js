const CACHE_NAME = "gestion-albaranes-v45";

const ARCHIVOS_APP = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ARCHIVOS_APP))
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(nombres => {
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

    const url = new URL(event.request.url);

    event.respondWith(
        fetch(event.request)
            .then(respuestaRed => {
                if (
                    respuestaRed &&
                    (
                        respuestaRed.status === 200 ||
                        respuestaRed.type === "opaque"
                    )
                ) {
                    const copia = respuestaRed.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, copia);
                        });
                }

                return respuestaRed;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(respuestaCache => {
                        if (respuestaCache) {
                            return respuestaCache;
                        }

                        if (event.request.mode === "navigate") {
                            return caches.match("./index.html");
                        }
                    });
            })
    );
});
