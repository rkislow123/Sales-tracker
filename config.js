// Firebase Initialization & Sync Engine
const configObj = {
    apiKey: "AIzaSyBv_s-mc57UsYyqMYTDtVTtIWicJ_qn4hE",
    authDomain: "monitoringsales-fec7a.firebaseapp.com",
    databaseURL: "https://monitoringsales-fec7a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "monitoringsales-fec7a",
    storageBucket: "monitoringsales-fec7a.firebasestorage.app",
    messagingSenderId: "767686039817",
    appId: "1:767686039817:web:b07b31af6660ce7d1a9bd8",
    measurementId: "G-JMDZMCZNPZ"
};

// Langsung inisialisasi agar jalan otomatis di semua halaman
if (!firebase.apps.length) {
    firebase.initializeApp(configObj);
}
