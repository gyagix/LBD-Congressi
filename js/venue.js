    
    /*
        Definizione costanti
    */ 
    const isDevArea = (window.location.pathname.includes('bethelfacilitysupport')) ? 1 : 0; 
    const doConsoleWrite = isDevArea ? true : false;

    const sharePointFolder = isDevArea ? "/sites/ita-lbd-bethelfacilitysupport" : "/sites/ita-lbd";           
    

    

    // DEV: busting aggressivo ad ogni refresh (in produzione userai una stringa fissa tipo "1.3.2")
    window.assetVersion = isDevArea ? String(Date.now()) : '1.0.0';
    // PROD: busting statico, evita di cambiare ad ogni refresh
    // window.assetVersion = '1.1.1'; // per produzione, evita busting ad ogni refresh

    // (opzionale) Base assoluta della libreria Framework, può tornare utile per import dinamici
    const BASE_FRAMEWORK_PATH = `https://jwsite.sharepoint.com/${sharePointFolder}/LBDSharepoint%20Code/Framework`;
    window.BASE_FRAMEWORK_PATH = BASE_FRAMEWORK_PATH;
    
    const logger = {
        log: (...args) => doConsoleWrite && console.log(...args),
        warn: (...args) => doConsoleWrite && console.warn(...args),
        error: (...args) => doConsoleWrite && console.error(...args),
    };

    function venuesApp() {
        return {
            overlayContainer:null,
            editContainer:null, //container di modifica
            notif:null, //div per le notifiche
            notifyMsg:null,
            notifTimeout:null,
            loading:null,
            search: '',
            sortKey: 'Id',
            sortAsc: true,
            venues: [],
            filteredVenues: [],
            typeOptions: [],
            form: {
                Id: null,
                Code: '',
                VenueName: '',
                Type: '',
                Capacity: 0,
                DateStart: '',
                DateEnd: '',
                DailyWorkStartTime: '',
                DailyWorkEndTime: '',
                Address: '',
                ShipmentContactDelivery: '',
                ShipmentContactPickUp: '',
                Notes: '',
                Latitude: 0,
                Longitude: 0
            },

            async init() {
                window.assetVersion = window.assetVersion || String(Date.now()); // se non già definita

                this.overlayContainer = document.getElementById("overlayContainer");
                this.editContainer = document.getElementById("venueEditContainer"); 
                this.notif = document.getElementById("divNotification");
                this.notifyMsg = document.getElementById("notifMsg");
                this.loading = document.getElementById("divLoading");

                const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${window.assetVersion}`);
                this.venueLogic = new VenueLogic();
                this.typeOptions = (VenueLogic.allowedTypes || []).slice();
                await this.loadVenues();
            },

            async loadVenues() {
                try {
                    // ✅ passa un filtro oggetto, non []
                    const data = await this.venueLogic.query({}, 500);
                    this.venues = data || [];
                    this.filterVenues();
                } catch (e) {
                    logger.error('Errore caricamento venues:', e);
                    this.showNotification('Errore caricamento venues, controlla console.','error');
                }
            },



            filterVenues() {
                const s = this.search.toLowerCase();
                this.filteredVenues = this.venues.filter((v) =>
                    Object.values(v).some((val) => String(val || '').toLowerCase().includes(s))
                );
                this.sortVenues();
            },

            sortVenues() {
                if (!this.sortKey) return;
                const k = this.sortKey;
                this.filteredVenues.sort((a, b) => {
                    const va = a[k], vb = b[k];

                    // numeri
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return this.sortAsc ? va - vb : vb - va;
                    }
                    // date ISO o data SharePoint
                    const da = Date.parse(va), db = Date.parse(vb);
                    if (!isNaN(da) && !isNaN(db)) {
                        return this.sortAsc ? da - db : db - da;
                    }
                    // fallback stringa
                    const fa = (va ?? '').toString().toLowerCase();
                    const fb = (vb ?? '').toString().toLowerCase();
                    if (fa < fb) return this.sortAsc ? -1 : 1;
                    if (fa > fb) return this.sortAsc ? 1 : -1;
                    return 0;
                });
            },

            sortBy(key) {
                if (this.sortKey === key) this.sortAsc = !this.sortAsc;
                else {
                    this.sortKey = key;
                    this.sortAsc = true;
                }
                this.sortVenues();
            },
            newVenue(venue){
                this.resetForm();
                this.openOverlay();
                this.openContentEditor();
            },
            editVenue(venue) {
                
                // Copia profonda per evitare binding diretto
                this.form = { ...venue };
                // Date trimming (solo YYYY-MM-DD)
                if (venue.DateStart) this.form.DateStart = venue.DateStart.split('T')[0];
                if (venue.DateEnd) this.form.DateEnd = venue.DateEnd.split('T')[0];
                // in caso di dati legacy (valori non più ammessi), mostrali comunque
                if (this.form.Type && !this.typeOptions.includes(this.form.Type)) {
                    this.typeOptions = [...this.typeOptions, this.form.Type];
                }                        

                this.openOverlay()
                this.openContentEditor();
            },

            resetForm() {
                this.form = {
                    Id: null,
                    Code: '',
                    VenueName: '',
                    Type: '',
                    Capacity: 0,
                    DateStart: '',
                    DateEnd: '',
                    DailyWorkStartTime: '',
                    DailyWorkEndTime: '',
                    Address: '',
                    ShipmentContactDelivery: '',
                    ShipmentContactPickUp: '',
                    Notes: '',
                    Latitude: null,
                    Longitude: null
                };
            },

            async saveVenue() {
                try {
                    // clone “pulito” per evitare Proxy Alpine
                    const payload = JSON.parse(JSON.stringify(this.form));

                    // numeri
                    if (payload.Capacity !== '' && payload.Capacity != null) {
                        const n = parseInt(payload.Capacity, 10);
                        payload.Capacity = isNaN(n) ? null : n;
                    } else {
                        payload.Capacity = null;
                    }

                    // Coordinate Geografiche
                    
                    if (payload.Latitude !== '' && payload.Latitude != null) {
                        const lat = parseFloat(payload.Latitude);
                        payload.Latitude = isNaN(lat) ? null : lat;
                    } else {
                        payload.Latitude = null;
                    }
                    if (payload.Longitude !== '' && payload.Longitude != null) {
                        const lon = parseFloat(payload.Longitude);
                        payload.Longitude = isNaN(lon) ? null : lon;
                    } else {
                        payload.Longitude = null;
                    }
                    

                    // date-only -> "YYYY-MM-DDT00:00:00"
                    const toSPDateOnly = (d) => d ? `${d}T00:00:00` : null;
                    payload.DateStart = toSPDateOnly(payload.DateStart);
                    payload.DateEnd   = toSPDateOnly(payload.DateEnd);

                    // campi testuali opzionali -> null se vuoti (coerenza con BLL)
                    const opt = ['DailyWorkStartTime','DailyWorkEndTime','Address',
                                'ShipmentContactDelivery','ShipmentContactPickUp','Notes'];
                    for (const k of opt) payload[k] = payload[k] || null;

                    if (payload.Id != null && payload.Id !== '') {
                        await this.venueLogic.update(payload);   // MERGE
                    } else {
                        await this.venueLogic.create(payload);   // POST
                    }

                    await this.loadVenues();
                    this.resetForm();
                    this.closeContentEditor()
                    this.closeOverlay();
                    this.showNotification('Salvato con successo.','success');
                } catch (e) {

                    const msg = (e?.message || '').toLowerCase();
                    if ((msg.includes('esiste gi') && msg.includes('un elemento')) || msg.includes('unicit')) {
                        logger.log('[DEBUG] app.js->saveVenue: Errore salvataggio venue: Nome già presente', e);
                        this.showNotification('Nome già presente. Scegli un nome diverso.','error');
                    } else {
                        logger.log('[DEBUG] app.js->saveVenue: Errore generico:', e);
                        this.showNotification('Errore nel salvataggio, controlla console.','error');
                    }          
                }
            },

            async deleteVenue(id) {
                if (!confirm('Sei sicuro di voler eliminare questa venue?')) return;
                try {
                // se la tua delete vuole l'oggetto:
                // await this.venueLogic.delete({ Id: id });
                await this.venueLogic.delete(id);
                await this.loadVenues();
                this.closeContentEditor()
                this.closeOverlay();
                } catch (e) {
                    logger.error('Errore cancellazione venue:', e);
                    this.showNotification('Errore nella cancellazione, controlla console.','error');
                }
            },

            formatDate(dateStr) {
                if (!dateStr) return '';
                const d = new Date(dateStr);
                if (isNaN(d)) return dateStr;
                return d.toLocaleDateString('it-IT');
            },

            showNotification(message, type){
                this.notifyMsg.textContent = message;
                this.notif.className = `notification ${type} show`;

                // se è successo: autoclose dopo 3 secondi
                switch(type){
                    case "success":
                    clearTimeout(this.notifTimeout);
                    this.notifTimeout = setTimeout(() => {
                                            this.hideNotification();
                                        }, 3000);
                    break;
                    case "error":
                        // errore → resta finché non chiudi con la X
                        clearTimeout(this.notifTimeout);
                    break;
                }
            },
            hideNotification(){ 
                this.notif.classList.remove("notificationShow");
            },
            openOverlay(){
                this.overlayContainer.classList.remove('overlayhidden');
                this.overlayContainer.classList.add('overlay');
            },
            closeOverlay(){
                this.overlayContainer.classList.add('overlayhidden');
                this.overlayContainer.classList.remove('overlay');
            },
            openContentEditor(){
                
                this.editContainer.classList.remove('mopdelContentHidden');
            },
            closeContentEditor(){                
                this.editContainer.classList.add('mopdelContentHidden');
            },
            showLoading(){
                this.loading.classList.add("loadingShow");
            },
            hideLoading(){
                this.loading.classList.remove("loadingShow");
            }
        };
    };


