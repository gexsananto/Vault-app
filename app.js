/*
  app.js - logic utama Vault
  Semua data sensitif (vaultData) cuma hidup di memori (variable JS),
  dan cuma ada selama app terbuka & dalam keadaan unlocked.
*/

let masterKey = null;      // CryptoKey, hilang saat lock/tutup app
let vaultRecord = null;    // {salt, iv, ciphertext} dari IndexedDB
let vaultData = null;      // {entries: [...]}  -- hasil dekripsi, di memori saja
let currentEntryId = null;
let editingEntryId = null;
let pinBuffer = '';
let useKeyboardMode = false;

const ICON_COLORS = ['#e8506e', '#6c63ff', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

function colorForName(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ICON_COLORS[hash % ICON_COLORS.length];
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showTab(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  showScreen('screen-' + tab);
  if (tab === 'vault') renderEntryList();
  if (tab === 'security') renderSecurityTab();
}

/* ---------------- BOOTSTRAP ---------------- */
async function init() {
  vaultRecord = await VaultDB.loadVaultRecord();
  if (!vaultRecord) {
    showScreen('screen-setup');
  } else {
    buildKeypad();
    renderPinDots();
    showScreen('screen-unlock');
  }
  wireEvents();
}

/* ---------------- SETUP (first run) ---------------- */
async function handleSetupSubmit() {
  const p1 = document.getElementById('setup-pass1').value;
  const p2 = document.getElementById('setup-pass2').value;
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '';

  if (p1.length < 8) { errorEl.textContent = 'Password minimal 8 karakter.'; return; }
  if (p1 !== p2) { errorEl.textContent = 'Password tidak cocok.'; return; }

  const saltB64 = VaultCrypto.randomSalt();
  const saltBytes = VaultCrypto.saltFromBase64(saltB64);
  masterKey = await VaultCrypto.deriveKey(p1, saltBytes);

  vaultData = { entries: [] };
  const { iv, ciphertext } = await VaultCrypto.encryptJSON(masterKey, vaultData);
  vaultRecord = { salt: saltB64, iv, ciphertext };
  await VaultDB.saveVaultRecord(vaultRecord);

  showTab('vault');
}

/* ---------------- UNLOCK ---------------- */
function buildKeypad() {
  const keypad = document.getElementById('keypad');
  keypad.innerHTML = '';
  const keys = [
    ['1',''], ['2','ABC'], ['3','DEF'],
    ['4','GHI'], ['5','JKL'], ['6','MNO'],
    ['7','PQRS'], ['8','TUV'], ['9','WXYZ'],
    ['ghost',''], ['0',''], ['back','']
  ];
  keys.forEach(([val, sub]) => {
    const btn = document.createElement('button');
    if (val === 'ghost') {
      btn.className = 'key ghost';
    } else if (val === 'back') {
      btn.className = 'key ghost';
      btn.innerHTML = '⌫';
      btn.onclick = () => { pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); };
    } else {
      btn.className = 'key';
      btn.innerHTML = sub ? `${val}<small>${sub}</small>` : val;
      btn.onclick = () => { pinBuffer += val; renderPinDots(); };
    }
    keypad.appendChild(btn);
  });
}

function renderPinDots() {
  const container = document.getElementById('pin-dots');
  const shown = Math.min(pinBuffer.length, 8);
  container.innerHTML = '';
  for (let i = 0; i < Math.max(shown, 4); i++) {
    const dot = document.createElement('div');
    dot.className = 'pin-dot' + (i < shown ? ' filled' : '');
    container.appendChild(dot);
  }
}

function toggleKeyboardMode() {
  useKeyboardMode = !useKeyboardMode;
  const input = document.getElementById('unlock-input');
  const keypad = document.getElementById('keypad');
  const dots = document.getElementById('pin-dots');
  const toggleLabel = document.getElementById('use-keyboard-toggle');
  if (useKeyboardMode) {
    input.style.position = 'static';
    input.style.opacity = '1';
    input.style.pointerEvents = 'auto';
    input.style.width = '80%';
    input.style.maxWidth = '280px';
    input.style.textAlign = 'center';
    input.style.padding = '13px';
    input.style.background = 'var(--bg-card)';
    input.style.border = '1px solid var(--border)';
    input.style.borderRadius = '12px';
    input.style.color = 'var(--text)';
    input.style.fontSize = '16px';
    input.style.marginBottom = '18px';
    keypad.style.display = 'none';
    dots.style.display = 'none';
    toggleLabel.textContent = 'Pakai keypad';
    input.value = '';
    input.focus();
  } else {
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    keypad.style.display = 'grid';
    dots.style.display = 'flex';
    toggleLabel.textContent = 'Pakai keyboard';
    pinBuffer = '';
    renderPinDots();
  }
}

async function attemptUnlock() {
  const errorEl = document.getElementById('unlock-error');
  errorEl.textContent = '';
  const password = useKeyboardMode ? document.getElementById('unlock-input').value : pinBuffer;

  if (!password) { errorEl.textContent = 'Masukkan password dulu.'; return; }

  try {
    const saltBytes = VaultCrypto.saltFromBase64(vaultRecord.salt);
    const key = await VaultCrypto.deriveKey(password, saltBytes);
    const decrypted = await VaultCrypto.decryptJSON(key, vaultRecord.iv, vaultRecord.ciphertext);
    masterKey = key;
    vaultData = decrypted;
    pinBuffer = '';
    document.getElementById('unlock-input').value = '';
    showTab('vault');
  } catch (e) {
    errorEl.textContent = 'Password salah. Coba lagi.';
    pinBuffer = '';
    renderPinDots();
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(d => d.classList.add('error'));
    setTimeout(() => dots.forEach(d => d.classList.remove('error')), 400);
  }
}

function lockVault() {
  masterKey = null;
  vaultData = null;
  pinBuffer = '';
  useKeyboardMode = false;
  document.getElementById('unlock-error').textContent = '';
  renderPinDots();
  showScreen('screen-unlock');
}

async function resetVaultCompletely() {
  if (!confirm('Ini akan menghapus SEMUA data vault secara permanen. Lanjutkan?')) return;
  await VaultDB.deleteVaultRecord();
  vaultRecord = null;
  vaultData = null;
  masterKey = null;
  showScreen('screen-setup');
}

/* ---------------- PERSIST HELPER ---------------- */
async function persistVault() {
  const saltBytes = VaultCrypto.saltFromBase64(vaultRecord.salt);
  const { iv, ciphertext } = await VaultCrypto.encryptJSON(masterKey, vaultData);
  vaultRecord = { salt: vaultRecord.salt, iv, ciphertext };
  await VaultDB.saveVaultRecord(vaultRecord);
}

/* ---------------- STRENGTH / SCORE ---------------- */
function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 25;
  if (pw.length >= 12) score += 15;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 20;
  if (/[0-9]/.test(pw)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 25;
  return Math.min(score, 100);
}

function overallScore() {
  if (!vaultData || vaultData.entries.length === 0) return 0;
  const scores = vaultData.entries.map(e => passwordStrength(e.password));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const passwords = vaultData.entries.map(e => e.password);
  const duplicates = passwords.length - new Set(passwords).size;
  return Math.max(0, Math.round(avg - duplicates * 10));
}

/* ---------------- RENDER: VAULT LIST ---------------- */
function renderEntryList(filter = '') {
  const list = document.getElementById('entry-list');
  const heading = document.getElementById('list-heading');
  list.innerHTML = '';

  const entries = (vaultData.entries || [])
    .filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  heading.textContent = filter ? `Hasil (${entries.length})` : `Semua Item (${entries.length})`;

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-state">Belum ada item.<br>Tap tombol + untuk menambah password pertama kamu.</div>';
  } else {
    entries.forEach(entry => list.appendChild(renderEntryRow(entry)));
  }

  const score = overallScore();
  document.getElementById('score-value').textContent = `${score}/100`;
  document.getElementById('score-ring').style.setProperty('--pct', score);
}

function renderEntryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry-row';
  row.innerHTML = `
    <div class="entry-icon" style="background:${colorForName(entry.name)}">${entry.name.charAt(0).toUpperCase()}</div>
    <div class="entry-info">
      <div class="entry-title">${escapeHtml(entry.name)}</div>
      <div class="entry-sub">${escapeHtml(entry.username || 'Tanpa username')}</div>
    </div>
    <div class="entry-chevron">›</div>
  `;
  row.onclick = () => openDetail(entry.id);
  return row;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- SECURITY TAB ---------------- */
function renderSecurityTab() {
  const score = overallScore();
  document.getElementById('sec-score-value').textContent = `${score}/100`;
  document.getElementById('sec-score-ring').style.setProperty('--pct', score);

  const list = document.getElementById('weak-list');
  list.innerHTML = '';
  const weak = (vaultData.entries || []).filter(e => passwordStrength(e.password) < 60);
  if (weak.length === 0) {
    list.innerHTML = '<div class="empty-state">Semua password kamu cukup kuat. 🎉</div>';
  } else {
    weak.forEach(entry => list.appendChild(renderEntryRow(entry)));
  }
}

/* ---------------- ENTRY DETAIL ---------------- */
function openDetail(id) {
  currentEntryId = id;
  const entry = vaultData.entries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('detail-icon').style.background = colorForName(entry.name);
  document.getElementById('detail-icon').textContent = entry.name.charAt(0).toUpperCase();
  document.getElementById('detail-title').textContent = entry.name;
  document.getElementById('detail-notes').textContent = entry.notes || 'Tidak ada catatan.';
  document.getElementById('detail-username').textContent = entry.username || '—';
  document.getElementById('detail-password').textContent = '•'.repeat(Math.max(8, (entry.password || '').length));
  document.getElementById('detail-password').dataset.revealed = 'false';
  document.getElementById('detail-modified').textContent = new Date(entry.modifiedAt).toLocaleDateString('id-ID');
  document.getElementById('detail-reveal-btn').textContent = '👁️';

  const strength = passwordStrength(entry.password);
  const badge = document.getElementById('detail-strength-badge');
  badge.textContent = strength >= 80 ? 'Strong' : strength >= 50 ? 'Medium' : 'Weak';
  badge.className = 'badge ' + (strength >= 60 ? 'success' : '');

  showScreen('screen-detail');
}

