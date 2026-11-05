import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  boolean,
  mysqlEnum,
  decimal,
  int,
  date,
} from "drizzle-orm/mysql-core";

export const UserRole = {
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

/**
 * Tabel Pengguna (Admin & Operator)
 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 })
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  password: text("password").notNull(),
  role: mysqlEnum("role", [UserRole.ADMIN, UserRole.OPERATOR])
    .default(UserRole.OPERATOR)
    .notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Tabel Refresh Token untuk Operator & Admin
 */
export const refreshTokens = mysqlTable("refresh_tokens", {
  id: varchar("id", { length: 36 })
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  token: varchar("token", { length: 500 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Tabel Master Kategori
 */
export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 })
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(), // Kode Kategori (maks 10, unique)
  name: varchar("name", { length: 100 }).notNull(), // Nama Kategori (maks 100)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Tabel Master Sub Kategori (termasuk Batas Harga)
 */
export const subCategories = mysqlTable("sub_categories", {
  id: varchar("id", { length: 36 })
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  categoryId: varchar("category_id", { length: 36 })
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(),
  code: varchar("code", { length: 10 }), // Kode Sub Kategori (opsional)
  name: varchar("name", { length: 100 }).notNull(), // Nama Sub Kategori (maks 100)
  priceLimit: decimal("price_limit", { precision: 15, scale: 2 }).notNull(), // Batas Harga
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Tabel Barang Masuk (Incoming Items)
 */
export const incomingItems = mysqlTable("incoming_items", {
  id: varchar("id", { length: 36 })
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),
  operatorId: varchar("operator_id", { length: 36 })
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  categoryId: varchar("category_id", { length: 36 })
    .references(() => categories.id, { onDelete: "restrict" })
    .notNull(),
  subCategoryId: varchar("sub_category_id", { length: 36 })
    .references(() => subCategories.id, { onDelete: "restrict" })
    .notNull(),
  itemOrigin: varchar("item_origin", { length: 200 }).notNull(), // Asal Barang (maks 200)
  letterNumber: varchar("letter_number", { length: 100 }), // Nomor Surat (maks 100)
  attachment: varchar("attachment", { length: 255 }), // Nama file/path lampiran
  attachmentOriginalName: varchar("attachment_original_name", { length: 255 }), // Nama asli file lampiran
  itemName: varchar("item_name", { length: 200 }).notNull(), // Nama Barang (maks 200)
  price: decimal("price", { precision: 15, scale: 2 }).notNull(), // Harga satuan (Rupiah)
  quantity: int("quantity").notNull(), // Jumlah Barang
  unit: varchar("unit", { length: 40 }).notNull(), // Satuan (maks 40)
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(), // Total (Harga * Jumlah)
  expiredDate: date("expired_date", { mode: "string" }), // Tgl Expired (opsional)
  incomingDate: date("incoming_date", { mode: "string" }).notNull(), // Tanggal Barang Masuk (untuk filter tahun)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// TypeScript Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type SubCategory = typeof subCategories.$inferSelect;
export type NewSubCategory = typeof subCategories.$inferInsert;
export type IncomingItem = typeof incomingItems.$inferSelect;
export type NewIncomingItem = typeof incomingItems.$inferInsert;
