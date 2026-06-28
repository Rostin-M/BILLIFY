// @ts-nocheck
// Service Worker BILLIFY - MVP
// Gestiona caché de assets estáticos para soporte offline básico

const CACHE_NAME = "billify-v1";

// Activar inmediatamente al instalar
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Estrategia network-first: intenta red, cae en caché solo para navegación
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo interceptar navegación (HTML) para soporte offline básico
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? Response.error()),
      ),
    );
  }
});
