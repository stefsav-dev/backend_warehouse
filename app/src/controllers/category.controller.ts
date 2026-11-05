import { Elysia, t } from "elysia";
import { db } from "../db";
import { categories, subCategories, incomingItems } from "../db/schema";
import { eq, or, like, asc, count, and, ne } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middleware/auth";

export const categoryController = new Elysia()
  .use(authMiddleware)
  .use(requireAdmin)

  /**
   * GET /categories
   * Mengambil daftar master kategori dengan:
   * - Paging 10 data per page (default limit=10, page=1)
   * - Pencarian berdasarkan Kode Kategori atau Nama Kategori (?search=...)
   * - Mode dropdown tanpa paging jika ?all=true
   */
  .get(
    "/categories",
    async ({ query }) => {
      const isAll = query.all === "true" || query.all === "1";
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const conditions = [];

      // Filter Pencarian berdasarkan Kode Kategori atau Nama Kategori
      if (query.search && query.search.trim() !== "") {
        const keyword = `%${query.search.trim()}%`;
        conditions.push(
          or(like(categories.code, keyword), like(categories.name, keyword))
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Mode All untuk pilihan dropdown / combobox
      if (isAll) {
        const allData = await db
          .select({
            id: categories.id,
            code: categories.code,
            name: categories.name,
            createdAt: categories.createdAt,
          })
          .from(categories)
          .where(whereClause)
          .orderBy(asc(categories.code));

        return {
          success: true,
          data: allData,
        };
      }

      // 1. Hitung total data
      const [totalResult] = await db
        .select({ total: count() })
        .from(categories)
        .where(whereClause);

      const total = Number(totalResult?.total || 0);
      const totalPages = Math.ceil(total / limit) || 1;

      // 2. Query data dengan paging
      const data = await db
        .select({
          id: categories.id,
          code: categories.code,
          name: categories.name,
          createdAt: categories.createdAt,
          updatedAt: categories.updatedAt,
        })
        .from(categories)
        .where(whereClause)
        .orderBy(asc(categories.code))
        .limit(limit)
        .offset(offset);

      return {
        success: true,
        data,
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
        search: t.Optional(t.String({ description: "Cari berdasarkan kode atau nama kategori" })),
        all: t.Optional(t.String({ description: "Set 'true' untuk mengambil semua tanpa paging (opsi combobox)" })),
      }),
      detail: {
        tags: ["Master Kategori"],
        summary: "Daftar Kategori (Paging 10 Data & Pencarian)",
        description: "Mengambil daftar master data kategori dengan fitur paging dan pencarian kode/nama kategori.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /categories/:id
   * Detail satu data kategori
   */
  .get(
    "/categories/:id",
    async ({ params, set }) => {
      const [cat] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1);

      if (!cat) {
        set.status = 404;
        return {
          success: false,
          message: "Data kategori tidak ditemukan.",
        };
      }

      return {
        success: true,
        data: cat,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Kategori" }),
      }),
      detail: {
        tags: ["Master Kategori"],
        summary: "Detail Kategori",
        description: "Mengambil data detail satu kategori berdasarkan ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * POST /categories
   * Tambah data kategori baru (Modal Popup)
   * - Kode Kategori: Wajib diisi, unique, string maksimal 10 karakter
   * - Nama Kategori: Wajib diisi, string maksimal 100 karakter
   */
  .post(
    "/categories",
    async ({ body, set }) => {
      const code = body.code.trim().toUpperCase();
      const name = body.name.trim();

      // Cek apakah kode kategori sudah pernah digunakan
      const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.code, code))
        .limit(1);

      if (existing) {
        set.status = 409;
        return {
          success: false,
          message: `Kode Kategori '${code}' sudah digunakan. Harap gunakan kode lain.`,
        };
      }

      const newId = crypto.randomUUID();
      await db.insert(categories).values({
        id: newId,
        code,
        name,
      });

      const [newCat] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, newId))
        .limit(1);

      set.status = 201;
      return {
        success: true,
        message: "Kategori baru berhasil ditambahkan.",
        data: newCat,
      };
    },
    {
      body: t.Object({
        code: t.String({
          minLength: 1,
          maxLength: 10,
          description: "Kode Kategori (wajib, unique, maksimal 10 karakter, contoh: 'KAT-01')",
          examples: ["KAT-04"],
        }),
        name: t.String({
          minLength: 1,
          maxLength: 100,
          description: "Nama Kategori (wajib, maksimal 100 karakter)",
          examples: ["Peralatan Medis & Farmasi"],
        }),
      }),
      detail: {
        tags: ["Master Kategori"],
        summary: "Tambah Kategori Baru (Form Popup)",
        description: "Menambahkan kategori baru dengan kode kategori unik (maks 10) dan nama kategori (maks 100).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * PUT /categories/:id
   * Edit data kategori (Modal Popup)
   */
  .put(
    "/categories/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data kategori tidak ditemukan.",
        };
      }

      const code = body.code ? body.code.trim().toUpperCase() : existing.code;
      const name = body.name ? body.name.trim() : existing.name;

      // Cek apakah kode sudah dipakai oleh record kategori lain
      if (code !== existing.code) {
        const [dupCode] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.code, code), ne(categories.id, params.id)))
          .limit(1);

        if (dupCode) {
          set.status = 409;
          return {
            success: false,
            message: `Kode Kategori '${code}' sudah digunakan oleh kategori lain.`,
          };
        }
      }

      await db
        .update(categories)
        .set({
          code,
          name,
        })
        .where(eq(categories.id, params.id));

      const [updated] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1);

      return {
        success: true,
        message: "Data kategori berhasil diperbarui.",
        data: updated,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Kategori" }),
      }),
      body: t.Object({
        code: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 10,
            description: "Kode Kategori (maksimal 10 karakter)",
          })
        ),
        name: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 100,
            description: "Nama Kategori (maksimal 100 karakter)",
          })
        ),
      }),
      detail: {
        tags: ["Master Kategori"],
        summary: "Ubah Data Kategori (Form Popup)",
        description: "Memperbarui kode kategori dan/atau nama kategori.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * DELETE /categories/:id
   * Hapus data kategori
   */
  .delete(
    "/categories/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data kategori tidak ditemukan.",
        };
      }

      // Cek apakah ada data barang masuk yang menggunakan kategori ini
      const [itemUsage] = await db
        .select({ total: count() })
        .from(incomingItems)
        .where(eq(incomingItems.categoryId, params.id));

      if (itemUsage && Number(itemUsage.total) > 0) {
        set.status = 400;
        return {
          success: false,
          message: `Tidak dapat menghapus kategori '${existing.name}' karena masih digunakan pada ${itemUsage.total} catatan transaksi barang masuk.`,
        };
      }

      try {
        await db.delete(categories).where(eq(categories.id, params.id));

        return {
          success: true,
          message: `Kategori '${existing.name}' berhasil dihapus.`,
        };
      } catch (err: any) {
        set.status = 400;
        return {
          success: false,
          message:
            err?.message?.includes("foreign key") || err?.message?.includes("constraint")
              ? `Kategori '${existing.name}' tidak dapat dihapus karena masih terkait dengan data transaksi lain.`
              : err?.message || "Gagal menghapus kategori.",
        };
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "ID Kategori" }),
      }),
      detail: {
        tags: ["Master Kategori"],
        summary: "Hapus Kategori (Khusus Admin)",
        description: "Menghapus data kategori beserta seluruh sub-kategori terkait.",
        security: [{ bearerAuth: [] }],
      },
    }
  );
