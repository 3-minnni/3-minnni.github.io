/* 期待値ラボ — Service Worker
   ------------------------------------------------------------------
   目的は2つ。
     1) オフラインでも起動できるようにする(TWAはHTTPS上のサイトを表示する
        方式のため、電波がない場所ではこのキャッシュが頼りになる)
     2) 2回目以降の起動を速くする

   アプリは ev-lab.html 1ファイルで完結し、外部依存は Google Fonts のみ。
   そのため戦略は単純に保つ:
     - 自オリジン        … キャッシュ優先。裏で更新を取りに行く
     - Google Fonts      … キャッシュ優先(失敗してもフォールバック書体で表示は成立する)
     - ページ遷移        … オフライン時は ev-lab.html を返す
   ------------------------------------------------------------------ */

const VERSION = 'v1';
const CACHE = 'evlab-' + VERSION;

/* 起動に最低限必要なもの。ここが揃っていればオフラインで完全に動く */
const PRECACHE = [
  './',
  './ev-lab.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* 1つでも失敗すると addAll 全体が落ちるため、個別に入れて取りこぼしを許容する */
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { /* 取得できないものはスキップ(オフライン時のインストール等) */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    /* 旧バージョンのキャッシュを掃除する */
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('evlab-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return;   /* それ以外は素通し */

  /* ページ遷移: オンラインなら通常取得、オフラインならキャッシュのアプリ本体を返す */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(req))
            || (await caches.match('./ev-lab.html'))
            || Response.error();
      }
    })());
    return;
  }

  /* それ以外: キャッシュ優先。ヒットしたら裏で更新しておく */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      /* opaque(フォント等)も含め、取得できたものは保存しておく */
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);

    if (cached) { network; return cached; }
    const res = await network;
    return res || Response.error();
  })());
});
