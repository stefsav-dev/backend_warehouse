import { Elysia, t } from "elysia";
import { db } from "../db";
import { users, refreshTokens, incomingItems, UserRole, UserRoleType } from "../db/schema";
import { eq, or, like, desc, count, and, ne } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middleware/auth";

/**
 * Validasi kompleksitas password:
 * Wajib 8 - 100 karakter, mengandung kombinasi huruf besar, huruf kecil, dan angka
 */
function isValidPasswordComplexity(password: string): boolean {
  if (password.length < 8 || password.length > 100) return false;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasLower && hasUpper && hasDigit;
}

export const adminController = new Elysia({ prefix: "/admin" })
  .use(authMiddleware)
  .use(requireAdmin)

  /**
   * GET /admin/dashboard
   * Endpoint dashboard statistik ringkas khusus Admin
   */
  .get(
    "/dashboard",
    async ({ user }) => {
      const allUsers = await db.select().from(users);
      const adminCount = allUsers.filter((u) => u.role === UserRole.ADMIN).length;
      const operatorCount = allUsers.filter((u) => u.role === UserRole.OPERATOR).length;
      const lockedCount = allUsers.filter((u) => u.isLocked).length;

      return {
        success: true,
        message: "Selamat datang di Panel Kontrol Admin Warehouse.",
        data: {
          adminUser: user,
          statistics: {
            totalUsers: allUsers.length,
            totalAdmins: adminCount,
            totalOperators: operatorCount,
            totalLockedUsers: lockedCount,
          },
          systemStatus: "Operational",
        },
      };
    },
    {
      detail: {
        tags: ["Manajemen User"],
        summary: "Dashboard Analitik Admin (Khusus Admin)",
        description:
          "Menampilkan statistik pengguna sistem (total admin, operator, dan akun terkunci).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /admin/users
   * Modul Manajemen User dengan:
   * - Fitur paging dengan tampilan 10 data per page (default limit=10, page=1)
   * - Filter data berdasarkan Role (?role=ADMIN atau ?role=OPERATOR)
   * - Fitur pencarian berdasarkan username atau nama (?search=...)
   */
  .get(
    "/users",
    async ({ query }) => {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const conditions = [];

      // Filter berdasarkan Role
      if (query.role) {
        conditions.push(eq(users.role, query.role as UserRoleType));
      }

      // Filter Pencarian berdasarkan Username ATAU Nama
      if (query.search && query.search.trim() !== "") {
        const keyword = `%${query.search.trim()}%`;
        conditions.push(
          or(like(users.username, keyword), like(users.name, keyword))
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 1. Hitung total data untuk pagination
      const [totalResult] = await db
        .select({ total: count() })
        .from(users)
        .where(whereClause);

      const total = Number(totalResult?.total || 0);
      const totalPages = Math.ceil(total / limit) || 1;

      // 2. Query data user (tanpa password)
      const userList = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isLocked: users.isLocked,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        success: true,
        data: userList,
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
        role: t.Optional(
          t.Union([t.Literal(UserRole.ADMIN), t.Literal(UserRole.OPERATOR)], {
            description: "Filter data berdasarkan Role (ADMIN atau OPERATOR)",
          })
        ),
        search: t.Optional(
          t.String({
            description: "Pencarian berdasarkan Username atau Nama",
          })
        ),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Daftar User (Paging 10 Data, Filter Role & Pencarian)",
        description:
          "Menampilkan daftar data pengguna dengan fitur paging 10 data/halaman, filter role, dan pencarian username/nama.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /admin/users/:id
   * Detail satu akun pengguna
   */
  .get(
    "/users/:id",
    async ({ params, set }) => {
      const [userItem] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isLocked: users.isLocked,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      if (!userItem) {
        set.status = 404;
        return {
          success: false,
          message: "Data user tidak ditemukan.",
        };
      }

      return {
        success: true,
        data: userItem,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID User" }),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Detail Akun Pengguna",
        description: "Mengambil data detail satu akun pengguna berdasarkan ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * POST /admin/users
   * Form Tambah User (berbentuk popup modal)
   * Field & Validasi:
   * - Role: Combobox, Wajib dipilih [Admin, Operator]
   * - Username: Textbox, Wajib diisi, unique, string 8 - 100 karakter
   * - Password: Password, Wajib diisi, string 8 – 100 karakter, kombinasi huruf besar, huruf kecil dan angka
   * - Nama: Textbox, Wajib diisi, string 8 – 100 karakter
   * - Email: Textbox, Wajib diisi, string 8 – 100 karakter, format email
   */
  .post(
    "/users",
    async ({ body, set }) => {
      const { name, username, email, password, role } = body;
      const cleanUsername = username.trim();
      const cleanName = name.trim();
      const cleanEmail = email.trim().toLowerCase();

      // 1. Validasi Kompleksitas Password (Huruf besar, huruf kecil, angka)
      if (!isValidPasswordComplexity(password)) {
        set.status = 400;
        return {
          success: false,
          message:
            "Password harus terdiri dari 8 - 100 karakter dan wajib mengandung kombinasi huruf besar, huruf kecil, dan angka.",
        };
      }

      // 2. Cek apakah username sudah ada (Unique)
      const [existingUsername] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, cleanUsername))
        .limit(1);

      if (existingUsername) {
        set.status = 409;
        return {
          success: false,
          message: `Username '${cleanUsername}' sudah digunakan. Harap gunakan username lain.`,
        };
      }

      // 3. Cek apakah email sudah ada (Unique)
      const [existingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (existingEmail) {
        set.status = 409;
        return {
          success: false,
          message: `Email '${cleanEmail}' sudah terdaftar pada akun lain.`,
        };
      }

      // 4. Hash password dengan Argon2id
      const hashedPassword = await Bun.password.hash(password, {
        algorithm: "argon2id",
      });

      const newUserId = crypto.randomUUID();

      await db.insert(users).values({
        id: newUserId,
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        role: role as UserRoleType,
        isLocked: false,
      });

      const [newUser] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isLocked: users.isLocked,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, newUserId))
        .limit(1);

      set.status = 201;
      return {
        success: true,
        message: `Pengguna baru dengan role ${role} berhasil ditambahkan.`,
        data: newUser,
      };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal(UserRole.ADMIN), t.Literal(UserRole.OPERATOR)], {
          description: "Role akun (Combobox: Wajib dipilih [Admin, Operator])",
          examples: ["OPERATOR"],
        }),
        username: t.String({
          minLength: 8,
          maxLength: 100,
          description: "Username akun (Textbox: Wajib diisi, unique, string 8 - 100 karakter)",
          examples: ["operator_joko"],
        }),
        password: t.String({
          minLength: 8,
          maxLength: 100,
          description:
            "Password akun (Password: Wajib diisi, 8 - 100 karakter, kombinasi huruf besar, huruf kecil, dan angka)",
          examples: ["Password123"],
        }),
        name: t.String({
          minLength: 8,
          maxLength: 100,
          description: "Nama lengkap (Textbox: Wajib diisi, string 8 - 100 karakter)",
          examples: ["Joko Susilo Prakoso"],
        }),
        email: t.String({
          minLength: 8,
          maxLength: 100,
          format: "email",
          description: "Email pengguna (Textbox: Wajib diisi, string 8 - 100 karakter, format email)",
          examples: ["joko.susilo@warehouse.local"],
        }),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Tambah User Baru (Popup Modal)",
        description:
          "Form modal popup untuk mendaftarkan user baru dengan validasi username unik 8-100 char, password kompleksitas huruf besar+kecil+angka, nama 8-100 char, dan email 8-100 char.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * PUT /admin/users/:id
   * Form Edit User (berbentuk popup modal)
   * Password bersifat opsional saat edit (jika kosong, mempertahankan password lama).
   */
  .put(
    "/users/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "Data user tidak ditemukan.",
        };
      }

      const role = body.role || existing.role;
      const username = body.username ? body.username.trim() : existing.username;
      const name = body.name ? body.name.trim() : existing.name;
      const email = body.email ? body.email.trim().toLowerCase() : existing.email;

      // Cek keunikan username jika diubah
      if (username !== existing.username) {
        const [dupUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, username), ne(users.id, params.id)))
          .limit(1);

        if (dupUser) {
          set.status = 409;
          return {
            success: false,
            message: `Username '${username}' sudah digunakan oleh user lain.`,
          };
        }
      }

      // Cek keunikan email jika diubah
      if (email && email !== existing.email) {
        const [dupEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, email), ne(users.id, params.id)))
          .limit(1);

        if (dupEmail) {
          set.status = 409;
          return {
            success: false,
            message: `Email '${email}' sudah digunakan oleh user lain.`,
          };
        }
      }

      // Password: Jika diisi, periksa kompleksitas dan hash ulang
      let hashedPassword = existing.password;
      if (body.password && body.password.trim() !== "") {
        if (!isValidPasswordComplexity(body.password)) {
          set.status = 400;
          return {
            success: false,
            message:
              "Password baru harus 8 - 100 karakter dan mengandung kombinasi huruf besar, huruf kecil, dan angka.",
          };
        }
        hashedPassword = await Bun.password.hash(body.password, {
          algorithm: "argon2id",
        });
      }

      await db
        .update(users)
        .set({
          role: role as UserRoleType,
          username,
          name,
          email,
          password: hashedPassword,
        })
        .where(eq(users.id, params.id));

      const [updated] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isLocked: users.isLocked,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      return {
        success: true,
        message: "Data user berhasil diperbarui.",
        data: updated,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID User" }),
      }),
      body: t.Object({
        role: t.Optional(
          t.Union([t.Literal(UserRole.ADMIN), t.Literal(UserRole.OPERATOR)], {
            description: "Role akun [Admin, Operator]",
          })
        ),
        username: t.Optional(
          t.String({
            minLength: 3,
            maxLength: 100,
            description: "Username unik (3 - 100 karakter)",
          })
        ),
        password: t.Optional(
          t.String({
            maxLength: 100,
            description:
              "Password baru (opsional saat edit, jika diisi wajib 8-100 char kombinasi huruf besar, kecil, angka)",
          })
        ),
        name: t.Optional(
          t.String({
            minLength: 3,
            maxLength: 100,
            description: "Nama lengkap (3 - 100 karakter)",
          })
        ),
        email: t.Optional(
          t.String({
            minLength: 8,
            maxLength: 100,
            format: "email",
            description: "Email pengguna (8 - 100 karakter format email)",
          })
        ),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Ubah Data User (Popup Modal)",
        description: "Memperbarui informasi pengguna dari form popup modal edit.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * PATCH /admin/users/:id/lock
   * Fitur Lock / Unlock User.
   * Jika User di-set Lock (isLocked: true), maka user tersebut TIDAK AKAN BISA LOGIN ke aplikasi.
   * Saat user di-lock, seluruh refresh token aktif miliknya otomatis dicabut (revoked).
   */
  .patch(
    "/users/:id/lock",
    async ({ params, body, user, set }) => {
      // 1. Mencegah Admin mengunci akunnya sendiri yang sedang aktif login
      if (params.id === user?.id) {
        set.status = 400;
        return {
          success: false,
          message: "Anda tidak dapat mengunci akun Anda sendiri yang sedang aktif.",
        };
      }

      // 2. Cek apakah user target ada
      const [targetUser] = await db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      if (!targetUser) {
        set.status = 404;
        return {
          success: false,
          message: "Data user tidak ditemukan.",
        };
      }

      const { isLocked } = body;

      // 3. Update status isLocked di tabel users
      await db
        .update(users)
        .set({ isLocked })
        .where(eq(users.id, params.id));

      // 4. Jika user dikunci, cabut seluruh sesi refresh token miliknya agar langsung logout
      if (isLocked) {
        await db
          .update(refreshTokens)
          .set({ revoked: true })
          .where(eq(refreshTokens.userId, params.id));
      }

      return {
        success: true,
        message: isLocked
          ? `Akun user '${targetUser.username}' (${targetUser.name}) berhasil DIKUNCI (Locked). User tidak dapat login ke aplikasi.`
          : `Kunci akun user '${targetUser.username}' (${targetUser.name}) berhasil DIBUKA (Unlocked). User dapat login kembali.`,
        data: {
          id: targetUser.id,
          username: targetUser.username,
          isLocked,
        },
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "ID User yang akan di-Lock / Unlock" }),
      }),
      body: t.Object({
        isLocked: t.Boolean({
          description: "true untuk mengunci user (Lock), false untuk membuka kunci (Unlock)",
        }),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Lock / Unlock User",
        description:
          "Mengunci atau membuka kunci akun pengguna. Jika dikunci (Locked), user tidak akan bisa login ke aplikasi dan sesi token langsung dicabut.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * DELETE /admin/users/:id
   * Admin menghapus akun pengguna
   */
  .delete(
    "/users/:id",
    async ({ params, set, user }) => {
      if (params.id === user?.id) {
        set.status = 400;
        return {
          success: false,
          message: "Tidak dapat menghapus akun sendiri yang sedang aktif.",
        };
      }

      const [existing] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return {
          success: false,
          message: "User tidak ditemukan.",
        };
      }

      // 1. Cek apakah user memiliki riwayat transaksi barang masuk
      const [itemUsage] = await db
        .select({ total: count() })
        .from(incomingItems)
        .where(eq(incomingItems.operatorId, params.id));

      if (itemUsage && Number(itemUsage.total) > 0) {
        set.status = 400;
        return {
          success: false,
          message: `Tidak dapat menghapus user '${existing.username}' karena akun ini terkait dengan ${itemUsage.total} catatan transaksi barang masuk.`,
        };
      }

      try {
        // Hapus token sesi terkait user
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, params.id));

        // Hapus user
        await db.delete(users).where(eq(users.id, params.id));

        return {
          success: true,
          message: `User '${existing.username}' berhasil dihapus.`,
        };
      } catch (err: any) {
        set.status = 400;
        return {
          success: false,
          message:
            err?.message?.includes("foreign key") || err?.message?.includes("constraint")
              ? `User '${existing.username}' tidak dapat dihapus karena masih terkait dengan data transaksi lain.`
              : err?.message || "Gagal menghapus user dari database.",
        };
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "ID User yang akan dihapus" }),
      }),
      detail: {
        tags: ["Manajemen User"],
        summary: "Hapus Pengguna",
        description: "Menghapus akun pengguna dari database berdasarkan ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  );
