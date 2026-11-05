import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { jwtPlugin } from "../src/plugins/jwt";
import { authMiddleware, requireAdmin, requireOperator } from "../src/middleware/auth";
import { UserRole } from "../src/db/schema";

describe("Authentication & Role Authorization Unit Tests", () => {
  it("harus berhasil hashing dan verifikasi password menggunakan Bun Argon2id", async () => {
    const rawPassword = "OperatorSecret123!";
    const hashedPassword = await Bun.password.hash(rawPassword, {
      algorithm: "argon2id",
    });

    expect(hashedPassword).toBeDefined();
    expect(hashedPassword.startsWith("$argon2id$")).toBe(true);

    const isMatch = await Bun.password.verify(rawPassword, hashedPassword);
    expect(isMatch).toBe(true);

    const isWrongMatch = await Bun.password.verify("WrongPassword", hashedPassword);
    expect(isWrongMatch).toBe(false);
  });

  it("harus berhasil membuat dan memverifikasi JWT access token dan refresh token", async () => {
    const app = new Elysia()
      .use(jwtPlugin)
      .get("/generate-tokens", async ({ accessJwt, refreshJwt }) => {
        const payload = {
          id: "usr-operator-01",
          username: "operator01",
          role: UserRole.OPERATOR,
        };

        const accessToken = await accessJwt.sign(payload);
        const refreshToken = await refreshJwt.sign(payload);

        const decodedAccess = await accessJwt.verify(accessToken);
        const decodedRefresh = await refreshJwt.verify(refreshToken);

        return { accessToken, refreshToken, decodedAccess, decodedRefresh };
      });

    const res = await app.handle(new Request("http://localhost/generate-tokens"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.decodedAccess.role).toBe(UserRole.OPERATOR);
    expect(data.decodedRefresh.role).toBe(UserRole.OPERATOR);
    expect(data.decodedAccess.username).toBe("operator01");
  });

  it("harus menolak akses ke endpoint Admin jika user adalah Operator (403 Forbidden)", async () => {
    const app = new Elysia()
      .use(jwtPlugin)
      .use(authMiddleware)
      .group("/admin", (grp) =>
        grp
          .use(requireAdmin)
          .get("/secret-dashboard", () => ({ secret: "admin-only-data" }))
      );

    // 1. Buat token Operator
    let operatorToken = "";
    const tokenGenApp = new Elysia().use(jwtPlugin).get("/get-token", async ({ accessJwt }) => {
      return await accessJwt.sign({
        id: "usr-op-1",
        username: "operator01",
        role: UserRole.OPERATOR,
      });
    });
    const tokenRes = await tokenGenApp.handle(new Request("http://localhost/get-token"));
    operatorToken = await tokenRes.text();

    // 2. Coba akses endpoint Admin dengan token Operator
    const res = await app.handle(
      new Request("http://localhost/admin/secret-dashboard", {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
        },
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("Hanya role Admin");
  });

  it("harus mengizinkan akses ke endpoint Admin jika user adalah Admin (200 OK)", async () => {
    const app = new Elysia()
      .use(jwtPlugin)
      .use(authMiddleware)
      .group("/admin", (grp) =>
        grp
          .use(requireAdmin)
          .get("/secret-dashboard", () => ({ success: true, secret: "admin-only-data" }))
      );

    // 1. Buat token Admin
    let adminToken = "";
    const tokenGenApp = new Elysia().use(jwtPlugin).get("/get-token", async ({ accessJwt }) => {
      return await accessJwt.sign({
        id: "usr-adm-1",
        username: "superadmin",
        role: UserRole.ADMIN,
      });
    });
    const tokenRes = await tokenGenApp.handle(new Request("http://localhost/get-token"));
    adminToken = await tokenRes.text();

    // 2. Akses endpoint Admin dengan token Admin
    const res = await app.handle(
      new Request("http://localhost/admin/secret-dashboard", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.secret).toBe("admin-only-data");
  });

  it("harus mengizinkan akses ke endpoint Operator jika user adalah Operator (200 OK)", async () => {
    const app = new Elysia()
      .use(jwtPlugin)
      .use(authMiddleware)
      .group("/operator", (grp) =>
        grp
          .use(requireOperator)
          .get("/tasks", () => ({ success: true, tasks: ["Check Stock"] }))
      );

    // 1. Buat token Operator
    let operatorToken = "";
    const tokenGenApp = new Elysia().use(jwtPlugin).get("/get-token", async ({ accessJwt }) => {
      return await accessJwt.sign({
        id: "usr-op-1",
        username: "operator01",
        role: UserRole.OPERATOR,
      });
    });
    const tokenRes = await tokenGenApp.handle(new Request("http://localhost/get-token"));
    operatorToken = await tokenRes.text();

    // 2. Akses endpoint Operator dengan token Operator
    const res = await app.handle(
      new Request("http://localhost/operator/tasks", {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tasks.length).toBe(1);
  });
});

