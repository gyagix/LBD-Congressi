	/*
        Definizione costanti
    */ 
    const isDevArea = (window.location.pathname.includes('bethelfacilitysupport')) ? 1 : 0; 
    const doConsoleWrite = isDevArea ? true : false;

    const sharePointFolder = isDevArea ? "/sites/ita-lbd-bethelfacilitysupport" : "/sites/ita-lbd";           
    
    // DEV: busting aggressivo ad ogni refresh (in produzione userai una stringa fissa tipo "1.3.2")
    window.assetVersion = isDevArea ? String(Date.now()) : '1.0.0';
	console.log("assetVersion:", window.assetVersion);

    // PROD: busting statico, evita di cambiare ad ogni refresh
    // window.assetVersion = '1.1.1'; // per produzione, evita busting ad ogni refresh

    // (opzionale) Base assoluta della libreria Framework, può tornare utile per import dinamici
    const BASE_FRAMEWORK_PATH = `https://jwsite.sharepoint.com/${sharePointFolder}/LBDSharepoint%20Code/Framework`;
    //window.BASE_FRAMEWORK_PATH = BASE_FRAMEWORK_PATH;
    
	// URL assoluto del Web per chiamate REST API (utile per import dinamici) fuori model SP Core
	const webUrl = `${window.location.origin}${sharePointFolder}`;

    const logger = {
        log: (...args) => doConsoleWrite && console.log(...args),
        warn: (...args) => doConsoleWrite && console.warn(...args),
        error: (...args) => doConsoleWrite && console.error(...args),
		debug: (...args) => doConsoleWrite && console.info(...args)
    };

	export function projectApp() {
		return {
			overlayContainer:null,
			editContainer:null, //container di modifica
			editTablesCols:null, //container delle colonne da mostrare/nascondere
			editContainerAssoc:null,
			notif:null, //div per le notifiche
			notifyMsg:null,
			notifTimeout:null,
			loading:null,
			tableList:null,
			search: '',
			sortKey: 'Id',
			sortAsc: true,
			projects: [],
			filteredProjects: [],
			typeOptions: [],
			venueOptions: [],
			designerOptions: [],
			form: {
				Id: null,
				ProjectCode: '',
				ProjectDescription: '',
				TipoProgetto: '',
				Anno: new Date().getFullYear(),
				VenueId: '',
				VenueName: '',
				DesignerId: '',
				Designer: ''
			},
			fields:[
					{ name: 'Id', type: 'number', label: 'ID', showInTableList:true },
					{ name: 'ProjectCode', type: 'text', label: 'Codice Progetto', showInTableList:true  },
					{ name: 'ProjectDescription', type: 'text', label: 'Descrizione', showInTableList:true  },
					{ name: 'TipoProgetto', type: 'text', label: 'Tipo', showInTableList:true  },
					{ name: 'Anno', type: 'number', label: 'Anno', showInTableList:true },
					{ name: 'VenueName', type: 'text', label: 'Venue Name', showInTableList:true },
					{ name: 'Designer', type: 'text', label: 'Designer', showInTableList:true }

			],
			get tableListCkAllChecked() {
				return this.fields.every(f => f.showInTableList);
			},
			set tableListCkAllChecked(value) {
				this.fields.forEach(f => f.showInTableList = value);
			},            
			async init() {
				window.assetVersion = window.assetVersion || String(Date.now()); // se non già definita

				this.overlayContainer = document.getElementById("overlayContainer");
				this.editContainer = document.getElementById("editContainer"); 
				this.editContainerAssoc = document.getElementById("editContainerAssociations");
				this.notif = document.getElementById("divNotification");
				this.notifyMsg = document.getElementById("notifMsg");
				this.loading = document.getElementById("divLoading");

				this.tableList = document.getElementById("tableList");
				this.editTablesCols = document.getElementById("editVisibilityTableCols");
				
				const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${window.assetVersion}`);
				const { DesignerLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/DesignerLogic.js?v=${window.assetVersion}`);
				const { ProjectLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/ProjectLogic.js?v=${window.assetVersion}`);

				this.showHideTableListFields();

				this.venueLogic = new VenueLogic();
				this.designerLogic = new DesignerLogic();
				this.projectLogic = new ProjectLogic();

				this.typeOptions = (ProjectLogic.allowedTypes || []).slice();
				await this.loadVenues();
				await this.loadDesigners();
				await this.loadProjects();
			},

			// Dentro Alpine.data(... return { ... })
			updateDesigner() {
				const id = Number(this.form.DesignerId) || null;
				this.form.DesignerId = id;

				const d = this.designers?.find(x => x.Id === id) || null;
				// Mantieni anche l’oggetto expanded per coerenza con le $expand
				this.form.Designer = d ? { Id: d.Id, Nome: d.Nome, Cognome: d.Cognome } : null;
			},

			updateCodeVenue() {
				const id = Number(this.form.VenueId) || null;
				this.form.VenueId = id;

				const v = this.venues?.find(x => x.Id === id) || null;
				this.form.Venue = v ? { Id: v.Id, Code: v.Code, VenueName: v.VenueName } : null;

				// Se vuoi che il ProjectCode si auto-compili dal Code della venue (facoltativo)
				if (v && (!this.form.ProjectCode || this.form.ProjectCode === '0' || this.form.ProjectCode === 0)) {
					this.form.ProjectCode = v.Code ?? this.form.ProjectCode;
				}
			},

			async loadVenues() {
				this.showLoading("Caricamento dati in corso...")
				try {
					const data = await this.venueLogic.query({}, 50);
					this.venueOptions = data || [];
					this.sortVenues("VenueName")
				} catch (e) {
					logger.error('Errore caricamento venues:', e);
					this.showNotification('Errore caricamento venues, controlla logger.','error');
				}
				finally{
					this.closeOverlay();
				}
			},

			async loadDesigners() {
				this.showLoading("Caricamento dati in corso...")
				try {
					const data = await this.designerLogic.query({
						filters : { 'Discontinued': false }
					}, 50);
					this.designerOptions = data || [];
					this.sortDesigner("Cognome");
				} catch (e) {
					logger.error('Errore caricamento designers:', e);
					this.showNotification('Errore caricamento designers, controlla logger.','error');
				}
				finally{
					this.closeOverlay();
				}
			},			

			async loadProjects() {
			    console.log("debug");
				this.showLoading("Caricamento dati in corso...")
				try {
					const data = await this.projectLogic.query({}, 500); // già injectato nel BLL
					this.projects = data || [];
					this.showHideTableListFields()
					this.filterProjects();
				} catch (e) {
					logger.error('Errore caricamento progetti:', e);
					this.showNotification('Errore caricamento progetti, controlla logger.','error');
				}
				finally{
					this.closeOverlay();
				}
			},

			filterProjects() {
				const s = this.search.toLowerCase();
				this.filteredProjects = this.projects.filter((e) =>
					Object.values(e).some((val) => String(val || '').toLowerCase().includes(s))
				);
				this.sortProjects();
			},
			sortVenues(sortKey) {
                if (!sortKey) return;
                const k = sortKey;
                this.venueOptions.sort((a, b) => {
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
			sortDesigner(sortKey) {
                if (!sortKey) return;
                const k = sortKey;
				//logger.log(this.designerOptions)
                this.designerOptions.sort((a, b) => {
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

			sortProjects() {
				if (!this.sortKey) return;
				const k = this.sortKey;
				this.filteredProjects.sort((a, b) => {
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
				this.sortProjects();
				},
			
			newProject(){
				this.resetForm();
				this.openOverlay();
				this.openContentEditor();
			},
			editProject(item) {

				this.form = { ...item };
				// Sistema le opzioni del tipo se non presente
				if (this.form.TipoProgetto && !this.typeOptions.includes(this.form.TipoProgetto)) {
					this.typeOptions = [...this.typeOptions, this.form.TipoProgetto];
				}
				this.form.VenueName = item.Venue.VenueName || '';
				this.form.Designer = item.Designer ? `${item.Designer.Cognome}, ${item.Designer.Nome}` : '';
				this.openContentEditor();
			},

			resetForm() {
				this.form = {
					Id: null,
					ProjectCode: '',
					ProjectDescription: '',
					TipoProgetto: '',
					Anno: new Date().getFullYear(),
					VenueId: '',
					Venue: null,
					DesignerId: '',
					Designer: ''
				};
			},


			async saveProject() {
				this.showLoading("Salvataggio dati in corso...")
				try {
					const payload = JSON.parse(JSON.stringify(this.form));

					logger.log('saveProject', payload);

					// ✅ usa direttamente VenueId / DesignerId
					if (payload.Id) {
						await this.projectLogic.update(payload);
					} else {
						await this.projectLogic.create(payload);
					}

					await this.loadProjects();
					this.resetForm();
					this.showNotification('Progetto salvato con successo.','success');
				} catch (e) {
					const msg = (e?.message || '').toLowerCase();
					if (msg.includes('esiste già un elemento') || msg.includes('unicità')) {
						logger.log('[DEBUG] app.js->saveEvent: Errore salvataggio Progetto: Nome già presente', e);
						this.showNotification('Nome già presente. Scegli un nome diverso.','error');
					} else {
						logger.log('[DEBUG] app.js->saveEvent: Errore generico:', e);
						this.showNotification('Errore nel salvataggio<br />' + (e?.message || ''),'error');				
					}
					this.hideLoading();
				}
			},

			async deleteProject(id) {
				if (!confirm('Sei sicuro di voler eliminare questo Progetto?')) return;
				this.showLoading("Operazione in corso")
				try {
					await this.projectLogic.delete(id);
					await this.loadProjects();
				} catch (e) {
					logger.error('Errore cancellazione Progetto:', e);
					this.showNotification('Errore nella cancellazione<br />' + (e?.message || ''),'error');
				}
				finally {					
					this.hideLoading();
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
				const anySelected = this.fields.some(f => f.showInTableList);
				if (!anySelected) {
					this.showNotification("Devi selezionare almeno una colonna da mostrare!",'warning');
					return; // Esce senza chiudere il pop-up
				}
				this.showLoading("Aggiornamento colonne in corso")
				this.editTablesCols.classList.add("modalShowHideTableColsHidden")
				this.showHideTableListFields();
				this.hideLoading();
				this.closeOverlay();
			},
            showNotification(message, type){
				const typeMsg = type || 'success';
                this.notifyMsg.innerHTML  = message;
                this.notif.className = `notification ${typeMsg} show`;

                // se è successo: autoclose dopo 3 secondi
                switch(typeMsg){
                    case "success":
                    clearTimeout(this.notifTimeout);
                    this.notifTimeout = setTimeout(() => {
                                            this.hideNotification();
                                        }, 3000);
                    break;
					case "warning":
                        // errore → resta finché non chiudi con la X
                        clearTimeout(this.notifTimeout);
						this.notifTimeout = setTimeout(() => {
												this.hideNotification();
											}, 5000);
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
				this.hideNotification()
            },
            showLoading(myText = "Salvataggio in corso"){
				logger.log("showLoading",myText)
                this.openOverlay();
                // prende il primo <p> dentro a divLoading
                let p = this.loading.querySelector("p");
                p.textContent = myText;
                
                this.loading.classList.remove("loading-hide");
            },
            hideLoading(){
                this.loading.classList.add("loading-hide");
            },
			
			assoc: {
				project: null,                 // progetto selezionato (oggetto riga)
				venueId: null,                 // per filtrare
				// Eventi
				events: {
					all: [], 
					linked: [],
					available: [],
					search: '',                    // tutti quelli filtrati per venue
					availableFiltered: []          // quelli filtrati per venue + ricerca
				},
				eventsOriginalLinks: [],       // snapshot per diffs
				eventsLinksLoaded: false,
				linked: [],                    // non usare, placeholder
				// Spedizioni
				shipments: {
					all: [],
					linked: [],
					available: [],                 // tutti quelli filtrati per venue
					search: '',
					availableFiltered: []          // quelli filtrati per venue + ricerca
				},
				shipmentsOriginalLinks: [],
				shipmentsLinksLoaded: false
			},

			// === OPEN/CLOSE ===
			// Apri Associations
			openAssociations(project) {
				this.openOverlay();
				this.editContainerAssoc.classList.remove('modelContentAssociationsHidden');
				
				try {
					logger.debug('[DEBUG] Avvio caricamento Associazioni a Progetto');

					// 1) Memorizzo il progetto selezionato
					this.assoc.project = project;
					
					
					// 2) Mostro SUBITO il modal via Alpine
					//this.ui.showAssociations = true;

					// 3) Tolgo le classi "hidden" in modo difensivo, quando il DOM è pronto
					/*
					this.$nextTick(() => {
						const overlay = document.getElementById('overlayContainer');
						if (overlay && overlay.classList.contains('overlayhidden')) {
							overlay.classList.remove('overlayhidden');
						}

						const modal = document.getElementById('editContainerAssociations');
						if (modal && modal.classList.contains('modelContentAssociationsHidden')) {
							modal.classList.remove('modelContentAssociationsHidden');
						}
					});
					*/

					// 4) Carico i dati (anche se vuoti, il modal rimane aperto)
					Promise.all([
						this.showLoading("Caricamento dati in corso..."),
						this.reloadEvents(),     // eventi disponibili filtrati per venue
						this.reloadShipping(),   // spedizioni disponibili filtrate per venue
						this.loadEventLinks(),	 // eventi già associati
						this.loadShipmentLinks() // spedizioni già associate
					])
					.then(() => this.hideLoading())
					.catch(err => {
						this.hideLoading();
						logger.error('Errore nel caricamento associazioni', err);
						this.showNotification('Errore nel caricamento associazioni', 'error');
					});

				} catch (err) {
					logger.error('openAssociations() error', err);
					this.showNotification('Errore apertura pannello associazioni', 'error');
				}
			},

			// Chiudi Associations
			closeAssociations() {
				this.hideLoading();
				this.editContainerAssoc.classList.add('modelContentAssociationsHidden');
				this.closeOverlay();
			},

			// === LOAD DISPONIBILI (filtrati per venue) ===
			async reloadEvents() {
				logger.log("reloadEvents",this.assoc.project.VenueId);
				if (!this.assoc.project.VenueId) { 
					this.assoc.events.all = []; 
					this.assoc.events.filtered = []; 
					return; 

				}

				const url = `${webUrl}/_api/web/lists/getbytitle('Events')/items`
				+ `?$select=Id,EventName,DateStart,DateEnd,VenueId`
				+ `&$filter=VenueId eq ${this.assoc.project.VenueId}`;

				const data = await this.spGET(url);
				this.assoc.events.all = data.value || [];
				this.recomputeAvailableEvents();

				this.filterEvents();
			},
			filterEvents() {
				const q = (this.assoc.events.search || '').toLowerCase();
				this.assoc.events.filtered = this.assoc.events.all.filter(ev =>
					`${ev.EventName ||''}`.toLowerCase().includes(q)
				);
			},

			async reloadShipping() {
				//logger.log("reloadShipping",this.assoc.project.VenueId,this.assoc.shipments.all);
				if (!this.assoc.project.VenueId) { 
					this.assoc.shipments.all = []; 
					this.assoc.shipments.filtered = []; 
					return; 
				}

				const url = `${webUrl}/_api/web/lists/getbytitle('Shippings')/items`
						+ `?$select=Id,ShipmentName,PickupDate,DeliveryDate,ToVenue/Id,ToVenue/Title`
						+ `&$expand=ToVenue`
						+ `&$filter=ToVenueId eq ${this.assoc.project.VenueId}`;

				const data = await this.spGET(url);
				this.assoc.shipments.all = data.value || [];
				this.recomputeAvailableShipments();

				this.filterShipping();
			},
			filterShipping() {
				const q = (this.assoc.shipments.search || '').toLowerCase();
				//logger.log("filterShipping",q);
				this.assoc.shipments.filtered = this.assoc.shipments.all.filter(sh =>
					`${sh.ShipmentName ||''}`.toLowerCase().includes(q)
				);

			},

			// === LOAD LINK ESISTENTI ===
			async loadEventLinks() {
				const pid = this.assoc.project?.Id;
				//logger.log("loadEventLinks",this.assoc.project,pid);
				if (!pid) return;
				const url = `${webUrl}/_api/web/lists/getbytitle('EventsXProgetto')/items
							?$select=Id,ProjectId/Id,EventId/Id,EventId/EventName,PeriodBegins,PeriodEnds
  							&$expand=ProjectId,EventId
  							&$filter=ProjectIdId eq ${pid}`;
				const data = await this.spGET(url);
				
				const links = (data.value || []).map(x => ({
					_key: `E-${x.Id}`,
					_spId: x.Id,
					ProjectId: x.ProjectId?.Id ?? this.assoc.project?.Id,
					EventId: x.EventId?.Id,                        
					PeriodBegins: x.PeriodBegins ? x.PeriodBegins.substring(0,10) : '',
					PeriodEnds: x.PeriodEnds ? x.PeriodEnds.substring(0,10) : '',
					_display: x.EventId.EventName || `Event ${x.EventId?.Id}` 
				}));

				this.assoc.events.linked = links;
				this.recomputeAvailableEvents();

				this.assoc.eventsOriginalLinks = JSON.parse(JSON.stringify(links)); // snapshot
				this.assoc.eventsLinksLoaded = true;
			},
			
			async loadShipmentLinks() {
				const pid = this.assoc.project?.Id;
				//logger.log("loadShipmentLinks",this.assoc.project,pid);
				if (!pid) return;
				const url = `${webUrl}/_api/web/lists/getbytitle('ShipmentsXProgetto')/items
							?$select=Id,ProjectId/Id,ShippingId/Id,ShippingId/ShipmentName,PeriodBegins,PeriodEnds
							&$expand=ProjectId,ShippingId
							&$filter=ProjectIdId eq ${pid}`;
				const data = await this.spGET(url);

				// Shipments
				const links = (data.value || []).map(x => ({
					_key: `S-${x.Id}`,
					_spId: x.Id,
					ProjectId: x.ProjectId?.Id ?? this.assoc.project?.Id,
					ShippingId: x.ShippingId?.Id,                 
					PeriodBegins: x.PeriodBegins ? x.PeriodBegins.substring(0,10) : '',
					PeriodEnds: x.PeriodEnds ? x.PeriodEnds.substring(0,10) : '',
					_display: x.ShippingId.ShipmentName || `Shipment ${x.ShippingId?.Id}` 
				}));

				this.assoc.shipments.linked = links;
				this.recomputeAvailableShipments();

				this.assoc.shipmentsOriginalLinks = JSON.parse(JSON.stringify(links));
				this.assoc.shipmentsLinksLoaded = true;
			},

			// === ADD/REMOVE IN UI ===
			addEvent(ev) {
				// crea un “link” temporaneo solo per UI; la tua logica di salvataggio già gestisce pending add/remove
				const link = {
					_key: `tmp-ev-${ev.Id}-${Date.now()}`,
					ProjectId: this.assoc.project.Id,
					EventId: ev.Id,
					_display: ev.EventName || '',
					PeriodBegins: this.formatDate(ev.DateStart),
					PeriodEnds: ev.DateEnd ? this.formatDate(ev.DateEnd) : ''
				};
				this.assoc.events.linked.push(link);

				// rimuovi dalla lista di sinistra
				this.assoc.events.available = this.assoc.events.available.filter(x => x.Id !== ev.Id);
				this.filterEvents(); // rigenera availableFiltered

				// se tieni una “pendingAddsEvents”, aggiungilo anche lì (opzionale se già presente nella tua save logic)
				this.assoc.events.pendingAdds = this.assoc.events.pendingAdds || [];
				this.assoc.events.pendingAdds.push({ EventId: ev.Id, PeriodBegins: link.PeriodBegins, PeriodEnds: link.PeriodEnds });
			},

			removeEvent(link) {
			// rimuovi da destra
			this.assoc.events.linked = this.assoc.events.linked.filter(l => l._key !== link._key);

			// rimetti in “available” se quell’evento esiste nell’elenco “all”
			const ev = this.assoc.events.all.find(e => Number(e.Id) === Number(link.EventId));
			if (ev) {
				this.assoc.events.available.push(ev);
				this.filterEvents();
			}

			// se tieni “pendingDeletesEvents”, segna la rimozione (opzionale se già presente)
			this.assoc.events.pendingDeletes = this.assoc.events.pendingDeletes || [];
			if (link.Id) {
				this.assoc.events.pendingDeletes.push(link.Id); // vero ID della riga link, se esiste
			}
			},

			addShipment(sh) {
				const link = {
					_key: `tmp-sh-${sh.Id}-${Date.now()}`,
					ProjectId: this.assoc.project.Id,
					ShippingId: sh.Id,
					_display: sh.ShipmentName || '',
					PeriodBegins: this.formatDate(sh.PickupDate),
					PeriodEnds: sh.DeliveryDate ? this.formatDate(sh.DeliveryDate) : ''
				};
				this.assoc.shipments.linked.push(link);

				this.assoc.shipments.available = this.assoc.shipments.available.filter(x => x.Id !== sh.Id);
				this.filterShipping();

				this.assoc.shipments.pendingAdds = this.assoc.shipments.pendingAdds || [];
				this.assoc.shipments.pendingAdds.push({ ShippingId: sh.Id, PeriodBegins: link.PeriodBegins, PeriodEnds: link.PeriodEnds });
			},

			removeShipment(link) {
				this.assoc.shipments.linked = this.assoc.shipments.linked.filter(l => l._key !== link._key);

				const sh = this.assoc.shipments.all.find(s => Number(s.Id) === Number(link.ShippingId));
				if (sh) {
					this.assoc.shipments.available.push(sh);
					this.filterShipping();
				}

				this.assoc.shipments.pendingDeletes = this.assoc.shipments.pendingDeletes || [];
				if (link.Id) {
					this.assoc.shipments.pendingDeletes.push(link.Id);
				}
			},

			resetAssociations() {
				this.assoc.events.linked = JSON.parse(JSON.stringify(this.assoc.eventsOriginalLinks || []));
				this.assoc.shipments.linked = JSON.parse(JSON.stringify(this.assoc.shipmentsOriginalLinks || []));
			},

			// === SAVE: calcola differenze e fa create/delete/update nelle liste ponte ===
			async saveAssociations() {
				
				this.showLoading("Salvataggio dati in corso")
				const pid = this.assoc.project?.Id;
				if (!pid) return;

				const evDiff = this.diffLinks(
					this.assoc.eventsOriginalLinks,  // old
					this.assoc.events.linked,        // now
					'EventId'
				);
				const shDiff = this.diffLinks(
					this.assoc.shipmentsOriginalLinks,
					this.assoc.shipments.linked,
					'ShippingId'
				);

				logger.log('saveAssociations | Eeents',this.assoc.eventsOriginalLinks,this.assoc.events.linked);
				logger.log('saveAssociations | DIFF',evDiff,shDiff);
				// EventsXProgetto
				for (const x of evDiff.toCreate) {
					await this.spPOSTCreate('EventsXProgetto', {
						ProjectIdId: pid,
						EventIdId: x.EventId,
						PeriodBegins: this.toIsoDate(x.PeriodBegins) || null,
						PeriodEnds: this.toIsoDate(x.PeriodEnds) || null
					});
				}
				for (const x of evDiff.toUpdate) {
					await this.spPOSTMerge('EventsXProgetto', x._spId, {
						PeriodBegins: this.toIsoDate(x.PeriodBegins) || null,
						PeriodEnds: this.toIsoDate(x.PeriodEnds) || null
					});
				}
				for (const x of evDiff.toDelete) {
					await this.spPOSTDelete('EventsXProgetto', x._spId);
				}

				// ShipmentsXProgetto
				for (const x of shDiff.toCreate) {
					await this.spPOSTCreate('ShipmentsXProgetto', {
					ProjectIdId: pid,
					ShippingIdId: x.ShippingId,
					PeriodBegins: this.toIsoDate(x.PeriodBegins) || null,
					PeriodEnds: this.toIsoDate(x.PeriodEnds) || null
					});
				}
				for (const x of shDiff.toUpdate) {
					await this.spPOSTMerge('ShipmentsXProgetto', x._spId, {
					PeriodBegins: this.toIsoDate(x.PeriodBegins) || null,
					PeriodEnds: this.toIsoDate(x.PeriodEnds) || null
					});
				}
				for (const x of shDiff.toDelete) {
					await this.spPOSTDelete('ShipmentsXProgetto', x._spId);
				}

				// ricarica snapshot e chiudi
				await Promise.all([
					this.loadEventLinks(this.assoc.project.Id),
					this.loadShipmentLinks(this.assoc.project.Id),
					this.reloadEvents(),        // per venue corrente
					this.reloadShipping()       // per venue corrente
				]);

				this.recomputeAvailableEvents();
				this.recomputeAvailableShipments();
				
				
				this.showNotification('Dati salvati con successo.','success');
				this.hideLoading();
				this.closeAssociations();
			},

			// === UTILS =========================================================
			// ---------- EVENTI ----------
			recomputeAvailableEvents() {
				const linkedIds = new Set(this.assoc.events.linked.map(l => Number(l.EventId)));
				this.assoc.events.available = this.assoc.events.all.filter(ev => !linkedIds.has(Number(ev.Id)));
				this.filterEvents(); // applica anche il testo di ricerca
			},
			filterEvents() {
				const q = (this.assoc.events.search || '').trim().toLowerCase();
				const base = this.assoc.events.available || [];
				if (!q) {
					this.assoc.events.availableFiltered = base.slice();
				} else {
					this.assoc.events.availableFiltered = base.filter(ev => {
					const name = (ev.EventName || '').toLowerCase();
					const date1 = (ev.DateStart || '').toString().toLowerCase();
					const date2 = (ev.DateEnd || '').toString().toLowerCase();
					return name.includes(q) || date1.includes(q) || date2.includes(q) || String(ev.Id).includes(q);
					});
				}
			},

			// ---------- SPEDIZIONI ----------
			recomputeAvailableShipments() {
				const linkedIds = new Set(this.assoc.shipments.linked.map(l => Number(l.ShippingId)));
				this.assoc.shipments.available = this.assoc.shipments.all.filter(sh => !linkedIds.has(Number(sh.Id)));
				this.filterShipping(); // applica anche il testo di ricerca
			},
			filterShipping() {
				const q = (this.assoc.shipments.search || '').trim().toLowerCase();
				const base = this.assoc.shipments.available || [];
				if (!q) {
					this.assoc.shipments.availableFiltered = base.slice();
				} else {
					this.assoc.shipments.availableFiltered = base.filter(sh => {
					const name = (sh.ShipmentName || '').toLowerCase();
					const d1 = (sh.PickupDate || '').toString().toLowerCase();
					const d2 = (sh.DeliveryDate || '').toString().toLowerCase();
					return name.includes(q) || d1.includes(q) || d2.includes(q) || String(sh.Id).includes(q);
					});
				}
			},
			
			
			
			findTitle(list, id) {
				const f = (list||[]).find(x => x.Id === id);
				return f ? (f.Title || f.Nome || `ID ${id}`) : `ID ${id}`;
			},

			formatDate(d) {
				if (!d) return '';
				const dt = new Date(d);
				if (isNaN(+dt)) return d;
				const mm = `${dt.getMonth()+1}`.padStart(2,'0');
				const dd = `${dt.getDate()}`.padStart(2,'0');
				return `${dd}/${mm}/${dt.getFullYear()}`;
			},
			toIsoDate(d) {
				if (!d) return null;
				const dt = new Date(d);
				if (isNaN(+dt)) return null;
				// normalizzo a mezzanotte UTC così non ci sono drift di timezone
				return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())).toISOString();
			},
			diffLinks(oldArr, newArr, keyField) {
				const byKey = (a)=>a.map(x=>[x._spId||`new-${x[keyField]}`,x]);
				const oldMap = new Map(byKey(oldArr||[]));
				const newMap = new Map(byKey(newArr||[]));

				const toCreate = [];
				const toUpdate = [];
				const toDelete = [];

				// create/update
				for (const [k, cur] of newMap) {
					const prev = [...oldMap.values()].find(x => (x._spId && x._spId===cur._spId) || (!x._spId && x[keyField]===cur[keyField]));
					if (!prev) {
					if (!cur._spId) toCreate.push(cur);
					} else {
					// cambiate date?
					if ((prev.PeriodBegins||'') !== (cur.PeriodBegins||'') || (prev.PeriodEnds||'') !== (cur.PeriodEnds||'')) {
						if (cur._spId) toUpdate.push(cur);
						else toCreate.push(cur); // nuovo ma con date: comunque create
					}
					}
				}
				// delete
				for (const prev of (oldArr||[])) {
					const stillThere = (newArr||[]).some(cur => (prev._spId && prev._spId===cur._spId) || (!prev._spId && prev[keyField]===cur[keyField]));
					if (!stillThere && prev._spId) toDelete.push(prev);
				}
				return {toCreate,toUpdate,toDelete};
			},

			// === SharePoint REST helpers (nometadata, modern) ==================
			async spGET(url) {
				const r = await fetch(url, { headers: { 'accept': 'application/json;odata=nometadata' }});
				if (!r.ok) throw new Error(`GET ${r.status}`);
				return await r.json();
			},
			async spPOSTCreate(listTitle, dataObj) {
				try {
					const digest = await this._ensureDigest();
					const entityType = await this._getEntityType(listTitle);

					// NB: per Lookup usare i campi *Id* (vedi note sotto).
					const payload = {
					__metadata: { type: entityType },
					...dataObj
					};

					const url = `${this._siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`;
					const res = await fetch(url, {
						method: 'POST',
						headers: {
							'Accept': 'application/json;odata=verbose',
							'Content-Type': 'application/json;odata=verbose',
							'X-RequestDigest': digest
						},
						credentials: 'same-origin',
						body: JSON.stringify(payload)
					});

					if (!res.ok) {
						let err; try { err = await res.json(); } catch {}
						console.error('Create error', listTitle, err || res.statusText);
						throw new Error('Create failed');
					}
					return (await res.json()).d;
				} catch (e) {
					console.error('spPOSTCreate error', e);
					throw e;
				}
			},
			async spPOSTMerge(listTitle, itemId, payload) {
				const digest = await this._ensureDigest();
				const url = `${webUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${itemId})`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Accept': 'application/json;odata=verbose',
						'Content-Type': 'application/json;odata=verbose',
						'X-RequestDigest': digest,
						'IF-MATCH': '*',
						'X-HTTP-Method': 'MERGE'
					},
					credentials: 'same-origin',
					body: JSON.stringify(payload)
				});
				if (!res.ok) {
					let err; try { err = await res.json(); } catch {}
					console.error('Merge error', listTitle, itemId, err || res.statusText);
					throw new Error('Merge failed');
				}
				return true;
			},
			async spPOSTDelete(listTitle, itemId) {
				const digest = await this._ensureDigest();
				const url = `${webUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${itemId})`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
					'Accept': 'application/json;odata=verbose',
					'Content-Type': 'application/json;odata=verbose',
					'X-RequestDigest': digest,
					'IF-MATCH': '*',                // oppure l’ETag specifico se lo hai
					'X-HTTP-Method': 'DELETE'
					},
					credentials: 'same-origin'
				});
			  if (!res.ok) {
					let err;
					try { err = await res.json(); } catch { /* noop */ }
					console.error('Delete error', listTitle, itemId, err || res.statusText);
					throw new Error('Delete failed');
				}
				return true;
			},
			// --- Cache interna per digest & entity types ---
			_sp: { digest: null, digestExpires: 0, entityTypes: {} },

			_siteUrl() {
				return `${webUrl}`;
			},

			async _ensureDigest() {
				const now = Date.now();
				if (this._sp.digest && now < this._sp.digestExpires) return this._sp.digest;

				const url = `${this._siteUrl()}/_api/contextinfo`;
				const r = await fetch(url, {
					method: 'POST',
					headers: {
						'Accept': 'application/json;odata=verbose',
						credentials: 'same-origin'
					}
				});
				if (!r.ok) throw new Error('contextinfo failed');

				const j = await r.json();
				const val = j?.d?.GetContextWebInformation?.FormDigestValue;
				const timeout = j?.d?.GetContextWebInformation?.FormDigestTimeoutSeconds || 1500;
				if (!val) throw new Error('missing FormDigestValue');

				this._sp.digest = val;
				this._sp.digestExpires = now + (timeout - 30) * 1000; // safety margin
				return val;
			},

			async _getEntityType(listTitle) {
				if (this._sp.entityTypes[listTitle]) return this._sp.entityTypes[listTitle];

				const url = `${this._siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')?$select=ListItemEntityTypeFullName`;
				const r = await fetch(url, { headers: { 'Accept': 'application/json;odata=verbose' }});
				if (!r.ok) throw new Error('List fetch failed');

				const j = await r.json();
				const typeName = j?.d?.ListItemEntityTypeFullName;
				if (!typeName) throw new Error('missing ListItemEntityTypeFullName');

				this._sp.entityTypes[listTitle] = typeName;
				return typeName;
			},

		}
	}
