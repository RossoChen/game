const CACHE_VERSION = 'v2026-02-23-2';
const CACHE_NAME = `rosso-games-${CACHE_VERSION}`;

// 核心殼（壞掉就沒得玩）
const CORE = [
  './',
  './index.html',
  './games.json',
  './manifest.webmanifest',
  // icons 可能有人沒 commit；不要讓 SW 因為兩張圖就直接罷工
  './icons/icon-192.png',
  './icons/icon-512.png'
];

async function safeAddAll(cache, urls){
  const results = await Promise.allSettled(urls.map(u => cache.add(u)));
  // 靜默忽略失敗項目（例如 icons 不存在），避免 SW install fail
  return results;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await safeAddAll(cache, CORE);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

function isCoreUrl(url) {
  // 網路優先：避免你新增遊戲後，Hub 先給你舊 games.json 還要 reload 第二次
  return (
    url.pathname.endsWith('/games.json') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/game/')
  );
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline and no cache');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });

  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);

  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  event.respondWith((async () => {
    if (isCoreUrl(url)) return networkFirst(req);
    return staleWhileRevalidate(req);
  })());
});
