/// <reference lib="WebWorker" />

export {};
declare const self: ServiceWorkerGlobalScope & {
  skipWaiting(): void;
  clients: Clients;
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});