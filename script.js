// Configuration & State
let targetConfig = {
    salesBulanan: 0,
    gmPct: 0,
    totalHari: 0
};

let currentFilter = 'hari';
let salesChart;
let dbRef = null;
let rawData = [];

let tahun = new Date().getFullYear();
let bulan = String(new Date().getMonth() + 1).padStart(2, '0');

function formatRupiah(num) {
    return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

//Change Mont and Years
const monthPicker = document.getElementById('monthPicker');
monthPicker.value = `${tahun}-${bulan}`;

monthPicker.addEventListener('change', function(e) {
    const bulanPilihan = e.target.value;
    const [newtahun, newbulan] = bulanPilihan.split("-");
    tahun = newtahun;
    bulan = newbulan;
    setupRealtimeListeners(); 
});

//Function Login
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    setupRealtimeListeners();
  } else {
    window.location.replace("Login.html"); 
  }
});
// 3. Fungsi Logout
function logoutUser() {
  if (confirm("Apakah kamu yakin ingin keluar dari aplikasi?")) {
    firebase.auth().signOut().then(() => {
      alert("Berhasil keluar.");
    });
  }
};
// Set Up Realtime Listener
function setupRealtimeListeners() {
    try {
        if (!dbRef) {
            dbRef = firebase.database().ref('taman_griya_store');
        }

        dbRef.child(`salesData/${tahun}/${bulan}`).off();
        dbRef.child(`targetConfig/${tahun}/${bulan}`).off();

        // Realtime listener for Sales Data
        dbRef.child(`salesData/${tahun}/${bulan}`).on('value', (snapshot) => {
            let val = snapshot.val();
            if (val) {
                rawData = Object.values(val).filter(Boolean);
                rawData.sort((a, b) => a.tgl - b.tgl);
            } else {
                rawData = [];
            }
            recalculateAndRender();
        });

        // Realtime listener for Target Config
        dbRef.child(`targetConfig/${tahun}/${bulan}`).on('value', (snapshot) => {
            let val = snapshot.val();
            if (val) {
                targetConfig = val;
            }
            recalculateAndRender();
        });

        // Update indikator sync
        const syncBadge = document.getElementById('sync-status');
        if (syncBadge) syncBadge.style.background = '#22c55e';
        
    } catch (error) {
        console.error("Firebase Sync Error:", error);
        const syncBadge = document.getElementById('sync-status');
        if (syncBadge) syncBadge.style.background = '#dc2626';
    }
}

// Modal Operations
function openTargetModal() {
    document.getElementById('target-sales-input').value = targetConfig.salesBulanan;
    document.getElementById('target-gm-input').value = targetConfig.gmPct;
    document.getElementById('total-days-input').value = targetConfig.totalHari;
    document.getElementById('targetModal').style.display = 'flex';
}

function closeTargetModal() {
    document.getElementById('targetModal').style.display = 'none';
}

function saveTargetSettings() {
    targetConfig.salesBulanan = parseFloat(document.getElementById('target-sales-input').value) || 0;
    targetConfig.gmPct = parseFloat(document.getElementById('target-gm-input').value) || 0;
    targetConfig.totalHari = parseInt(document.getElementById('total-days-input').value) || 31;

    closeTargetModal();
    if (dbRef) {
        dbRef.child(`targetConfig/${tahun}/${bulan}`).set(targetConfig);
    }
    recalculateAndRender();
}

