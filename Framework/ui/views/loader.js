// loader.js — robusto contro race con Alpine (SharePoint-safe)
const DEFAULTS = {
  ROOT_URL: "https://jwsite.sharepoint.com/sites/ita-lbd-bethelfacilitysupport/LBDSharepoint%20Code/Framework",
  FILE_HTML: "index.html",
  FILE_CSS:  "style.css",
  FILE_JS:   "app.js",
  PROVIDER_NAME: "",
  TARGET: "view-host",
  VERSION: "20250913-1000",
  FORCE_ALPINE_DATA: true,
  AUTO_DETECT_XDATA: true,
  CSS_LINK_ID: "loader-css-link",
  HOST_TIMEOUT_MS: 10000
};

// ——— utils ———
const isSelector = (s) => /[#.\[\s>:]/.test(s);
const join = (base, path) => new URL(path, base).toString();
const DEBUG = new URL(import.meta.url).searchParams.get("debug") === "1";
function log(...a){ if (DEBUG) console.log("[loader]", ...a); }

function getHostNode(selOrId){
  if (!selOrId) return null;
  return isSelector(selOrId) ? document.querySelector(selOrId)
                             : (document.getElementById(selOrId) || document.querySelector(`#${selOrId}`));
}
function parseUrlParams(){
  const u = new URL(import.meta.url); const p = u.searchParams; const m = {};
  for (const [k,v] of p.entries()) m[k.toLowerCase()] = v; return m;
}
async function fetchText(url){ const r = await fetch(url, {credentials:"same-origin"}); if(!r.ok) throw new Error(`HTTP ${r.status} su ${url}`); return r.text(); }
function extractBody(html){
  const hasShell = /<\s*(html|body)\b/i.test(html);
  const doc = new DOMParser().parseFromString(hasShell ? html : `<body>${html}</body>`, "text/html");
  return { fragment: doc.body?.innerHTML ?? html, parsed: doc };
}
function attachCssLink(href, id){
  const prev = document.getElementById(id); if (prev) return prev;
  const link = document.createElement("link"); link.id=id; link.rel="stylesheet"; link.href=href; document.head.appendChild(link); return link;
}
function showErrorOverlay(host, message){
  const wrap = document.createElement("div");
  wrap.style.cssText = "border:1px solid rgba(220,53,69,.35);background:#fff;color:#dc3545;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.08);";
  wrap.innerHTML = `<strong>Impossibile caricare il contenuto</strong><br><span>${message}</span>`;
  host.innerHTML = ""; host.appendChild(wrap);
}
function resolveProviderFromModule(mod, name){
  if (!mod) return null;
  if (name && typeof mod[name] === "function") return mod[name];
  if (typeof mod.default === "function") return mod.default;
  return null;
}
function guessProviderNameFromXData(parsed){
  try {
    const el = parsed.querySelector("[x-data]"); if (!el) return "";
    const raw = (el.getAttribute("x-data") || "").trim();
    return /^[A-Za-z_$]\w*$/.test(raw) ? raw : "";
  } catch { return ""; }
}
function mergeConfig(host){
  const cfg = { ...DEFAULTS };
  if (host?.dataset){
    if (host.dataset.rootUrl)    cfg.ROOT_URL = host.dataset.rootUrl;
    if (host.dataset.fileHtml)   cfg.FILE_HTML = host.dataset.fileHtml;
    if (host.dataset.fileCss)    cfg.FILE_CSS  = host.dataset.fileCss;
    if (host.dataset.fileJs)     cfg.FILE_JS   = host.dataset.fileJs;
    if (host.dataset.provider)   cfg.PROVIDER_NAME = host.dataset.provider;
    if (host.dataset.target)     cfg.TARGET = host.dataset.target;
    if (host.dataset.version)    cfg.VERSION = host.dataset.version;
    if (host.dataset.subfolder)  cfg.ROOT_URL = cfg.ROOT_URL.replace(/\/$/,"") + "/" + host.dataset.subfolder.replace(/^\//,"");
  }
  const qp = parseUrlParams();
  if (qp.root_url)  cfg.ROOT_URL = qp.root_url;
  if (qp.file_html) cfg.FILE_HTML = qp.file_html;
  if (qp.file_css)  cfg.FILE_CSS  = qp.file_css;
  if (qp.file_js)   cfg.FILE_JS   = qp.file_js;
  if (qp.provider)  cfg.PROVIDER_NAME = qp.provider;
  if (qp.target)    cfg.TARGET = qp.target;
  if (qp.v)         cfg.VERSION = qp.v;
  if (qp.subfolder) cfg.ROOT_URL = cfg.ROOT_URL.replace(/\/$/,"") + "/" + qp.subfolder.replace(/^\//,"");
  return cfg;
}
function whenAlpineReady(cbRegister, cbInitTree){
  if (window.Alpine){
    try{ cbRegister?.(window.Alpine); }catch{}
    try{ cbInitTree?.(window.Alpine); }catch{}
    return;
  }
  document.addEventListener("alpine:init",      () => { try{ cbRegister?.(window.Alpine); }catch{} }, {once:true});
  document.addEventListener("alpine:initialized",() => { try{ cbInitTree?.(window.Alpine); }catch{} }, {once:true});
}

async function boot(){
  try {
    // 1) host + cfg
    const defaultHost = getHostNode(DEFAULTS.TARGET);
    const cfg = mergeConfig(defaultHost);
    const host = getHostNode(cfg.TARGET);
    if (!host){ console.error(`[loader] Host non trovato: ${cfg.TARGET}`); return; }

    const cssUrl  = join(cfg.ROOT_URL + "/", `${cfg.FILE_CSS}?v=${encodeURIComponent(cfg.VERSION)}`);
    const htmlUrl = join(cfg.ROOT_URL + "/", `${cfg.FILE_HTML}?v=${encodeURIComponent(cfg.VERSION)}`);
    const jsUrl   = join(cfg.ROOT_URL + "/", `${cfg.FILE_JS}?v=${encodeURIComponent(cfg.VERSION)}`);
    log("cfg:", cfg); log("cssUrl", cssUrl); log("htmlUrl", htmlUrl); log("jsUrl", jsUrl);

    // 2) CSS
    attachCssLink(cssUrl, cfg.CSS_LINK_ID);

    // 3) HTML -> parse, ma NON iniettiamo ancora
    const htmlText = await fetchText(htmlUrl);
    const { fragment, parsed } = extractBody(htmlText);

    // 4) provider name
    const providerName = cfg.PROVIDER_NAME || (cfg.AUTO_DETECT_XDATA ? guessProviderNameFromXData(parsed) : "");
    log("providerName:", providerName || "(none)");

    // 5) carica JS PRIMA di toccare il DOM
    let mod = null;
    try{
      mod = await import(/* @vite-ignore */ jsUrl);
    }catch(e){
      log("dynamic import failed, fallback to <script type=module>", e);
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.type = "module"; s.src = jsUrl;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // 6) ricava la factory e registrala in Alpine PRIMA dell’iniezione
    let providerFn = null;
    if (providerName){
      providerFn = (typeof window[providerName] === "function" ? window[providerName] : null)
                || resolveProviderFromModule(mod, providerName);
      if (!window[providerName] && typeof providerFn === "function"){
        try{ window[providerName] = providerFn; }catch{}
      }
    }else{
      const def = resolveProviderFromModule(mod, "");
      if (typeof def === "function") providerFn = def;
    }
    whenAlpineReady(
      (Alpine) => { if (cfg.FORCE_ALPINE_DATA && providerName && typeof providerFn === "function"){
        try{ Alpine.data(providerName, providerFn); log("Alpine.data registrato:", providerName); }catch(e){ console.warn("[loader] Alpine.data errore:", e); }
      }},
      null
    );

    // 7) ora iniettiamo l’HTML in modo “atomico” per non farlo auto-inizializzare
    host.setAttribute("x-ignore", "");     // blocca il MutationObserver di Alpine
    host.innerHTML = fragment;
    host.removeAttribute("x-ignore");      // riattiva

    // 8) inizializza esplicitamente solo questo subtree
    whenAlpineReady(null, (Alpine) => {
      try{ Alpine.initTree(host); log("Alpine.initTree done"); }catch(e){ console.warn("[loader] Alpine.initTree errore:", e); }
    });

    // 9) init(host) opzionale del modulo
    if (mod && typeof mod.init === "function"){
      try{ await mod.init(host); }catch(e){ console.warn("[loader] init(host) errore:", e); }
    }

    host.dispatchEvent(new CustomEvent("loader:ready", { bubbles:true, detail:{ providerName: providerName || null, module: mod || null } }));
  } catch (err){
    console.error("[loader] Errore durante il boot:", err);
    showErrorOverlay(getHostNode(DEFAULTS.TARGET) || document.body, err.message || "Errore sconosciuto");
  }
}

boot();
