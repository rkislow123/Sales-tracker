// ==============================================
// 1. INISIALISASI DATABASE & STATE GLOBAL
// ==============================================
let dbRef = null;

// Mengambil referensi dari Firebase yang sudah di-initialize oleh config.js
if (typeof firebase !== 'undefined' && firebase.apps.length) {
    dbRef = firebase.database().ref();
}

let targetConfig = {
    salesBulanan: 0,
    gmPct: 0,
    totalHari: 0
};

let currentFilter = 'hari';
let salesChart = null;
let modalChartInstance = null; // Instance Chart khusus modal detail toko
let rawData = [];
let kd_toko = null;
let storeName = null; 

let tahun = new Date().getFullYear();
let bulan = String(new Date().getMonth() + 1).padStart(2, '0');

// Helper Format Rupiah
function formatRupiah(num) {
    return 'Rp ' + Math.round(num || 0).toLocaleString('id-ID');
}

// Helper Format Bulan Aktif YYYY-MM
function getActiveMonth() {
    const monthPicker = document.getElementById('ownerMonthPicker') || document.getElementById('monthPicker');
    if (monthPicker && monthPicker.value) return monthPicker.value;
    return `${tahun}-${bulan}`;
}

// ==============================================
// 2. FIREBASE AUTHENTICATION LISTENER
// ==============================================
if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            kd_toko = user.email ? user.email.split('@')[0].toUpperCase() : 'OWNER';
            if (typeof setupRealtimeListeners === 'function') {
                setupRealtimeListeners();
            }
        } else {
            // Redirect ke login jika bukan di halaman login atau owner
            const currentPath = window.location.pathname;
            if (!currentPath.includes('Login') && !currentPath.includes('owner')) {
                window.location.replace("../Login.html");
            }
        }
    });
}

function logoutUser() {
    if (confirm("Apakah kamu yakin ingin keluar dari aplikasi?")) {
        firebase.auth().signOut().then(() => {
            alert("Berhasil keluar.");
        });
    }
}

// ==============================================
// 3. FUNGSI POPUP DETAIL TOKO (MODAL OVERLAY)
// ==============================================
function openStoreDetail(storeId) {
    const modal = document.getElementById('modalStoreDetail');
    if (!modal) return alert('Elemen modal detail toko tidak ditemukan di HTML!');
    
    const activeMonth = getActiveMonth();
    console.log(activeMonth);

    
    // Tarik Data Toko Realtime dari Firebase
    dbRef.child(`stores/Q271`).once('value', (snapshot) => {
        const storeData = snapshot.val();
        storeName = storeData.profile.storeName;
        storeId = "Q271";
        if (!storeData) {
            alert('⚠️ Data toko tidak ditemukan di database!');
            return;
        }
        
        document.getElementById('modalStoreName').innerText = storeName || storeId;
        document.getElementById('modalStoreCode').innerText = `ID Toko: ${storeId}`;

        const salesData = storeData.salesData ? storeData.salesData[activeMonth] : null;
        console.log(salesData);
        let totalSales = 0;
        let daysArray = [];
        let salesValues = [];

        if (salesData) {
            const validEntries = Object.entries(salesData).filter(([tgl, val]) => val && tgl !== "targetConfig");
            validEntries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
            
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
    const modal = document.getElementById('modalStoreDetail');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Render Grafik Harian di Modal Detail Toko
function renderDetailChart(labels, dataSales, targetDaily) {
    const canvas = document.getElementById('detailStoreChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (modalChartInstance) {
        modalChartInstance.destroy(); // Menghapus chart lama sebelum membuat chart baru
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
// 4. FUNGSI TAMBAH TOKO BARU
// ==============================================
function openAddStoreModal() {
    const modal = document.getElementById('modalAddStore');
    if (modal) modal.classList.add('active');
}

function closeAddStoreModal() {
    const modal = document.getElementById('modalAddStore');
    if (modal) {
        modal.classList.remove('active');
        const form = document.getElementById('formAddStore');
        if (form) form.reset();
    }
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

    // Cek keberadaan ID Toko di Firebase
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

// ==============================================
// 5. EVENT LISTENERS UNTUK CLOSING POPUP AUTOMATIC
// ==============================================
// Menutup modal jika pengguna mengeklik area hitam (backdrop/overlay) di luar box modal
window.addEventListener('click', function(event) {
    const detailModal = document.getElementById('modalStoreDetail');
    const addModal = document.getElementById('modalAddStore');
    
    if (event.target === detailModal) {
        closeStoreDetail();
    }
    if (event.target === addModal) {
        closeAddStoreModal();
    }
});

// Menutup modal dengan menekan tombol ESC di keyboard
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeStoreDetail();
        closeAddStoreModal();
    }
});
