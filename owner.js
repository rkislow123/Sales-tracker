// =========================================================
// OWNER DASHBOARD — script.js
// =========================================================

// PENTING: sesuaikan domain ini dengan domain email yang dipakai
// akun-akun toko kamu di Firebase Auth (mis. Q271@toko.com).
// Kode toko baru akan dibuatkan email dengan pola: {KODE}@EMAIL_DOMAIN
const EMAIL_DOMAIN = 'sat.co.id';

let tahun = new Date().getFullYear();
let bulan = String(new Date().getMonth() + 1).padStart(2, '0');

let storesState = {};       // { KODE: { profile, salesData:[], targetConfig } }
let activeListeners = [];   // untuk .off() saat ganti bulan
let secondaryApp = null;    // firebase app kedua, dipakai khusus createUser
let detailChart = null;
let detailKodeAktif = null;

function formatRupiah(num) {
    return 'Rp ' + Math.round(num || 0).toLocaleString('id-ID');
}

// ---------------------------------------------------------
// AUTH GUARD — hanya email dengan prefix "owner" yang boleh masuk
// ---------------------------------------------------------
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        const prefix = user.email.split('@')[0].toLowerCase();
        if (prefix !== 'owner') {
            alert('Akses ditolak. Halaman ini khusus untuk akun Owner.');
            firebase.auth().signOut();
            window.location.replace('Login.html');
            return;
        }
        document.getElementById('sync-status').style.background = '#22c55e';
        initMonthPicker();
        subscribeAllStores();
    } else {
        window.location.replace('Login.html');
    }
});

function logoutUser() {
    if (confirm('Apakah kamu yakin ingin keluar dari aplikasi?')) {
        firebase.auth().signOut();
    }
}

// ---------------------------------------------------------
// MONTH PICKER
// ---------------------------------------------------------
function initMonthPicker() {
    const picker = document.getElementById('monthPicker');
    picker.value = `${tahun}-${bulan}`;
    picker.addEventListener('change', (e) => {
        [tahun, bulan] = e.target.value.split('-');
        subscribeAllStores();
    });
}

// ---------------------------------------------------------
// REALTIME SUBSCRIPTIONS — semua toko, untuk bulan/tahun aktif
// ---------------------------------------------------------
function subscribeAllStores() {
    activeListeners.forEach(({ ref, event }) => ref.off(event));
    activeListeners = [];
    storesState = {};
    renderLoading();

    const storesRootRef = firebase.database().ref('stores');
    storesRootRef.once('value').then((snapshot) => {
        const data = snapshot.val() || {};
        const kodeList = Object.keys(data);

        if (kodeList.length === 0) {
            storesState = {};
            renderAll();
            return;
        }
        kodeList.forEach((kode) => subscribeStore(kode));
    }).catch((err) => {
        console.error('Gagal mengambil daftar toko:', err);
        document.getElementById('sync-status').style.background = '#dc2626';
    });
}

function subscribeStore(kode) {
    if (!storesState[kode]) {
        storesState[kode] = {
            profile: {},
            salesData: [],
            targetConfig: { salesBulanan: 0, gmPct: 0, totalHari: 0 }
        };
    }

    const profileRef = firebase.database().ref(`stores/${kode}/profile`);
    const salesRef = firebase.database().ref(`stores/${kode}/salesData/${tahun}/${bulan}`);
    const targetRef = firebase.database().ref(`stores/${kode}/targetConfig/${tahun}/${bulan}`);

    profileRef.on('value', (snap) => {
        storesState[kode].profile = snap.val() || {};
        renderAll();
    });
    salesRef.on('value', (snap) => {
        const val = snap.val();
        storesState[kode].salesData = val ? Object.values(val).filter(Boolean) : [];
        storesState[kode].salesData.sort((a, b) => a.tgl - b.tgl);
        renderAll();
    });
    targetRef.on('value', (snap) => {
        storesState[kode].targetConfig = snap.val() || { salesBulanan: 0, gmPct: 0, totalHari: 0 };
        renderAll();
    });

    activeListeners.push({ ref: profileRef, event: 'value' });
    activeListeners.push({ ref: salesRef, event: 'value' });
    activeListeners.push({ ref: targetRef, event: 'value' });
}

