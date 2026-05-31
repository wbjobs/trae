const api = window.dconfig;

const $ = (id) => document.getElementById(id);

const startBtn = $('startBtn');
const stopBtn = $('stopBtn');
const nodeStatus = $('nodeStatus');
const nodeStatusText = $('nodeStatusText');
const peerIdShort = $('peerIdShort');
const listenAddr = $('listenAddr');
const bootstrapAddr = $('bootstrapAddr');
const mergeStrategySel = $('mergeStrategy');
const peerCount = $('peerCount');
const keyCount = $('keyCount');
const historyCount = $('historyCount');
const addressList = $('addressList');
const peerList = $('peerList');
const configForm = $('configForm');
const configKey = $('configKey');
const configValue = $('configValue');
const configTable = $('configTable');
const historyList = $('historyList');
const logList = $('logList');
const dhtRouting = $('dhtRouting');
const dhtContent = $('dhtContent');
const dhtPut = $('dhtPut');
const dhtGet = $('dhtGet');
const dhtReplication = $('dhtReplication');
const dhtLastRefresh = $('dhtLastRefresh');
const dhtLastRepublish = $('dhtLastRepublish');

const dagSize = $('dagSize');
const dagHeadHash = $('dagHeadHash');
const dagGenesisHash = $('dagGenesisHash');
const dagChainList = $('dagChainList');
const dagVerifyResult = $('dagVerifyResult');
const verifyDAGBtn = $('verifyDAGBtn');
const verifyRemoteDAGBtn = $('verifyRemoteDAGBtn');
const remotePeerSelect = $('remotePeerSelect');

let started = false;
let currentPeers = [];

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(ts);
  }
}

function shortId(id) {
  if (!id) return '-';
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function shortHash(hash) {
  if (!hash) return '-';
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function setStarted(val, peerId) {
  started = val;
  nodeStatus.className = 'status-dot ' + (val ? 'online' : 'offline');
  nodeStatusText.textContent = val ? 'Online' : 'Offline';
  peerIdShort.textContent = peerId ? shortId(peerId) : '-';
  startBtn.disabled = val;
  stopBtn.disabled = !val;
  verifyRemoteDAGBtn.disabled = !val;
}

function logEvent(msg) {
  if (!msg) return;
  const li = document.createElement('li');
  let cls = '';
  if (msg.event === 'config-change' || msg.event === 'update') cls = 'log-update';
  else if (msg.event === 'peer-connect' || msg.event === 'peer-disconnect' || msg.event === 'started')
    cls = 'log-peer';
  else if (msg.event === 'error') cls = 'log-error';
  else if (msg.event === 'dag-verify-result' || msg.event === 'dag-verify-failed') cls = 'log-update';
  if (cls) li.classList.add(cls);
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatTime(msg.ts);
  const ev = document.createElement('span');
  ev.className = 'log-event';
  ev.textContent = `[${msg.event}]`;
  const payload = document.createElement('span');
  let txt = '';
  try {
    txt = JSON.stringify(msg.payload).slice(0, 200);
  } catch {
    txt = String(msg.payload);
  }
  payload.textContent = txt;
  li.appendChild(time);
  li.appendChild(ev);
  li.appendChild(payload);
  logList.insertBefore(li, logList.firstChild);
  while (logList.children.length > 200) logList.removeChild(logList.lastChild);
}

function renderState(state) {
  if (!state) return;
  peerCount.textContent = state.peers ? state.peers.length : 0;
  keyCount.textContent = state.config ? Object.keys(state.config).length : 0;
  historyCount.textContent = state.history ? state.history.length : 0;

  currentPeers = state.peers || [];
  updateRemotePeerSelect();

  if (state.addresses && state.addresses.length) {
    addressList.innerHTML = '';
    state.addresses.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a;
      addressList.appendChild(li);
    });
  }

  if (state.peers && state.peers.length) {
    peerList.innerHTML = '';
    state.peers.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      peerList.appendChild(li);
    });
  } else {
    peerList.innerHTML = '<li class="muted">(无)</li>';
  }

  if (state.mergeStrategy) {
    mergeStrategySel.value = state.mergeStrategy;
  }

  renderDHTHealth(state);
  renderConfig(state);
  renderHistory(state);
  renderDAG(state);
}

function updateRemotePeerSelect() {
  const prev = remotePeerSelect.value;
  remotePeerSelect.innerHTML = '';
  if (currentPeers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(无已连接节点)';
    remotePeerSelect.appendChild(opt);
    verifyRemoteDAGBtn.disabled = true;
  } else {
    currentPeers.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = shortId(p);
      remotePeerSelect.appendChild(opt);
    });
    verifyRemoteDAGBtn.disabled = false;
  }
  if (prev && currentPeers.includes(prev)) {
    remotePeerSelect.value = prev;
  }
}

