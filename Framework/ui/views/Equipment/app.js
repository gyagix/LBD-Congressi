(async function () {
  console.log("[DEBUG] Inizio MiniBind VM");

  // 🔹 Carica MiniBind.js dal tuo repository
  const { reactiveVM, bindDOM } = await import("https://jwsite.sharepoint.com/sites/ita-lbd-bethelfacilitysupport/LBDSharepoint%20Code/Framework/ui/mvvm/MiniBind.js");

  // 🔹 Carica la logica Equipment
  const { EquipmentLogic } = await import("https://jwsite.sharepoint.com/sites/ita-lbd-bethelfacilitysupport/LBDSharepoint%20Code/Framework/bll/EquipmentLogic.js?v=3");
  const equipmentBLL = new EquipmentLogic();

  // 🔹 Definisci la classe ViewModel
  class EquipmentViewModel {
    gridItems = [];
    searchText = "";
    editingItem = { id: null, name: "" };

    get filteredItems() {
      return this.gridItems.filter(item =>
        item.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }

    async refresh() {
      try {
        const result = await equipmentBLL.query({}, 5000);
        this.gridItems = result.map(obj => ({
          id: obj.Id,
          name: obj.Descrizione,
          remove: () => this.removeItem(obj.Id)
        }));
      } catch (err) {
        alert("Errore nel caricamento: " + err.message);
      }
    }

    async removeItem(id) {
      try {
        await equipmentBLL.delete({ Id: id });
        this.gridItems = this.gridItems.filter(item => item.id !== id);
      } catch (err) {
        alert("Errore nella rimozione: " + err.message);
      }
    }

    openNewModal() {
      this.editingItem = { id: null, name: "" };
      bootstrap.Modal.getOrCreateInstance(document.getElementById("editModal")).show();
    }

    editItem(item) {
      this.editingItem = { id: item.id, name: item.name };
      bootstrap.Modal.getOrCreateInstance(document.getElementById("editModal")).show();
    }

    closeModal() {
      bootstrap.Modal.getInstance(document.getElementById("editModal"))?.hide();
    }

    async saveEditingItem() {
      const name = this.editingItem.name?.trim();
      if (!name) return alert("Inserisci una descrizione");

      try {
        if (!this.editingItem.id) {
          const res = await equipmentBLL.create({ Descrizione: name });
          this.editingItem.id = res.Id;
        } else {
          await equipmentBLL.update({ Id: this.editingItem.id, Descrizione: name });
        }
        this.closeModal();
        await this.refresh();
      } catch (err) {
        alert("Errore: " + err.message);
      }
    }
    
    async addItem()
    {
        const res = await equipmentBLL.create({ Descrizione: "Nuovo" });
        this.gridItems = [...this.gridItems, res];

    }

    async saveAll() {
      for (const item of this.gridItems) {
        if (!item.name?.trim()) continue;
        try {
          if (!item.id) {
            const res = await equipmentBLL.create({ Descrizione: item.name });
            item.id = res.Id;
          } else {
            await equipmentBLL.update({ Id: item.id, Descrizione: item.name });
          }
        } catch (err) {
          alert("Errore: " + err.message);
        }
      }
      await this.refresh();
    }
  }

  // 🔹 Instanzia VM e applica binding
  const vm = reactiveVM(new EquipmentViewModel());
  bindDOM(vm);
  await vm.refresh();
})();