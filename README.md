# Vault — Password Manager Pribadi (PWA)

App penyimpanan password offline, terenkripsi AES-256, jalan sebagai PWA di iPhone
(Add to Home Screen), tanpa perlu Mac/Xcode/Developer Account.

## Isi folder
- index.html — semua screen (unlock, vault list, detail, generator, settings)
- styles.css — tampilan (tema gelap indigo, sesuai desain Stitch)
- app.js — logic aplikasi
- crypto.js — enkripsi AES-256-GCM + PBKDF2 (Web Crypto API, native browser)
- db.js — penyimpanan lokal via IndexedDB
- manifest.json — supaya bisa di-"Add to Home Screen" sebagai app
- service-worker.js — cache offline
- icons/ — icon app

## Cara deploy (dari iPhone/iPad, tanpa komputer)
1. Upload semua file (jaga struktur folder, terutama folder `icons/`) ke repo GitHub baru → aktifkan GitHub Pages.
2. Buka URL GitHub Pages kamu di Safari.
3. Share → Add to Home Screen.
4. Buka dari icon di Home Screen → buat master password pertama kali.

## Keamanan (penting dibaca)
- Master password TIDAK disimpan di mana pun — kalau lupa, vault tidak bisa dibuka lagi (data akan hilang kecuali kamu punya backup export).
- Semua data hanya tersimpan di HP kamu sendiri (IndexedDB browser). Tidak ada server, tidak ada cloud.
- Ini project belajar — cocok untuk pemakaian pribadi, tapi belum melalui audit keamanan profesional seperti aplikasi password manager komersial (1Password, Bitwarden, dll).
