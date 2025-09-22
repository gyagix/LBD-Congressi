/*
    Ambiente di sviluppo o produzione?
    (usato per logging, path SharePoint, cache-busting)
    (opzionale) Base assoluta della tua libreria (uguale alla tua web part)
    Autodetecta se siamo in area di sviluppo (bethelfacilitysupport) o produzione (ita-lbd)
*/ 
const isDevArea = (window.location.pathname.includes('bethelfacilitysupport')) ? 1 : 0; 
const doConsoleWrite = isDevArea ? true : false;
const stableVersion = '20250912-1119'; // indicare la data di ultima pubblicazione dello script in produzione
const sharePointFolder = isDevArea ? "/sites/ita-lbd-bethelfacilitysupport" : "/sites/ita-lbd";           

window.assetVersion = isDevArea ? String(Date.now()) : stableVersion;

// (opzionale) Base assoluta della libreria Framework, può tornare utile per import dinamici
const BASE_FRAMEWORK_PATH = `https://jwsite.sharepoint.com/${sharePointFolder}/LBDSharepoint%20Code/Framework`;


const logger = {
    log: (...args) => doConsoleWrite && console.log(...args),
    warn: (...args) => doConsoleWrite && console.warn(...args),
    error: (...args) => doConsoleWrite && console.error(...args),
debug: (...args) => doConsoleWrite && console.info(...args)
};


// --- UTIL: prende il nonce CSP (se presente in pagina SPO) ---
function getCspNonce() {
  const s = document.querySelector('script[nonce]');
  return s?.nonce || s?.getAttribute?.('nonce') || null;
}

// Carica SheetJS (same-origin) forzando la UMD a registrare su window.XLSX
async function loadXLSX() {
  const inject = (src) => new Promise((resolve, reject) => {
    // già presente e ok?
    if (window.XLSX && typeof window.XLSX.read === 'function') return resolve();

    // 1) Se esiste uno "stub" senza read, rimuovilo prima del load
    let hadStub = false, prevStub = null;
    if (window.XLSX && typeof window.XLSX.read !== 'function') {
      hadStub = true;
      prevStub = window.XLSX;
      try { delete window.XLSX; } catch { window.XLSX = undefined; }
    }

    // 2) Maschera temporaneamente AMD per far scegliere il ramo window.*
    const prevDefine = window.define;
    const hadDefine = typeof prevDefine === 'function';
    try { if (hadDefine) window.define = undefined; } catch {}

    const s = document.createElement('script');
    s.src = src;
    const nonce = getCspNonce();
    if (nonce) s.setAttribute('nonce', nonce);

    s.onload = () => {
      // ripristina AMD
      if (hadDefine) window.define = prevDefine;

      // verifica aggancio corretto
      if (!window.XLSX || typeof window.XLSX.read !== 'function') {
        // fallback diagnostico: se serve, ripristina eventuale stub
        if (hadStub && prevStub) window.XLSX = prevStub;
        return reject(new Error('SheetJS caricato ma non ha esposto XLSX.read'));
      }
      resolve();
    };

    s.onerror = () => {
      if (hadDefine) window.define = prevDefine;
      if (hadStub && prevStub) window.XLSX = prevStub;
      reject(new Error('Impossibile caricare: ' + src));
    };

    document.head.appendChild(s);
  });

  // prova con cache-busting e poi senza (same-origin, niente CDN)
  const srcV = `${BASE_FRAMEWORK_PATH}/vendors/xlsx.full.min.js?v=${assetVersion}`;
  try {
    await inject(srcV);
  } catch {
    await inject(`${BASE_FRAMEWORK_PATH}/vendors/xlsx.full.min.js`);
  }

  // verifica finale
  if (!window.XLSX || typeof window.XLSX.read !== 'function') {
    throw new Error('SheetJS/XLSX non disponibile.');
  }
}


