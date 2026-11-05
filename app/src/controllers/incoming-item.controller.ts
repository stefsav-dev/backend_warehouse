import { Elysia, t } from "elysia";
import { db } from "../db";
import {
  incomingItems,
  categories,
  subCategories,
  users,
  UserRole,
} from "../db/schema";
import { eq, and, gte, lte, like, or, desc, asc, sql, count } from "drizzle-orm";
import { authMiddleware, requireAuth } from "../middleware/auth";
import path from "path";
import fs from "fs";

/**
 * Format angka ke mata uang Rupiah
 */
function formatRupiah(amount: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

// Folder penyimpanan file lampiran
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const incomingItemController = new Elysia({ prefix: "/incoming-items" })
  .use(authMiddleware)
  .use(requireAuth)

  /**
   * POST /incoming-items/upload
   * Endpoint khusus untuk mengunggah file lampiran (doc, docx, zip)
   */
  .post(
    "/upload",
    async ({ body, set }) => {
      const file = body.file;

      if (!file) {
        set.status = 400;
        return {
          success: false,
          message: "File lampiran wajib disertakan.",
        };
      }

      // 1. Validasi ekstensi file (doc, docx, zip)
      const allowedExtensions = [".doc", ".docx", ".zip"];
      const fileExt = path.extname(file.name).toLowerCase();

      if (!allowedExtensions.includes(fileExt)) {
        set.status = 400;
        return {
          success: false,
          message:
            "Format file tidak didukung. Lampiran hanya boleh berekstensi .doc, .docx, atau .zip.",
        };
      }

      // 2. Batas ukuran maksimal file (10 MB)
      const maxSizeBytes = 10 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        set.status = 400;
        return {
          success: false,
          message: "Ukuran file lampiran terlalu besar. Maksimal 10 MB.",
        };
      }

      // 3. Simpan file dengan nama unik
      const uniqueFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${fileExt}`;
      const targetPath = path.join(UPLOAD_DIR, uniqueFilename);

      const arrayBuffer = await file.arrayBuffer();
      await Bun.write(targetPath, arrayBuffer);

      return {
        success: true,
        message: "File lampiran berhasil diunggah.",
        data: {
          filename: uniqueFilename,
          originalName: file.name,
          url: `/uploads/${uniqueFilename}`,
          size: file.size,
        },
      };
    },
    {
      body: t.Object({
        file: t.File({
          description: "File lampiran berekstensi .doc, .docx, atau .zip (maksimal 10MB)",
        }),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Upload File Lampiran",
        description:
          "Mengunggah file dokumen lampiran barang masuk dengan format .doc, .docx, atau .zip.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /incoming-items/categories
   * Mengambil daftar Kategori untuk pilihan combobox form Barang Masuk
   */
  .get(
    "/categories",
    async () => {
      const data = await db
        .select({
          id: categories.id,
          code: categories.code,
          name: categories.name,
        })
        .from(categories)
        .orderBy(asc(categories.name));

      return {
        success: true,
        data,
      };
    },
    {
      detail: {
        tags: ["Barang Masuk"],
        summary: "Opsi Combobox Kategori",
        description:
          "Mengambil daftar Kategori untuk mengisi pilihan Combobox Kategori pada form Barang Masuk (dapat diakses Admin dan Operator).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /incoming-items/categories/:id/sub-categories
   * Mengambil daftar Sub Kategori yang sesuai dengan Kategori yang dipilih beserta batas harga
   */
  .get(
    "/categories/:id/sub-categories",
    async ({ params }) => {
      const data = await db
        .select({
          id: subCategories.id,
          categoryId: subCategories.categoryId,
          code: subCategories.code,
          name: subCategories.name,
          priceLimit: subCategories.priceLimit,
        })
        .from(subCategories)
        .where(eq(subCategories.categoryId, params.id))
        .orderBy(asc(subCategories.name));

      return {
        success: true,
        data: data.map((s) => {
          const numPrice = Number(s.priceLimit);
          return {
            id: s.id,
            categoryId: s.categoryId,
            code: s.code,
            name: s.name,
            priceLimit: numPrice,
            priceLimitFormatted: formatRupiah(numPrice),
          };
        }),
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Kategori yang dipilih" }),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Opsi Combobox Sub Kategori & Batas Harga",
        description:
          "Mengambil list Sub Kategori yang sesuai dengan Kategori yang dipilih, lengkap dengan informasi Batas Harga (Rupiah).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /incoming-items/operators
   * Mengambil daftar user Operator untuk pilihan Combobox Operator pada form Barang Masuk.
   * - Login sebagai Admin: dapat memilih user Operator mana pun.
   * - Login sebagai Operator: otomatis terkunci hanya pada akun Operator yang sedang login.
   */
  .get(
    "/operators",
    async ({ user }) => {
      if (user?.role === UserRole.ADMIN) {
        const data = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
          })
          .from(users)
          .where(eq(users.role, UserRole.OPERATOR))
          .orderBy(asc(users.name));

        return {
          success: true,
          data,
        };
      }

      // Jika role Operator, hanya kembalikan akun miliknya sendiri
      const [currentUser] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, user!.id))
        .limit(1);

      return {
        success: true,
        data: currentUser ? [currentUser] : [],
      };
    },
    {
      detail: {
        tags: ["Barang Masuk"],
        summary: "Opsi Combobox Operator",
        description:
          "Mengambil daftar Operator untuk Combobox form Barang Masuk. Admin dapat memilih operator mana pun, sedangkan Operator terkunci pada dirinya sendiri.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /incoming-items
   * Mengambil daftar data barang masuk dengan:
   * - Pagination (default 10 data per halaman)
   * - Filter Kategori
   * - Filter Sub Kategori
   * - Filter Tahun
   * - Pencarian nama barang / asal barang / nomor surat
   */
  .get(
    "",
    async ({ query, user }) => {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      // Kumpulan kondisi filter query
      const conditions = [];

      // Filter Operator: jika role Operator otomatis miliknya sendiri, jika Admin bisa filter by operatorId
      if (user?.role === UserRole.OPERATOR) {
        conditions.push(eq(incomingItems.operatorId, user.id));
      } else if (query.operatorId) {
        conditions.push(eq(incomingItems.operatorId, query.operatorId));
      }

      // Filter Kategori
      if (query.categoryId) {
        conditions.push(eq(incomingItems.categoryId, query.categoryId));
      }

      // Filter Sub Kategori
      if (query.subCategoryId) {
        conditions.push(eq(incomingItems.subCategoryId, query.subCategoryId));
      }

      // Filter Tahun
      if (query.year) {
        const yearInt = Number(query.year);
        if (!isNaN(yearInt)) {
          const startOfYear = `${yearInt}-01-01`;
          const endOfYear = `${yearInt}-12-31`;
          conditions.push(gte(incomingItems.incomingDate, startOfYear));
          conditions.push(lte(incomingItems.incomingDate, endOfYear));
        }
      }

      // Filter Pencarian Teks
      if (query.search && query.search.trim() !== "") {
        const keyword = `%${query.search.trim()}%`;
        conditions.push(
          or(
            like(incomingItems.itemName, keyword),
            like(incomingItems.itemOrigin, keyword),
            like(incomingItems.letterNumber, keyword)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 1. Hitung total data untuk pagination
      const [totalResult] = await db
        .select({ total: count() })
        .from(incomingItems)
        .where(whereClause);

      const total = Number(totalResult?.total || 0);
      const totalPages = Math.ceil(total / limit) || 1;

      // 2. Query data dengan Join ke Tabel Kategori, Sub Kategori, dan Operator
      const rows = await db
        .select({
          id: incomingItems.id,
          operatorId: incomingItems.operatorId,
          operatorName: users.name,
          operatorUsername: users.username,
          categoryId: incomingItems.categoryId,
          categoryName: categories.name,
          subCategoryId: incomingItems.subCategoryId,
          subCategoryName: subCategories.name,
          subCategoryPriceLimit: subCategories.priceLimit, // Batas Harga Sub Kategori
          itemOrigin: incomingItems.itemOrigin, // Asal Barang
          letterNumber: incomingItems.letterNumber, // Nomor Surat
          attachment: incomingItems.attachment,
          attachmentOriginalName: incomingItems.attachmentOriginalName,
          itemName: incomingItems.itemName, // Nama Barang
          price: incomingItems.price, // Harga Satuan
          quantity: incomingItems.quantity, // Jumlah Barang
          unit: incomingItems.unit, // Satuan
          totalPrice: incomingItems.totalPrice, // Total (Harga * Jumlah)
          expiredDate: incomingItems.expiredDate, // Tgl Expired
          incomingDate: incomingItems.incomingDate, // Tgl Masuk
          createdAt: incomingItems.createdAt,
          updatedAt: incomingItems.updatedAt,
        })
        .from(incomingItems)
        .leftJoin(categories, eq(incomingItems.categoryId, categories.id))
        .leftJoin(subCategories, eq(incomingItems.subCategoryId, subCategories.id))
        .leftJoin(users, eq(incomingItems.operatorId, users.id))
        .where(whereClause)
        .orderBy(desc(incomingItems.createdAt))
        .limit(limit)
        .offset(offset);

      // Format response dengan objek yang terstruktur
      const formattedData = rows.map((item) => ({
        id: item.id,
        operator: {
          id: item.operatorId,
          name: item.operatorName || "Tidak Diketahui",
          username: item.operatorUsername || "-",
        },
        category: {
          id: item.categoryId,
          name: item.categoryName || "-",
        },
        subCategory: {
          id: item.subCategoryId,
          name: item.subCategoryName || "-",
          priceLimit: Number(item.subCategoryPriceLimit || 0), // Informasi Batas Harga
        },
        itemOrigin: item.itemOrigin,
        letterNumber: item.letterNumber || null,
        attachment: item.attachment
          ? {
              filename: item.attachment,
              originalName: item.attachmentOriginalName || item.attachment,
              url: `/uploads/${item.attachment}`,
            }
          : null,
        itemName: item.itemName,
        price: Number(item.price),
        quantity: item.quantity,
        unit: item.unit,
        totalPrice: Number(item.totalPrice),
        expiredDate: item.expiredDate || null,
        incomingDate: item.incomingDate,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      return {
        success: true,
        data: formattedData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    },
    {
      query: t.Object({
        page: t.Optional(
          t.Numeric({ default: 1, description: "Nomor halaman (default: 1)" })
        ),
        limit: t.Optional(
          t.Numeric({ default: 10, description: "Banyaknya data per halaman (default: 10)" })
        ),
        categoryId: t.Optional(
          t.String({ description: "Filter berdasarkan ID Kategori" })
        ),
        subCategoryId: t.Optional(
          t.String({ description: "Filter berdasarkan ID Sub Kategori" })
        ),
        year: t.Optional(
          t.Numeric({ description: "Filter berdasarkan Tahun barang masuk (contoh: 2026)" })
        ),
        search: t.Optional(
          t.String({
            description: "Pencarian nama barang, asal barang, atau nomor surat",
          })
        ),
        operatorId: t.Optional(
          t.String({
            description: "Filter berdasarkan ID Operator",
          })
        ),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Daftar Barang Masuk (Paging 10 Data & Filter)",
        description:
          "Mengambil daftar data barang masuk dengan dukungan paging 10 data per halaman, filter Kategori, filter Sub Kategori, dan filter Tahun.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /incoming-items/:id
   * Mengambil detail satu data barang masuk
   */
  .get(
    "/:id",
    async ({ params, set }) => {
      const [item] = await db
        .select({
          id: incomingItems.id,
          operatorId: incomingItems.operatorId,
          operatorName: users.name,
          operatorUsername: users.username,
          categoryId: incomingItems.categoryId,
          categoryName: categories.name,
          subCategoryId: incomingItems.subCategoryId,
          subCategoryName: subCategories.name,
          subCategoryPriceLimit: subCategories.priceLimit,
          itemOrigin: incomingItems.itemOrigin,
          letterNumber: incomingItems.letterNumber,
          attachment: incomingItems.attachment,
          attachmentOriginalName: incomingItems.attachmentOriginalName,
          itemName: incomingItems.itemName,
          price: incomingItems.price,
          quantity: incomingItems.quantity,
          unit: incomingItems.unit,
          totalPrice: incomingItems.totalPrice,
          expiredDate: incomingItems.expiredDate,
          incomingDate: incomingItems.incomingDate,
          createdAt: incomingItems.createdAt,
          updatedAt: incomingItems.updatedAt,
        })
        .from(incomingItems)
        .leftJoin(categories, eq(incomingItems.categoryId, categories.id))
        .leftJoin(subCategories, eq(incomingItems.subCategoryId, subCategories.id))
        .leftJoin(users, eq(incomingItems.operatorId, users.id))
        .where(eq(incomingItems.id, params.id))
        .limit(1);

      if (!item) {
        set.status = 404;
        return {
          success: false,
          message: "Data barang masuk tidak ditemukan.",
        };
      }

      return {
        success: true,
        data: {
          id: item.id,
          operator: {
            id: item.operatorId,
            name: item.operatorName || "Tidak Diketahui",
            username: item.operatorUsername || "-",
          },
          category: {
            id: item.categoryId,
            name: item.categoryName || "-",
          },
          subCategory: {
            id: item.subCategoryId,
            name: item.subCategoryName || "-",
            priceLimit: Number(item.subCategoryPriceLimit || 0),
          },
          itemOrigin: item.itemOrigin,
          letterNumber: item.letterNumber || null,
          attachment: item.attachment
            ? {
                filename: item.attachment,
                originalName: item.attachmentOriginalName || item.attachment,
                url: `/uploads/${item.attachment}`,
              }
            : null,
          itemName: item.itemName,
          price: Number(item.price),
          quantity: item.quantity,
          unit: item.unit,
          totalPrice: Number(item.totalPrice),
          expiredDate: item.expiredDate || null,
          incomingDate: item.incomingDate,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Barang Masuk" }),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Detail Barang Masuk",
        description: "Mengambil data lengkap satu record barang masuk.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * POST /incoming-items
   * Tambah data barang masuk.
   * Aturan Role Operator:
   * - Login sebagai Admin: bisa memilih operatorId dari combobox.
   * - Login sebagai Operator: otomatis terkunci pada user.id yang login.
   * Total harga otomatis dihitung: Harga * Jumlah Barang.
   */
  .post(
    "",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      // 1. Tentukan Operator ID berdasarkan peran (Role Check)
      let targetOperatorId: string;

      if (user.role === UserRole.ADMIN) {
        // Admin bisa memilih operatorId, atau default ke admin jika tidak memilih
        targetOperatorId = body.operatorId || user.id;

        // Validasi user operator yang dipilih ada di DB
        const [opExists] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, targetOperatorId))
          .limit(1);

        if (!opExists) {
          set.status = 400;
          return {
            success: false,
            message: "Operator yang dipilih tidak valid atau tidak terdaftar.",
          };
        }
      } else {
        // Operator otomatis terkunci pada dirinya sendiri
        targetOperatorId = user.id;
      }

      // 2. Validasi Kategori dan Sub Kategori
      const [categoryExists] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, body.categoryId))
        .limit(1);

      if (!categoryExists) {
        set.status = 400;
        return {
          success: false,
          message: "Kategori yang dipilih tidak valid.",
        };
      }

      const [subCategoryExists] = await db
        .select({
          id: subCategories.id,
          categoryId: subCategories.categoryId,
          priceLimit: subCategories.priceLimit,
        })
        .from(subCategories)
        .where(eq(subCategories.id, body.subCategoryId))
        .limit(1);

      if (!subCategoryExists) {
        set.status = 400;
        return {
          success: false,
          message: "Sub Kategori yang dipilih tidak valid.",
        };
      }

      if (subCategoryExists.categoryId !== body.categoryId) {
        set.status = 400;
        return {
          success: false,
          message: "Sub Kategori yang dipilih tidak sesuai dengan Kategori yang dipilih.",
        };
      }

      // 3. Hitung otomatis Total = Harga * Jumlah Barang (Rupiah)
      const numPrice = Number(body.price);
      const numQuantity = Number(body.quantity);
      const calculatedTotal = (numPrice * numQuantity).toFixed(2);

      // 4. Tanggal Masuk (default hari ini jika tidak disertakan)
      const incomingDateStr =
        body.incomingDate || new Date().toISOString().split("T")[0];

      // 5. Simpan ke database MySQL
      const newItemId = crypto.randomUUID();

      await db.insert(incomingItems).values({
        id: newItemId,
        operatorId: targetOperatorId,
        categoryId: body.categoryId,
        subCategoryId: body.subCategoryId,
        itemOrigin: body.itemOrigin.trim(),
        letterNumber: body.letterNumber ? body.letterNumber.trim() : null,
        attachment: body.attachment ? body.attachment.trim() : null,
        attachmentOriginalName: body.attachmentOriginalName
          ? body.attachmentOriginalName.trim()
          : null,
        itemName: body.itemName.trim(),
        price: numPrice.toFixed(2),
        quantity: numQuantity,
        unit: body.unit.trim(),
        totalPrice: calculatedTotal,
        expiredDate: body.expiredDate ? body.expiredDate : null,
        incomingDate: incomingDateStr,
      });

      // 6. Ambil data yang baru dibuat
      const [createdItem] = await db
        .select()
        .from(incomingItems)
        .where(eq(incomingItems.id, newItemId))
        .limit(1);

      set.status = 201;
      return {
        success: true,
        message: "Data barang masuk berhasil ditambahkan.",
        data: {
          ...createdItem,
          price: Number(createdItem.price),
          totalPrice: Number(createdItem.totalPrice),
          subCategoryPriceLimit: Number(subCategoryExists.priceLimit),
        },
      };
    },
    {
      body: t.Object({
        operatorId: t.Optional(
          t.String({
            description:
              "ID User Operator (hanya dapat dipilih oleh Admin, untuk Operator otomatis terkunci ke akunnya sendiri)",
          })
        ),
        categoryId: t.String({
          minLength: 1,
          description: "ID Kategori yang dipilih (wajib)",
        }),
        subCategoryId: t.String({
          minLength: 1,
          description: "ID Sub Kategori yang dipilih (wajib)",
        }),
        itemOrigin: t.String({
          minLength: 1,
          maxLength: 200,
          description: "Asal Barang (wajib, maksimal 200 karakter)",
        }),
        letterNumber: t.Optional(
          t.String({
            maxLength: 100,
            description: "Nomor Surat Jalan/Faktur (tidak wajib, maksimal 100 karakter)",
          })
        ),
        attachment: t.Optional(
          t.String({
            description: "Nama file lampiran hasil upload dari endpoint /upload (opsional)",
          })
        ),
        attachmentOriginalName: t.Optional(
          t.String({
            description: "Nama asli file lampiran (opsional)",
          })
        ),
        itemName: t.String({
          minLength: 1,
          maxLength: 200,
          description: "Nama Barang (wajib, maksimal 200 karakter)",
        }),
        price: t.Numeric({
          minimum: 0,
          description: "Harga satuan barang (wajib, numerik rupiah)",
        }),
        quantity: t.Integer({
          minimum: 1,
          description: "Jumlah Barang (wajib, numerik integer minimal 1)",
        }),
        unit: t.String({
          minLength: 1,
          maxLength: 40,
          description: "Satuan barang (wajib, contoh: 'Pcs', 'Box', 'Rim', maksimal 40 karakter)",
        }),
        expiredDate: t.Optional(
          t.String({
            description: "Tanggal kedaluwarsa barang (format: YYYY-MM-DD, tidak wajib)",
          })
        ),
        incomingDate: t.Optional(
          t.String({
            description: "Tanggal barang masuk (format: YYYY-MM-DD, default hari ini)",
          })
        ),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Tambah Data Barang Masuk",
        description:
          "Menambahkan barang masuk baru. Admin bebas memilih operator, sedangkan akun Operator otomatis terkunci ke dirinya sendiri. Total harga dihitung otomatis dari Harga * Jumlah.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * PUT /incoming-items/:id
   * Memperbarui data barang masuk
   */
  .put(
    "/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      // 1. Cek apakah record ada
      const [existing] = await db
        .select()
        .from(incomingItems)
        .where(eq(incomingItems.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data barang masuk tidak ditemukan.",
        };
      }

      // Jika Operator, pastikan hanya bisa mengedit miliknya sendiri
      if (user.role === UserRole.OPERATOR && existing.operatorId !== user.id) {
        set.status = 403;
        return {
          success: false,
          message: "Akses ditolak: Anda hanya dapat mengubah data barang masuk yang Anda catat.",
        };
      }

      // 2. Operator assignment rule
      let targetOperatorId = existing.operatorId;
      if (user.role === UserRole.ADMIN && body.operatorId) {
        targetOperatorId = body.operatorId;
      }

      // 3. Validasi Kategori & Sub Kategori
      const categoryId = body.categoryId || existing.categoryId;
      const subCategoryId = body.subCategoryId || existing.subCategoryId;

      const [subCat] = await db
        .select()
        .from(subCategories)
        .where(eq(subCategories.id, subCategoryId))
        .limit(1);

      if (!subCat || subCat.categoryId !== categoryId) {
        set.status = 400;
        return {
          success: false,
          message: "Kategori atau Sub Kategori yang dipilih tidak valid/tidak cocok.",
        };
      }

      // 4. Hitung ulang total
      const price = body.price !== undefined ? Number(body.price) : Number(existing.price);
      const quantity = body.quantity !== undefined ? Number(body.quantity) : existing.quantity;
      const calculatedTotal = (price * quantity).toFixed(2);

      // 5. Update di database
      await db
        .update(incomingItems)
        .set({
          operatorId: targetOperatorId,
          categoryId,
          subCategoryId,
          itemOrigin: body.itemOrigin !== undefined ? body.itemOrigin.trim() : existing.itemOrigin,
          letterNumber:
            body.letterNumber !== undefined
              ? body.letterNumber?.trim() || null
              : existing.letterNumber,
          attachment:
            body.attachment !== undefined ? body.attachment?.trim() || null : existing.attachment,
          attachmentOriginalName:
            body.attachmentOriginalName !== undefined
              ? body.attachmentOriginalName?.trim() || null
              : existing.attachmentOriginalName,
          itemName: body.itemName !== undefined ? body.itemName.trim() : existing.itemName,
          price: price.toFixed(2),
          quantity,
          unit: body.unit !== undefined ? body.unit.trim() : existing.unit,
          totalPrice: calculatedTotal,
          expiredDate:
            body.expiredDate !== undefined ? body.expiredDate || null : existing.expiredDate,
          incomingDate: body.incomingDate || existing.incomingDate,
        })
        .where(eq(incomingItems.id, params.id));

      const [updated] = await db
        .select()
        .from(incomingItems)
        .where(eq(incomingItems.id, params.id))
        .limit(1);

      return {
        success: true,
        message: "Data barang masuk berhasil diperbarui.",
        data: {
          ...updated,
          price: Number(updated.price),
          totalPrice: Number(updated.totalPrice),
        },
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Barang Masuk" }),
      }),
      body: t.Object({
        operatorId: t.Optional(t.String()),
        categoryId: t.Optional(t.String()),
        subCategoryId: t.Optional(t.String()),
        itemOrigin: t.Optional(t.String({ maxLength: 200 })),
        letterNumber: t.Optional(t.String({ maxLength: 100 })),
        attachment: t.Optional(t.String()),
        attachmentOriginalName: t.Optional(t.String()),
        itemName: t.Optional(t.String({ maxLength: 200 })),
        price: t.Optional(t.Numeric({ minimum: 0 })),
        quantity: t.Optional(t.Integer({ minimum: 1 })),
        unit: t.Optional(t.String({ maxLength: 40 })),
        expiredDate: t.Optional(t.String()),
        incomingDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Ubah Data Barang Masuk",
        description: "Memperbarui record barang masuk dan menghitung ulang total harga.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * DELETE /incoming-items/:id
   * Menghapus data barang masuk
   */
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      const [existing] = await db
        .select()
        .from(incomingItems)
        .where(eq(incomingItems.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data barang masuk tidak ditemukan.",
        };
      }

      // Hapus file lampiran dari disk jika ada
      if (existing.attachment) {
        const filePath = path.join(UPLOAD_DIR, existing.attachment);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Abaikan jika gagal hapus file fisik
          }
        }
      }

      await db.delete(incomingItems).where(eq(incomingItems.id, params.id));

      return {
        success: true,
        message: "Data barang masuk berhasil dihapus.",
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Barang Masuk" }),
      }),
      detail: {
        tags: ["Barang Masuk"],
        summary: "Hapus Data Barang Masuk",
        description: "Menghapus data barang masuk dan file lampiran terkait dari server.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