function renderDAG(state) {
  if (!state.dag) return;
  const d = state.dag;
  dagSize.textContent = d.size != null ? d.size : 0;
  dagHeadHash.textContent = d.headHash ? shortHash(d.headHash) : '-';
  dagHeadHash.title = d.headHash || '';
  dagGenesisHash.textContent = d.genesisHash ? shortHash(d.genesisHash) : '-';
  dagGenesisHash.title = d.genesisHash || '';

  if (!d.chain || d.chain.length === 0) {
    dagChainList.innerHTML = '<li class="muted">(暂无 DAG 节点)</li>';
    return;
  }

  dagChainList.innerHTML = '';
  d.chain.slice().reverse().forEach((node) => {
    const li = document.createElement('li');
    li.className = 'dag-node';
    if (node.action === 'delete') li.classList.add('delete');

    const head = document.createElement('div');
    head.className = 'dag-node-head';
    const idx = document.createElement('span');
    idx.className = 'dag-idx';
    idx.textContent = `#${node.index}`;
    const action = document.createElement('span');
    action.className = 'dag-action';
    if (node.action === 'delete') action.classList.add('dag-action-delete');
    action.textContent = node.action;
    const key = document.createElement('span');
    key.className = 'dag-key';
    key.textContent = node.key;
    const time = document.createElement('span');
    time.className = 'dag-time';
    time.textContent = formatTime(node.timestamp);
    const author = document.createElement('span');
    author.className = 'dag-author';
    author.textContent = shortId(node.author);

    head.appendChild(idx);
    head.appendChild(action);
    head.appendChild(key);
    head.appendChild(time);
    head.appendChild(author);

    const hashes = document.createElement('div');
    hashes.className = 'dag-hashes';
    const prevLine = document.createElement('div');
    prevLine.className = 'dag-hash-row';
    const prevLabel = document.createElement('span');
    prevLabel.className = 'dag-hash-label';
    prevLabel.textContent = 'prev:';
    const prevVal = document.createElement('span');
    prevVal.className = 'dag-hash-val';
    prevVal.textContent = node.prevHash ? shortHash(node.prevHash) : 'GENESIS';
    prevVal.title = node.prevHash || 'Genesis block';
    prevLine.appendChild(prevLabel);
    prevLine.appendChild(prevVal);

    const hashLine = document.createElement('div');
    hashLine.className = 'dag-hash-row';
    const hashLabel = document.createElement('span');
    hashLabel.className = 'dag-hash-label';
    hashLabel.textContent = 'hash:';
    const hashVal = document.createElement('span');
    hashVal.className = 'dag-hash-val';
    hashVal.textContent = shortHash(node.hash);
    hashVal.title = node.hash;
    hashLine.appendChild(hashLabel);
    hashLine.appendChild(hashVal);

    hashes.appendChild(prevLine);
    hashes.appendChild(hashLine);

    li.appendChild(head);
    if (node.action !== 'delete' && node.value !== undefined && node.value !== null) {
      const val = document.createElement('div');
      val.className = 'dag-value';
      val.textContent = '= ' + (typeof node.value === 'string' ? node.value : JSON.stringify(node.value));
      li.appendChild(val);
    }
    li.appendChild(hashes);
    dagChainList.appendChild(li);
  });
}

function renderDHTHealth(state) {
  if (!state.dhtHealth) return;
  const h = state.dhtHealth;
  dhtRouting.textContent = h.routingTableSize != null ? h.routingTableSize : 0;
  dhtContent.textContent = h.contentKeys != null ? h.contentKeys : 0;
  dhtPut.textContent = `${h.putSuccessCount || 0} / ${h.putFailCount || 0}`;
  dhtGet.textContent = `${h.getSuccessCount || 0} / ${h.getFailCount || 0}`;
  dhtReplication.textContent = h.replicationCount || 0;
  dhtLastRefresh.textContent = h.lastRefresh ? formatTime(h.lastRefresh) : '-';
  dhtLastRepublish.textContent = h.lastRepublish ? formatTime(h.lastRepublish) : '-';
}

function renderConfig(state) {
  const tbody = configTable.querySelector('tbody');
  tbody.innerHTML = '';
  if (!state.config || Object.keys(state.config).length === 0) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">暂无配置</td></tr>';
    return;
  }
  const meta = (state.history || []).reduce((acc, h) => {
    if (h.action !== 'delete' && !acc[h.key]) acc[h.key] = h;
    return acc;
  }, {});
  for (const key of Object.keys(state.config)) {
    const tr = document.createElement('tr');
    const m = meta[key] || {};
    tr.innerHTML = `
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td style="text-align:right"></td>
    `;
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = key;
    const v = state.config[key];
    tds[1].textContent = typeof v === 'string' ? v : JSON.stringify(v);
    tds[2].textContent = shortId(m.author || '-');
    tds[3].textContent = m.timestamp ? formatTime(m.timestamp) : '-';
    const btn = document.createElement('button');
    btn.className = 'del-btn';
    btn.textContent = '删除';
    btn.addEventListener('click', async () => {
      await api.deleteConfig(key);
    });
    tds[4].appendChild(btn);
    tbody.appendChild(tr);
  }
}

