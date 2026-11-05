# Warehouse Management System - Backend API

Backend RESTful API dengan performa tinggi untuk sistem manajemen pergudangan inventaris barang, otorisasi RBAC (Role-Based Access Control), manajemen pengguna dengan fitur lock/unlock akun, master klasifikasi kategori dengan pagu batas harga, serta pencatatan barang masuk.

---

## 📌 1. Link Deployment (Live App)
* **Backend API Server (Live)**: [https://backendwarehouse-production.up.railway.app](https://backendwarehouse-production.up.railway.app)
* **Swagger / OpenAPI Documentation**: [https://backendwarehouse-production.up.railway.app/swagger](https://backendwarehouse-production.up.railway.app/swagger)
* **OpenAPI JSON Schema**: [https://backendwarehouse-production.up.railway.app/openapi.json](https://backendwarehouse-production.up.railway.app/openapi.json)
* **Frontend Web Application**: [https://frontendwarehouse-production.up.railway.app/](https://frontendwarehouse-production.up.railway.app/)

---

## 🎥 2. Link Video Demo
* **Google Drive Video Demo**: [https://drive.google.com/drive/folders/1T52p3kCWKn2fk6r7CCUp176hlE3Gca-n?usp=sharing](https://drive.google.com/drive/folders/1T52p3kCWKn2fk6r7CCUp176hlE3Gca-n?usp=sharing)

---

## 🛠️ 3. Tech Stack yang Digunakan

### **Backend (API Server)**
* **Runtime**: Bun (Fast JavaScript & TypeScript runtime)
* **Framework**: Elysia.js
* **ORM**: Drizzle ORM
* **Database Driver**: MySQL2 (Connection Pool)
* **Keamanan & Kriptografi**:
  * Argon2id Password Hashing (`Bun.password`)
  * JWT Access Token + Refresh Token Rotation
* **Dokumentasi API**: OpenAPI 3.0 / Swagger UI (@elysiajs/swagger)
* **Bahasa**: TypeScript

### **Frontend & Database**
* **Frontend**: Next.js 15+ (App Router), React 19, Tailwind CSS, Shadcn UI
* **Database**: MySQL 8.0 (Railway Cloud MySQL)
* **Cloud Platform**: Railway (Auto-Deployment via Git Webhook)

---

## 💻 4. Petunjuk Instalasi Lokal

### **Prasyarat Sistem**
* [Bun](https://bun.sh/) (v1.1+)
* Server database MySQL aktif lokal (misal port 3306)

### **Langkah-Langkah Menjalankan Backend:**
```bash
# 1. Clone repository backend
git clone https://github.com/stefsav-dev/backend_warehouse.git
cd backend_warehouse/app

# 2. Pasang dependensi project
bun install

# 3. Konfigurasi Environment Variable
# Buat file .env di dalam folder backend_warehouse/app:
PORT=3001
NODE_ENV=development
DATABASE_URL=mysql://root:password@localhost:3306/warehouse_db
JWT_SECRET=super_secret_jwt_key_warehouse_2026_dev

# 4. Jalankan Server API
bun run src/index.ts
```

> **Catatan Otomatisasi DB:**
> Saat pertama kali server dijalankan, sistem secara otomatis mengeksekusi `initDatabase()` untuk migrasi tabel MySQL dan menjalankan `seed()` untuk mengisi akun default Admin & Operator beserta sample data kategori jika tabel masih kosong.

---

## 🔑 5. Akun Pengujian (Kredensial)

| Peran (Role) | Username | Password | Deskripsi & Hak Akses |
| :--- | :--- | :--- | :--- |
| **Super Administrator** | `admin` | `admin123` | **Akses Penuh**: Manajemen Pengguna (Tambah/Ubah/Kunci Akun), Master Kategori, Master Sub Kategori (Batas Pagu Harga), Monitoring dan Ubah/Hapus Data Barang Masuk seluruh operator. |
| **Warehouse Operator** | `operator` | `operator123` | **Akses Operasional**: Pencatatan Barang Masuk (Form Append multi-item), filter kategori/tahun, unduh berkas lampiran, dan ringkasan operasional mandiri. |
| **Operator Lapangan (Budi)** | `operator_budi` | `operator123` | Akun operator tambahan untuk simulasi pencatatan operator lapangan A. |
| **Operator Lapangan (Siti)** | `operator_siti` | `operator123` | Akun operator tambahan untuk simulasi pencatatan operator lapangan B. |

---

## 📋 Matriks Hak Akses & Modul API

| Modul | Method | Endpoint | Hak Akses | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/auth/login` | Public | Login akun & mendapatkan Access + Refresh Token |
| **Auth** | `POST` | `/auth/refresh` | Public | Refresh token rotation |
| **Auth** | `POST` | `/auth/logout` | Authenticated | Revoke refresh token aktif |
| **User Management** | `GET` | `/admin/users` | Admin | List user dengan paging (10/hlm), search, & filter role |
| **User Management** | `POST` | `/admin/users` | Admin | Tambah akun user baru (Admin/Operator) |
| **User Management** | `PUT` | `/admin/users/:id` | Admin | Ubah data user |
| **User Management** | `PATCH` | `/admin/users/:id/lock` | Admin | Kunci/buka akun (Lock mencabut semua refresh token aktif) |
| **User Management** | `DELETE` | `/admin/users/:id` | Admin | Hapus akun user |
| **Kategori** | `GET, POST, PUT, DELETE` | `/categories` | Admin (Write) / Auth (Read) | Master klasifikasi kategori |
| **Sub Kategori** | `GET, POST, PUT, DELETE` | `/sub-categories` | Admin (Write) / Auth (Read) | Master sub kategori beserta batas harga satuan maksimum |
| **Barang Masuk** | `GET, POST, PUT, DELETE` | `/incoming-items` | Operator & Admin | CRUD pencatatan barang masuk inventaris gudang |
| **Lampiran Berkas** | `POST` | `/incoming-items/upload` | Operator & Admin | Unggah lampiran surat jalan/faktur (.doc, .docx, .zip) |
| **Unduh Berkas** | `GET` | `/uploads/:filename` | Authenticated | Akses dan unduh file lampiran |
