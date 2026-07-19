/* 拓扑 PWA Service Worker —— 离线首屏 + 静态资源本地缓存
 * 策略:
 *  - 同源导航:网络优先,断网回落到缓存的 index.html(SPA 首屏也能开)
 *  - 同源静态资源(带哈希名的 JS/CSS/图标等):stale-while-revalidate,先给缓存、后台更新
 *  - Supabase / 跨域 / 非 GET(API、鉴权、上传、字体 CDN…):一律直连,绝不缓存
 * 部署到子路径或根路径都行:所有路径相对 SW 自身位置解析。
 */
const CACHE = "topo-shell-v1";
const SHELL = "./index.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // 只接管同源 GET;Supabase API、鉴权、上传、跨域字体等直连(不缓存动态/敏感数据)
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // 导航:网络优先,断网回落缓存的首屏
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || caches.match(req)))
    );
    return;
  }

  // 静态资源:stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
