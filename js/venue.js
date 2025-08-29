    
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
            tableList:null,
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
            fields:[
                { name: 'Id', type: 'number', label: 'ID', showInTableList:1 },
                { name: 'Code', type: 'text', label: 'Codice', showInTableList:1  },
                { name: 'VenueName', type: 'text', label: 'Nome', showInTableList:1  },
                { name: 'Type', type: 'text', label: 'Tipo', showInTableList:1  },
                { name: 'Capacity', type: 'number', label: 'Capacita', showInTableList:1  },
                { name: 'DateStart', type: 'date', label: 'Data Inizio', showInTableList:1  },
                { name: 'DateEnd', type: 'date', label: 'Data Fine', showInTableList:1  },
                { name: 'DailyWorkStartTime', type: 'time', label: 'Ora Inizio', showInTableList:0 },
                { name: 'DailyWorkEndTime', type: 'time', label: 'Ora Fine', showInTableList:0 },
                { name: 'Address', type: 'text', label: 'Indirizzo', showInTableList:0 },
                { name: 'ShipmentContactDelivery', type: 'text', label: 'Contatto consegna', showInTableList:0 },
                { name: 'ShipmentContactPickUp', type: 'text', label: 'Contatto ritiro', showInTableList:0 },
                { name: 'Notes', type: 'text', label: 'Note', showInTableList:0 },
                { name: 'Latitude', type: 'number', label: 'Latitudine', showInTableList:0 },
                { name: 'Longitude', type: 'number', label: 'Longitudine', showInTableList:0 }
            ],

            async init() {
                window.assetVersion = window.assetVersion || String(Date.now()); // se non già definita

                this.overlayContainer = document.getElementById("overlayContainer");
                this.editContainer = document.getElementById("venueEditContainer"); 
                this.notif = document.getElementById("divNotification");
                this.notifyMsg = document.getElementById("notifMsg");
                this.loading = document.getElementById("divLoading");

                this.tableList = document.getElementById("tableList");
                

                const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${window.assetVersion}`);
                this.venueLogic = new VenueLogic();
                this.typeOptions = (VenueLogic.allowedTypes || []).slice();
                await this.loadVenues();
            },

            async loadVenues() {
                this.showLoading("Caricamento dati in corso...")
                try {
                    // ✅ passa un filtro oggetto, non []
                    const data = await this.venueLogic.query({}, 500);
                    this.venues = data || [];                    
                    this.showHideTableListFields()
                    this.filterVenues();
                    this.closeOverlay();
                } catch (e) {
                    logger.error('Errore caricamento venues:', e);
                    this.showNotification('Errore caricamento venues, controlla console.','error');
                }

                this.closeOverlay();
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
                this.showLoading();
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

                    this.resetForm();
                    this.closeContentEditor();
                    await this.loadVenues();
                    this.showNotification('Salvato con successo.','success');
                } catch (e) {
                    this.closeOverlay();
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
                this.closeContentEditor();
                await this.loadVenues();
                } catch (e) {
                    logger.error('Errore cancellazione venue:', e);
                    this.showNotification('Errore nella cancellazione, controlla console.','error');
                }
            },


            showHideTableListFields(){
                this.fields.forEach(field => {   
                    const tdFields = this.tableList.querySelectorAll(`td[data-name="${field.name}"]`);
                    tdFields.forEach(td => {
                        if(field.showInTableList == 1){
                            td.classList.remove("table-list-column-hide")
                        }else{
                            td.classList.add("table-list-column-hide")
                        }
                    })
                    
                    const thField = this.tableList.querySelector(`th[data-name="${field.name}"]`);
                    if(field.showInTableList == 1){
                        thField.classList.remove("table-list-column-hide")
                    }else{
                        thField.classList.add("table-list-column-hide")
                    }

                    
                })
            },
            openEditTableListShowHide(){
                alert("W.i.P.")
            },
            saveTableListShowHide(){

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
                                        }, 4000);
                    break;
                    case "error":
                        // errore → resta finché non chiudi con la X
                        clearTimeout(this.notifTimeout);
                    break;
                }
            },
            hideNotification(){ 
                this.notif.classList.remove("show");
            },
            openOverlay(){
                this.overlayContainer.classList.remove('overlayhidden');
                //this.overlayContainer.classList.add('overlay');
            },
            closeModalEdit(){
                this.closeOverlay();
            },
            closeOverlay(){
                this.overlayContainer.classList.add('overlayhidden');
                this.hideLoading();
                this.closeContentEditor()
                //this.overlayContainer.classList.remove('overlay');
            },
            openContentEditor(){      
                this.openOverlay();          
                this.editContainer.classList.remove('modelContentHidden');
            },
            closeContentEditor(){                
                this.editContainer.classList.add('modelContentHidden');
            },
            showLoading(myText = "Salvataggio in corso"){
                this.openOverlay();
                // prende il primo <p> dentro a divLoading
                let p = this.loading.querySelector("p");
                p.textContent = myText;
                
                this.loading.classList.remove("loading-hide");
            },
            hideLoading(){
                this.loading.classList.add("loading-hide");
            }
        };
    };


