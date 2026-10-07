/**
 * Map Viewer & Route Navigation Engine
 * Manages 797 floor maps and classroom routing for NNSTU
 * Supports multi-floor navigation and transition pathways (entrance -> stairs -> room)
 * Created by kosterik
 */

class MapViewer {
  constructor() {
    this.buildingsIndex = null;
    this.currentBuilding = "1";
    this.currentFloor = "1";
    this.selectedRoom = null;
    
    // Transform state
    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    
    // DOM elements
    this.viewport = document.getElementById("map-viewport");
    this.mapImg = document.getElementById("map-img-layer");
    this.buildingSelect = document.getElementById("map-building-select");
    this.floorChipsContainer = document.getElementById("map-floor-chips");
    this.searchInput = document.getElementById("room-search-input");
    this.autocompleteList = document.getElementById("room-autocomplete-list");
    this.routeInfoCard = document.getElementById("active-route-info-card");
    this.routeTitle = document.getElementById("active-route-title");
    this.routeDesc = document.getElementById("active-route-desc");
    this.assetBase = "../app_assets";
    
    this.init();
  }

  async init() {
    try {
      let resp = await fetch(`${this.assetBase}/buildings_index.json`).catch(() => null);
      if (!resp || !resp.ok) {
        resp = await fetch("/app_assets/buildings_index.json").catch(() => null);
      }
      if (resp && resp.ok) {
        this.buildingsIndex = await resp.json();
      }
    } catch (e) {
      console.warn("Could not fetch buildings_index.json", e);
    }
    
    this.bindEvents();
    this.updateBuildingFloors();
    this.renderMap();
  }

