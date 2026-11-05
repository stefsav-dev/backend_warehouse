import { Elysia } from "elysia";
import { jwtPlugin, JWTPayload } from "../plugins/jwt";
import { UserRole } from "../db/schema";

/**
 * Middleware untuk mengekstrak dan memverifikasi token JWT dari header Authorization: Bearer <token>
 */
export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ headers, accessJwt }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { user: null };
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return { user: null };
    }

    try {
      const payload = (await accessJwt.verify(token)) as unknown as JWTPayload | false;
      if (!payload || !payload.id || !payload.role) {
        return { user: null };
      }

      return { user: payload };
    } catch {
      return { user: null };
    }
  });

/**
 * Guard untuk memastikan request sudah diautentikasi (memiliki user valid)
 */
export const requireAuth = new Elysia({ name: "requireAuth" })
  .use(authMiddleware)
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return {
        success: false,
        message: "Unauthorized: Token akses tidak valid atau tidak disertakan.",
      };
    }
  });

/**
 * Guard khusus role Admin
 */
export const requireAdmin = new Elysia({ name: "requireAdmin" })
  .use(authMiddleware)
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return {
        success: false,
        message: "Unauthorized: Harap login terlebih dahulu.",
      };
    }

    if (user.role !== UserRole.ADMIN) {
      set.status = 403;
      return {
        success: false,
        message: "Forbidden: Akses ditolak. Hanya role Admin yang diizinkan.",
      };
    }
  });

/**
 * Guard khusus role Operator
 */
export const requireOperator = new Elysia({ name: "requireOperator" })
  .use(authMiddleware)
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return {
        success: false,
        message: "Unauthorized: Harap login terlebih dahulu.",
      };
    }

    if (user.role !== UserRole.OPERATOR) {
      set.status = 403;
      return {
        success: false,
        message: "Forbidden: Akses ditolak. Hanya role Operator yang diizinkan.",
      };
    }
  });
