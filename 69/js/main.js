import { SceneInitializer } from './scene/SceneInitializer.js';
import { stratumData } from './data/geologyData.js';

class GeologyVisualizationApp {
    constructor() {
        this.sceneAPI = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        const initializer = new SceneInitializer('canvas-container');
        this.sceneAPI = await initializer.initialize();
        
        this.setupCallbacks();
        this.setupUI();
        this.buildLegend();
        
        this.isInitialized = true;
        this.hideLoading();
        this.animate();
    }

    setupCallbacks() {
        this.sceneAPI.drilling.onDrillComplete = (result) => {
            this.showDrillResult(result);
        };
        
        this.sceneAPI.dataPoints.onPointClick = (pointData) => {
            this.showDataPopup(pointData);
        };
        
        this.sceneAPI.interactionManager.onViewChange = (viewType) => {
            this.updateViewButtons(viewType);
        };
        
        this.sceneAPI.interactionManager.onSectionChange = (mode) => {
            this.updateSectionButtons(mode);
        };
        
        this.sceneAPI.explorationPath.onPathComplete = (pathData) => {
            this.showPathResult(pathData);
        };
        
        this.sceneAPI.renderOptimizer.onQualityChange = (stats) => {
            this.updatePerformanceStats(stats);
        };
    }

    setupUI() {
        this.setupViewButtons();
        this.setupSectionButtons();
        this.setupDrillingButtons();
        this.setupFaultButtons();
        this.setupPathButtons();
        this.setupExportButtons();
        this.setupPopupClose();
    }