  bindEvents() {
    // Building selector
    this.buildingSelect?.addEventListener("change", (e) => {
      this.currentBuilding = e.target.value;
      this.selectedRoom = null;
      if (this.searchInput) this.searchInput.value = "";
      this.resetTransform();
      this.updateBuildingFloors();
      this.renderMap();
    });

    // Search room input
    this.searchInput?.addEventListener("input", (e) => {
      this.handleSearchInput(e.target.value.trim());
    });

    this.searchInput?.addEventListener("focus", (e) => {
      if (e.target.value.trim()) {
        this.handleSearchInput(e.target.value.trim());
      }
    });

    // Close autocomplete on click outside
    document.addEventListener("click", (e) => {
      if (!this.searchInput?.contains(e.target) && !this.autocompleteList?.contains(e.target)) {
        this.autocompleteList?.classList.remove("show");
      }
    });

    // HUD Zoom controls
    document.getElementById("hud-zoom-in")?.addEventListener("click", () => this.zoom(0.25));
    document.getElementById("hud-zoom-out")?.addEventListener("click", () => this.zoom(-0.25));
    document.getElementById("hud-zoom-reset")?.addEventListener("click", () => this.resetTransform());
    document.getElementById("hud-fullscreen")?.addEventListener("click", () => this.toggleFullscreen());
    document.getElementById("btn-clear-route")?.addEventListener("click", () => this.clearRoute());

    // Mouse drag pan
    this.viewport?.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransform();
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    // Mouse wheel zoom
    this.viewport?.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      this.zoom(delta);
    }, { passive: false });

    // Touch events for mobile
    let initialTouchDist = 0;
    this.viewport?.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.startX = e.touches[0].clientX - this.translateX;
        this.startY = e.touches[0].clientY - this.translateY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        initialTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    });

    this.viewport?.addEventListener("touchmove", (e) => {
      if (this.isDragging && e.touches.length === 1) {
        this.translateX = e.touches[0].clientX - this.startX;
        this.translateY = e.touches[0].clientY - this.startY;
        this.applyTransform();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = (dist - initialTouchDist) * 0.005;
        this.zoom(factor);
        initialTouchDist = dist;
      }
    });

    this.viewport?.addEventListener("touchend", () => {
      this.isDragging = false;
    });
  }

  updateBuildingFloors() {
    if (!this.floorChipsContainer) return;
    this.floorChipsContainer.innerHTML = "";
    
    // Floors config per building
    const maxFloors = { "1": 4, "2": 3, "3": 3, "4": 4, "5": 4, "6": 5 }[this.currentBuilding] || 4;
    
    for (let f = 1; f <= maxFloors; f++) {
      const chip = document.createElement("button");
      chip.className = `floor-chip ${f.toString() === this.currentFloor ? "active" : ""}`;
      chip.textContent = `${f} этаж`;
      chip.id = `floor-chip-${this.currentBuilding}-${f}`;
      chip.addEventListener("click", () => {
        this.currentFloor = f.toString();
        // Keep selectedRoom route intact across floors
        this.updateBuildingFloors();
        this.renderMap();
      });
      this.floorChipsContainer.appendChild(chip);
    }
  }

  renderMap() {
    if (!this.mapImg) return;
    
    let imagePath = "";
    const currentF = parseInt(this.currentFloor) || 1;
    const bData = this.buildingsIndex ? this.buildingsIndex[this.currentBuilding] : null;
    const baseFloors = bData ? bData.base_floors : [];

    if (this.selectedRoom) {
      const targetF = parseInt(this.selectedRoom.floor) || 1;

      if (currentF === targetF) {
        // Destination floor -> show exact classroom route
        imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${encodeURIComponent(this.selectedRoom.file)}`;
      } else if (currentF < targetF) {
        // Lower floor -> route going UP
        if (baseFloors.includes(`${currentF}level up.png`)) {
          imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${currentF}level%20up.png`;
        } else if (baseFloors.includes(`${currentF}level to.png`)) {
          imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${currentF}level%20to.png`;
        } else {
          imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${currentF}level%20non-active.png`;
        }
      } else {
        // Higher floor -> route going DOWN (use level down if exists, else non-active floor plan)
        if (baseFloors.includes(`${currentF}level down.png`)) {
          imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${currentF}level%20down.png`;
        } else {
          imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${currentF}level%20non-active.png`;
        }
      }

      // Update HUD Route Info Card
      if (this.routeInfoCard) {
        this.routeInfoCard.style.display = "block";
        this.routeTitle.textContent = `Маршрут до аудитории ${this.selectedRoom.room} (Корпус ${this.currentBuilding})`;
        
        let statusText = "";
        if (currentF === targetF) {
          statusText = `📍 <strong>Этаж ${currentF} (Финиш):</strong> Маршрут непосредственно к аудитории ${this.selectedRoom.room}.`;
        } else if (currentF === 1) {
          statusText = `🚪 <strong>1 этаж (Вход в корпус):</strong> Маршрут от турникетов входа к лестнице для подъема на ${targetF} этаж.`;
        } else if (currentF < targetF) {
          statusText = `🪜 <strong>${currentF} этаж (Переход):</strong> Проход по этажу к лестнице наверх к ${targetF} этажу.`;
        } else {
          statusText = `🔻 <strong>${currentF} этаж:</strong> Спуск по лестнице вниз на ${targetF} этаж к аудитории ${this.selectedRoom.room}.`;
        }

        // Render Step-by-Step buttons
        let stepsHtml = `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">`;
        stepsHtml += `<span style="font-size:11px; color:var(--color-fg-muted); font-weight:600;">Этапы маршрута:</span>`;
        
        const maxStepFloor = Math.max(targetF, 2, currentF);
        for (let fl = 1; fl <= maxStepFloor; fl++) {
          const isActive = fl === currentF;
          let label = `${fl} этаж`;
          if (fl === 1) label = `1 эт. (Вход)`;
          else if (fl === targetF) label = `${fl} эт. (Ауд. ${this.selectedRoom.room})`;
          else label = `${fl} эт. (Лестница)`;

          stepsHtml += `
            <button type="button" class="btn-gh ${isActive ? 'btn-accent-gh' : ''}" style="font-size:11px; padding:3px 8px;" onclick="window.appMapViewer.switchRouteFloor('${fl}')">
              ${label}
            </button>
          `;
        }
        stepsHtml += `</div>`;

        this.routeDesc.innerHTML = statusText + stepsHtml;
      }
    } else {
      if (this.routeInfoCard) {
        this.routeInfoCard.style.display = "none";
      }
      imagePath = `${this.assetBase}/maps/${this.currentBuilding}/${this.currentFloor}level%20non-active.png`;
    }

    this.mapImg.onload = () => {
      this.applyTransform();
    };
    this.mapImg.onerror = () => {
      this.mapImg.onerror = null;
      this.mapImg.src = `${this.assetBase}/maps/${this.currentBuilding}/${this.currentFloor}level%20non-active.png`;
    };
    this.mapImg.src = imagePath;
  }

  switchRouteFloor(floorStr) {
    this.currentFloor = floorStr.toString();
    this.updateBuildingFloors();
    this.renderMap();
  }

  handleSearchInput(query) {
    if (!this.autocompleteList) return;
    if (!query) {
      this.autocompleteList.classList.remove("show");
      return;
    }

    const matches = [];
    if (this.buildingsIndex) {
      for (const [bId, bData] of Object.entries(this.buildingsIndex)) {
        for (const r of bData.rooms) {
          if (r.room.toLowerCase().includes(query.toLowerCase())) {
            matches.push({ ...r, building: bId });
            if (matches.length >= 12) break;
          }
        }
        if (matches.length >= 12) break;
      }
    }

    if (matches.length === 0) {
      this.autocompleteList.innerHTML = `<div class="autocomplete-item" style="color:var(--color-fg-subtle);">Аудитория не найдена</div>`;
    } else {
      this.autocompleteList.innerHTML = matches.map(m => `
        <div class="autocomplete-item" data-room="${m.room}" data-building="${m.building}" data-file="${m.file}">
          <span><strong>${m.room}</strong></span>
          <span style="font-size:11px; color:var(--color-fg-muted);">Корпус ${m.building}, Этаж ${m.floor}</span>
        </div>
      `).join("");

      this.autocompleteList.querySelectorAll(".autocomplete-item").forEach(item => {
        item.addEventListener("click", () => {
          const room = item.getAttribute("data-room");
          const bId = item.getAttribute("data-building");
          const file = item.getAttribute("data-file");
          this.navigateToRoom(room, bId, file);
          this.autocompleteList.classList.remove("show");
        });
      });
    }

    this.autocompleteList.classList.add("show");
  }

  navigateToRoom(roomName, preferredBuilding = null, roomFile = null) {
    const mapTabBtn = document.querySelector('[data-tab="map"]');
    if (mapTabBtn) mapTabBtn.click();

    let targetBuilding = preferredBuilding;
    let targetRoomObj = null;

    if (this.buildingsIndex) {
      if (!targetBuilding) {
        const firstDigit = roomName.charAt(0);
        if (this.buildingsIndex[firstDigit]) {
          targetBuilding = firstDigit;
        } else {
          targetBuilding = "1";
        }
      }

      const bData = this.buildingsIndex[targetBuilding];
      if (bData) {
        targetRoomObj = bData.rooms.find(r => r.room === roomName) || {
          room: roomName,
          file: roomFile || `${roomName}.png`,
          floor: roomName.charAt(1) || "1"
        };
      }
    }

    if (!targetRoomObj) {
      targetRoomObj = {
        room: roomName,
        file: `${roomName}.png`,
        floor: roomName.charAt(1) || "1"
      };
    }

    this.currentBuilding = targetBuilding || "1";
    this.currentFloor = targetRoomObj.floor || "1";
    this.selectedRoom = targetRoomObj;
    
    if (this.buildingSelect) this.buildingSelect.value = this.currentBuilding;
    if (this.searchInput) this.searchInput.value = roomName;

    this.updateBuildingFloors();
    this.resetTransform();
    this.renderMap();
  }

  clearRoute() {
    this.selectedRoom = null;
    if (this.searchInput) this.searchInput.value = "";
    if (this.routeInfoCard) this.routeInfoCard.style.display = "none";
    this.updateBuildingFloors();
    this.resetTransform();
    this.renderMap();
  }

  zoom(delta) {
    this.scale = Math.min(Math.max(0.5, this.scale + delta), 4.5);
    this.applyTransform();
  }

  resetTransform() {
    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform();
  }

  applyTransform() {
    if (!this.mapImg) return;
    this.mapImg.style.transform = `translate(calc(-50% + ${this.translateX}px), calc(-50% + ${this.translateY}px)) scale(${this.scale})`;
  }

  toggleFullscreen() {
    const container = document.getElementById("map-canvas-box");
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  }
}

window.MapViewer = MapViewer;
