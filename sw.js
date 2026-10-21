const CACHE_NAME = "kao-yan-ying-yu-zong-he-bei-kao-zhan-v16";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/main.css",
  "./assets/css/papers.css",
  "./assets/js/app.js",
  "./assets/js/api.js",
  "./assets/js/charts.js",
  "./assets/js/data.js",
  "./assets/js/db.js",
  "./assets/js/exams.js",
  "./assets/js/papers.js",
  "./assets/js/prompts.js",
  "./assets/js/settings.js",
  "./assets/js/ui.js",
  "./assets/js/utils.js",
  "./assets/js/vocabulary.js",
  "./assets/js/vocab-session.js",
  "./assets/js/views/dashboard.js",
  "./assets/js/views/grade.js",
  "./assets/js/views/papers.js",
  "./assets/js/views/practice.js",
  "./assets/js/views/vocabulary.js",
  "./assets/data/vocabulary.json",
  "./assets/data/NOTICE.txt",
  "./assets/data/papers/index.json",
  "./assets/data/papers/NOTICE.txt",
  "./assets/data/papers/2010-1.json",
  "./assets/data/papers/2010-2.json",
  "./assets/data/papers/2011-1.json",
  "./assets/data/papers/2011-2.json",
  "./assets/data/papers/2012-1.json",
  "./assets/data/papers/2012-2.json",
  "./assets/data/papers/2013-1.json",
  "./assets/data/papers/2013-2.json",
  "./assets/data/papers/2014-1.json",
  "./assets/data/papers/2014-2.json",
  "./assets/data/papers/2015-1.json",
  "./assets/data/papers/2015-2.json",
  "./assets/data/papers/2016-1.json",
  "./assets/data/papers/2016-2.json",
  "./assets/data/papers/2017-1.json",
  "./assets/data/papers/2017-2.json",
  "./assets/data/papers/2018-1.json",
  "./assets/data/papers/2018-2.json",
  "./assets/data/papers/2019-1.json",
  "./assets/data/papers/2019-2.json",
  "./assets/data/papers/2020-1.json",
  "./assets/data/papers/2020-2.json",
  "./assets/data/papers/2021-1.json",
  "./assets/data/papers/2021-2.json",
  "./assets/data/papers/2022-1.json",
  "./assets/data/papers/2022-2.json",
  "./assets/data/papers/2023-1.json",
  "./assets/data/papers/2023-2.json",
  "./assets/data/papers/2024-1.json",
  "./assets/data/papers/2024-2.json",
  "./assets/data/papers/2025-1.json",
  "./assets/data/papers/2025-2.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/images/exams/essay/2010-chart.jpg",
  "./assets/images/exams/essay/2011-chart.jpg",
  "./assets/images/exams/essay/2012-chart.jpg",
  "./assets/images/exams/essay/2013-chart.jpg",
  "./assets/images/exams/essay/2014-chart.jpg",
  "./assets/images/exams/essay/2015-chart.jpg",
  "./assets/images/exams/essay/2016-chart.jpg",
  "./assets/images/exams/essay/2017-chart.jpg",
  "./assets/images/exams/essay/2018-chart.jpg",
  "./assets/images/exams/essay/2019-chart.jpg",
  "./assets/images/exams/essay/2020-chart.jpg",
  "./assets/images/exams/essay/2021-chart.jpg",
  "./assets/images/exams/essay/2022-chart.jpg",
  "./assets/images/exams/essay/2023-chart.jpg",
  "./assets/images/exams/essay/2024-chart.jpg",
  "./assets/images/exams/essay/2025-chart.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match("./index.html")) || Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
