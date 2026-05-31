export class UIManager {
  constructor() {
    this.elements = {};
    this.toastContainer = null;
  }

  initialize() {
    this.elements = {
      btnCreateRoom: document.getElementById('btn-create-room'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      inputRoomCode: document.getElementById('input-room-code'),
      roomInit: document.getElementById('room-init'),
      roomActive: document.getElementById('room-active'),
      displayRoomCode: document.getElementById('display-room-code'),
      btnCopyCode: document.getElementById('btn-copy-code'),
      btnLeaveRoom: document.getElementById('btn-leave-room'),
      memberCount: document.getElementById('member-count'),
      memberList: document.getElementById('member-list'),
      btnAddCircle: document.getElementById('btn-add-circle'),
      btnAddPolygon: document.getElementById('btn-add-polygon'),
      geofenceList: document.getElementById('geofence-list'),
      btnToggleSimulation: document.getElementById('btn-toggle-simulation'),
      btnCenterLocation: document.getElementById('btn-center-location'),
      modal: document.getElementById('modal'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalFooter: document.getElementById('modal-footer'),
      modalClose: document.getElementById('modal-close'),
    };

    this.toastContainer = document.createElement('div');
    this.toastContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 3000;';
    document.body.appendChild(this.toastContainer);
  }

  showRoomInit() {
    this.elements.roomInit.classList.remove('hidden');
    this.elements.roomActive.classList.add('hidden');
  }

  showRoomActive(roomCode) {
    this.elements.roomInit.classList.add('hidden');
    this.elements.roomActive.classList.remove('hidden');
    this.elements.displayRoomCode.textContent = roomCode;
  }

  updateMemberCount(count) {
    this.elements.memberCount.textContent = `成员数: ${count}`;
  }

  updateMemberList(members, currentPeerId) {
    const list = this.elements.memberList;

    if (members.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无可用成员</div>';
      return;
    }

    list.innerHTML = members.map(member => {
      const isCurrentUser = member.peerId === currentPeerId;
      const color = member.color || '#2563EB';
      const initial = (member.nickname || member.peerId).charAt(0).toUpperCase();
      
      return `
        <div class="member-item fade-in" data-peer-id="${member.peerId}">
          <div class="member-avatar" style="background-color: ${color}">
            ${initial}
          </div>
          <div class="member-info">
            <div class="member-name">
              ${member.nickname || member.peerId.slice(0, 8)}
              ${isCurrentUser ? '(你)' : ''}
            </div>
            <div class="member-status">在线</div>
          </div>
          <div class="online-indicator"></div>
        </div>
      `;
    }).join('');
  }

  addMember(member) {
    const list = this.elements.memberList;
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const existingItem = list.querySelector(`[data-peer-id="${member.peerId}"]`);
    if (existingItem) {
      return;
    }

    const color = member.color || '#2563EB';
    const initial = (member.nickname || member.peerId).charAt(0).toUpperCase();

    const memberHTML = `
      <div class="member-item fade-in" data-peer-id="${member.peerId}">
        <div class="member-avatar" style="background-color: ${color}">
          ${initial}
        </div>
        <div class="member-info">
          <div class="member-name">${member.nickname || member.peerId.slice(0, 8)}</div>
          <div class="member-status">在线</div>
        </div>
        <div class="online-indicator"></div>
      </div>
    `;

    list.insertAdjacentHTML('beforeend', memberHTML);
  }

  removeMember(peerId) {
    const item = this.elements.memberList.querySelector(`[data-peer-id="${peerId}"]`);
    if (item) {
      item.remove();
    }

    const members = this.elements.memberList.querySelectorAll('.member-item');
    if (members.length === 0) {
      this.elements.memberList.innerHTML = '<div class="empty-state">暂无可用成员</div>';
    }
  }

  updateGeofenceList(geofences) {
    const list = this.elements.geofenceList;

    if (geofences.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无围栏</div>';
      return;
    }

    list.innerHTML = geofences.map(gf => `
      <div class="geofence-item fade-in" data-geofence-id="${gf.id}">
        <div class="geofence-info">
          <div class="geofence-name">${gf.name}</div>
          <div class="geofence-type">${gf.type === 'circle' ? '圆形' : '多边形'}</div>
        </div>
        <div class="geofence-color" style="background-color: ${gf.color}"></div>
      </div>
    `).join('');
  }

  addGeofence(geofence) {
    const list = this.elements.geofenceList;
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const existingItem = list.querySelector(`[data-geofence-id="${geofence.id}"]`);
    if (existingItem) {
      return;
    }

    const geofenceHTML = `
      <div class="geofence-item fade-in" data-geofence-id="${geofence.id}">
        <div class="geofence-info">
          <div class="geofence-name">${geofence.name}</div>
          <div class="geofence-type">${geofence.type === 'circle' ? '圆形' : '多边形'}</div>
        </div>
        <div class="geofence-color" style="background-color: ${geofence.color}"></div>
      </div>
    `;

    list.insertAdjacentHTML('beforeend', geofenceHTML);
  }

  removeGeofence(id) {
    const item = this.elements.geofenceList.querySelector(`[data-geofence-id="${id}"]`);
    if (item) {
      item.remove();
    }

    const geofences = this.elements.geofenceList.querySelectorAll('.geofence-item');
    if (geofences.length === 0) {
      this.elements.geofenceList.innerHTML = '<div class="empty-state">暂无围栏</div>';
    }
  }

  updateSimulationButton(isRunning) {
    this.elements.btnToggleSimulation.textContent = isRunning ? '⏸️ 停止模拟' : '▶️ 启动模拟';
  }

  showModal(title, bodyContent, footerContent = '') {
    this.elements.modalTitle.textContent = title;
    this.elements.modalBody.innerHTML = bodyContent;
    this.elements.modalFooter.innerHTML = footerContent;
    this.elements.modal.classList.remove('hidden');
  }

  hideModal() {
    this.elements.modal.classList.add('hidden');
  }

  showCircleModal() {
    const body = `
      <div class="form-group">
        <label>围栏名称</label>
        <input type="text" id="input-geofence-name" class="input" placeholder="例如：公司范围" value="">
      </div>
      <div class="form-group">
        <label>中心点</label>
        <div id="modal-map" style="height: 200px; border-radius: 6px; margin-top: 8px;"></div>
        <small style="color: var(--text-muted); margin-top: 4px; display: block;">点击地图选择中心点</small>
      </div>
      <div class="form-group">
        <label>半径 (米)</label>
        <input type="number" id="input-geofence-radius" class="input" placeholder="例如：500" value="200">
      </div>
    `;

    const footer = `
      <button id="btn-cancel-circle" class="btn btn-secondary">取消</button>
      <button id="btn-confirm-circle" class="btn btn-primary">创建</button>
    `;

    this.showModal('添加圆形围栏', body, footer);

    setTimeout(() => {
      const mapDiv = document.getElementById('modal-map');
      if (mapDiv && !mapDiv._leaflet_id) {
        const modalMap = L.map('modal-map').setView([39.9042, 116.4074], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(modalMap);

        let centerMarker = null;
        let center = null;

        modalMap.on('click', (e) => {
          center = [e.latlng.lat, e.latlng.lng];
          if (centerMarker) {
            modalMap.removeLayer(centerMarker);
          }
          centerMarker = L.circleMarker(e.latlng, {
            radius: 8,
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 1,
          }).addTo(modalMap);
        });
      }
    }, 100);

    return new Promise((resolve) => {
      const handleConfirm = () => {
        const name = document.getElementById('input-geofence-name')?.value || '未命名围栏';
        const radius = parseInt(document.getElementById('input-geofence-radius')?.value) || 200;
        
        const modalMapDiv = document.getElementById('modal-map');
        if (modalMapDiv && modalMapDiv._latlng) {
          center = [modalMapDiv._latlng.lat, modalMapDiv._latlng.lng];
        }

        this.hideModal();
        cleanup();
        resolve({ name, radius, center });
      };

      const handleCancel = () => {
        this.hideModal();
        cleanup();
        resolve(null);
      };

      const cleanup = () => {
        document.getElementById('btn-cancel-circle')?.removeEventListener('click', handleCancel);
        document.getElementById('btn-confirm-circle')?.removeEventListener('click', handleConfirm);
      };

      setTimeout(() => {
        document.getElementById('btn-cancel-circle')?.addEventListener('click', handleCancel);
        document.getElementById('btn-confirm-circle')?.addEventListener('click', handleConfirm);
      }, 100);
    });
  }

  showPolygonModal() {
    const body = `
      <div class="form-group">
        <label>围栏名称</label>
        <input type="text" id="input-geofence-name-poly" class="input" placeholder="例如：巡逻区域" value="">
      </div>
      <p style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">
        点击地图添加顶点，双击完成绘制（至少3个顶点）
      </p>
      <div id="polygon-hint" style="margin-top: 8px; padding: 8px; background: var(--background); border-radius: 4px; font-size: 13px;">
        顶点: 0
      </div>
    `;

    const footer = `
      <button id="btn-cancel-polygon" class="btn btn-secondary">取消</button>
      <button id="btn-confirm-polygon" class="btn btn-primary" disabled>创建</button>
    `;

    this.showModal('添加多边形围栏', body, footer);

    return new Promise((resolve) => {
      let vertices = [];
      let tempPolygon = null;
      let markers = [];

      setTimeout(() => {
        const mapDiv = document.getElementById('modal-map');
        if (mapDiv && !mapDiv._leaflet_id) {
          const modalMap = L.map('modal-map').setView([39.9042, 116.4074], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
          }).addTo(modalMap);

          const updatePolygon = () => {
            if (tempPolygon) {
              modalMap.removeLayer(tempPolygon);
            }
            if (vertices.length >= 2) {
              tempPolygon = L.polygon(vertices, {
                color: '#10B981',
                fillColor: '#10B981',
                fillOpacity: 0.3,
                dashArray: '5, 5',
              }).addTo(modalMap);
            }
            document.getElementById('polygon-hint').textContent = `顶点: ${vertices.length}`;
            document.getElementById('btn-confirm-polygon').disabled = vertices.length < 3;
          };

          modalMap.on('click', (e) => {
            vertices.push([e.latlng.lat, e.latlng.lng]);
            
            const marker = L.circleMarker(e.latlng, {
              radius: 6,
              color: '#10B981',
              fillColor: '#10B981',
              fillOpacity: 1,
            }).addTo(modalMap);
            markers.push(marker);

            updatePolygon();
          });

          modalMap.on('dblclick', (e) => {
            L.DomEvent.stopPropagation(e);
          });

          mapDiv._modalMap = modalMap;
          mapDiv._vertices = vertices;
          mapDiv._updatePolygon = updatePolygon;
        }
      }, 100);

      const handleConfirm = () => {
        const name = document.getElementById('input-geofence-name-poly')?.value || '未命名围栏';
        this.hideModal();
        cleanup();
        
        setTimeout(() => {
          const mapDiv = document.getElementById('modal-map');
          if (mapDiv._modalMap) {
            mapDiv._modalMap.remove();
          }
        }, 100);
        
        resolve(vertices.length >= 3 ? { name, vertices } : null);
      };

      const handleCancel = () => {
        this.hideModal();
        cleanup();
        
        setTimeout(() => {
          const mapDiv = document.getElementById('modal-map');
          if (mapDiv._modalMap) {
            mapDiv._modalMap.remove();
          }
        }, 100);
        
        resolve(null);
      };

      const cleanup = () => {
        document.getElementById('btn-cancel-polygon')?.removeEventListener('click', handleCancel);
        document.getElementById('btn-confirm-polygon')?.removeEventListener('click', handleConfirm);
      };

      setTimeout(() => {
        document.getElementById('btn-cancel-polygon')?.addEventListener('click', handleCancel);
        document.getElementById('btn-confirm-polygon')?.addEventListener('click', handleConfirm);
      }, 100);
    });
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.animation = 'fadeIn 0.3s ease-out';

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  showLoading(element) {
    element.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('邀请码已复制', 'success');
    }).catch(() => {
      this.showToast('复制失败', 'error');
    });
  }

  bindEvents(events) {
    Object.entries(events).forEach(([selector, handler]) => {
      const element = this.elements[selector] || document.querySelector(selector);
      if (element) {
        element.addEventListener('click', handler);
      }
    });

    this.elements.modalClose?.addEventListener('click', () => {
      this.hideModal();
    });

    this.elements.modal?.addEventListener('click', (e) => {
      if (e.target === this.elements.modal) {
        this.hideModal();
      }
    });
  }

  cleanup() {
    if (this.toastContainer && this.toastContainer.parentNode) {
      this.toastContainer.parentNode.removeChild(this.toastContainer);
    }
  }
}
