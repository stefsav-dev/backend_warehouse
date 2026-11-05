import { describe, expect, it } from "bun:test";
import { app } from "../src/index";
import { jwtPlugin } from "../src/plugins/jwt";
import { Elysia } from "elysia";
import { UserRole } from "../src/db/schema";

describe("Role Matrix and Clean Swagger Structure Tests", () => {
  it("harus memverifikasi bahwa spesifikasi Swagger/OpenAPI hanya memiliki 5 tag modul resmi dan rapi", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);

    const openApi = await res.json();
    const tagNames = openApi.tags?.map((t: any) => t.name) || [];

    // Pastikan tag resmi ada
    expect(tagNames).toContain("Authentication");
    expect(tagNames).toContain("Barang Masuk");
    expect(tagNames).toContain("Master Kategori");
    expect(tagNames).toContain("Master Sub Kategori");
    expect(tagNames).toContain("Manajemen User");

    // Pastikan tag dummy/berantakan TIDAK ADA
    expect(tagNames).not.toContain("Operator");
    expect(tagNames).not.toContain("Admin");
    expect(tagNames).not.toContain("Master Data");
    expect(tagNames).not.toContain("API Health Check");

    // Pastikan semua endpoints di spec hanya menggunakan tag yang terdaftar
    const paths = openApi.paths || {};
    const usedTags = new Set<string>();

    for (const p of Object.keys(paths)) {
      for (const m of Object.keys(paths[p])) {
        const op = paths[p][m];
        if (op.tags) {
          for (const t of op.tags) {
            usedTags.add(t);
          }
        }
      }
    }

    expect(usedTags.has("Operator")).toBe(false);
    expect(usedTags.has("Master Data")).toBe(false);
    expect(usedTags.has("Admin")).toBe(false);
    expect(usedTags.has("API Health Check")).toBe(false);
  });

  it("harus menolak Operator mengakses Master Kategori, Master Sub Kategori, dan Manajemen User (403 Forbidden)", async () => {
    // Generate token operator
    const tokenApp = new Elysia().use(jwtPlugin);
    let operatorToken = "";
    tokenApp.get("/token", async ({ accessJwt }) => {
      operatorToken = await accessJwt.sign({
        id: "usr-operator-01",
        username: "operator01",
        role: UserRole.OPERATOR,
      });
      return { token: operatorToken };
    });
    await tokenApp.handle(new Request("http://localhost/token"));

    // 1. Coba akses Master Kategori sebagai Operator
    const resCat = await app.handle(
      new Request("http://localhost/categories", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resCat.status).toBe(403);

    // 2. Coba akses Master Sub Kategori sebagai Operator
    const resSubCat = await app.handle(
      new Request("http://localhost/sub-categories", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resSubCat.status).toBe(403);

    // 3. Coba akses Manajemen User sebagai Operator
    const resUsers = await app.handle(
      new Request("http://localhost/admin/users", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resUsers.status).toBe(403);

    // 4. Coba akses Dashboard Admin sebagai Operator
    const resDashboard = await app.handle(
      new Request("http://localhost/admin/dashboard", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resDashboard.status).toBe(403);
  });

  it("harus mengizinkan Operator mengakses modul Barang Masuk dan combobox helper-nya", async () => {
    // Generate token operator
    const tokenApp = new Elysia().use(jwtPlugin);
    let operatorToken = "";
    tokenApp.get("/token", async ({ accessJwt }) => {
      operatorToken = await accessJwt.sign({
        id: "usr-operator-01",
        username: "operator01",
        role: UserRole.OPERATOR,
      });
      return { token: operatorToken };
    });
    await tokenApp.handle(new Request("http://localhost/token"));

    // 1. Akses list barang masuk
    const resItems = await app.handle(
      new Request("http://localhost/incoming-items", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resItems.status).toBe(200);

    // 2. Akses combobox kategori
    const resCats = await app.handle(
      new Request("http://localhost/incoming-items/categories", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resCats.status).toBe(200);

    // 3. Akses combobox operators (operator terkunci pada dirinya sendiri)
    const resOps = await app.handle(
      new Request("http://localhost/incoming-items/operators", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      })
    );
    expect(resOps.status).toBe(200);
  });
});

