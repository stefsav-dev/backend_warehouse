# Backend Warehouse API (Elysia + Bun + MySQL)

Backend API untuk Warehouse Management System dengan modul lengkap:
1. **Autentikasi & RBAC (Admin & Operator)**
2. **Manajemen User (Paging, Filter Role, Pencarian, Lock/Unlock Akun)**
3. **Master Data > Kategori**
4. **Master Data > Sub Kategori**
5. **Barang Masuk (Incoming Items)**

---

## 🚀 Fitur Modul Manajemen User

- **Paging**: Tampilan 10 data per halaman (`?page=1&limit=10`).
- **Filter Role**: Filter data berdasarkan peran akun (`?role=ADMIN` atau `?role=OPERATOR`).
- **Pencarian**: Pencarian instan berdasarkan **Username** atau **Nama** (`?search=...`).
- **Fitur Lock / Unlock User**:
  - Endpoint: `PATCH /admin/users/:id/lock` dengan body `{ "isLocked": true / false }`.
  - Jika User di-set **Lock** (`isLocked: true`), maka:
    1. User tersebut **tidak akan bisa login** ke aplikasi (`403 Forbidden`).
    2. Seluruh sesi Refresh Token aktif miliknya di database otomatis dicabut (**revoked**).
    3. Admin yang sedang login dicegah mengunci akunnya sendiri.
- **Form Tambah / Edit User (Popup Modal)**:
  - **Role**: Combobox, Wajib dipilih `[Admin, Operator]`.
  - **Username**: Textbox, Wajib diisi, **unique**, string 8 - 100 karakter.
  - **Password**: Password, Wajib diisi (saat tambah), string 8 – 100 karakter, **wajib mengandung kombinasi huruf besar, huruf kecil, dan angka**. (Saat edit, bersifat opsional; jika kosong, password lama dipertahankan).
  - **Nama**: Textbox, Wajib diisi, string 8 – 100 karakter.
  - **Email**: Textbox, Wajib diisi, string 8 – 100 karakter, berupa format email.

---

## 📋 Daftar Endpoint Modul Manajemen User (`/admin/users`)

| Method | Endpoint | Role | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/users?page=1&limit=10` | Admin Only | Daftar Pengguna (Paging 10 data/halaman) |
| `GET` | `/admin/users?role=OPERATOR` | Admin Only | Filter pengguna berdasarkan Role (ADMIN/OPERATOR) |
| `GET` | `/admin/users?search=...` | Admin Only | Pencarian berdasarkan Username atau Nama |
| `GET` | `/admin/users/:id` | Admin Only | Detail satu akun pengguna |
| `POST` | `/admin/users` | Admin Only | **Tambah User Baru** (Form Popup Modal) |
| `PUT` | `/admin/users/:id` | Admin Only | **Ubah Data User** (Form Popup Modal) |
| `PATCH` | `/admin/users/:id/lock` | Admin Only | **Lock / Unlock User** (Mencegah / Mengizinkan login) |
| `DELETE` | `/admin/users/:id` | Admin Only | Hapus Akun User |

---

## 📝 Contoh Payload Request & Response

### 1. Tambah User Baru (`POST /admin/users`)
**Header:**
```http
Authorization: Bearer <adminAccessToken>
Content-Type: application/json
```

**Body Request:**
```json
{
  "role": "OPERATOR",
  "username": "operator_joko",
  "password": "Password123",
  "name": "Joko Susilo Prakoso",
  "email": "joko.susilo@warehouse.local"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Pengguna baru dengan role OPERATOR berhasil ditambahkan.",
  "data": {
    "id": "f583b211-...",
    "name": "Joko Susilo Prakoso",
    "username": "operator_joko",
    "email": "joko.susilo@warehouse.local",
    "role": "OPERATOR",
    "isLocked": false,
    "createdAt": "2026-11-04T15:38:00.000Z"
  }
}
```

---

### 2. Lock User (`PATCH /admin/users/:id/lock`)
Mengunci akun agar tidak dapat login ke sistem:

**Body Request:**
```json
{
  "isLocked": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Akun user 'operator_joko' (Joko Susilo Prakoso) berhasil DIKUNCI (Locked). User tidak dapat login ke aplikasi.",
  "data": {
    "id": "f583b211-...",
    "username": "operator_joko",
    "isLocked": true
  }
}
```

*Respon saat user yang terkunci mencoba login (`POST /auth/login`):*
```json
{
  "success": false,
  "message": "Akun Anda telah dikunci (Locked). Anda tidak dapat login ke dalam aplikasi. Silakan hubungi Administrator."
}
```

---

### 3. Unlock User (`PATCH /admin/users/:id/lock`)
Membuka kunci akun agar dapat login kembali:

**Body Request:**
```json
{
  "isLocked": false
}
```

---

### 4. Ambil List User dengan Paging, Filter Role, & Pencarian
```http
GET /admin/users?page=1&limit=10&role=OPERATOR&search=Joko
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "f583b211-...",
      "name": "Joko Susilo Prakoso",
      "username": "operator_joko",
      "email": "joko.susilo@warehouse.local",
      "role": "OPERATOR",
      "isLocked": false,
      "createdAt": "2026-11-04T15:38:00.000Z",
      "updatedAt": "2026-11-04T15:38:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 🏃 Menjalankan Server & Swagger UI

```bash
cd backend_warehouse/app
bun run dev
```

- **Swagger Documentation**: `http://localhost:3000/swagger`
- **OpenAPI JSON Spec**: `http://localhost:3000/openapi.json`
