// Inisialisasi Firebase Safe Fallback (Gunakan dbRef sesuai config firebase kamu)
const dbRef = typeof firebase !== 'undefined' && firebase.database ? firebase.database().ref() : null;

// Dummy Chart Multi-Toko Utama
const ctx = document.getElementById('multiStoreChart').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['Tgl 1', 'Tgl 2', 'Tgl 3', 'Tgl 4', 'Tgl 5', 'Tgl 6', 'Tgl 7'],
    datasets: [
      {
        label: 'Taman Griya',
        data: [12, 19, 15, 17, 22, 24, 20],
        borderColor: '#2563eb',
        tension: 0.3
      },
      {
        label: 'Kuta Branch',
        data: [10, 15, 12, 14, 18, 19, 17],
        borderColor: '#10b981',
        tension: 0.3
      },
      {
        label: 'Denpasar Store',
        data: [7, 9, 8, 11, 10, 12, 11],
        borderColor: '#f59e0b',
        tension: 0.3
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#fff' } } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  }
});

let modalChartInstance = null; // Instance chart modal agar tidak tumpang tindih

// ==============================================
// 1. FUNGSI UNTUK DETAIL TOKO (MODAL OVERLAY)
// ==============================================
function openStoreDetail(storeId) {
  const modal = document.getElementById('modalStoreDetail');
  const activeMonth = getActiveMonth();

  // Jika Firebase belum terkoneksi, jalankan simulasi UI
  if (!dbRef) {
    document.getElementById('modalStoreName').innerText = storeId.replace('_', ' ').toUpperCase();
    document.getElementById('modalStoreCode').innerText = `ID Toko: ${storeId} | (Mode Simulasi Offline)`;
    document.getElementById('detailTargetSales').innerText = formatRupiah(800000000);
    document.getElementById('detailTotalSales').innerText = formatRupiah(350000000);
    document.getElementById('detailAcvPct').innerText = `88.5%`;
    document.getElementById('detailTotalDays').innerText = `20 Hari`;

    renderDetailChart(['Tgl 1', 'Tgl 2', 'Tgl 3', 'Tgl 4'], [15000000, 18000000, 12000000, 22000000], 26600000);
    modal.classList.add('active');
    return;
  }

  // Tarik Data Realtime dari Firebase
  dbRef.child(`stores/${storeId}`).once('value', (snapshot) => {
    const storeData = snapshot.val();
    if (!storeData) return alert('Data toko tidak ditemukan di database!');

    document.getElementById('modalStoreName').innerText = storeData.name || storeId;
    document.getElementById('modalStoreCode').innerText = `ID Toko: ${storeId} | Lokasi: ${storeData.location || '-'}`;

    const salesData = storeData.salesData ? storeData.salesData[activeMonth] : null;
    
    let totalSales = 0;
    let daysArray = [];
    let salesValues = [];

    if (salesData) {
      const validEntries = Object.entries(salesData).filter(([tgl, val]) => val && tgl !== "targetConfig");
      
      validEntries.forEach(([tgl, data]) => {
        totalSales += (data.sales || 0);
        daysArray.push(`Tgl ${tgl}`);
        salesValues.push(data.sales || 0);
      });
    }

    const targetSales = storeData.targetSales || 800000000;
    const acvPct = targetSales > 0 ? ((totalSales / targetSales) * 100).toFixed(1) : 0;
    const totalDays = daysArray.length;

    document.getElementById('detailTargetSales').innerText = formatRupiah(targetSales);
    document.getElementById('detailTotalSales').innerText = formatRupiah(totalSales);
    document.getElementById('detailAcvPct').innerText = `${acvPct}%`;
    document.getElementById('detailTotalDays').innerText = `${totalDays} Hari`;

    renderDetailChart(daysArray, salesValues, (targetSales / 30));
    modal.classList.add('active');
  });
}

function closeStoreDetail() {
  document.getElementById('modalStoreDetail').classList.remove('active');
}

// Render Grafik Harian Toko di Modal
function renderDetailChart(labels, dataSales, targetDaily) {
  const ctx = document.getElementById('detailStoreChart').getContext('2d');
  
  if (modalChartInstance) {
    modalChartInstance.destroy();
  }

  modalChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['Belum Ada Data'],
      datasets: [
        {
          label: 'Sales Realisasi (Rp)',
          data: dataSales.length > 0 ? dataSales : [0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Target Daily Avg',
          data: Array(labels.length > 0 ? labels.length : 1).fill(targetDaily),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
      }
    }
  });
}


// ==============================================
// 2. FUNGSI TAMBAH TOKO BARU KE DATABASE
// ==============================================
function openAddStoreModal() {
  document.getElementById('modalAddStore').classList.add('active');
}

function closeAddStoreModal() {
  document.getElementById('modalAddStore').classList.remove('active');
  document.getElementById('formAddStore').reset();
}

function handleCreateStore(event) {
  event.preventDefault();

  const storeId = document.getElementById('newStoreId').value.trim().toLowerCase();
  const name = document.getElementById('newStoreName').value.trim();
  const location = document.getElementById('newStoreLocation').value.trim();
  const targetSales = parseFloat(document.getElementById('newStoreTarget').value);

  if (!dbRef) {
    alert(`✅ [Offline Mode] Toko "${name}" berhasil dibuat secara virtual!`);
    closeAddStoreModal();
    return;
  }

  // Cek Keberadaan ID Toko di Firebase Database
  dbRef.child(`stores/${storeId}`).once('value', (snapshot) => {
    if (snapshot.exists()) {
      alert('⚠️ ID Toko sudah digunakan! Gunakan ID/Kode yang lain.');
      return;
    }

    const newStoreData = {
      name: name,
      location: location,
      targetSales: targetSales,
      createdAt: new Date().toISOString()
    };

    dbRef.child(`stores/${storeId}`).set(newStoreData)
      .then(() => {
        alert(`✅ Toko "${name}" berhasil disimpan ke Database!`);
        closeAddStoreModal();
        if (typeof loadOwnerDashboard === 'function') loadOwnerDashboard();
      })
      .catch((error) => {
        alert('Gagal menambah toko: ' + error.message);
      });
  });
}

// Utility Helpers
function formatRupiah(number) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(number);
}

function getActiveMonth() {
  const picker = document.getElementById('ownerMonthPicker');
  if (picker && picker.value) return picker.value;
  
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}
