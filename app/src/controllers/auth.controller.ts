import { Elysia, t } from "elysia";
import { db } from "../db";
import { users, refreshTokens, UserRole } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { jwtPlugin } from "../plugins/jwt";
import { authMiddleware, requireAuth } from "../middleware/auth";

export const authController = new Elysia({ prefix: "/auth" })
  .use(jwtPlugin)
  .use(authMiddleware)

  /**
   * POST /auth/login
   * Mendukung login untuk role Admin dan Operator.
   * Khusus Operator akan mendapatkan JWT Access Token dan Refresh Token (disimpan di MySQL).
   */
  .post(
    "/login",
    async ({ body, accessJwt, refreshJwt, set }) => {
      const { username, password } = body;

      // 1. Cari user berdasarkan username
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user) {
        set.status = 401;
        return {
          success: false,
          message: "Username atau password salah.",
        };
      }

      // 2. Verifikasi password dengan Bun.password (Argon2id)
      const isPasswordValid = await Bun.password.verify(password, user.password);
      if (!isPasswordValid) {
        set.status = 401;
        return {
          success: false,
          message: "Username atau password salah.",
        };
      }

      // 3. Cek apakah akun dalam status terkunci (Lock)
      if (user.isLocked) {
        set.status = 403;
        return {
          success: false,
          message: "Akun Anda telah dikunci (Locked). Anda tidak dapat login ke dalam aplikasi. Silakan hubungi Administrator.",
        };
      }

      // 4. Buat JWT Access Token (Payload: id, username, role)
      const accessToken = await accessJwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      // 5. Khusus Operator (dan Admin) generate Refresh Token unik dengan JTI
      let refreshToken: string | null = null;
      let refreshExpiresAt: Date | null = null;

      if (user.role === UserRole.OPERATOR || user.role === UserRole.ADMIN) {
        // Buat JWT Refresh Token (Masa berlaku 7 hari, jti unik untuk mencegah collision)
        refreshToken = await refreshJwt.sign({
          id: user.id,
          username: user.username,
          role: user.role,
          jti: crypto.randomUUID(),
        });

        // 7 hari dari sekarang
        refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Simpan refresh token ke database MySQL untuk token tracking & revocation
        await db.insert(refreshTokens).values({
          id: crypto.randomUUID(),
          userId: user.id,
          token: refreshToken,
          expiresAt: refreshExpiresAt,
          revoked: false,
        });
      }

      return {
        success: true,
        message: `Login berhasil sebagai ${user.role}.`,
        data: {
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            isLocked: user.isLocked,
          },
          accessToken,
          refreshToken,
          tokenType: "Bearer",
          expiresIn: 900, // 15 menit (dalam detik)
        },
      };
    },
    {
      body: t.Object({
        username: t.String({
          minLength: 3,
          description: "Username akun (contoh: 'admin' atau 'operator')",
          examples: ["admin", "operator"],
        }),
        password: t.String({
          minLength: 4,
          description: "Password akun (contoh: 'admin123' atau 'operator123')",
          examples: ["admin123", "operator123"],
        }),
      }),
      detail: {
        tags: ["Authentication"],
        summary: "Login Pengguna (Admin & Operator)",
        description:
          "Endpoint untuk masuk ke sistem. Pengguna dengan role OPERATOR (maupun ADMIN) akan menerima Access Token dan Refresh Token yang tercatat di database.",
      },
    }
  )

  /**
   * POST /auth/refresh
   * Endpoint untuk memperbarui access token menggunakan refresh token
   * Dilengkapi token rotation untuk keamanan maksimal.
   */
  .post(
    "/refresh",
    async ({ body, accessJwt, refreshJwt, set }) => {
      const { refreshToken } = body;

      // 1. Verifikasi integritas & masa berlaku JWT refresh token
      const payload = await refreshJwt.verify(refreshToken);
      if (!payload || !payload.id) {
        set.status = 401;
        return {
          success: false,
          message: "Refresh token tidak valid atau telah kedaluwarsa.",
        };
      }

      // 2. Cek apakah refresh token ada di MySQL dan belum dicabut (revoked)
      const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.token, refreshToken),
            eq(refreshTokens.revoked, false)
          )
        )
        .limit(1);

      if (!tokenRecord) {
        set.status = 401;
        return {
          success: false,
          message:
            "Refresh token tidak terdaftar atau telah dicabut (revoked).",
        };
      }

      // Cek apakah tanggal expired sudah lewat
      if (new Date() > new Date(tokenRecord.expiresAt)) {
        set.status = 401;
        return {
          success: false,
          message: "Refresh token sudah kedaluwarsa.",
        };
      }

      // 3. Ambil data user terkait
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, tokenRecord.userId))
        .limit(1);

      if (!user) {
        set.status = 401;
        return {
          success: false,
          message: "User tidak ditemukan.",
        };
      }

      // 4. Token Rotation: Cabut token lama agar tidak bisa dipakai ulang
      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, tokenRecord.id));

      // 5. Terbitkan Access Token baru dan Refresh Token baru (dengan jti unik)
      const newAccessToken = await accessJwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      const newRefreshToken = await refreshJwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        jti: crypto.randomUUID(),
      });

      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        id: crypto.randomUUID(),
        userId: user.id,
        token: newRefreshToken,
        expiresAt: newExpiresAt,
        revoked: false,
      });

      return {
        success: true,
        message: "Token berhasil diperbarui.",
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenType: "Bearer",
          expiresIn: 900,
        },
      };
    },
    {
      body: t.Object({
        refreshToken: t.String({
          description: "JWT Refresh Token yang masih berlaku",
        }),
      }),
      detail: {
        tags: ["Authentication"],
        summary: "Pembaruan Token (Token Rotation)",
        description:
          "Menghasilkan Access Token baru dan Refresh Token baru. Token lama otomatis dinonaktifkan (revoked) untuk mencegah penyalahgunaan token reuse.",
      },
    }
  )

  /**
   * POST /auth/logout
   * Mencabut (revoke) refresh token dari MySQL sehingga tidak dapat digunakan kembali.
   */
  .post(
    "/logout",
    async ({ body, user, set }) => {
      const refreshToken = body?.refreshToken;

      if (refreshToken) {
        // Cabut token spesifik
        await db
          .update(refreshTokens)
          .set({ revoked: true })
          .where(eq(refreshTokens.token, refreshToken));
      } else if (user) {
        // Jika login dengan Bearer token, cabut semua refresh token milik user ini
        await db
          .update(refreshTokens)
          .set({ revoked: true })
          .where(eq(refreshTokens.userId, user.id));
      } else {
        set.status = 400;
        return {
          success: false,
          message: "Harap sertakan refreshToken di body atau Bearer token di header.",
        };
      }

      return {
        success: true,
        message: "Logout berhasil. Sesi refresh token telah dicabut.",
      };
    },
    {
      body: t.Optional(
        t.Object({
          refreshToken: t.Optional(
            t.String({
              description: "Refresh token yang ingin dicabut (opsional jika menggunakan Bearer token)",
            })
          ),
        })
      ),
      detail: {
        tags: ["Authentication"],
        summary: "Logout & Pencabutan Sesi Token",
        description:
          "Mencabut status validitas Refresh Token di database MySQL sehingga tidak dapat dipakai lagi.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  /**
   * GET /auth/me
   * Mengambil data profil user saat ini (memerlukan Bearer Access Token)
   */
  .use(requireAuth)
  .get(
    "/me",
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      const [userData] = await db
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
        .where(eq(users.id, user.id))
        .limit(1);

      if (!userData) {
        set.status = 404;
        return { success: false, message: "User tidak ditemukan di database." };
      }

      return {
        success: true,
        data: userData,
      };
    },
    {
      detail: {
        tags: ["Authentication"],
        summary: "Profil Pengguna yang Sedang Login",
        description:
          "Mengambil detail informasi akun dari user yang sedang terautentikasi berdasarkan JWT Access Token.",
        security: [{ bearerAuth: [] }],
      },
    }
  );