// === App Alpine ===
export default function importApp() {
  return {
    step: 1,
    file: null,
    headers: [],
    rows: [],
    fields: [
      'VenueName','Code','Type','Capacity',
      'DateStart','DateEnd','DailyWorkStartTime','DailyWorkEndTime',
      'Address','ShipmentContactDelivery','ShipmentContactPickUp',
      'Notes','Latitude','Longitude'
    ],
    mapping: {},
    mode: 'create', // 'create' | 'upsert_name' | 'upsert_code'
    previewCount: 10,
    previewRows: [],
    total: 0,
    done: 0,
    cancel: false,
    results: [],
    venueLogic: null,

    async init() {
      await loadXLSX();
      // NB: VenueLogic importa i core da /Framework/core/
      const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${assetVersion}`);
      this.venueLogic = new VenueLogic();
    },

    onFileChosen(e) { this.file = e.target.files?.[0] || null; },

    async parseFile() {
      if (!this.file) return;
      if (!window.XLSX || typeof XLSX.read !== 'function') {
        alert('Il lettore Excel non è ancora pronto. Riprova tra un istante.');
        return;
      }
      const buf = await this.file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];

      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!json.length) { alert('Il file sembra vuoto.'); return; }

      const hdr = (json[0] || []).map(h => String(h).trim());
      this.headers = hdr;

      const dataRows = json.slice(1).filter(r => r.some(cell => String(cell).trim() !== ''));
      this.rows = dataRows.map((r, idx) => {
        const o = {}; hdr.forEach((h,i)=>o[h] = r[i] ?? ''); o._row = idx+2; return o;
      });

      this.autoMap();
      this.buildPreview();
      this.step = 2;
    },

    autoMap() {
      const synonyms = {
        VenueName: ['VenueName','Name','Nome','Sede','Venue Name','Nome Sede'],
        Code: ['Code','Codice','ID','Cod','Ref'],
        Type: ['Type','Tipo','Categoria'],
        Capacity: ['Capacity','Capienza','Posti','Seats'],
        DateStart: ['DateStart','Start','Data Inizio','Start Date'],
        DateEnd: ['DateEnd','End','Data Fine','End Date'],
        DailyWorkStartTime: ['DailyWorkStartTime','Work Start','Ora Inizio'],
        DailyWorkEndTime: ['DailyWorkEndTime','Work End','Ora Fine'],
        Address: ['Address','Indirizzo','Location'],
        ShipmentContactDelivery: ['ShipmentContactDelivery','Delivery Contact','Contatto Consegna'],
        ShipmentContactPickUp: ['ShipmentContactPickUp','Pickup Contact','Contatto Ritiro'],
        Notes: ['Notes','Note','Osservazioni'],
        Latitude: ['Lat','Latitudine'],
        // ✅ fix: la chiave corretta è 'Longitude'
        Longitude: ['Lon','Long','Longitudine']
      };
      const hdrLower = this.headers.map(h => h.toLowerCase());
      this.fields.forEach(f => {
        const names = synonyms[f] || [f];
        let found = '';
        for (const n of names) {
          const idx = hdrLower.indexOf(n.toLowerCase());
          if (idx >= 0) { found = this.headers[idx]; break; }
        }
        this.mapping[f] = found || '';
      });
    },

    buildPreview() {
      this.previewRows = this.rows.slice(0, this.previewCount).map(r => this.mapRow(r));
    },

    mapRow(rowObj) {
      const out = {};
      for (const f of this.fields) {
        const col = this.mapping[f]; if (!col) continue;
        out[f] = rowObj[col] ?? '';
      }

      // Normalizzatori
      const toSPDateOnly = (d) => {
        if (!d) return null;
        if (typeof d === 'number' && XLSX.SSF) {
          const dt = XLSX.SSF.parse_date_code(d);
          if (dt) { const p=(x)=>String(x).padStart(2,'0'); return `${dt.y}-${p(dt.m)}-${p(dt.d)}T00:00:00`; }
        }
        const s = String(d).trim(); if (!s) return null;
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
        const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m2) { const dd=m2[1].padStart(2,'0'), mm=m2[2].padStart(2,'0'), yyyy=m2[3]; return `${yyyy}-${mm}-${dd}T00:00:00`; }
        return null;
      };
      if ('DateStart' in out) out.DateStart = toSPDateOnly(out.DateStart);
      if ('DateEnd'   in out) out.DateEnd   = toSPDateOnly(out.DateEnd);

      const toTimeHHMM = (v) => {
        if (v == null || v === '') return null;
        if (typeof v === 'number') {
          const total = Math.round(((v % 1) + 1) % 1 * 24 * 60); // gestisce numeri negativi o >1
          const hh = String(Math.floor(total / 60)).padStart(2, '0');
          const mm = String(total % 60).padStart(2, '0');
          return `${hh}:${mm}`;
        }
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2}):(\d{2})$/);
        if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
        return null;
      };

      if ('DailyWorkStartTime' in out) out.DailyWorkStartTime = toTimeHHMM(out.DailyWorkStartTime);
      if ('DailyWorkEndTime'   in out) out.DailyWorkEndTime   = toTimeHHMM(out.DailyWorkEndTime);


      if ('Capacity' in out) {
        const n = parseInt(String(out.Capacity).replace(/\D+/g,''), 10);
        out.Capacity = Number.isFinite(n) ? n : null;
      }

      // lat/long (accetta virgola decimale)
      if ('Latitude' in out && typeof out.Latitude === 'string') {
        const v = out.Latitude.replace(',', '.');
        out.Latitude = v === '' ? null : Number(v);
      }
      if ('Longitude' in out && typeof out.Longitude === 'string') {
        const v = out.Longitude.replace(',', '.');
        out.Longitude = v === '' ? null : Number(v);
      }

      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && out[k].trim() === '') out[k] = null;
      }
      return out;
    },

    async startImport() {
      const payloads = this.rows
        .map(r => ({ _row: r._row, data: this.mapRow(r) }))
        .filter(x => Object.keys(x.data).length > 0);

      this.total = payloads.length;
      this.done = 0;
      this.results = [];
      this.cancel = false;
      this.step = 3;

      const queue = payloads.slice();
      const limit = 3;
      const workers = Array.from({ length: limit }, () => this.worker(queue));
      await Promise.all(workers);
    },

    downloadTemplate() {
      if (!window.XLSX) { alert('Generatore template non ancora disponibile. Attendi qualche secondo e riprova.'); return; }

      const headers = this.fields.slice();
      // Riga d'esempio (puoi cancellarla)
      const example = [
        'Esempio Venue', '200', 'Centro congressi', 1000,
        new Date(2025, 0, 1), new Date(2025, 11, 31),
        null, null, // orari li settiamo come numeri frazionari più sotto
        'Via Esempio 123, Milano',
        'Mario Rossi – 3331234567',
        'Luigi Bianchi – 3339876543',
        'Note di esempio (cancella questa riga prima di importare).',
        45.464211, 9.191383
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);

      // Larghezze colonne
      ws['!cols'] = [
        { wch: 24 }, // VenueName
        { wch: 14 }, // Code
        { wch: 16 }, // Type
        { wch: 10 }, // Capacity
        { wch: 14 }, // DateStart
        { wch: 14 }, // DateEnd
        { wch: 10 }, // DailyWorkStartTime
        { wch: 10 }, // DailyWorkEndTime
        { wch: 35 }, // Address
        { wch: 28 }, // ShipmentContactDelivery
        { wch: 28 }, // ShipmentContactPickUp
        { wch: 40 }, // Notes
        { wch: 13 }, // Latitude
        { wch: 13 }  // Longitude
      ];

      // AutoFilter
      ws['!autofilter'] = { ref: 'A1:N1' };

      // Formattazione celle della riga 2 (date, orari, numeri)
      const enc = XLSX.utils.encode_cell;
      const set = (c, obj) => ws[enc({ c, r: 1 })] = obj;
      // Capacity
      set(3, { t: 'n', v: 100, z: '0' });
      // DateStart / DateEnd
      set(4, { t: 'd', v: new Date(2025, 0, 1),  z: 'yyyy-mm-dd' });
      set(5, { t: 'd', v: new Date(2025, 11, 31), z: 'yyyy-mm-dd' });
      // Orari come frazione del giorno (08:00 e 18:00)
      const tnum = (h, m) => (h * 60 + m) / (24 * 60);
      set(6, { t: 'n', v: tnum(8, 0),  z: 'hh:mm' });
      set(7, { t: 'n', v: tnum(18, 0), z: 'hh:mm' });
      // Coordinate
      set(12, { t: 'n', v: 45.464211, z: '0.000000' });
      set(13, { t: 'n', v: 9.191383,  z: '0.000000' });

      XLSX.utils.book_append_sheet(wb, ws, 'Venues');
      XLSX.writeFile(wb, 'Venues_Template.xlsx', { compression: true });
    },


    async worker(queue) {
      while (queue.length && !this.cancel) {
        const item = queue.shift();
        try {
          const res = await this.processItem(item);
          this.results.push({ _row: item._row, status: res.status, message: res.message, id: res.id, data: item.data });
        } catch (e) {
          this.results.push({ _row: item._row, status: 'error', message: e?.message || 'Errore', data: item.data });
        } finally {
          this.done++;
        }
      }
    },

    async processItem(item) {
      const data = item.data;

      if (this.mode === 'create') {
        const created = await this.venueLogic.create(data);
        return { status: 'created', message: 'Creato', id: created?.Id };
      }

      const uniqueField = this.mode === 'upsert_name' ? 'VenueName' : 'Code';
      const key = data[uniqueField];

      if (!key) {
        const created = await this.venueLogic.create(data);
        return { status: 'created', message: 'Creato (nessuna chiave upsert)', id: created?.Id };
      }

      // trova Id dalla chiave
      try {
        const { siteUrl, headers } = await import(`${BASE_FRAMEWORK_PATH}/config/context.js?v=${assetVersion}`);
        const safe = String(key).trim().replace(/'/g,"''");
        const url = `${siteUrl}/_api/web/lists/getbytitle('venues')/items?$select=Id,${uniqueField}&$filter=${uniqueField} eq '${safe}'&$top=1`;
        const resp = await fetch(url, { method: 'GET', headers });
        if (resp.ok) {
          const js = await resp.json();
          const id = js?.d?.results?.[0]?.Id;
          if (id) {
            const upd = { ...data, Id: id };
            await this.venueLogic.update(upd);
            return { status: 'updated', message: 'Aggiornato', id };
          }
        }
      } catch { /* ignora e crea */ }

      const created = await this.venueLogic.create(data);
      return { status: 'created', message: 'Creato (nuovo)', id: created?.Id };
    },

    get progressPct() { return this.total ? Math.round((this.done/this.total)*100) : 0; },

    downloadReport() {
      const rows = [
        ['Row','Status','Message','Id','VenueName','Code'],
        ...this.results.map(r => [r._row, r.status, r.message||'', r.id||'', r.data?.VenueName||'', r.data?.Code||''])
      ];
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'import-results.csv'; a.click();
      URL.revokeObjectURL(a.href);
    }
  };
}

// Esponi per Alpine/loader
window.importApp = importApp;
