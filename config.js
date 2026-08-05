// Firebase Initialization & Sync Engine
const configObj = {
    apiKey: "AIzaSyB9E39QtuLEMqFi6l9hEpIq0dbj0Cub8o4",
    authDomain: "latihan-e6e0e.firebaseapp.com",
    databaseURL: "https://latihan-e6e0e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "latihan-e6e0e",
    storageBucket: "latihan-e6e0e.firebasestorage.app",
    messagingSenderId: "206077007630",
    appId: "1:206077007630:web:95923c3dc84e2fd92c695f",
    measurementId: "G-M522KHJD4Q"
};

// Langsung inisialisasi agar jalan otomatis di semua halaman
if (!firebase.apps.length) {
    firebase.initializeApp(configObj);
}
