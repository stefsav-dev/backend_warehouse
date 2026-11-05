import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { config } from "./config/env";
import { initDatabase } from "./db";
import { authController } from "./controllers/auth.controller";
import { adminController } from "./controllers/admin.controller";
import { categoryController } from "./controllers/category.controller";
import { subCategoryController } from "./controllers/sub-category.controller";
import { incomingItemController } from "./controllers/incoming-item.controller";
import { formatValidationError } from "./utils/error";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Inisialisasi aplikasi Elysia
export const app = new Elysia()
  // Global Error Handler agar respon error singkat, rapi, dan mudah dibaca
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: formatValidationError(error),
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        message: "Endpoint yang Anda tuju tidak ditemukan.",
      };
    }
  })
  // Plugin CORS agar frontend Next.js dapat mengakses API
  .use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  // Plugin Dokumentasi Interaktif OpenAPI 3.0 / Swagger
  .use(
    swagger({
      path: "/swagger",
      exclude: ["/", "/openapi.json", "/swagger", "/swagger/json"],
      documentation: {
        openapi: "3.0.3",
        info: {
          title: "Warehouse Management API",
          version: "1.0.0",
          description: `
## Warehouse Management API Documentation

Backend REST API sistem manajemen gudang dengan pembagian hak akses terstruktur sesuai matriks otorisasi:

### 📋 Matriks Hak Akses Modul:
| Modul | Admin | Operator | Keterangan |
| :--- | :---: | :---: | :--- |
| **Halaman Login / Auth** | ✅ | ✅ | Login, refresh token rotation, profil, logout |
| **Barang Masuk** | ✅ | ✅ | Operator terkunci pada dirinya sendiri, Admin bebas memilih operator |
| **Master Data: Kategori** | ✅ | ❌ | Khusus Admin: Paging 10/hlm, pencarian, popup form |
| **Master Data: Sub Kategori** | ✅ | ❌ | Khusus Admin: Paging 10/hlm, pencarian, batas harga rupiah |
| **Manajemen User** | ✅ | ❌ | Khusus Admin: Paging 10/hlm, filter role, lock/unlock user |

---

### 🔑 Cara Autentikasi di Swagger:
1. Jalankan endpoint **\`POST /auth/login\`** dengan salah satu akun:
   - **Admin**: username \`admin\` | password \`admin123\`
   - **Operator**: username \`operator\` | password \`operator123\`
2. Salin nilai **\`accessToken\`** dari respons JSON.
3. Klik tombol hijau **Authorize 🔓** di pojok kanan atas dokumentasi ini.
4. Masukkan access token pada kolom Value (tanpa kata 'Bearer'), lalu klik **Authorize**.
          `,
          contact: {
            name: "Backend Warehouse Support",
          },
        },
        tags: [
          {
            name: "Authentication",
            description: "Modul Autentikasi: Login, Refresh Token Rotation, Profile, Logout (Hak Akses: Admin & Operator)",
          },
          {
            name: "Barang Masuk",
            description: "Modul Barang Masuk: CRUD, Paging 10 data/hlm, Filter Kategori/Sub Kategori/Tahun, File Upload Lampiran (Hak Akses: Admin & Operator)",
          },
          {
            name: "Master Kategori",
            description: "Modul Master Data Kategori: Paging 10 data/hlm, Pencarian Kode/Nama, Form Modal Popup (Hak Akses: Khusus Admin)",
          },
          {
            name: "Master Sub Kategori",
            description: "Modul Master Data Sub Kategori: Paging 10 data/hlm, Pencarian, Batas Harga Rupiah, Form Modal Popup (Hak Akses: Khusus Admin)",
          },
          {
            name: "Manajemen User",
            description: "Modul Manajemen User: Paging 10 data/hlm, Filter Role, Pencarian, Lock/Unlock User (Hak Akses: Khusus Admin)",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "Masukkan JWT Access Token Anda di sini (tanpa prefix 'Bearer ').",
            },
          },
        },
      },
    })
  )
  // Route Utama / Health Check
  .get(
    "/",
    () => ({
      success: true,
      message: "Warehouse Backend API is running smoothly 🚀",
      version: "1.0.0",
      documentation: "/swagger",
      openApiJson: "/openapi.json",
      timestamp: new Date().toISOString(),
    }),
    {
      detail: {
        hide: true,
      },
    }
  )
  // Alias URL untuk export spesifikasi OpenAPI JSON
  .get(
    "/openapi.json",
    async ({ redirect }) => {
      return redirect("/swagger/json");
    },
    {
      detail: {
        hide: true,
      },
    }
  )
  // Endpoint Akses/Download File Lampiran Upload
  .get(
    "/uploads/:filename",
    ({ params, set }) => {
      const filePath = path.join(UPLOAD_DIR, params.filename);
      if (!fs.existsSync(filePath)) {
        set.status = 404;
        return {
          success: false,
          message: "File lampiran tidak ditemukan.",
        };
      }
      return Bun.file(filePath);
    },
    {
      params: t.Object({
        filename: t.String({ description: "Nama file lampiran" }),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Download / Akses File Lampiran",
        description: "Menyajikan file lampiran yang telah diunggah untuk dilihat atau diunduh.",
      },
    }
  )
  // Pasang Controller Modules Sesuai Matriks Hak Akses
  .use(authController)
  .use(incomingItemController)
  .use(categoryController)
  .use(subCategoryController)
  .use(adminController);

// Jalankan server jika dieksekusi langsung
if (import.meta.main) {
  initDatabase()
    .then(() => {
      console.log("📦 MySQL connected & schema ready.");
    })
    .catch((err) => {
      console.warn(
        "⚠️ MySQL connection warning: Pastikan database MySQL berjalan pada",
        config.databaseUrl,
        "\nError details:",
        err.message || err
      );
    });

  app.listen({ port: config.port, hostname: "0.0.0.0" }, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Warehouse API Server running at http://0.0.0.0:${config.port}`);
    console.log(`📑 OpenAPI / Swagger Docs at http://0.0.0.0:${config.port}/swagger`);
    console.log(`📄 OpenAPI JSON Schema at http://0.0.0.0:${config.port}/openapi.json`);
    console.log(`======================================================\n`);
  });
}

export type App = typeof app;
