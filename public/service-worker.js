const CACHE_NAME = "refine-physio-shell-v69";
const APP_SHELL = [
  "/",
  "/index.html",
  "/device-preview.html",
  "/styles.css?v=20260606-handbook-17",
  "/app.js?v=20260606-handbook-17",
  "/manifest.webmanifest",
  "/icon.svg?v=20260605-1",
  "/icon-192.png?v=20260605-1",
  "/icon-512.png?v=20260605-1",
  "/practitioner-quick-start-guide.pdf",
  "/onboarding-illustrations/katie-waving.png",
  "/onboarding-illustrations/katie-writing-welcome.png",
  "/onboarding-illustrations/diverse-physio-team.png",
  "/onboarding-illustrations/paediatric-family-support.png",
  "/onboarding-illustrations/aged-care-group-exercise.png",
  "/onboarding-illustrations/home-neuro-rehab.png",
  "/onboarding-illustrations/hydrotherapy-session.png",
  "/onboarding-illustrations/wheelchair-disability-physio.png",
  "/onboarding-illustrations/paediatric-physio-play.png",
  "/onboarding-illustrations/extra-diverse-physio-scene.png",
  "/onboarding-illustrations/01-home-visit-greeting.png",
  "/onboarding-illustrations/01-team-bonding-diverse.png",
  "/onboarding-illustrations/02-seated-exercise.png",
  "/onboarding-illustrations/02-ndis-walker-support.png",
  "/onboarding-illustrations/03-physio-team.png",
  "/onboarding-illustrations/03-seated-exercise-diverse.png",
  "/onboarding-illustrations/04-balance-exercise.png",
  "/onboarding-illustrations/04-mobile-physio-driving.png",
  "/onboarding-illustrations/05-care-plan-tablet.png",
  "/onboarding-illustrations/05-case-manager-collaboration.png",
  "/onboarding-illustrations/06-team-celebration-diverse.png",
  "/onboarding-illustrations/06-walking-support.png",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
