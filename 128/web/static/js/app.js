let weeklyChart, hourlyChart;
let alarmPlayed = false;
let alarmTimeout = null;

function initCharts() {
    const weeklyCtx = document.getElementById('weeklyChart').getContext('2d');
    weeklyChart = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '报警次数',
                data: [],
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });

    const hourlyCtx = document.getElementById('hourlyChart').getContext('2d');
    hourlyChart = new Chart(hourlyCtx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: '报警次数',
                data: [],
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function initMultiCameraPanel() {
    if (typeof USE_MULTI_CAMERA !== 'undefined' && USE_MULTI_CAMERA) {
        document.getElementById('mode-badge').style.display = 'inline-block';
        document.getElementById('multi-cam-panel').style.display = 'block';
        document.getElementById('analysis-3d-panel').style.display = 'block';
        
        const cameraGrid = document.getElementById('camera-grid');
        const cameraNames = ['cam_front', 'cam_right', 'cam_back', 'cam_left'];
        const numCameras = typeof NUM_CAMERAS !== 'undefined' ? NUM_CAMERAS : 4;
        
        cameraGrid.innerHTML = '';
        for (let i = 0; i < numCameras; i++) {
            const camDiv = document.createElement('div');
            camDiv.className = 'camera-item';
            camDiv.id = `camera-${i}`;
            camDiv.innerHTML = `
                <div class="camera-indicator" id="cam-indicator-${i}"></div>
                <span class="camera-name">${cameraNames[i] || 'cam_' + i}</span>
                <span class="camera-status" id="cam-status-${i}">初始化中</span>
            `;
            cameraGrid.appendChild(camDiv);
        }
    }
}

function updateCameraStatus(data) {
    if (!data.use_multi_camera) return;
    
    const visibleCameras = data.visible_cameras || 0;
    const totalCameras = data.total_cameras || 0;
    
    const numCameras = typeof NUM_CAMERAS !== 'undefined' ? NUM_CAMERAS : 4;
    
    for (let i = 0; i < numCameras && i < 4; i++) {
        const indicator = document.getElementById(`cam-indicator-${i}`);
        const status = document.getElementById(`cam-status-${i}`);
        
        if (indicator.className = 'camera-indicator active';
        status.textContent = '在线';
    }
    
    document.getElementById('visible-cameras').textContent = `${visibleCameras}/${totalCameras || 0};
    document.getElementById('hip-height').textContent = `${(data.hip_height_3d || 0).toFixed(2)} m`;
    
    const vel = document.getElementById('vertical-velocity');
    const vVel = data.vertical_velocity || 0;
    vel.textContent = `${vVel.toFixed(2)} m/s`;
    vel.className = 'analysis-value';
    if (vVel < -0.1) {
        vel.style.color = '#ef4444';
    } else {
        vel.style.color = '#22c55e';
    }
    
    const aspectRatio = data.body_aspect_ratio_3d || 0;
    const aspectEl = document.getElementById('body-aspect-ratio');
    aspectEl.textContent = aspectRatio.toFixed(2);
    aspectEl.className = 'analysis-value';
    if (aspectRatio < 0.8) {
        aspectEl.style.color = '#ef4444';
    } else {
        aspectEl.style.color = '#22c55e';
    }
}

function updateStatus(data) {
    const statusCard = document.getElementById('status-card');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const fallProb = document.getElementById('fall-prob');
    const lastUpdate = document.getElementById('last-update');
    const mqttStatus = document.getElementById('mqtt-status');
    const mqttText = document.getElementById('mqtt-text');
    const todayCount = document.getElementById('today-count');
    const detectionState = document.getElementById('detection-state');
    const recoveryInfo = document.getElementById('recovery-info');
    const recoveryProgress = document.getElementById('recovery-progress');

    detectionState.textContent = data.detection_state || 'NORMAL';

    if (data.detection_state === 'WAITING_FOR_RECOVERY') {
        detectionState.style.color = '#f97316';
        recoveryInfo.style.display = 'block';
        recoveryProgress.textContent = data.recovery_progress || 0;
    } else {
        detectionState.style.color = '#22c55e';
        recoveryInfo.style.display = 'none';
    }

    if (data.status === 'alarm') {
        statusCard.className = 'status-card alarm';
        statusIcon.textContent = '⚠';
        statusTitle.textContent = '检测到摔倒！';
        statusTitle.style.color = '#ef4444';
        playAlarm();
    } else {
        statusCard.className = 'status-card normal';
        statusIcon.textContent = '✓';
        statusTitle.textContent = '系统正常';
        statusTitle.style.color = '#22c55e';
        stopAlarm();
    }

    fallProb.textContent = (data.fall_probability * 100).toFixed(2) + '%';
    lastUpdate.textContent = new Date(data.last_update).toLocaleString('zh-CN');
    todayCount.textContent = data.alarm_count_today;

    if (data.mqtt_connected) {
        mqttStatus.className = 'status-indicator connected';
        mqttText.textContent = '已连接';
    } else {
        mqttStatus.className = 'status-indicator disconnected';
        mqttText.textContent = '未连接';
    }
    
    updateCameraStatus(data);
}

function playAlarm() {
    if (!alarmPlayed) {
        const alarmSound = document.getElementById('alarm-sound');
        alarmSound.currentTime = 0;
        alarmSound.play().catch(() => {});
        alarmPlayed = true;
        
        if (alarmTimeout) {
            clearTimeout(alarmTimeout);
        }
        alarmTimeout = setTimeout(() => {
            alarmPlayed = false;
        }, 5000);
    }
}

function stopAlarm() {
    if (alarmTimeout) {
        clearTimeout(alarmTimeout);
        alarmTimeout = null;
    }
    alarmPlayed = false;
}

function updateWeeklyStats(data) {
    weeklyChart.data.labels = data.map(item => item.date.slice(5));
    weeklyChart.data.datasets[0].data = data.map(item => item.count);
    weeklyChart.update('none');
    
    const weekTotal = data.reduce((sum, item) => sum + item.count, 0);
    document.getElementById('week-count').textContent = weekTotal;
}

function updateHourlyStats(data) {
    hourlyChart.data.datasets[0].data = data.map(item => item.count);
    hourlyChart.update('none');
}

function updateRecentAlarms(alarms) {
    const alarmList = document.getElementById('alarm-list');
    
    if (alarms.length === 0) {
        alarmList.innerHTML = '<p class="no-data">暂无报警记录</p>';
        return;
    }
    
    alarmList.innerHTML = alarms.map(item => {
        if (item.event_type === 'recovery_detected' || (typeof item === 'string')) {
            return `<div class="alarm-item recovery-item">
                <div class="alarm-info">
                    <h4>✓ 已恢复站立</h4>
                    <p>时间: ${new Date(item.timestamp || item).toLocaleString('zh-CN')}</p>
                </div>
                <div class="alarm-confidence" style="background:#22c55e;">恢复</div>
            </div>`;
        }
        
        const multiCamInfo = item.multi_camera ? 
            `<p>摄像头: ${item.multi_camera.visible_cameras}/${item.multi_camera.total_cameras}</p>` : '';
        
        return `<div class="alarm-item">
            <div class="alarm-info">
                <h4>🚨 摔倒报警</h4>
                <p>时间: ${new Date(item.timestamp).toLocaleString('zh-CN')}</p>
                <p>设备: ${item.device_id}</p>
                ${multiCamInfo}
            </div>
            <div class="alarm-confidence">${(item.confidence * 100).toFixed(1)}%</div>
        </div>`;
    }).join('');
}

function updateEvents(events) {
    const tbody = document.getElementById('events-body');
    
    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:40px;">暂无历史记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = events.map(event => {
        const camInfo = event.visible_cameras > 0 ? 
            `${event.visible_cameras}/${event.total_cameras}` : '-';
        
        const analysis3d = event.hip_height_3d ? 
            `H:${event.hip_height_3d.toFixed(2)}m V:${event.vertical_velocity?.toFixed(2) || 0}m/s` : '-';
        
        const isRecovery = event.event_type === 'recovery_detected';
        const badgeClass = isRecovery ? 'success' : 'danger';
        const statusText = isRecovery ? '恢复' : '摔倒';
        
        return `
        <tr>
            <td>${new Date(event.timestamp).toLocaleString('zh-CN')}</td>
            <td>${event.device_id}</td>
            <td>${(event.confidence * 100).toFixed(1)}%</td>
            <td>${camInfo}</td>
            <td style="font-size:0.8em;">${analysis3d}</td>
            <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
        </tr>
    `;
    }).join('');
}

async function fetchData() {
    try {
        const [statusRes, alarmsRes, weeklyRes, hourlyRes, eventsRes] = await Promise.all([
            fetch('/api/status'),
            fetch('/api/recent_alarms'),
            fetch('/api/weekly_stats'),
            fetch('/api/hourly_stats'),
            fetch('/api/events')
        ]);
        
        const status = await statusRes.json();
        const alarms = await alarmsRes.json();
        const weekly = await weeklyRes.json();
        const hourly = await hourlyRes.json();
        const events = await eventsRes.json();
        
        updateStatus(status);
        updateRecentAlarms(alarms);
        updateWeeklyStats(weekly);
        updateHourlyStats(hourly);
        updateEvents(events);
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initMultiCameraPanel();
    fetchData();
    setInterval(fetchData, 2000);
});
