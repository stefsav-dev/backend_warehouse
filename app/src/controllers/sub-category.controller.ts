import { Elysia, t } from "elysia";
import { db } from "../db";
import { subCategories, categories, incomingItems } from "../db/schema";
import { eq, or, like, asc, count, and } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middleware/auth";

/**
 * Format angka ke format mata uang Rupiah dengan masking penanda 3 digit ribuan (id-ID)
 * Contoh: 25000000 -> "Rp 25.000.000"
 */
function formatRupiah(amount: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

export const subCategoryController = new Elysia({ prefix: "/sub-categories" })
  .use(authMiddleware)
  .use(requireAdmin)

  /**
   * GET /sub-categories
   * Mengambil daftar data Sub Kategori dengan:
   * - Fitur paging dengan tampilan 10 data per page (default limit=10, page=1)
   * - Fitur pencarian berdasarkan Nama Kategori atau Nama Sub Kategori (?search=...)
   * - Filter Kategori (?categoryId=...)
   * - Mode dropdown list tanpa paging (?all=true)
   */
  .get(
    "",
    async ({ query }) => {
      const isAll = query.all === "true" || query.all === "1";
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const conditions = [];

      // Filter berdasarkan Kategori tertentu (jika ada)
      if (query.categoryId) {
        conditions.push(eq(subCategories.categoryId, query.categoryId));
      }

      // Fitur pencarian berdasarkan Nama Kategori ATAU Nama Sub Kategori
      if (query.search && query.search.trim() !== "") {
        const keyword = `%${query.search.trim()}%`;
        conditions.push(
          or(
            like(subCategories.name, keyword),
            like(categories.name, keyword)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Mode All untuk pilihan dropdown / combobox
      if (isAll) {
        const allRows = await db
          .select({
            id: subCategories.id,
            categoryId: subCategories.categoryId,
            categoryName: categories.name,
            code: subCategories.code,
            name: subCategories.name,
            priceLimit: subCategories.priceLimit,
            createdAt: subCategories.createdAt,
          })
          .from(subCategories)
          .leftJoin(categories, eq(subCategories.categoryId, categories.id))
          .where(whereClause)
          .orderBy(asc(subCategories.name));

        return {
          success: true,
          data: allRows.map((r) => {
            const numPrice = Number(r.priceLimit);
            return {
              id: r.id,
              categoryId: r.categoryId,
              categoryName: r.categoryName || "-",
              name: r.name,
              code: r.code || null,
              priceLimit: numPrice,
              priceLimitFormatted: formatRupiah(numPrice),
              createdAt: r.createdAt,
            };
          }),
        };
      }

      // 1. Hitung total data untuk pagination
      const [totalResult] = await db
        .select({ total: count() })
        .from(subCategories)
        .leftJoin(categories, eq(subCategories.categoryId, categories.id))
        .where(whereClause);

      const total = Number(totalResult?.total || 0);
      const totalPages = Math.ceil(total / limit) || 1;

      // 2. Query data dengan paging 10 data per page & Join ke Kategori
      const rows = await db
        .select({
          id: subCategories.id,
          categoryId: subCategories.categoryId,
          categoryName: categories.name,
          categoryCode: categories.code,
          code: subCategories.code,
          name: subCategories.name,
          priceLimit: subCategories.priceLimit,
          createdAt: subCategories.createdAt,
          updatedAt: subCategories.updatedAt,
        })
        .from(subCategories)
        .leftJoin(categories, eq(subCategories.categoryId, categories.id))
        .where(whereClause)
        .orderBy(asc(subCategories.name))
        .limit(limit)
        .offset(offset);

      const formattedData = rows.map((r) => {
        const numPrice = Number(r.priceLimit);
        return {
          id: r.id,
          name: r.name,
          code: r.code || null,
          priceLimit: numPrice,
          priceLimitFormatted: formatRupiah(numPrice),
          category: {
            id: r.categoryId,
            code: r.categoryCode || "-",
            name: r.categoryName || "-",
          },
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      });

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
        page: t.Optional(t.Numeric({ default: 1, description: "Nomor halaman (default: 1)" })),
        limit: t.Optional(t.Numeric({ default: 10, description: "Data per halaman (default: 10)" })),
        search: t.Optional(
          t.String({
            description: "Pencarian berdasarkan Nama Kategori atau Nama Sub Kategori",
          })
        ),
        categoryId: t.Optional(
          t.String({ description: "Filter berdasarkan ID Kategori induk" })
        ),
        all: t.Optional(
          t.String({ description: "Set 'true' untuk mengambil seluruh opsi (tanpa paging)" })
        ),
      }),
      detail: {
        tags: ["Master Sub Kategori"],
        summary: "Daftar Sub Kategori (Paging 10 Data & Pencarian)",
        description:
          "Menampilkan list Sub Kategori dengan paging 10 data/halaman serta pencarian berdasarkan Nama Kategori atau Nama Sub Kategori.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /sub-categories/:id
   * Detail satu data sub kategori
   */
  .get(
    "/:id",
    async ({ params, set }) => {
      const [item] = await db
        .select({
          id: subCategories.id,
          categoryId: subCategories.categoryId,
          categoryName: categories.name,
          categoryCode: categories.code,
          code: subCategories.code,
          name: subCategories.name,
          priceLimit: subCategories.priceLimit,
          createdAt: subCategories.createdAt,
          updatedAt: subCategories.updatedAt,
        })
        .from(subCategories)
        .leftJoin(categories, eq(subCategories.categoryId, categories.id))
        .where(eq(subCategories.id, params.id))
        .limit(1);

      if (!item) {
        set.status = 404;
        return {
          success: false,
          message: "Data sub kategori tidak ditemukan.",
        };
      }

      const numPrice = Number(item.priceLimit);

      return {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          code: item.code || null,
          priceLimit: numPrice,
          priceLimitFormatted: formatRupiah(numPrice),
          category: {
            id: item.categoryId,
            code: item.categoryCode || "-",
            name: item.categoryName || "-",
          },
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Sub Kategori" }),
      }),
      detail: {
        tags: ["Master Sub Kategori"],
        summary: "Detail Sub Kategori",
        description: "Mengambil data detail satu Sub Kategori beserta Batas Harga.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * POST /sub-categories
   * Tambah Sub Kategori Baru (Form Popup Modal)
   * Form Fields:
   * 1. Kategori: Combobox (Wajib dipilih, list option mengambil dari data Kategori)
   * 2. Nama Sub Kategori: Textbox (Wajib diisi, string maksimal 100 karakter)
   * 3. Batas Harga: Textbox (Wajib diisi, angka rupiah dengan masking penanda 3 digit ribuan)
   */
  .post(
    "",
    async ({ body, set }) => {
      const name = body.name.trim();
      const priceLimit = Number(body.priceLimit);
      const categoryId = body.categoryId;
      const code = body.code ? body.code.trim().toUpperCase() : null;

      // 1. Validasi Kategori induk ada di database
      const [catExists] = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);

      if (!catExists) {
        set.status = 400;
        return {
          success: false,
          message: "Kategori yang dipilih tidak valid atau tidak terdaftar.",
        };
      }

      // 2. Simpan Sub Kategori Baru
      const newId = crypto.randomUUID();
      await db.insert(subCategories).values({
        id: newId,
        categoryId,
        name,
        priceLimit: priceLimit.toFixed(2),
        code,
      });

      const [newSub] = await db
        .select()
        .from(subCategories)
        .where(eq(subCategories.id, newId))
        .limit(1);

      const numPrice = Number(newSub.priceLimit);

      set.status = 201;
      return {
        success: true,
        message: "Sub Kategori baru berhasil ditambahkan.",
        data: {
          id: newSub.id,
          categoryId: newSub.categoryId,
          categoryName: catExists.name,
          name: newSub.name,
          code: newSub.code || null,
          priceLimit: numPrice,
          priceLimitFormatted: formatRupiah(numPrice),
          createdAt: newSub.createdAt,
        },
      };
    },
    {
      body: t.Object({
        categoryId: t.String({
          minLength: 1,
          description: "Kategori (Combobox: Wajib dipilih, list option mengambil dari data Kategori)",
        }),
        name: t.String({
          minLength: 1,
          maxLength: 100,
          description: "Nama Sub Kategori (Textbox: Wajib diisi, string maksimal 100 karakter)",
          examples: ["Monitor & Layar Display"],
        }),
        priceLimit: t.Numeric({
          minimum: 0,
          description: "Batas Harga (Textbox: Wajib diisi, angka rupiah dengan masking 3 digit ribuan)",
          examples: [5000000],
        }),
        code: t.Optional(
          t.String({
            maxLength: 10,
            description: "Kode Sub Kategori (opsional, maksimal 10 karakter)",
          })
        ),
      }),
      detail: {
        tags: ["Master Sub Kategori"],
        summary: "Tambah Sub Kategori Baru (Popup Modal)",
        description:
          "Form Tambah Sub Kategori dengan field: Kategori (Combobox), Nama Sub Kategori (Textbox maks 100), dan Batas Harga (Angka rupiah).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * PUT /sub-categories/:id
   * Edit Sub Kategori (Form Popup Modal)
   */
  .put(
    "/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(subCategories)
        .where(eq(subCategories.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data sub kategori tidak ditemukan.",
        };
      }

      const categoryId = body.categoryId || existing.categoryId;
      const name = body.name !== undefined ? body.name.trim() : existing.name;
      const priceLimit =
        body.priceLimit !== undefined
          ? Number(body.priceLimit).toFixed(2)
          : existing.priceLimit;
      const code =
        body.code !== undefined
          ? body.code?.trim().toUpperCase() || null
          : existing.code;

      // Jika mengganti kategori, pastikan kategori baru ada
      if (body.categoryId && body.categoryId !== existing.categoryId) {
        const [catExists] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.categoryId))
          .limit(1);

        if (!catExists) {
          set.status = 400;
          return {
            success: false,
            message: "Kategori yang dipilih tidak valid.",
          };
        }
      }

      await db
        .update(subCategories)
        .set({
          categoryId,
          name,
          priceLimit,
          code,
        })
        .where(eq(subCategories.id, params.id));

      const [updated] = await db
        .select()
        .from(subCategories)
        .where(eq(subCategories.id, params.id))
        .limit(1);

      const numPrice = Number(updated.priceLimit);

      return {
        success: true,
        message: "Data sub kategori berhasil diperbarui.",
        data: {
          id: updated.id,
          categoryId: updated.categoryId,
          name: updated.name,
          code: updated.code || null,
          priceLimit: numPrice,
          priceLimitFormatted: formatRupiah(numPrice),
          updatedAt: updated.updatedAt,
        },
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Sub Kategori" }),
      }),
      body: t.Object({
        categoryId: t.Optional(t.String({ description: "Kategori (Combobox)" })),
        name: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 100,
            description: "Nama Sub Kategori (maksimal 100 karakter)",
          })
        ),
        priceLimit: t.Optional(
          t.Numeric({
            minimum: 0,
            description: "Batas Harga (angka rupiah)",
          })
        ),
        code: t.Optional(t.String({ maxLength: 10 })),
      }),
      detail: {
        tags: ["Master Sub Kategori"],
        summary: "Ubah Sub Kategori (Popup Modal)",
        description: "Memperbarui data sub kategori dari form popup modal.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * DELETE /sub-categories/:id
   * Hapus data sub kategori
   */
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: subCategories.id, name: subCategories.name })
        .from(subCategories)
        .where(eq(subCategories.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data sub kategori tidak ditemukan.",
        };
      }

      // Cek apakah ada data barang masuk yang menggunakan sub kategori ini
      const [itemUsage] = await db
        .select({ total: count() })
        .from(incomingItems)
        .where(eq(incomingItems.subCategoryId, params.id));

      if (itemUsage && Number(itemUsage.total) > 0) {
        set.status = 400;
        return {
          success: false,
          message: `Tidak dapat menghapus sub kategori '${existing.name}' karena masih digunakan pada ${itemUsage.total} catatan transaksi barang masuk.`,
        };
      }

      try {
        await db.delete(subCategories).where(eq(subCategories.id, params.id));

        return {
          success: true,
          message: `Sub Kategori '${existing.name}' berhasil dihapus.`,
        };
      } catch (err: any) {
        set.status = 400;
        return {
          success: false,
          message:
            err?.message?.includes("foreign key") || err?.message?.includes("constraint")
              ? `Sub kategori '${existing.name}' tidak dapat dihapus karena masih terkait dengan data transaksi lain.`
              : err?.message || "Gagal menghapus sub kategori.",
        };
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Sub Kategori" }),
      }),
      detail: {
        tags: ["Master Sub Kategori"],
        summary: "Hapus Sub Kategori",
        description: "Menghapus data sub kategori berdasarkan ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  );
