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
        log: (...args) => doConsoleWrite && logger.log(...args),
        warn: (...args) => doConsoleWrite && logger.warn(...args),
        error: (...args) => doConsoleWrite && logger.error(...args),
		debug: (...args) => doConsoleWrite && logger.info(...args),
    };


  function EQListStockApp() {
    	return {
			search: '',
			sortKey: 'ModelCode',
			sortAsc: true,
			eqModelsStock: [],
			filteredEQModels: [],
			typeOptions: [],
			form: {
				Id: null,
				ModelCode: '',
				ModelDescription: '',
				StockQuantity: 0,
				EQCategory: '',
				Discontinued: 0
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

				logger.log('[DEBUG] Avvio Caricamnento EQ List Stock CRUD');

				window.assetVersion = window.assetVersion || String(Date.now()); // se non già definita

				this.overlayContainer = document.getElementById("overlayContainer");
				this.editContainer = document.getElementById("editContainer"); 
				this.notif = document.getElementById("divNotification");
				this.notifyMsg = document.getElementById("notifMsg");
				this.loading = document.getElementById("divLoading");

				this.tableList = document.getElementById("tableList");
				this.editTablesCols = document.getElementById("editVisibilityTableCols");

				const { EQStockItemLogic } = await import(`${window.BASE_FRAMEWORK_PATH}/bll/EQListStockLogic.js?v=${window.assetVersion}`);

				this.showHideTableListFields();

				this.eqStockItemLogic = new EQStockItemLogic();
				
				await this.loadEQListStock();
			},

			async loadEQListStock() {
				try {
					const data = await this.eqStockItemLogic.query({}, 500);
					this.eqModelsStock = data || [];
					this.showHideTableListFields()
					this.filterEQModels();
				} catch (e) {
					logger.error('Errore caricamento Elenco Modelli Equipemtn List Stock:', e);
					this.showNotification('Errore caricamento Elenco Modelli Equipemtn List Stock, controlla logger.','error');
				}
				finally{
					this.closeOverlay();
				}
			},

			filterEQModels() {
				const s = this.search.toLowerCase();
				this.filteredEQModels = this.eqModelsStock.filter((v) =>
				Object.values(v).some((val) => String(val || '').toLowerCase().includes(s))
				);
				this.sortEQListStock();
			},

			sortEQListStock() {
				if (!this.sortKey) return;
				const k = this.sortKey;
				this.filteredEQModels.sort((a, b) => {
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
				this.sortEQListStock();
			},

			newRecord(){
				this.resetForm();
				this.openOverlay();
				this.openContentEditor();
			},

			editEQListItemStock(eqListStockItem) {
				// Copia profonda per evitare binding diretto
				this.form = { ...eqListStockItem };

				this.openContentEditor();
			},

			resetForm() {
				this.form = {
				Id: null,
				ModelCode: '',
				ModelDescription: '',
				StockQuantity: 0,
				EQCategory: '',
				Discontinued: false
				};
			},

			async saveEQListStock() {
				this.showLoading("Caricamento dati in corso...")
				try {
				// clone “pulito” per evitare Proxy Alpine
				const payload = JSON.parse(JSON.stringify(this.form));

				// numeri
				if (payload.StockQuantity !== '' && payload.StockQuantity != null) {
					const n = parseInt(payload.StockQuantity, 10);
					payload.StockQuantity = isNaN(n) ? null : n;
				} else {
					payload.StockQuantity = null;
				}


				// campi testuali opzionali -> null se vuoti (coerenza con BLL)
				/*
				const opt = ['DailyWorkStartTime','DailyWorkEndTime','Address',
							'ShipmentContactDelivery','ShipmentContactPickUp','Notes'];
				for (const k of opt) payload[k] = payload[k] || null;
				*/

				if (payload.Id != null && payload.Id !== '') {
					await this.eqStockItemLogic.update(payload);   // MERGE
				} else {
					await this.eqStockItemLogic.create(payload);   // POST
				}

				await this.loadEQListStock();
				this.resetForm();
				this.showNotification('Salvato con successo.');
				} catch (e) {

					const msg = (e?.message || '').toLowerCase();
					if (msg.includes('esiste già un elemento') || msg.includes('unicità')) {
						logger.log('[DEBUG] app.js->saveEQListStock: Errore salvataggio Equipment Stock Item: ModelCode già presente', e);
						this.showNotification('ModelCode già presente. Scegli un ModelCode diverso.','error');
					} else {
						logger.log('[DEBUG] app.js->saveEQListStock: Errore generico:', e);
						this.showNotification('Errore nel salvataggio, controlla logger.','error');
					}
					this.hideLoading();          
				}
			},

			async deleteEQListStock(id) {
				if (!confirm('Sei sicuro di voler eliminare questo Item della lista?')) return;
				try {
					// se la tua delete vuole l'oggetto:
					// await this.eqStockItemLogic.delete({ Id: id });
					await this.eqStockItemLogic.delete(id);
					await this.loadEQListStock();
				} catch (e) {
					logger.error('Errore cancellazione Item:', e);
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
		};
  };


