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
    //window.BASE_FRAMEWORK_PATH = BASE_FRAMEWORK_PATH;
    
    const logger = {
        log: (...args) => doConsoleWrite && console.log(...args),
        warn: (...args) => doConsoleWrite && console.warn(...args),
        error: (...args) => doConsoleWrite && console.error(...args),
		debug: (...args) => doConsoleWrite && console.info(...args),
    };

	function eventsApp() {
		return {
			overlayContainer:null,
			editContainer:null, //container di modifica
			editTablesCols:null, //container delle colonne da mostrare/nascondere
			notif:null, //div per le notifiche
			notifyMsg:null,
			notifTimeout:null,
			loading:null,
			tableList:null,
			search: '',
			sortKey: 'Id',
			sortAsc: true,
			events: [],
			filteredEvents: [],
			typeOptions: [],
			venueOptions: [],
			form: {
				Id: null,
				EventNumber: '',
				EventName: '',
				Type: '',
				DateStart: '',
				DateEnd: '',
				Language: '',
				Email: '',
				VenueId: '',
				CodeVenue: '',
				Venue:null
			},
			fields:[
					{ name: 'Id', type: 'number', label: 'ID', showInTableList:true },
					{ name: 'EventNumber', type: 'number', label: 'Numero', showInTableList:true  },
					{ name: 'EventName', type: 'text', label: 'Nome', showInTableList:true  },
					{ name: 'Type', type: 'text', label: 'Tipo', showInTableList:true  },
					{ name: 'DateStart', type: 'date', label: 'Data Inizio', showInTableList:true  },
					{ name: 'DateEnd', type: 'date', label: 'Data Fine', showInTableList:true  },
					{ name: 'Language', type: 'text', label: 'Lingua', showInTableList:true },
					{ name: 'Email', type: 'text', label: 'Email', showInTableList:true },
					{ name: 'CodeVenue', type: 'text', label: 'Venue Code', showInTableList:true }
					/*
					,{ name: 'VenueId', type: 'number', label: 'Id Venue', showInTableList:false }
					*/
			],
			get tableListCkAllChecked() {
				return this.fields.every(f => f.showInTableList);
			},
			set tableListCkAllChecked(value) {
				this.fields.forEach(f => f.showInTableList = value);
			},            
			editTableListToggleAll() {
				let newVal = !this.tableListCkAllChecked;
				this.fields.forEach(f => f.showInTableList = newVal);
			},
			async init() {
				window.assetVersion = window.assetVersion || String(Date.now()); // se non già definita

				this.overlayContainer = document.getElementById("overlayContainer");
				this.editContainer = document.getElementById("editContainer"); 
				this.notif = document.getElementById("divNotification");
				this.notifyMsg = document.getElementById("notifMsg");
				this.loading = document.getElementById("divLoading");

				this.tableList = document.getElementById("tableList");
				this.editTablesCols = document.getElementById("editVisibilityTableCols");
				
				const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${window.assetVersion}`);
				const { EventLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/EventLogic.js?v=${window.assetVersion}`);

				this.showHideTableListFields();

				this.venueLogic = new VenueLogic();
				this.eventLogic = new EventLogic();

				this.typeOptions = (EventLogic.allowedTypes || []).slice();
				await this.loadVenues();
				await this.loadEvents();
			},

			async loadVenues() {
				this.showLoading("Caricamento dati in corso...")
				try {
					const data = await this.venueLogic.query({}, 500);
					this.venueOptions = data || [];
				} catch (e) {
					logger.error('Errore caricamento venues:', e);
					this.showNotification('Errore caricamento venues, controlla logger.');
				}
				finally{
					this.closeOverlay();
				}
			},

			async loadEvents() {
				this.showLoading("Caricamento dati in corso...")
				try {
					const data = await this.eventLogic.query({}, 500); // già injectato nel BLL
					this.events = data || [];
					this.showHideTableListFields()
					this.filterEvents();
				} catch (e) {
					logger.error('Errore caricamento eventi:', e);
					this.showNotification('Errore caricamento eventi, controlla logger.','error');
				}
				finally{
					this.closeOverlay();
				}
			},

			filterEvents() {
				const s = this.search.toLowerCase();
				this.filteredEvents = this.events.filter((e) =>
					Object.values(e).some((val) => String(val || '').toLowerCase().includes(s))
				);
				this.sortEvents();
			},

			sortEvents() {
				if (!this.sortKey) return;
				const k = this.sortKey;
				this.filteredEvents.sort((a, b) => {
					const va = a[k], vb = b[k];
					if (typeof va === 'number' && typeof vb === 'number') return this.sortAsc ? va - vb : vb - va;
					const da = Date.parse(va), db = Date.parse(vb);
					if (!isNaN(da) && !isNaN(db)) return this.sortAsc ? da - db : db - da;
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
				this.sortEvents();
				},
			
			newEvent(){
				this.resetForm();
				this.openOverlay();
				this.openContentEditor();
			},
			editEvent(event) {

				this.form = { ...event };
				if (event.DateStart) this.form.DateStart = event.DateStart.split('T')[0];
				if (event.DateEnd) this.form.DateEnd = event.DateEnd.split('T')[0];
				if (this.form.Type && !this.typeOptions.includes(this.form.Type)) {
					this.typeOptions = [...this.typeOptions, this.form.Type];
				}
				this.form.CodeVenue = event.Venue.Code || '';

				this.openContentEditor();
			},

			resetForm() {
				this.form = {
					Id: null,
					EventNumber: '',
					EventName: '',
					Type: '',
					DateStart: '',
					DateEnd: '',
					Language: '',
					Email: '',
					VenueId: '',
					CodeVenue: '',
					Venue: null
				};
			},

			updateCodeVenue() {
				//logger.log(this.form)
				const venueSelected = this.venueOptions.find(v => v.Id === parseInt(this.form.VenueId));
				this.form.CodeVenue = venueSelected?.Code || '';
				//logger.log("updateCodeVenue",venueSelected?.Code,"form",this.form.CodeVenue)
			},

			updateEmail() {
				const name = this.form.EventName?.trim().replace(/\s+/g, '').toLowerCase();
				const number = this.form.EventNumber?.toString().padStart(3, '0');
				this.form.Email = name && number ? `${name}${number}@jwpub.org` : '';
			},

			async saveEvent() {
				this.showLoading("Caricamento dati in corso...")
				try {
					const payload = JSON.parse(JSON.stringify(this.form));

					logger.log('saveEvent', payload);

					const toSPDateOnly = (d) => d ? `${d}T00:00:00` : null;
					payload.DateStart = toSPDateOnly(payload.DateStart);
					payload.DateEnd = toSPDateOnly(payload.DateEnd);

					this.updateEmail();
					payload.Email = this.form.Email;

					// Assicurati che Venue sia solo l'id
					if (payload.Venue && typeof payload.Venue === 'object' && payload.Venue.Id) {
					payload.Venue = payload.Venue;
					} else if (payload.VenueId) {
					payload.Venue = payload.VenueId;
					}

					if (payload.Id != null && payload.Id !== '' &&payload.Venue != null && payload.Venue !== '') {
						await this.eventLogic.update(payload);
					} else {
						await this.eventLogic.create(payload);
					}

					await this.loadEvents();
					this.resetForm();
					this.showNotification('Evento salvato con successo.');
				} catch (e) {
					const msg = (e?.message || '').toLowerCase();
					if (msg.includes('esiste già un elemento') || msg.includes('unicità')) {
						logger.log('[DEBUG] app.js->saveEvent: Errore salvataggio evento: Nome già presente', e);
						this.showNotification('Nome già presente. Scegli un nome diverso.','error');
					} else {
						logger.log('[DEBUG] app.js->saveEvent: Errore generico:', e);
						this.showNotification('Errore nel salvataggio, controlla logger.','error');						
					}
					this.hideLoading();
				}
			},

			async deleteEvent(id) {
				if (!confirm('Sei sicuro di voler eliminare questo evento?')) return;
				try {
					await this.eventLogic.delete(id);
					await this.loadEvents();
				} catch (e) {
					logger.error('Errore cancellazione evento:', e);
					this.showNotification('Errore nella cancellazione, controlla logger.','error');
				}
			},

			formatDate(dateStr) {
				if (!dateStr) return '';
				const d = new Date(dateStr);
				if (isNaN(d)) return dateStr;
				return d.toLocaleDateString('it-IT');
				},
			
			showHideTableListFields(){

				this.fields.forEach(field => {   
					//logger.log("showHideTableListFields",'field',field)
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
				this.openOverlay();
				if(this.editTablesCols == null){
					this.editTablesCols = document.getElementById("editVisibilityTableCols")
				}
				logger.log('openEditTableListShowHide',this.editTablesCols)
				this.editTablesCols.classList.remove("modalShowHideTableColsHidden")
			},
			saveTableListShowHide(){
				this.showLoading("Aggiornamento colonne in corso")
				this.editTablesCols.classList.add("modalShowHideTableColsHidden")
				this.showHideTableListFields();
				this.hideLoading();
				this.closeOverlay();
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
		}
	}