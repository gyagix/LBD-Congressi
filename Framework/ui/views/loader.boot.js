// loader.boot.js  — avvia il loader modulare da uno script "classico"
(() => {
  // Per evitare che il browser usi una versione in cache di loader.js, aggiungiamo un parametro "cache-busting"
  const cacheBusting = new Date().getTime();
  const ROOT = "https://jwsite.sharepoint.com/sites/ita-lbd-bethelfacilitysupport/LBDSharepoint%20Code/Framework/ui/views";
  const url  = `${ROOT}/loader.js?v=${cacheBusting}`;   // cache-busting
  import(url).catch(err => console.error("[boot] import loader failed:", err));
})();
