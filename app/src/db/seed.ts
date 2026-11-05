import { db, initDatabase, poolConnection } from "./index";
import { users, UserRole, categories, subCategories, incomingItems } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Running database seeder (MySQL)...");

  try {
    // Pastikan tabel sudah ada
    await initDatabase();

    // 1. Cek & buat akun Admin default
    let adminUser = (
      await db.select().from(users).where(eq(users.username, "admin")).limit(1)
    )[0];

    if (!adminUser) {
      const hashedAdminPassword = await Bun.password.hash("admin123", {
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
      });

      const newAdminId = crypto.randomUUID();
      await db.insert(users).values({
        id: newAdminId,
        name: "Super Administrator",
        username: "admin",
        email: "admin@warehouse.local",
        password: hashedAdminPassword,
        role: UserRole.ADMIN,
      });

      adminUser = {
        id: newAdminId,
        name: "Super Administrator",
        username: "admin",
        email: "admin@warehouse.local",
        password: hashedAdminPassword,
        role: UserRole.ADMIN,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      console.log("✅ Admin user seeded: username='admin', password='admin123'");
    } else {
      console.log("ℹ️ Admin user already exists.");
    }

    // 2. Cek & buat akun Operator default
    let operatorUser = (
      await db.select().from(users).where(eq(users.username, "operator")).limit(1)
    )[0];

    if (!operatorUser) {
      const hashedOperatorPassword = await Bun.password.hash("operator123", {
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
      });

      const newOperatorId = crypto.randomUUID();
      await db.insert(users).values({
        id: newOperatorId,
        name: "Warehouse Operator Lapangan",
        username: "operator",
        email: "operator@warehouse.local",
        password: hashedOperatorPassword,
        role: UserRole.OPERATOR,
      });

      operatorUser = {
        id: newOperatorId,
        name: "Warehouse Operator Lapangan",
        username: "operator",
        email: "operator@warehouse.local",
        password: hashedOperatorPassword,
        role: UserRole.OPERATOR,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      console.log("✅ Operator user seeded: username='operator', password='operator123'");
    } else {
      console.log("ℹ️ Operator user already exists.");
    }

    // 3. Cek & buat akun Operator tambahan (Budi & Siti) untuk pilihan di combobox
    const existingOp2 = await db
      .select()
      .from(users)
      .where(eq(users.username, "operator_budi"))
      .limit(1);

    if (existingOp2.length === 0) {
      const pass = await Bun.password.hash("operator123", { algorithm: "argon2id" });
      await db.insert(users).values({
        id: crypto.randomUUID(),
        name: "Budi Pratama (Operator A)",
        username: "operator_budi",
        email: "budi@warehouse.local",
        password: pass,
        role: UserRole.OPERATOR,
      });
      console.log("✅ Operator Budi seeded: username='operator_budi'");
    }

    // 4. Update kode untuk kategori & sub-kategori yang sudah ada jika belum memiliki kode
    const existingCats = await db.select().from(categories);

    if (existingCats.length > 0) {
      let codeIndex = 1;
      for (const cat of existingCats) {
        if (!cat.code) {
          const generatedCode = `KAT-${String(codeIndex).padStart(2, "0")}`;
          await db
            .update(categories)
            .set({ code: generatedCode })
            .where(eq(categories.id, cat.id));
          codeIndex++;
        }
      }

      const existingSubs = await db.select().from(subCategories);
      let subIndex = 1;
      for (const sub of existingSubs) {
        if (!sub.code) {
          const generatedSubCode = `SUB-${String(subIndex).padStart(2, "0")}`;
          await db
            .update(subCategories)
            .set({ code: generatedSubCode })
            .where(eq(subCategories.id, sub.id));
          subIndex++;
        }
      }
    } else {
      console.log("📦 Seeding categories & sub-categories with codes and price limits...");

      // Kategori 1: Elektronik
      const catElektronikId = crypto.randomUUID();
      await db.insert(categories).values({
        id: catElektronikId,
        code: "KAT-01",
        name: "Elektronik & Gadget",
      });

      await db.insert(subCategories).values([
        {
          id: crypto.randomUUID(),
          categoryId: catElektronikId,
          code: "SUB-01",
          name: "Komputer & Laptop",
          priceLimit: "25000000.00",
        },
        {
          id: crypto.randomUUID(),
          categoryId: catElektronikId,
          code: "SUB-02",
          name: "Smartphone & Tablet",
          priceLimit: "15000000.00",
        },
        {
          id: crypto.randomUUID(),
          categoryId: catElektronikId,
          code: "SUB-03",
          name: "Aksesoris & Kabel",
          priceLimit: "1000000.00",
        },
      ]);

      // Kategori 2: Peralatan Kantor (ATK)
      const catAtkId = crypto.randomUUID();
      await db.insert(categories).values({
        id: catAtkId,
        code: "KAT-02",
        name: "Peralatan Kantor (ATK)",
      });

      const subCatKertasId = crypto.randomUUID();
      await db.insert(subCategories).values([
        {
          id: subCatKertasId,
          categoryId: catAtkId,
          code: "SUB-04",
          name: "Kertas & Dokumen",
          priceLimit: "500000.00",
        },
        {
          id: crypto.randomUUID(),
          categoryId: catAtkId,
          code: "SUB-05",
          name: "Alat Tulis & Binder",
          priceLimit: "250000.00",
        },
        {
          id: crypto.randomUUID(),
          categoryId: catAtkId,
          code: "SUB-06",
          name: "Printer & Tinta",
          priceLimit: "4500000.00",
        },
      ]);

      // Kategori 3: Material Gudang & Peralatan
      const catMaterialId = crypto.randomUUID();
      await db.insert(categories).values({
        id: catMaterialId,
        code: "KAT-03",
        name: "Material Gudang & Logistik",
      });

      await db.insert(subCategories).values([
        {
          id: crypto.randomUUID(),
          categoryId: catMaterialId,
          code: "SUB-07",
          name: "Pallet & Kardus Kemasan",
          priceLimit: "2000000.00",
        },
        {
          id: crypto.randomUUID(),
          categoryId: catMaterialId,
          code: "SUB-08",
          name: "Lakban & Plastik Wrapping",
          priceLimit: "800000.00",
        },
      ]);

      // 5. Sample Barang Masuk
      const nowYear = new Date().getFullYear();
      await db.insert(incomingItems).values({
        id: crypto.randomUUID(),
        operatorId: operatorUser.id,
        categoryId: catAtkId,
        subCategoryId: subCatKertasId,
        itemOrigin: "PT Sinar Grafika Perkasa",
        letterNumber: `SJ-${nowYear}/001`,
        itemName: "Kertas HVS A4 80gr Rim",
        price: "55000.00",
        quantity: 20,
        unit: "Rim",
        totalPrice: "1100000.00",
        incomingDate: `${nowYear}-02-15`,
      });

      console.log("✅ Categories, Sub-categories, and sample Incoming Items seeded.");
    }

    console.log("🎉 Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await poolConnection.end();
    process.exit(0);
  }
}

seed();