    setupViewButtons() {
        document.getElementById('btn-top')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setView('top');
        });
        
        document.getElementById('btn-front')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setView('front');
        });
        
        document.getElementById('btn-side')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setView('side');
        });
        
        document.getElementById('btn-3d')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setView('3d');
        });
    }

    setupSectionButtons() {
        document.getElementById('btn-section-x')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setSectionMode('x');
        });
        
        document.getElementById('btn-section-z')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setSectionMode('z');
        });
        
        document.getElementById('btn-section-reset')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.setSectionMode('none');
        });
    }

    setupDrillingButtons() {
        document.getElementById('btn-drill-mode')?.addEventListener('click', () => {
            this.sceneAPI.explorationPath.hide();
            document.getElementById('btn-path-mode')?.classList.remove('active');
            const enabled = this.sceneAPI.interactionManager.toggleDrillMode();
            const btn = document.getElementById('btn-drill-mode');
            btn.textContent = enabled ? '停止钻探' : '启动钻探';
            btn.classList.toggle('active', enabled);
        });
        
        document.getElementById('btn-drill-clear')?.addEventListener('click', () => {
            this.sceneAPI.interactionManager.clearDrillHoles();
            this.clearDrillResult();
        });
    }

    setupFaultButtons() {
        document.getElementById('btn-fault-toggle')?.addEventListener('click', () => {
            const visible = this.sceneAPI.faultSimulation.toggle();
            const btn = document.getElementById('btn-fault-toggle');
            btn.textContent = visible ? '隐藏断层' : '显示断层';
            btn.classList.toggle('active', visible);
        });
        
        document.getElementById('btn-fault-animate')?.addEventListener('click', () => {
            this.sceneAPI.faultSimulation.startAnimation();
        });
        
        document.getElementById('btn-fault-reset')?.addEventListener('click', () => {
            this.sceneAPI.faultSimulation.resetAnimation();
        });
    }

    setupPathButtons() {
        document.getElementById('btn-path-mode')?.addEventListener('click', () => {
            this.sceneAPI.drilling.disableDrillMode();
            document.getElementById('btn-drill-mode')?.textContent = '启动钻探';
            document.getElementById('btn-drill-mode')?.classList.remove('active');
            const drawing = this.sceneAPI.explorationPath.toggleDrawing();
            const btn = document.getElementById('btn-path-mode');
            btn.textContent = drawing ? '停止绘制' : '绘制路线';
            btn.classList.toggle('active', drawing);
        });
        
        document.getElementById('btn-path-undo')?.addEventListener('click', () => {
            this.sceneAPI.explorationPath.undo();
        });
        
        document.getElementById('btn-path-clear')?.addEventListener('click', () => {
            this.sceneAPI.explorationPath.clear();
            this.clearPathResult();
        });
        
        document.getElementById('btn-path-export')?.addEventListener('click', () => {
            this.sceneAPI.modelExporter.exportPathData(
                this.sceneAPI.explorationPath,
                { format: 'json', download: true, pretty: true }
            );
        });
        
        this.sceneAPI.container.addEventListener('mousemove', (e) => {
            this.sceneAPI.explorationPath.handleMouseMove(e);
        });
        
        this.sceneAPI.container.addEventListener('click', (e) => {
            if (this.sceneAPI.explorationPath.isInDrawingMode()) {
                this.sceneAPI.explorationPath.handleClick(e);
            }
        });
    }

    setupExportButtons() {
        document.getElementById('btn-export-model')?.addEventListener('click', () => {
            const format = document.getElementById('export-format')?.value || 'json';
            const lightweight = document.getElementById('export-lightweight')?.checked || false;
            
            this.sceneAPI.modelExporter.exportStratumModel(
                this.sceneAPI.stratumModel,
                { format, lightweight, download: true, pretty: true }
            );
        });
        
        document.getElementById('btn-export-drill')?.addEventListener('click', () => {
            const format = document.getElementById('export-drill-format')?.value || 'json';
            this.sceneAPI.modelExporter.exportDrillData(
                this.sceneAPI.drilling,
                { format, download: true, pretty: true }
            );
        });
        
        document.getElementById('btn-export-all')?.addEventListener('click', () => {
            this.sceneAPI.modelExporter.exportAll(
                this.sceneAPI.stratumModel,
                this.sceneAPI.drilling,
                this.sceneAPI.explorationPath,
                { download: true, pretty: true, lightweight: false }
            );
        });
    }

    setupPopupClose() {
        document.getElementById('popup-close')?.addEventListener('click', () => {
            this.hideDataPopup();
        });
        
        document.getElementById('data-popup')?.addEventListener('click', (e) => {
            if (e.target.id === 'data-popup') {
                this.hideDataPopup();
            }
        });
    }

    buildLegend() {
        const container = document.getElementById('legend-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        stratumData.forEach(stratum => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            
            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = `#${stratum.color.toString(16).padStart(6, '0')}`;
            
            const label = document.createElement('span');
            label.textContent = stratum.name;
            label.title = `${stratum.nameEn} - ${stratum.description}`;
            
            item.appendChild(colorBox);
            item.appendChild(label);
            
            item.addEventListener('mouseenter', () => {
                this.sceneAPI.stratumModel.highlightStratum(stratum.id);
            });
            
            item.addEventListener('mouseleave', () => {
                this.sceneAPI.stratumModel.clearHighlight();
            });
            
            container.appendChild(item);
        });
    }

    showDrillResult(result) {
        const container = document.getElementById('drill-result');
        if (!container) return;
        
        container.innerHTML = '';
        
        const header = document.createElement('div');
        header.className = 'drill-header';
        header.innerHTML = `
            <h4>钻孔 #${result.id.slice(-4)}</h4>
            <p>位置: (${result.x.toFixed(1)}, ${result.z.toFixed(1)})</p>
            <p>总深度: ${result.totalDepth.toFixed(1)}m</p>
            <p>时间: ${result.timestamp}</p>
        `;
        container.appendChild(header);
        
        const strataList = document.createElement('div');
        strataList.className = 'strata-list';
        
        result.strata.forEach(stratum => {
            const item = document.createElement('div');
            item.className = 'stratum-item';
            
            const colorBar = document.createElement('div');
            colorBar.className = 'stratum-color-bar';
            colorBar.style.backgroundColor = `#${stratum.color.toString(16).padStart(6, '0')}`;
            
            const info = document.createElement('div');
            info.className = 'stratum-info';
            info.innerHTML = `
                <strong>${stratum.name}</strong>
                <span>${stratum.topDepth}m ~ ${stratum.bottomDepth}m</span>
                <small>厚度: ${stratum.thickness}m</small>
            `;
            
            item.appendChild(colorBar);
            item.appendChild(info);
            strataList.appendChild(item);
        });
        
        container.appendChild(strataList);
    }

    clearDrillResult() {
        const container = document.getElementById('drill-result');
        if (container) {
            container.innerHTML = '<p class="placeholder">暂无钻探数据</p>';
        }
    }

    showPathResult(pathData) {
        const container = document.getElementById('path-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="path-header">
                <h4>勘探路线</h4>
                <p>总点数: ${pathData.pointCount}</p>
                <p>总距离: ${pathData.totalDistance.toFixed(2)}m</p>
            </div>
        `;
    }

    clearPathResult() {
        const container = document.getElementById('path-result');
        if (container) {
            container.innerHTML = '<p class="placeholder">暂无路线数据</p>';
        }
    }

    showDataPopup(pointData) {
        const popup = document.getElementById('data-popup');
        const title = document.getElementById('popup-title');
        const content = document.getElementById('popup-content');
        
        if (!popup || !title || !content) return;
        
        title.textContent = pointData.name;
        
        let html = `<div class="popup-section">`;
        html += `<h4>基本信息</h4>`;
        html += `<p><strong>类型:</strong> ${this.getTypeLabel(pointData.type)}</p>`;
        html += `<p><strong>位置:</strong> (${pointData.position.x.toFixed(1)}, ${pointData.position.y.toFixed(1)}, ${pointData.position.z.toFixed(1)})</p>`;
        html += `</div>`;
        
        html += this.formatDataContent(pointData);
        
        content.innerHTML = html;
        popup.classList.remove('hidden');
    }

    getTypeLabel(type) {
        const labels = {
            borehole: '钻孔',
            monitoring: '监测井',
            sampling: '取样点',
            geological: '地质点'
        };
        return labels[type] || type;
    }

    formatDataContent(pointData) {
        let html = '';
        const data = pointData.data;
        
        switch (pointData.type) {
            case 'borehole':
                html += `<div class="popup-section">`;
                html += `<h4>钻孔信息</h4>`;
                html += `<p><strong>孔号:</strong> ${data.holeNumber}</p>`;
                html += `<p><strong>孔深:</strong> ${data.holeDepth}m</p>`;
                html += `<p><strong>标高:</strong> ${data.elevation}m</p>`;
                html += `<p><strong>坐标:</strong> (${data.coordinate.x}, ${data.coordinate.y})</p>`;
                html += `<p><strong>日期:</strong> ${data.drillingDate}</p>`;
                html += `<p><strong>地下水位:</strong> ${data.groundwaterLevel}m</p>`;
                html += `</div>`;
                
                if (data.strata && data.strata.length > 0) {
                    html += `<div class="popup-section">`;
                    html += `<h4>地层分层</h4>`;
                    html += `<table class="data-table">`;
                    html += `<tr><th>层位</th><th>深度</th><th>厚度</th></tr>`;
                    data.strata.forEach(s => {
                        html += `<tr><td>${s.layer}</td><td>${s.depth}</td><td>${s.thickness}</td></tr>`;
                    });
                    html += `</table>`;
                    html += `</div>`;
                }
                
                if (data.remarks) {
                    html += `<div class="popup-section">`;
                    html += `<h4>备注</h4>`;
                    html += `<p>${data.remarks}</p>`;
                    html += `</div>`;
                }
                break;
                
            case 'monitoring':
                html += `<div class="popup-section">`;
                html += `<h4>监测井信息</h4>`;
                html += `<p><strong>井号:</strong> ${data.wellNumber}</p>`;
                html += `<p><strong>井深:</strong> ${data.wellDepth}m</p>`;
                html += `<p><strong>更新时间:</strong> ${data.lastUpdate}</p>`;
                html += `</div>`;
                
                if (data.monitoringData) {
                    html += `<div class="popup-section">`;
                    html += `<h4>监测数据</h4>`;
                    html += `<p><strong>当前水位:</strong> ${data.monitoringData.currentWaterLevel}m</p>`;
                    html += `<p><strong>历史最高:</strong> ${data.monitoringData.historicalMax}m</p>`;
                    html += `<p><strong>历史最低:</strong> ${data.monitoringData.historicalMin}m</p>`;
                    html += `<p><strong>pH值:</strong> ${data.monitoringData.ph}</p>`;
                    html += `<p><strong>水温:</strong> ${data.monitoringData.temperature}°C</p>`;
                    html += `<p><strong>电导率:</strong> ${data.monitoringData.conductivity} μS/cm</p>`;
                    html += `</div>`;
                }
                break;
                
            case 'sampling':
                html += `<div class="popup-section">`;
                html += `<h4>取样信息</h4>`;
                html += `<p><strong>样品号:</strong> ${data.sampleNumber}</p>`;
                html += `<p><strong>取样深度:</strong> ${data.samplingDepth}</p>`;
                html += `<p><strong>日期:</strong> ${data.samplingDate}</p>`;
                if (data.rockType) {
                    html += `<p><strong>岩石类型:</strong> ${data.rockType}</p>`;
                }
                html += `</div>`;
                
                if (data.testResults) {
                    html += `<div class="popup-section">`;
                    html += `<h4>试验结果</h4>`;
                    html += `<table class="data-table">`;
                    for (const [key, value] of Object.entries(data.testResults)) {
                        const label = this.formatKey(key);
                        html += `<tr><td>${label}</td><td>${value}</td></tr>`;
                    }
                    html += `</table>`;
                    html += `</div>`;
                }
                break;
                
            case 'geological':
                html += `<div class="popup-section">`;
                html += `<h4>地质特征</h4>`;
                html += `<p><strong>类型:</strong> ${data.featureType}</p>`;
                html += `<p><strong>走向:</strong> ${data.strike}</p>`;
                html += `<p><strong>倾向:</strong> ${data.dip}</p>`;
                html += `<p><strong>倾角:</strong> ${data.dipAngle}°</p>`;
                html += `<p><strong>宽度:</strong> ${data.faultWidth}</p>`;
                html += `<p><strong>充填物:</strong> ${data.fillingMaterial}</p>`;
                html += `<p><strong>活动性:</strong> ${data.activity}</p>`;
                html += `</div>`;
                break;
        }
        
        if (data.remarks) {
            html += `<div class="popup-section">`;
            html += `<h4>备注</h4>`;
            html += `<p>${data.remarks}</p>`;
            html += `</div>`;
        }
        
        return html;
    }

    formatKey(key) {
        const keyMap = {
            moistureContent: '含水量',
            density: '密度',
            organicMatter: '有机质',
            ph: 'pH值',
            shearStrength: '抗剪强度',
            porosity: '孔隙度',
            uniaxialStrength: '单轴强度',
            tensileStrength: '抗拉强度',
            elasticModulus: '弹性模量',
            poissonsRatio: '泊松比',
            compressionModulus: '压缩模量',
            frictionAngle: '内摩擦角',
            particleSize: '颗粒粒径',
            weatheringDegree: '风化程度',
            rockType: '岩石类型',
            rqd: 'RQD'
        };
        return keyMap[key] || key;
    }

    hideDataPopup() {
        const popup = document.getElementById('data-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
        this.sceneAPI.dataPoints.clearSelection();
    }

    updateViewButtons(activeType) {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`btn-${activeType}`)?.classList.add('active');
    }

    updateSectionButtons(mode) {
        document.querySelectorAll('.section-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (mode === 'none') {
            document.getElementById('btn-section-reset')?.classList.add('active');
        } else if (mode === 'x') {
            document.getElementById('btn-section-x')?.classList.add('active');
        } else if (mode === 'z') {
            document.getElementById('btn-section-z')?.classList.add('active');
        }
    }

    updatePerformanceStats(stats) {
        const fpsElement = document.getElementById('fps-display');
        const qualityElement = document.getElementById('quality-display');
        
        if (fpsElement) {
            fpsElement.textContent = `FPS: ${stats.fps}`;
        }
        if (qualityElement) {
            qualityElement.textContent = `质量: ${stats.qualityLevel}`;
        }
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => {
                loading.style.display = 'none';
            }, 300);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const deltaTime = this.sceneAPI.clock.getDelta();
        
        this.sceneAPI.update(deltaTime);
        this.sceneAPI.render();
    }

    dispose() {
        if (this.sceneAPI) {
            this.sceneAPI.dispose();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeologyVisualizationApp();
});

window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.dispose();
    }
});