// ---------------------------------------------------------
// PERHITUNGAN METRIK (dipakai untuk per-toko & agregat)
// ---------------------------------------------------------
function computeMetrics(salesData, targetConfig) {
    const tc = targetConfig || { salesBulanan: 0, gmPct: 0, totalHari: 0 };
    const targetDaily = tc.totalHari > 0 ? tc.salesBulanan / tc.totalHari : 0;
    const targetGmRp = tc.salesBulanan * ((tc.gmPct || 0) / 100);

    let totalSales = 0;
    let totalGmRp = 0;
    (salesData || []).forEach((item) => {
        totalSales += item.sales || 0;
        totalGmRp += (item.sales || 0) * ((item.gmPct || 0) / 100);
    });

    const numDays = (salesData || []).length;
    const avgSalesDaily = numDays > 0 ? totalSales / numDays : 0;
    const actualGmPct = totalSales > 0 ? (totalGmRp / totalSales) * 100 : 0;
    const achievementPct = tc.salesBulanan > 0 ? (totalSales / tc.salesBulanan) * 100 : 0;

    const remainingDays = Math.max(0, (tc.totalHari || 0) - numDays);
    const gapSales = tc.salesBulanan - totalSales;
    const gapGmRp = targetGmRp - totalGmRp;

    const spdSales = remainingDays > 0 ? Math.max(0, gapSales / remainingDays) : 0;
    const spdGm = (remainingDays > 0 && tc.gmPct > 0)
        ? Math.max(0, (gapGmRp / (tc.gmPct / 100)) / remainingDays)
        : 0;

    return {
        targetDaily, targetGmRp, totalSales, totalGmRp, numDays,
        avgSalesDaily, actualGmPct, achievementPct,
        remainingDays, gapSales, gapGmRp, spdSales, spdGm,
        targetSales: tc.salesBulanan, targetGmPct: tc.gmPct, totalHari: tc.totalHari
    };
}

function achvClass(pct) {
    if (pct >= 95) return 'good';
    if (pct >= 75) return 'warn';
    return 'bad';
}

// ---------------------------------------------------------
// RENDER — Ringkasan Semua Toko
// ---------------------------------------------------------
function renderLoading() {
    document.getElementById('store-grid').innerHTML = '<div class="owner-loading">Memuat data toko...</div>';
}

function renderAll() {
    const kodeList = Object.keys(storesState);

    let sumSales = 0, sumTarget = 0, sumGmRp = 0, sumTargetGmRp = 0;

    kodeList.forEach((kode) => {
        const s = storesState[kode];
        const m = computeMetrics(s.salesData, s.targetConfig);
        sumSales += m.totalSales;
        sumTarget += m.targetSales;
        sumGmRp += m.totalGmRp;
        sumTargetGmRp += m.targetGmRp;
    });

    const overallAchv = sumTarget > 0 ? (sumSales / sumTarget) * 100 : 0;
    const overallGmPct = sumSales > 0 ? (sumGmRp / sumSales) * 100 : 0;
    const overallTargetGmPct = sumTarget > 0 ? (sumTargetGmRp / sumTarget) * 100 : 0;

    document.getElementById('disp-total-sales').innerText = formatRupiah(sumSales);
    document.getElementById('disp-total-sales-2').innerText = formatRupiah(sumSales);
    document.getElementById('disp-total-target').innerText = `Target: ${formatRupiah(sumTarget)}`;
    document.getElementById('disp-total-achv').innerText = overallAchv.toFixed(1) + '%';
    document.getElementById('disp-total-toko').innerText = kodeList.length;
    document.getElementById('disp-total-toko-2').innerText = kodeList.length;
    document.getElementById('disp-total-gm').innerText = overallGmPct.toFixed(2) + '%';
    document.getElementById('disp-total-gm-sub').innerText = `Target GM: ${overallTargetGmPct.toFixed(2)}%`;

    renderStoreGrid(kodeList);

    // Jika modal detail sedang terbuka, refresh datanya juga (realtime)
    if (detailKodeAktif && storesState[detailKodeAktif]) {
        renderDetailContent(detailKodeAktif);
    }
}

