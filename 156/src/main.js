import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let systemData = {
  cpu: { overall: 0, cores: [] },
  memory: { total: 0, used: 0, free: 0, percentage: 0 },
  disks: [],
  network: { received: 0, transmitted: 0, received_speed: 0, transmitted_speed: 0 },
  history: {
    cpu: [],
    memory: [],
    network_in: [],
    network_out: [],
  },
};

let alertThreshold = 90;
let alertActive = false;
let chartsLoaded = false;
let searchResults = [];
let showSearch = false;
let recentEvents = [];

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatSpeed(bytesPerSec) {
  return formatBytes(bytesPerSec) + "/s";
}

function checkAlert(data) {
  if (data.cpu.overall > alertThreshold && !alertActive) {
    alertActive = true;
    showAlertBanner(`CPU 使用率过高: ${data.cpu.overall.toFixed(1)}%`);
    invoke("send_alert_notification", {
      message: `CPU 使用率超过 ${alertThreshold}%: ${data.cpu.overall.toFixed(1)}%`,
    });
  } else if (data.cpu.overall <= alertThreshold) {
    alertActive = false;
    hideAlertBanner();
  }
}

function showAlertBanner(message) {
  let banner = document.getElementById("alert-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "alert-banner";
    banner.className = "alert-banner";
    const dashboard = document.querySelector(".dashboard");
    dashboard.insertBefore(banner, dashboard.firstChild.nextSibling);
  }
  banner.innerHTML = `
    <span>⚠️ ${message}</span>
    <button onclick="dismissAlert()">关闭</button>
  `;
}

function hideAlertBanner() {
  const banner = document.getElementById("alert-banner");
  if (banner) {
    banner.remove();
  }
}

window.dismissAlert = function () {
  alertActive = false;
  hideAlertBanner();
};

async function loadCharts() {
  try {
    const [cpuChart, memoryChart, networkChart] = await Promise.all([
      invoke("generate_cpu_chart", { width: 400, height: 200 }),
      invoke("generate_memory_chart", { width: 400, height: 200 }),
      invoke("generate_network_chart", { width: 400, height: 200 }),
    ]);

    const cpuImg = document.getElementById("cpu-chart");
    const memoryImg = document.getElementById("memory-chart");
    const networkImg = document.getElementById("network-chart");

    if (cpuImg) cpuImg.src = cpuChart;
    if (memoryImg) memoryImg.src = memoryChart;
    if (networkImg) networkImg.src = networkChart;

    chartsLoaded = true;
  } catch (e) {
    console.error("Failed to load charts:", e);
  }
}