// Calculation Engine
function recalculateAndRender() {
    let targetDaily = targetConfig.salesBulanan / targetConfig.totalHari;
    let targetGmRp = targetConfig.salesBulanan * (targetConfig.gmPct / 100);

    let totalSalesMTD = 0;
    let totalGmRpMTD = 0;

    rawData.forEach(item => {
        totalSalesMTD += item.sales;
        totalGmRpMTD += item.sales * (item.gmPct / 100);
    });

    const numDaysRecorded = rawData.length;
    const avgSalesDaily = numDaysRecorded > 0 ? totalSalesMTD / numDaysRecorded: 0;
    const actualGmPct = totalSalesMTD > 0 ? (totalGmRpMTD / totalSalesMTD) * 100: 0;

    const remainingDays = Math.max(0,
        targetConfig.totalHari - numDaysRecorded);
    const gapSales = targetConfig.salesBulanan - totalSalesMTD;
    const gapGmRp = targetGmRp - totalGmRpMTD;

    const spdSales = remainingDays > 0 ? Math.max(0,
        gapSales / remainingDays): 0;
    const spdGm = (remainingDays > 0 && targetConfig.gmPct > 0) ? Math.max(0,
        (gapGmRp / (targetConfig.gmPct / 100)) / remainingDays): 0;

    // UI Updates Header
    document.getElementById('disp-header-target-sales').innerText = formatRupiah(targetConfig.salesBulanan);
    document.getElementById('disp-header-target-gm').innerText = targetConfig.gmPct.toFixed(2) + '%';

    // UI Updates Cards
    document.getElementById('disp-sales-mtd').innerText = formatRupiah(totalSalesMTD);
    document.getElementById('disp-sales-acv').innerText = `Acv: ${((totalSalesMTD / targetConfig.salesBulanan) * 100).toFixed(2)}%`;

    document.getElementById('disp-gm-pct').innerText = actualGmPct.toFixed(2) + '%';
    const gapGmValue = actualGmPct - targetConfig.gmPct;
    document.getElementById('disp-gm-gap-pct').innerText = `Gap: ${gapGmValue >= 0 ? '+': ''}${gapGmValue.toFixed(2)}%`;
    document.getElementById('disp-gm-gap-pct').style.color = gapGmValue >= 0 ? 'var(--secondary)': 'var(--danger)';

    document.getElementById('disp-avg-sales').innerText = formatRupiah(avgSalesDaily);
    document.getElementById('disp-target-daily').innerText = `Target: ${formatRupiah(targetDaily)}`;

    document.getElementById('disp-gm-rp').innerText = formatRupiah(totalGmRpMTD);
    document.getElementById('disp-target-gm-rp').innerText = `Target: ${formatRupiah(targetGmRp)}`;

    // UI Focus Alert
    if(actualGmPct < targetConfig.gmPct){
        document.getElementById('fokus').innerText = 'EVAKUASI GAP GM!';
    }else if(avgSalesDaily < targetDaily){
        document.getElementById('fokus').innerText = 'EVAKUASI SPD!';
    }else{
        document.getElementById('fokus').innerText = 'EVAKUASI!';
    };
    document.getElementById('disp-remaining-days').innerText = `${remainingDays} Hari`;
    document.getElementById('disp-spd-sales').innerText = `${formatRupiah(spdSales)} /hr`;
    document.getElementById('disp-spd-gm').innerText = `${formatRupiah(spdGm)} /hr`;

    // Update Chart & History Table
    updateChart(targetDaily);
    renderHistory();
}

// Navigation & Tabs
function switchTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    document.getElementById('tab-' + tabName).classList.add('active');
    el.classList.add('active');
}

function setFilter(opt, el) {
    document.querySelectorAll('.filter-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    currentFilter = opt;
    renderHistory();
}

// Render History
function renderHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '';

    if (currentFilter === 'hari') {
        document.getElementById('history-title').innerText = 'Rekap Penjualan Harian';
        [...rawData].reverse().forEach(item => {
            const gmRp = item.sales * (item.gmPct / 100);
            const div = document.createElement('div');
            div.className = 'history-card';
            div.innerHTML = `
            <div class="history-info">
            <div class="history-date">Tanggal ${item.tgl}</div>
            <div class="history-sub">GM: ${item.gmPct.toFixed(2)}% (${formatRupiah(gmRp)})</div>
            </div>
            <div class="history-right">
            <div>
            <div class="history-val">${formatRupiah(item.sales)}</div>
            </div>
            <button class="action-icon" onclick="editData('${item.tgl}')">✏️</button>
            <button class="action-icon" onclick="deleteData('${item.tgl}')">🗑️</button>
            </div>
            `;
            container.appendChild(div);
        });
    } else if (currentFilter === 'minggu') {
        document.getElementById('history-title').innerText = 'Rekap Penjualan Mingguan';
        let weeks = [[],
            [],
            [],
            []];
        rawData.forEach(item => {
            let wIdx = Math.min(3, Math.floor((item.tgl - 1) / 8));
            weeks[wIdx].push(item);
        });

        weeks.forEach((wData, i) => {
            if (wData.length === 0) return;
            let wSales = wData.reduce((acc, c) => acc + c.sales, 0);
            let wGmRp = wData.reduce((acc, c) => acc + (c.sales * (c.gmPct / 100)), 0);
            let wGmPct = wSales > 0 ? (wGmRp / wSales) * 100: 0;

            const div = document.createElement('div');
            div.className = 'history-card';
            div.innerHTML = `
            <div class="history-info">
            <div class="history-date">Minggu Ke-${i+1} (${wData.length} Hari)</div>
            <div class="history-sub">Avg GM: ${wGmPct.toFixed(2)}% (${formatRupiah(wGmRp)})</div>
            </div>
            <div class="history-right">
            <div class="history-val">${formatRupiah(wSales)}</div>
            </div>
            `;
            container.appendChild(div);
        });
    } else if (currentFilter === 'bulan') {
        document.getElementById('history-title').innerText = 'Rekap Penjualan Bulanan';
        
        // Tampilkan indikator loading sederhana
        container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px; font-size:0.9rem;">Memuat data seluruh bulan...</div>';

        // Tarik seluruh folder bulan dari parent node 'salesData' di Firebase
        dbRef.child('salesData').once('value', snapshot => {
            container.innerHTML = ''; // Bersihkan loading
            const allMonths = snapshot.val();

            if (!allMonths) {
                container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px; font-size:0.9rem;">Belum ada riwayat penjualan.</div>';
                return;
            }

            // Ambil semua key bulan (contoh: ["2026-05", "2026-06", "2026-07"]) lalu urutkan dari yang terbaru
            const monthKeys = Object.keys(allMonths).sort().reverse();

            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                
                // Antisipasi jika data berupa Array (karena index tanggal) atau Object
                const days = Array.isArray(monthData) ? monthData.filter(Boolean) : Object.values(monthData);

                // Kalkulasi Total Sales & GM per Bulan
                let mSales = days.reduce((acc, c) => acc + (c.sales || 0), 0);
                let mGmRp = days.reduce((acc, c) => acc + ((c.sales || 0) * ((c.gmPct || 0) / 100)), 0);
                let mGmPct = mSales > 0 ? (mGmRp / mSales) * 100 : 0;

                // Konversi format YYYY-MM (misal "2026-07") menjadi "Juli 2026"
                const [thn, bln] = monthKey.split('-');
                const namaBulan = new Date(thn, bln - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' });

                // Render Kartu Riwayat Per Bulan
                const div = document.createElement('div');
                div.className = 'history-card';
                div.innerHTML = `
                    <div class="history-info">
                        <div class="history-date">${namaBulan}</div>
                        <div class="history-sub">Rata-rata GM: ${mGmPct.toFixed(2)}% (${formatRupiah(mGmRp)})</div>
                    </div>
                    <div class="history-right">
                        <div class="history-val">${formatRupiah(mSales)}</div>
                    </div>
                `;
                container.appendChild(div);
            });
        });
    }

}