function renderStoreGrid(kodeList) {
    const grid = document.getElementById('store-grid');

    if (kodeList.length === 0) {
        grid.innerHTML = '<div class="store-empty-state">Belum ada toko. Klik "+ Tambah Toko" untuk memulai.</div>';
        return;
    }

    grid.innerHTML = '';
    kodeList
        .sort((a, b) => (storesState[a].profile.storeName || a).localeCompare(storesState[b].profile.storeName || b))
        .forEach((kode) => {
            const s = storesState[kode];
            const m = computeMetrics(s.salesData, s.targetConfig);
            const badgeClass = achvClass(m.achievementPct);
            const pctWidth = Math.min(100, Math.max(0, m.achievementPct));

            const div = document.createElement('div');
            div.className = 'store-card';
            div.innerHTML = `
                <div class="store-card-top">
                    <div>
                        <div class="store-card-name">${s.profile.storeName || '(Tanpa Nama)'}</div>
                        <div class="store-card-code">${kode}</div>
                    </div>
                    <span class="store-achv-badge ${badgeClass}">${m.achievementPct.toFixed(1)}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill ${badgeClass}" style="width:${pctWidth}%;"></div>
                </div>
                <div class="store-card-metric-row">
                    <span>Sales MTD</span>
                    <span>${formatRupiah(m.totalSales)}</span>
                </div>
                <div class="store-card-metric-row">
                    <span>Target</span>
                    <span>${formatRupiah(m.targetSales)}</span>
                </div>
                <div class="store-card-metric-row">
                    <span>GM Actual / Target</span>
                    <span>${m.actualGmPct.toFixed(2)}% / ${(m.targetGmPct || 0).toFixed(2)}%</span>
                </div>
                <button class="btn-detail-store" onclick="openDetailModal('${kode}')">Lihat Detail</button>
            `;
            grid.appendChild(div);
        });
}

// ---------------------------------------------------------
// MODAL DETAIL TOKO
// ---------------------------------------------------------
function openDetailModal(kode) {
    detailKodeAktif = kode;
    renderDetailContent(kode);
    document.getElementById('detailModal').style.display = 'flex';
}

function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
    detailKodeAktif = null;
}

function renderDetailContent(kode) {
    const s = storesState[kode];
    if (!s) return;
    const m = computeMetrics(s.salesData, s.targetConfig);

    document.getElementById('detail-store-name').innerText = s.profile.storeName || '(Tanpa Nama)';
    document.getElementById('detail-store-code').innerText = `${kode} • ${namaBulanTahun()}`;

    document.getElementById('detail-sales-mtd').innerText = formatRupiah(m.totalSales);
    document.getElementById('detail-sales-target').innerText = `Target: ${formatRupiah(m.targetSales)}`;
    document.getElementById('detail-achv').innerText = m.achievementPct.toFixed(1) + '%';

    document.getElementById('detail-gm-pct').innerText = m.actualGmPct.toFixed(2) + '%';
    const gapGm = m.actualGmPct - (m.targetGmPct || 0);
    document.getElementById('detail-gm-gap').innerText = `Target: ${(m.targetGmPct || 0).toFixed(2)}% (Gap ${gapGm >= 0 ? '+' : ''}${gapGm.toFixed(2)}%)`;

    document.getElementById('detail-avg-sales').innerText = formatRupiah(m.avgSalesDaily);
    document.getElementById('detail-target-daily').innerText = `Target/hari: ${formatRupiah(m.targetDaily)}`;

    document.getElementById('detail-remaining-days').innerText = `${m.remainingDays} Hari`;
    document.getElementById('detail-spd-sales').innerText = `${formatRupiah(m.spdSales)} /hr`;
    document.getElementById('detail-spd-gm').innerText = `${formatRupiah(m.spdGm)} /hr`;

    updateDetailChart(s.salesData, m.targetDaily);
}