function toggleReveal() {
  const el = document.getElementById('detail-password');
  const entry = vaultData.entries.find(e => e.id === currentEntryId);
  const revealed = el.dataset.revealed === 'true';
  if (revealed) {
    el.textContent = '•'.repeat(Math.max(8, (entry.password || '').length));
    el.dataset.revealed = 'false';
    document.getElementById('detail-reveal-btn').textContent = '👁️';
  } else {
    el.textContent = entry.password || '';
    el.dataset.revealed = 'true';
    document.getElementById('detail-reveal-btn').textContent = '🙈';
  }
}

function copyField(field) {
  const entry = vaultData.entries.find(e => e.id === currentEntryId);
  const value = field === 'username' ? entry.username : entry.password;
  navigator.clipboard.writeText(value || '').then(() => showToast());
}

function showToast() {
  const toast = document.getElementById('copied-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1200);
}

async function deleteCurrentEntry() {
  if (!confirm('Hapus entry ini secara permanen?')) return;
  vaultData.entries = vaultData.entries.filter(e => e.id !== currentEntryId);
  await persistVault();
  showTab('vault');
}

/* ---------------- ADD / EDIT ENTRY ---------------- */
function openEditScreen(id = null) {
  editingEntryId = id;
  const title = document.getElementById('edit-title');
  if (id) {
    const entry = vaultData.entries.find(e => e.id === id);
    title.textContent = 'Edit Entry';
    document.getElementById('edit-name').value = entry.name;
    document.getElementById('edit-username').value = entry.username || '';
    document.getElementById('edit-password').value = entry.password || '';
    document.getElementById('edit-url').value = entry.url || '';
    document.getElementById('edit-notes').value = entry.notes || '';
  } else {
    title.textContent = 'Entry Baru';
    ['edit-name', 'edit-username', 'edit-password', 'edit-url', 'edit-notes'].forEach(id => document.getElementById(id).value = '');
  }
  showScreen('screen-edit');
}

async function saveEditScreen() {
  const name = document.getElementById('edit-name').value.trim();
  if (!name) { alert('Nama tidak boleh kosong.'); return; }

  const now = Date.now();
  if (editingEntryId) {
    const entry = vaultData.entries.find(e => e.id === editingEntryId);
    entry.name = name;
    entry.username = document.getElementById('edit-username').value.trim();
    entry.password = document.getElementById('edit-password').value;
    entry.url = document.getElementById('edit-url').value.trim();
    entry.notes = document.getElementById('edit-notes').value.trim();
    entry.modifiedAt = now;
  } else {
    vaultData.entries.push({
      id: 'e_' + now + '_' + Math.random().toString(36).slice(2, 8),
      name,
      username: document.getElementById('edit-username').value.trim(),
      password: document.getElementById('edit-password').value,
      url: document.getElementById('edit-url').value.trim(),
      notes: document.getElementById('edit-notes').value.trim(),
      createdAt: now,
      modifiedAt: now
    });
  }
  await persistVault();
  showTab('vault');
}

/* ---------------- GENERATOR ---------------- */
const genOptions = { upper: true, lower: true, numbers: true, symbols: true };

function generatePassword(length) {
  const sets = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnpqrstuvwxyz',
    numbers: '23456789',
    symbols: '!@#$%^&*-_=+?'
  };
  let pool = '';
  Object.keys(genOptions).forEach(k => { if (genOptions[k]) pool += sets[k]; });
  if (!pool) pool = sets.lower;

  const randomValues = crypto.getRandomValues(new Uint32Array(length));
  let result = '';
  for (let i = 0; i < length; i++) result += pool[randomValues[i] % pool.length];
  return result;
}