// CRUD Functions
function editData(tgl) {
    const item = rawData.find(d => d.tgl === tgl);
    if (!item) return;
    document.getElementById('input-tgl').value = `${tahun}-${bulan}-${item.tgl}`;
    document.getElementById('input-sales').value = item.sales;
    document.getElementById('input-gm').value = item.gmPct;

    document.getElementById('edit-mode').value = "true";
    document.getElementById('input-tgl').readOnly = true;
    document.getElementById('form-title').innerText = `Edit Data Sales - Tanggal ${tgl}`;
    document.getElementById('btn-save').innerText = 'Update ke Cloud';
    document.getElementById('btn-cancel-edit').style.display = 'block';

    switchTab('input', document.querySelectorAll('.nav-item')[1]);
}

function deleteData(tgl) {
    if (confirm(`Yakin ingin menghapus data penjualan tanggal ${tgl}?`)) {
        if (dbRef) {
            dbRef.child(`salesData/${tahun}/${bulan}`).child(tgl).remove();
        } else {
            rawData = rawData.filter(d => d.tgl !== tgl);
            recalculateAndRender();
        }
    }
}

window.editData = editData;
window.deleteData = deleteData;

function resetForm() {
    document.getElementById('salesForm').reset();
    document.getElementById('edit-mode').value = "false";
    document.getElementById('input-tgl').readOnly = false;
    document.getElementById('form-title').innerText = 'Input Realisasi Sales Harian';
    document.getElementById('btn-save').innerText = 'Simpan ke Cloud';
    document.getElementById('btn-cancel-edit').style.display = 'none';
}


document.getElementById('salesForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const date = (document.getElementById('input-tgl').value);
    const [thn, bln, tgl] = date.split("-");
    const sales = parseFloat(document.getElementById('input-sales').value);
    const gmPct = parseFloat(document.getElementById('input-gm').value);

    if (dbRef) {
        dbRef.child(`salesData/${thn}/${bln}`).child(tgl).set({
            tgl, sales, gmPct
        });
    } else {
        const existingIdx = rawData.findIndex(d => d.tgl === tgl);
        if (existingIdx >= 0) {
            rawData[existingIdx] = {
                tgl,
                sales,
                gmPct
            };
        } else {
            rawData.push({
                tgl, sales, gmPct
            });
            rawData.sort((a, b) => a.tgl - b.tgl);
        }
        recalculateAndRender();
    }

    resetForm();
    switchTab('dashboard', document.querySelectorAll('.nav-item')[0]);
});

// Chart Update
function updateChart(targetDaily) {
    const labels = rawData.map(d => 'Tgl ' + d.tgl);
    const salesValues = rawData.map(d => d.sales);
    const targetLine = Array(rawData.length).fill(targetDaily);

    if (!salesChart) {
        const ctx = document.getElementById('salesChart').getContext('2d');
        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
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
                    }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top', labels: {
                            boxWidth: 10, font: {
                                size: 9
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: {
                                size: 8
                            }
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                size: 8
                            },
                            callback: val => (val / 1000000).toFixed(0) + 'M'
                        }
                    }
                }
            }
        });
    } else {
        salesChart.data.labels = labels;
        salesChart.data.datasets[0].data = salesValues;
        salesChart.data.datasets[1].data = targetLine;
        salesChart.update();
    }
}

// Initialization
window.onload = function() {
    setupRealtimeListeners();
};