function namaBulanTahun() {
    return new Date(tahun, bulan - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
}

function updateDetailChart(salesData, targetDaily) {
    const labels = (salesData || []).map((d) => 'Tgl ' + d.tgl);
    const salesValues = (salesData || []).map((d) => d.sales);
    const targetLine = Array(salesData.length).fill(targetDaily);

    if (detailChart) {
        detailChart.destroy();
        detailChart = null;
    }
    const ctx = document.getElementById('detailChart').getContext('2d');
    detailChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sales Realisasi',
                    data: salesValues,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: 'Target / Hari',
                    data: targetLine,
                    borderColor: '#dc2626',
                    borderDash: [5, 5],
                    borderWidth: 1.5,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
                x: { ticks: { font: { size: 8 } } },
                y: { ticks: { font: { size: 8 }, callback: (val) => (val / 1000000).toFixed(0) + 'M' } }
            }
        }
    });
}

// ---------------------------------------------------------
// TAMBAH TOKO BARU — Firebase Auth + Realtime Database
// Pakai secondary app instance supaya sesi owner tidak ke-logout
// ---------------------------------------------------------
function getSecondaryAuth() {
    if (!secondaryApp) {
        secondaryApp = firebase.initializeApp(firebase.app().options, 'Secondary');
    }
    return secondaryApp.auth();
}

function openAddStoreModal() {
    document.getElementById('addStoreForm').reset();
    document.getElementById('addStoreModal').style.display = 'flex';
}

function closeAddStoreModal() {
    document.getElementById('addStoreModal').style.display = 'none';
}

async function tambahTokoBaru(e) {
    e.preventDefault();
    const kode = document.getElementById('new-kode').value.trim().toUpperCase();
    const nama = document.getElementById('new-nama').value.trim();
    const password = document.getElementById('new-password').value;
    const targetSales = parseFloat(document.getElementById('new-target-sales').value) || 0;
    const targetGm = parseFloat(document.getElementById('new-target-gm').value) || 0;
    const totalHari = parseInt(document.getElementById('new-total-hari').value) || 31;

    if (!kode || !nama || !password) {
        alert('Kode toko, nama toko, dan password wajib diisi.');
        return;
    }
    if (password.length < 6) {
        alert('Password minimal 6 karakter (syarat Firebase Auth).');
        return;
    }
    if (storesState[kode]) {
        alert(`Kode toko ${kode} sudah terdaftar.`);
        return;
    }

    const email = `${kode.toLowerCase()}@${EMAIL_DOMAIN}`;
    const submitBtn = document.getElementById('btn-submit-add-store');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Menyimpan...';

    try {
        const secondaryAuth = getSecondaryAuth();
        await secondaryAuth.createUserWithEmailAndPassword(email, password);
        await secondaryAuth.signOut();

        const now = new Date();
        const thnIni = String(now.getFullYear());
        const blnIni = String(now.getMonth() + 1).padStart(2, '0');

        await firebase.database().ref(`stores/${kode}`).set({
            profile: { storeName: nama },
            targetConfig: {
                [thnIni]: {
                    [blnIni]: {
                        salesBulanan: targetSales,
                        gmPct: targetGm,
                        totalHari: totalHari
                    }
                }
            }
        });

        alert(`Toko "${nama}" (${kode}) berhasil ditambahkan.\nLogin email: ${email}`);
        closeAddStoreModal();
        subscribeAllStores();
    } catch (err) {
        console.error(err);
        let msg = err.message || 'Terjadi kesalahan.';
        if (err.code === 'auth/email-already-in-use') msg = 'Kode toko ini sudah punya akun login.';
        if (err.code === 'auth/weak-password') msg = 'Password terlalu lemah (minimal 6 karakter).';
        alert('Gagal menambah toko: ' + msg);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Simpan Toko Baru';
    }
}

// ---------------------------------------------------------
// TEMA (samakan perilaku dengan app toko)
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    document.getElementById('addStoreForm').addEventListener('submit', tambahTokoBaru);
});

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}
