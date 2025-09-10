/*
    Definizione costanti
*/

const isDevArea = (window.location.pathname.includes('bethelfacilitysupport')) ? 1 : 0;
const doConsoleWrite = isDevArea ? true : false;

const sharePointFolder = isDevArea ? "/sites/ita-lbd-bethelfacilitysupport" : "/sites/ita-lbd";

// Versioning coerente con Shipments
window.assetVersion = isDevArea ? String(Date.now()) : '1.0.0';

// Base assoluta della libreria Framework
const BASE_FRAMEWORK_PATH = `https://jwsite.sharepoint.com/${sharePointFolder}/LBDSharepoint%20Code/Framework`;

const logger = {
    log: (...args) => doConsoleWrite && console.log(...args),
    warn: (...args) => doConsoleWrite && console.warn(...args),
    error: (...args) => doConsoleWrite && console.error(...args),
    debug: (...args) => doConsoleWrite && console.info(...args),
};

export function equipmentApp() {
    return {
        overlayContainer: null,
        editContainer: null,
        editTablesCols: null,
        notif: null,
        notifyMsg: null,
        notifTimeout: null,
        loading: null,
        tableList: null,
        search: '',
        sortKey: 'Id',
        sortAsc: true,
        equipments: [],
        filteredEquipments: [],
        parentEquipmentOptions: [],
        form: {
            Id: null,
            IdentificationNumber: '',
            Title: '',
            ModelDescription: '',
            Details: '',
            Groupcode: '',
            Height: null,
            Length: null,
            Width: null,
            Weight: null,
            PackagingTypeCode: '',
            SerialNumber: '',
            Image: '', // Ora è una semplice stringa
            ParentEquipmentID: null,
            ParentEquipment: null,
            ParentEquipmentModelDescription: ''
        },
        fields: [
            { name: 'Id', type: 'number', label: 'ID', showInTableList: true },
            { name: 'IdentificationNumber', type: 'text', label: 'ID Number', showInTableList: true },
            { name: 'Titolo', type: 'text', label: 'Titolo', showInTableList: true },
            { name: 'ModelDescription', type: 'text', label: 'Modello', showInTableList: true },
            { name: 'Details', type: 'text', label: 'Dettagli', showInTableList: false },
            { name: 'Groupcode', type: 'text', label: 'Gruppo', showInTableList: false },
            { name: 'Height', type: 'number', label: 'Altezza', showInTableList: false },
            { name: 'Length', type: 'number', label: 'Lunghezza', showInTableList: false },
            { name: 'Width', type: 'number', label: 'Larghezza', showInTableList: false },
            { name: 'Weight', type: 'number', label: 'Peso', showInTableList: false },
            { name: 'PackagingTypeCode', type: 'text', label: 'Tipo Packaging', showInTableList: false },
            { name: 'SerialNumber', type: 'text', label: 'Seriale', showInTableList: true },
            { name: 'ParentEquipmentModelDescription', type: 'text', label: 'Parent', showInTableList: true }
        ],
        get tableListCkAllChecked() {
            return this.fields.every(f => f.showInTableList);
        },
        set tableListCkAllChecked(value) {
            this.fields.forEach(f => f.showInTableList = value);
        },
        async init() {
            window.assetVersion = window.assetVersion || String(Date.now());

            this.overlayContainer = document.getElementById("overlayContainer");
            this.editContainer = document.getElementById("equipmentEditContainer");
            this.notif = document.getElementById("divNotification");
            this.notifyMsg = document.getElementById("notifMsg");
            this.loading = document.getElementById("divLoading");
            this.tableList = document.getElementById("tableList");
            this.editTablesCols = document.getElementById("editVisibilityTableCols");

            // Caricamento dinamico con versioning coerente
            const { EquipmentLogic } = await import(`${BASE_FRAMEWORK_PATH}/bll/EquipmentLogic.js?v=${window.assetVersion}`);
            this.equipmentLogic = new EquipmentLogic();

            this.showHideTableListFields();
            await this.loadEquipments();
        },

        async loadEquipments() {
            this.showLoading("Caricamento equipment in corso...");
            try {
                const data = await this.equipmentLogic.query({}, 500);
                this.equipments = data || [];
                this.filterEquipments();
            } catch (e) {
                logger.error('Errore caricamento equipment:', e);
                this.showNotification('Errore caricamento equipment, controlla console.', 'error');
            }
            this.closeOverlay();
        },

        filterEquipments() {
            const s = this.search.toLowerCase();
            this.filteredEquipments = this.equipments.filter((v) =>
                Object.values(v).some((val) => String(val || '').toLowerCase().includes(s))
            );
            this.sortEquipments();
        },

        sortEquipments() {
            if (!this.sortKey) return;
            const k = this.sortKey;
            this.filteredEquipments.sort((a, b) => {
                const va = a[k], vb = b[k];
                if (typeof va === 'number' && typeof vb === 'number') {
                    return this.sortAsc ? va - vb : vb - va;
                }
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
            this.sortEquipments();
        },

        newEquipment() {
            this.resetForm();
            this.openOverlay();
            this.openContentEditor();
        },

        editEquipment(equipment) {
            this.form = { ...equipment };
            this.openContentEditor();
        },

        resetForm() {
            this.form = {
                Id: null,
                IdentificationNumber: '',
                Title: '',
                ModelDescription: '',
                Details: '',
                Groupcode: '',
                Height: null,
                Length: null,
                Width: null,
                Weight: null,
                PackagingTypeCode: '',
                SerialNumber: '',
                Image: '', // Resetta il campo immagine
                ParentEquipmentID: null,
                ParentEquipment: null,
                ParentEquipmentModelDescription: ''
            };
        },

        async saveEquipment() {
            this.showLoading();
            try {
                if (this.form.Id) {
                    await this.equipmentLogic.update(this.form); // Passa direttamente il form
                } else {
                    await this.equipmentLogic.create(this.form); // Passa direttamente il form
                }

                this.resetForm();
                this.closeContentEditor();
                await this.loadEquipments();
                this.showNotification('Equipment salvato con successo.', 'success');
            } catch (e) {
                console.error('Errore salvataggio equipment:', e);
                this.showNotification(`Errore: ${e.message}`, 'error');
            } finally {
                this.hideLoading();
            }
        },

        async deleteEquipment(id) {
            if (!confirm('Sei sicuro di voler eliminare questo equipment?')) return;
            try {
                await this.equipmentLogic.delete(id);
                this.closeContentEditor();
                await this.loadEquipments();
            } catch (e) {
                logger.error('Errore cancellazione equipment:', e);
                this.showNotification('Errore nella cancellazione, controlla console.', 'error');
            }
        },

        showHideTableListFields() {
            this.fields.forEach(field => {
                const thField = this.tableList.querySelector(`th[data-name="${field.name}"]`);
                const tdFields = this.tableList.querySelectorAll(`td[data-name="${field.name}"]`);
                const isVisible = field.showInTableList;
                if (thField) thField.classList.toggle("table-list-column-hide", !isVisible);
                tdFields.forEach(td => td.classList.toggle("table-list-column-hide", !isVisible));
            })
        },
        openEditTableListShowHide() {
            this.openOverlay();
            if (this.editTablesCols == null) this.editTablesCols = document.getElementById("editVisibilityTableCols");
            this.editTablesCols.classList.remove("modalShowHideTableColsHidden");
        },
        saveTableListShowHide() {
            const anySelected = this.fields.some(f => f.showInTableList);
            if (!anySelected) {
                this.showNotification("Devi selezionare almeno una colonna da mostrare!", 'warning');
                return;
            }
            this.showLoading("Aggiornamento colonne in corso");
            this.editTablesCols.classList.add("modalShowHideTableColsHidden");
            this.showHideTableListFields();
            this.hideLoading();
            this.closeOverlay();
        },
        formatDate(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return isNaN(d) ? dateStr : d.toLocaleDateString('it-IT');
        },
        showNotification(message, type) {
            this.notifyMsg.textContent = message;
            this.notif.className = `notification ${type} show`;
            clearTimeout(this.notifTimeout);
            if (type === "success") {
                this.notifTimeout = setTimeout(() => this.hideNotification(), 4000);
            } else if (type === "warning") {
                this.notifTimeout = setTimeout(() => this.hideNotification(), 5000);
            }
        },
        hideNotification() {
            this.notif.classList.remove("show");
        },
        openOverlay() {
            this.overlayContainer.classList.remove('overlayhidden');
        },
        closeModalEdit() {
            this.closeOverlay();
        },
        closeOverlay() {
            this.overlayContainer.classList.add('overlayhidden');
            this.hideLoading();
            this.closeContentEditor();
        },
        openContentEditor() {
            this.openOverlay();
            this.editContainer.classList.remove('modelContentHidden');
        },
        closeContentEditor() {
            if (this.editContainer) this.editContainer.classList.add('modelContentHidden');
        },
        showLoading(myText = "Salvataggio in corso") {
            this.openOverlay();
            let p = this.loading.querySelector("p");
            if (p) p.textContent = myText;
            this.loading.classList.remove("loading-hide");
        },
        hideLoading() {
            this.loading.classList.add("loading-hide");
        }
    };
};

// Esposizione su window per compatibilità
if (typeof window !== 'undefined') {
    window.equipmentApp = equipmentApp;
}

// Hook per il loader
export async function init(host) { /* no-op */ }