function refreshGeneratorOutput() {
  const length = parseInt(document.getElementById('gen-length').value, 10);
  document.getElementById('gen-length-label').textContent = length;
  document.getElementById('gen-output').textContent = generatePassword(length);
}

/* ---------------- EXPORT / IMPORT ---------------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(vaultRecord)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const record = JSON.parse(reader.result);
      if (!record.salt || !record.iv || !record.ciphertext) throw new Error('invalid file');
      if (!confirm('Import backup ini akan menggantikan vault yang sekarang. Lanjutkan?')) return;
      await VaultDB.saveVaultRecord(record);
      vaultRecord = record;
      lockVault();
      alert('Backup berhasil diimport. Silakan unlock dengan password dari backup tersebut.');
    } catch (e) {
      alert('File backup tidak valid.');
    }
  };
  reader.readAsText(file);
}

/* ---------------- CHANGE MASTER PASSWORD ---------------- */
async function changeMasterPassword() {
  const current = prompt('Masukkan password utama saat ini:');
  if (current === null) return;
  const saltBytes = VaultCrypto.saltFromBase64(vaultRecord.salt);
  let checkKey;
  try {
    checkKey = await VaultCrypto.deriveKey(current, saltBytes);
    await VaultCrypto.decryptJSON(checkKey, vaultRecord.iv, vaultRecord.ciphertext);
  } catch (e) {
    alert('Password saat ini salah.');
    return;
  }
  const next = prompt('Masukkan password utama baru (min. 8 karakter):');
  if (!next || next.length < 8) { alert('Dibatalkan / password terlalu pendek.'); return; }

  const newSaltB64 = VaultCrypto.randomSalt();
  const newSaltBytes = VaultCrypto.saltFromBase64(newSaltB64);
  masterKey = await VaultCrypto.deriveKey(next, newSaltBytes);
  const { iv, ciphertext } = await VaultCrypto.encryptJSON(masterKey, vaultData);
  vaultRecord = { salt: newSaltB64, iv, ciphertext };
  await VaultDB.saveVaultRecord(vaultRecord);
  alert('Password utama berhasil diganti.');
}

/* ---------------- EVENT WIRING ---------------- */
function wireEvents() {
  document.getElementById('setup-submit').onclick = handleSetupSubmit;

  document.getElementById('use-keyboard-toggle').onclick = toggleKeyboardMode;
  document.getElementById('unlock-submit-btn').onclick = attemptUnlock;
  document.getElementById('unlock-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptUnlock();
  });
  document.getElementById('reset-vault-link').onclick = resetVaultCompletely;
  document.getElementById('lock-now-btn').onclick = lockVault;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => showTab(btn.dataset.tab);
  });

  document.getElementById('search-input').addEventListener('input', (e) => renderEntryList(e.target.value));
  document.getElementById('add-entry-btn').onclick = () => openEditScreen(null);

  document.getElementById('detail-back-btn').onclick = () => showTab('vault');
  document.getElementById('detail-edit-btn').onclick = () => openEditScreen(currentEntryId);
  document.getElementById('detail-reveal-btn').onclick = toggleReveal;
  document.getElementById('detail-delete-btn').onclick = deleteCurrentEntry;
  document.getElementById('detail-open-btn').onclick = () => {
    const entry = vaultData.entries.find(e => e.id === currentEntryId);
    if (entry.url) window.open(entry.url.startsWith('http') ? entry.url : 'https://' + entry.url, '_blank');
  };
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => copyField(btn.dataset.copy);
  });

  document.getElementById('edit-cancel-btn').onclick = () => {
    showScreen(currentEntryId && editingEntryId ? 'screen-detail' : 'screen-vault');
    if (!editingEntryId) showTab('vault');
  };
  document.getElementById('edit-save-btn').onclick = saveEditScreen;
  document.getElementById('edit-gen-btn').onclick = () => {
    document.getElementById('edit-password').value = generatePassword(16);
  };

  document.getElementById('gen-length').addEventListener('input', refreshGeneratorOutput);
  document.getElementById('gen-regenerate-btn').onclick = refreshGeneratorOutput;
  document.getElementById('gen-copy-btn').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('gen-output').textContent).then(showToast);
  };
  document.querySelectorAll('.toggle').forEach(t => {
    t.onclick = () => {
      const opt = t.dataset.opt;
      genOptions[opt] = !genOptions[opt];
      t.classList.toggle('on', genOptions[opt]);
      refreshGeneratorOutput();
    };
  });

  document.getElementById('change-pass-item').onclick = changeMasterPassword;
  document.getElementById('export-item').onclick = exportBackup;
  document.getElementById('import-item').onclick = () => document.getElementById('import-file-input').click();
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
  document.getElementById('reset-all-btn').onclick = resetVaultCompletely;

  refreshGeneratorOutput();
}

init();