function renderDashboard() {
  const app = document.getElementById("main");
  app.innerHTML = `
    <div class="dashboard">
      <div class="header">
        <h1>🖥️ 系统监控仪表盘</h1>
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="tab-btn ${showSearch ? 'active' : ''}" onclick="toggleSearch()">
            🔍 搜索/事件
          </button>
          <div class="status">
            <span class="status-dot"></span>
            <span>实时监控中</span>
          </div>
        </div>
      </div>
      ${showSearch ? `
      <div class="search-section">
        <div class="search-container">
          <input 
            type="text" 
            id="search-input" 
            class="search-input" 
            placeholder="输入关键词搜索事件日志 (如: CPU, 告警, 内存)..."
            onkeypress="if(event.key === 'Enter') performSearch()"
          />
          <button class="search-btn" onclick="performSearch()">搜索</button>
          <button class="tab-btn" onclick="loadRecentEvents()">最近事件</button>
        </div>
        <div class="search-results">
          ${searchResults.length > 0 || recentEvents.length > 0 ? 
            (searchResults.length > 0 ? renderSearchResults() : renderRecentEvents()) : 
            '<div class="no-results">输入关键词搜索事件日志，或点击"最近事件"查看历史记录</div>'
          }
        </div>
      </div>
      ` : ''}
      <div class="grid">
        <div class="card">
          <h2>💻 CPU 使用率</h2>
          <div class="metric">
            <span class="metric-label">总体</span>
            <span class="metric-value">${systemData.cpu.overall.toFixed(1)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${systemData.cpu.overall > 80 ? 'warning' : ''}" 
                 style="width: ${systemData.cpu.overall}%"></div>
          </div>
          <div class="cpu-cores" style="margin-top: 16px;">
            ${systemData.cpu.cores.map((usage, i) => `
              <div class="cpu-core">
                <div class="cpu-core-label">核心 ${i + 1}</div>
                <div class="cpu-core-value">${usage.toFixed(1)}%</div>
                <div class="cpu-core-bar">
                  <div class="cpu-core-fill" 
                       style="width: ${usage}%; background: ${usage > 80 ? 'linear-gradient(90deg, #ff9800, #f44336)' : 'linear-gradient(90deg, #4caf50, #00d4ff)'}"></div>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="threshold-config">
            <label>告警阈值:</label>
            <input type="number" id="threshold-input" value="${alertThreshold}" min="1" max="100" 
                   onchange="updateThreshold(this.value)" />
            <span>%</span>
          </div>
          <img id="cpu-chart" class="chart-container" alt="CPU历史图表" />
        </div>
        <div class="card">
          <h2>🧠 内存使用</h2>
          <div class="metric">
            <span class="metric-label">已用</span>
            <span class="metric-value">${formatBytes(systemData.memory.used)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">总量</span>
            <span class="metric-value">${formatBytes(systemData.memory.total)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">可用</span>
            <span class="metric-value">${formatBytes(systemData.memory.free)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">使用率</span>
            <span class="metric-value">${systemData.memory.percentage.toFixed(1)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${systemData.memory.percentage > 80 ? 'warning' : ''}" 
                 style="width: ${systemData.memory.percentage}%"></div>
          </div>
          <img id="memory-chart" class="chart-container" alt="内存历史图表" />
        </div>
        <div class="card">
          <h2>💾 磁盘使用</h2>
          <div class="disk-grid">
            ${systemData.disks.map(disk => `
              <div class="disk-item">
                <div class="disk-name">${disk.name || disk.mount_point}</div>
                <div class="disk-usage">
                  <span>${formatBytes(disk.used)}</span>
                  <span>${formatBytes(disk.total)}</span>
                </div>
                <div class="disk-bar">
                  <div class="disk-fill" 
                       style="width: ${disk.percentage}%; background: ${disk.percentage > 80 ? 'linear-gradient(90deg, #ff9800, #f44336)' : 'linear-gradient(90deg, #4caf50, #00d4ff)'}"></div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="card">
          <h2>🌐 网络流量</h2>
          <div class="network-stats">
            <div class="network-item">
              <div class="network-direction">↓ 下载</div>
              <div class="network-value">${formatSpeed(systemData.network.received_speed)}</div>
              <div class="metric" style="margin-top: 8px;">
                <span class="metric-label">总计</span>
                <span class="metric-value">${formatBytes(systemData.network.received)}</span>
              </div>
            </div>
            <div class="network-item">
              <div class="network-direction">↑ 上传</div>
              <div class="network-value">${formatSpeed(systemData.network.transmitted_speed)}</div>
              <div class="metric" style="margin-top: 8px;">
                <span class="metric-label">总计</span>
                <span class="metric-value">${formatBytes(systemData.network.transmitted)}</span>
              </div>
            </div>
          </div>
          <img id="network-chart" class="chart-container" alt="网络历史图表" />
        </div>
      </div>
    </div>
  `;

  if (!chartsLoaded) {
    loadCharts();
  }
}

window.updateThreshold = function (value) {
  alertThreshold = parseInt(value) || 90;
  invoke("update_alert_threshold", { threshold: alertThreshold });
};

window.toggleSearch = function () {
  showSearch = !showSearch;
  renderDashboard();
};

window.performSearch = async function () {
  const query = document.getElementById("search-input").value.trim();
  if (!query) return;

  try {
    searchResults = await invoke("hybrid_search", { query, limit: 20 });
    renderDashboard();
  } catch (e) {
    console.error("Search failed:", e);
  }
};

window.loadRecentEvents = async function () {
  try {
    recentEvents = await invoke("get_recent_events", { limit: 20 });
    showSearch = true;
    renderDashboard();
  } catch (e) {
    console.error("Failed to load events:", e);
  }
};

function formatTimestamp(ts) {
  const date = new Date(ts * 1000);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderSearchResults() {
  if (searchResults.length === 0) {
    return `<div class="no-results">暂无搜索结果</div>`;
  }

  return searchResults.map(result => `
    <div class="search-result-item">
      <div class="search-result-header">
        <span class="search-result-type">${result.event_type}</span>
        <span class="search-result-time">${formatTimestamp(result.timestamp)}</span>
      </div>
      <div class="search-result-content">${result.content}</div>
      <div class="search-result-score">
        <span>RRF分数: ${result.score.toFixed(4)}</span>
        ${result.bm25_rank !== null ? `<span>BM25排名: #${result.bm25_rank + 1}</span>` : ''}
        ${result.vector_rank !== null ? `<span>向量排名: #${result.vector_rank + 1}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderRecentEvents() {
  if (recentEvents.length === 0) {
    return `<div class="no-results">暂无事件记录</div>`;
  }

  return recentEvents.map(event => `
    <div class="search-result-item">
      <div class="search-result-header">
        <span class="search-result-type">${event.event_type}</span>
        <span class="search-result-time">${formatTimestamp(event.timestamp)}</span>
      </div>
      <div class="search-result-content">${event.content}</div>
    </div>
  `).join('');
}

setInterval(() => {
  chartsLoaded = false;
  loadCharts();
}, 30000);

async function init() {
  try {
    const data = await invoke("get_system_data");
    systemData = data;
    renderDashboard();
  } catch (e) {
    console.error("Failed to get initial data:", e);
  }

  listen("system_data_update", (event) => {
    systemData = event.payload;
    checkAlert(systemData);
    renderDashboard();
  });

  listen("cpu_alert", (event) => {
    console.warn("CPU Alert:", event.payload);
  });

  invoke("start_monitoring");
}

init();