function renderHistory(state) {
  historyList.innerHTML = '';
  if (!state.history || state.history.length === 0) {
    historyList.innerHTML = '<li class="muted">(暂无)</li>';
    return;
  }
  state.history.forEach((h) => {
    const li = document.createElement('li');
    if (h.action === 'delete') li.classList.add('delete');
    const action = document.createElement('span');
    action.className = 'hist-action';
    action.textContent = h.action;
    const key = document.createElement('span');
    key.className = 'hist-key';
    key.textContent = h.key;
    const author = document.createElement('span');
    author.className = 'hist-author';
    author.textContent = shortId(h.author || '');
    const time = document.createElement('span');
    time.className = 'hist-time';
    time.textContent = formatTime(h.timestamp);
    const val = document.createElement('div');
    val.style.marginTop = '4px';
    val.style.color = '#b9bde6';
    if (h.action !== 'delete' && h.value !== undefined) {
      val.textContent = '= ' + (typeof h.value === 'string' ? h.value : JSON.stringify(h.value));
    }
    if (h.hash) {
      const hash = document.createElement('div');
      hash.style.marginTop = '2px';
      hash.style.fontSize = '10px';
      hash.style.color = '#5a5f94';
      hash.style.fontFamily = 'Consolas, monospace';
      hash.textContent = `#${h.dagIndex != null ? h.dagIndex : '?'}  ${shortHash(h.hash)}`;
      hash.title = h.hash;
      li.appendChild(hash);
    }
    li.appendChild(action);
    li.appendChild(key);
    li.appendChild(author);
    li.appendChild(time);
    li.appendChild(val);
    historyList.appendChild(li);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = 'tab-' + btn.dataset.tab;
    document.getElementById(tabId).classList.add('active');
  });
});

verifyDAGBtn.addEventListener('click', async () => {
  dagVerifyResult.innerHTML = '<span style="color:#8d93c4">验证中…</span>';
  try {
    const result = await api.verifyDAG();
    if (result && result.valid) {
      dagVerifyResult.innerHTML = `<span style="color:#3ddc97">✓ 本地链完整，共 ${result._verifiedCount || '全部'} 个节点验证通过</span>`;
    } else {
      dagVerifyResult.innerHTML = `<span style="color:#ff6b6b">✗ 验证失败: ${result ? result.error : '未知错误'} (index=${result ? result.failedIndex : '?'})</span>`;
    }
  } catch (e) {
    dagVerifyResult.innerHTML = `<span style="color:#ff6b6b">✗ 验证异常: ${e.message}</span>`;
  }
});

verifyRemoteDAGBtn.addEventListener('click', async () => {
  const peerId = remotePeerSelect.value;
  if (!peerId) return;
  dagVerifyResult.innerHTML = `<span style="color:#8d93c4">验证远端 ${shortId(peerId)}…</span>`;
  try {
    const result = await api.verifyRemoteDAG(peerId);
    if (result && result.valid) {
      dagVerifyResult.innerHTML = `<span style="color:#3ddc97">✓ 远端链验证通过</span>`;
    } else {
      dagVerifyResult.innerHTML = `<span style="color:#ff6b6b">✗ 远端验证失败: ${result ? result.error : '未知错误'}</span>`;
    }
  } catch (e) {
    dagVerifyResult.innerHTML = `<span style="color:#ff6b6b">✗ 验证异常: ${e.message}</span>`;
  }
});

startBtn.addEventListener('click', async () => {
  const bootstrap = bootstrapAddr.value.trim();
  const result = await api.start({
    listenAddresses: [listenAddr.value.trim()].filter(Boolean),
    bootstraps: bootstrap ? [bootstrap] : [],
    mergeStrategy: mergeStrategySel.value,
  });
  if (result && result.started) {
    setStarted(true, result.peerId);
  }
});

stopBtn.addEventListener('click', async () => {
  await api.stop();
  setStarted(false, null);
});

mergeStrategySel.addEventListener('change', async () => {
  if (started) {
    await api.setMergeStrategy(mergeStrategySel.value);
  }
});

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = configKey.value.trim();
  let value = configValue.value.trim();
  if (!key) return;
  try {
    value = JSON.parse(value);
  } catch {
  }
  await api.setConfig(key, value);
  configKey.value = '';
  configValue.value = '';
});

api.onState((state) => {
  renderState(state);
});

api.onEvent((msg) => {
  logEvent(msg);
});

(async function init() {
  try {
    const s = await api.status();
    if (s && s.started) {
      setStarted(true, s.peerId);
      renderState(s);
    }
  } catch (e) {
    console.error(e);
  }
})();
