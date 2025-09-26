/*
    Costanti e logger
*/ 
const isDevArea = (window.location.pathname.includes('bethelfacilitysupport')) ? 1 : 0; 
const doConsoleWrite = isDevArea ? true : false;

const sharePointFolder = isDevArea ? "/sites/ita-lbd-bethelfacilitysupport" : "/sites/ita-lbd";           
window.assetVersion = isDevArea ? String(Date.now()) : '1.0.0';

const BASE_FRAMEWORK_PATH = `https://jwsite.sharepoint.com/${sharePointFolder}/LBDSharepoint%20Code/Framework`;

const logger = {
  log: (...args) => doConsoleWrite && console.log(...args),
  warn: (...args) => doConsoleWrite && console.warn(...args),
  error: (...args) => doConsoleWrite && console.error(...args),
  debug: (...args) => doConsoleWrite && console.info(...args)
};

export function shipmentApp() {
  return {
    // refs
    overlayContainer:null,
    editContainer:null,
    editTablesCols:null,
    notif:null,
    notifyMsg:null,
    notifTimeout:null,
    loading:null,
    tableList:null,

    // stato
    search: '',
    sortKey: 'Id',
    sortAsc: true,
    shipments: [],
    filteredShipments: [],
    venueOptions: [],

    // form shipping
    form: {
      Id: null,
      ShipmentName: '',
      FromVenueId: '',
      ToVenueId: '',
      PickupDate: '',
      DeliveryDate: '',
      Notes: ''
    },

    // colonne visibili elenco
    fields:[
      { name: 'Id', type: 'number', label: 'ID', showInTableList:true },
      { name: 'ShipmentName', type: 'text', label: 'Nome', showInTableList:true },
      { name: 'FromVenueName', type: 'text', label: 'Origine', showInTableList:true },
      { name: 'ToVenueName', type: 'text', label: 'Destinazione', showInTableList:true },
      { name: 'PickupDate', type: 'date', label: 'Pickup', showInTableList:true },
      { name: 'DeliveryDate', type: 'date', label: 'Delivery', showInTableList:true },
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
      window.assetVersion = window.assetVersion || String(Date.now());

      // hook DOM
      this.overlayContainer = document.getElementById("overlayContainer");
      this.editContainer = document.getElementById("editContainer"); 
      this.notif = document.getElementById("divNotification");
      this.notifyMsg = document.getElementById("notifMsg");
      this.loading = document.getElementById("divLoading");
      this.tableList = document.getElementById("tableList");
      this.editTablesCols = document.getElementById("editVisibilityTableCols");

      // BLL
      const { VenueLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/VenueLogic.js?v=${window.assetVersion}`);
      const { ShipmentLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/ShipmentLogic.js?v=${window.assetVersion}`);

      this.venueLogic = new VenueLogic();
      this.shipmentLogic = new ShipmentLogic();

      this.showHideTableListFields();
      await this.loadVenues();
      await this.loadShipments();
    },

    async loadVenues() {
      this.showLoading("Caricamento sedi (venues)...");
      try {
        const data = await this.venueLogic.query({}, 500);
        // attesi: Id, VenueName, Code
        this.venueOptions = Array.isArray(data) ? data : [];
        this.sortVenues("VenueName")
      } catch (e) {
        logger.error('Errore caricamento venues:', e);
        this.showNotification('Errore caricamento venues, controlla logger.','error');
      } finally {
        this.closeOverlay();
      }
    },

    async loadShipments() {
      this.showLoading("Caricamento spedizioni...");
      try {
        const data = await this.shipmentLogic.query({}, 500);
        const list = Array.isArray(data) ? data : [];

        // Normalizzazione per UI:
        // - assicuriamo FromVenueId/ToVenueId (numeri)
        // - creiamo FromVenueName/ToVenueName per la tabella
        // - normalizziamo date a "YYYY-MM-DD" per gli input type="date"
        const byId = new Map(this.venueOptions.map(v => [Number(v.Id), v]));
        const toDateInput = (val) => {
          if (!val) return '';
          const d = new Date(val);
          if (isNaN(d)) return '';
          // YYYY-MM-DD
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          return `${d.getFullYear()}-${mm}-${dd}`;
        };

        this.shipments = list.map(it => {
          // compatibilità: i BLL possono restituire lookup come oggetto {Id, Title} o come semplice Id
          const fromId = typeof it.FromVenue === 'object' && it.FromVenue?.Id ? Number(it.FromVenue.Id)
                        : (it.FromVenueId ?? it.FromVenue ?? null);
          const toId   = typeof it.ToVenue === 'object' && it.ToVenue?.Id ? Number(it.ToVenue.Id)
                        : (it.ToVenueId ?? it.ToVenue ?? null);

          const fromVenue = byId.get(Number(fromId)) || null;
          const toVenue   = byId.get(Number(toId)) || null;

          return {
            ...it,
            FromVenueId: Number(fromId) || '',
            ToVenueId: Number(toId) || '',
            FromVenueName: fromVenue ? `${fromVenue.VenueName} (${fromVenue.Code ?? ''})` : '',
            ToVenueName: toVenue ? `${toVenue.VenueName} (${toVenue.Code ?? ''})` : '',
            PickupDate: toDateInput(it.PickupDate),
            DeliveryDate: toDateInput(it.DeliveryDate),
          };
        });

        this.showHideTableListFields();
        this.filterShipments();
      } catch (e) {
        logger.error('Errore caricamento spedizioni:', e);
        this.showNotification('Errore caricamento spedizioni, controlla logger.','error');
      } finally {
        this.closeOverlay();
      }
    },

    filterShipments() {
      const s = (this.search || '').toLowerCase();
      this.filteredShipments = this.shipments.filter((e) =>
        Object.values({
          Id: e.Id,
          ShipmentName: e.ShipmentName,
          FromVenueName: e.FromVenueName,
          ToVenueName: e.ToVenueName,
          PickupDate: e.PickupDate,
          DeliveryDate: e.DeliveryDate,
          Notes: e.Notes
        }).some((val) => String(val || '').toLowerCase().includes(s))
      );
      this.sortShipments();
    },

    sortShipments() {
      if (!this.sortKey) return;
      const k = this.sortKey;
      this.filteredShipments.sort((a, b) => {
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
      this.sortShipments();
    },

    newShipment(){
      this.resetForm();
      this.openOverlay();
      this.openContentEditor();
    },

    editShipment(shipment) {
      // Clona e adatta ai campi form
      this.form = {
        Id: shipment.Id ?? null,
        ShipmentName: shipment.ShipmentName ?? '',
        FromVenueId: shipment.FromVenueId ?? '',
        ToVenueId: shipment.ToVenueId ?? '',
        PickupDate: shipment.PickupDate ?? '',
        DeliveryDate: shipment.DeliveryDate ?? '',
        Notes: shipment.Notes ?? ''
      };
      this.openContentEditor();
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
    resetForm() {
      this.form = {
        Id: null,
        ShipmentName: '',
        FromVenueId: '',
        ToVenueId: '',
        PickupDate: '',
        DeliveryDate: '',
        Notes: ''
      };
    },

    // Validazione semplice: Delivery >= Pickup (se valorizzate)
    isDateRangeValid() {
      const { PickupDate, DeliveryDate } = this.form;
      if (!PickupDate || !DeliveryDate) return true;
      return new Date(DeliveryDate) >= new Date(PickupDate);
    },

    async saveShipment() {
      if (!this.isDateRangeValid()) {
        this.showNotification('La DeliveryDate non può essere precedente alla PickupDate.','warning');
        return;
      }

		  this.showLoading(this.form.Id ? "Aggiornamento spedizione..." : "Creazione spedizione...");
      try {
        const toSPDateOnly = (d) => d ? `${d}T00:00:00` : null;

        const payload = {
        Id: this.form.Id ?? null,
        ShipmentName: (this.form.ShipmentName || '').trim().replace(/\s+/g, ' '),
        PickupDate: toSPDateOnly(this.form.PickupDate),
        DeliveryDate: toSPDateOnly(this.form.DeliveryDate),
        Notes: this.form.Notes || '',
        // 🔴 CORRETTO: inviare i campi lookup ID, NON le navigazioni
        FromVenueId: this.form.FromVenueId ? Number(this.form.FromVenueId) : null,
        ToVenueId:   this.form.ToVenueId   ? Number(this.form.ToVenueId)   : null
        };

        // NON inviare mai FromVenue / ToVenue nel payload
        delete payload.FromVenue;
        delete payload.ToVenue;

        if (payload.Id) await this.shipmentLogic.update(payload);
        else            await this.shipmentLogic.create(payload);

        await this.loadShipments();
        this.resetForm();
        this.showNotification('Spedizione salvata con successo.','success');
        this.closeContentEditor();
      } catch (e) {
        logger.error('[DEBUG] saveShipment errore:', e);
        this.showNotification('Errore nel salvataggio, controlla logger.','error');
      } finally {
        this.hideLoading();
      }
		},

    async deleteShipment(id) {
      if (!confirm('Sei sicuro di voler eliminare questa spedizione?')) return;
      try {
        await this.shipmentLogic.delete(id);
        await this.loadShipments();
        this.showNotification('Spedizione eliminata.','success');
      } catch (e) {
        logger.error('Errore cancellazione spedizione:', e);
        this.showNotification('Errore nella cancellazione, controlla logger.','error');
      }
    },

    formatDateForList(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString('it-IT');
    },

    showHideTableListFields(){
      this.fields.forEach(field => {   
        const tdFields = this.tableList.querySelectorAll(`td[data-name="${field.name}"]`);
        tdFields.forEach(td => {
          if(field.showInTableList){
            td.classList.remove("table-list-column-hide")
          }else{
            td.classList.add("table-list-column-hide")
          }
        });
        const thField = this.tableList.querySelector(`th[data-name="${field.name}"]`);
        if (!thField) return;
        if(field.showInTableList){
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
      this.editTablesCols.classList.remove("modalShowHideTableColsHidden")
    },

    saveTableListShowHide(){
      this.showLoading("Aggiornamento colonne in corso");
      this.editTablesCols.classList.add("modalShowHideTableColsHidden");
      this.showHideTableListFields();
      this.hideLoading();
      this.closeOverlay();
    },

    // notifiche & modali
    showNotification(message, type='success'){
      this.notifyMsg.textContent = message;
      this.notif.className = `notification ${type} show`;
      clearTimeout(this.notifTimeout);
      if (type === 'success' || type === 'warning') {
        this.notifTimeout = setTimeout(() => this.hideNotification(), 4000);
      }
    },
    hideNotification(){ 
      this.notif.classList.remove("show");
    },
    openOverlay(){
      this.overlayContainer.classList.remove('overlayhidden');
    },
    closeModalEdit(){
      this.closeOverlay();
    },
    closeOverlay(){
      this.overlayContainer.classList.add('overlayhidden');
      this.hideLoading();
      this.closeContentEditor();
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
      let p = this.loading.querySelector("p");
      p.textContent = myText;
      this.loading.classList.remove("loading-hide");
    },
    hideLoading(){
      this.loading.classList.add("loading-hide");
    }
  }
}
