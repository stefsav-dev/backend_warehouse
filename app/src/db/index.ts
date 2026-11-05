import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "../config/env";
import * as schema from "./schema";

/**
 * Memastikan database sudah ada di server MySQL sebelum membuka koneksi pool
 */
async function ensureDatabaseExists() {
  try {
    const url = new URL(config.databaseUrl);
    const dbName = url.pathname.replace(/^\//, "");
    if (!dbName) return;

    // Buat koneksi sementara tanpa database spesifik untuk CREATE DATABASE IF NOT EXISTS
    const tempConn = await mysql.createConnection({
      host: url.hostname || "localhost",
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username || "root"),
      password: decodeURIComponent(url.password || ""),
      connectTimeout: 4000,
    });

    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await tempConn.end();
  } catch (err: any) {
    // Jika tidak dapat koneksi sementara, biarkan poolConnection mencoba
  }
}

// Connection pool MySQL
export const poolConnection = mysql.createPool({
  uri: config.databaseUrl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Instance Drizzle ORM
export const db = drizzle(poolConnection, { schema, mode: "default" });

/**
 * Helper untuk membuat index secara aman di MySQL tanpa error syntax IF NOT EXISTS
 */
async function createIndexSafe(
  conn: any,
  tableName: string,
  indexName: string,
  columns: string
) {
  try {
    const [rows]: any = await conn.query(
      `SELECT 1 FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
       LIMIT 1;`,
      [tableName, indexName]
    );
    if (!rows || rows.length === 0) {
      await conn.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns});`);
    }
  } catch (e) {
    // Abaikan jika index sudah ada
  }
}

/**
 * Helper untuk menambahkan kolom secara aman di MySQL jika belum ada
 */
async function addColumnSafe(
  conn: any,
  tableName: string,
  columnName: string,
  columnDef: string
) {
  try {
    const [rows]: any = await conn.query(
      `SELECT 1 FROM information_schema.columns 
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
       LIMIT 1;`,
      [tableName, columnName]
    );
    if (!rows || rows.length === 0) {
      await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDef};`);
    }
  } catch (e) {
    // Abaikan jika kolom sudah ada
  }
}

/**
 * Otomatis membuat tabel-tabel di MySQL jika belum ada
 */
export async function initDatabase() {
  try {
    await ensureDatabaseExists();

    const conn = await poolConnection.getConnection();

    try {
      // 1. Tabel users
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          username VARCHAR(100) NOT NULL UNIQUE,
          email VARCHAR(255) UNIQUE,
          password TEXT NOT NULL,
          role ENUM('ADMIN', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR',
          is_locked BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Migrasi kolom is_locked jika belum ada
      await addColumnSafe(conn, "users", "is_locked", "BOOLEAN NOT NULL DEFAULT false AFTER role");

      // 2. Tabel refresh_tokens
      await conn.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          token VARCHAR(500) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          revoked BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 3. Tabel categories (Master Kategori)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id VARCHAR(36) PRIMARY KEY,
          code VARCHAR(10) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Migrasi kolom code jika belum ada
      await addColumnSafe(conn, "categories", "code", "VARCHAR(10) UNIQUE AFTER id");

      // 4. Tabel sub_categories (Master Sub Kategori dengan Batas Harga)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS sub_categories (
          id VARCHAR(36) PRIMARY KEY,
          category_id VARCHAR(36) NOT NULL,
          code VARCHAR(10) NULL,
          name VARCHAR(100) NOT NULL,
          price_limit DECIMAL(15,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT fk_sub_category_parent FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Migrasi kolom code jika belum ada
      await addColumnSafe(conn, "sub_categories", "code", "VARCHAR(10) UNIQUE AFTER category_id");

      // 5. Tabel incoming_items (Data Barang Masuk)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS incoming_items (
          id VARCHAR(36) PRIMARY KEY,
          operator_id VARCHAR(36) NOT NULL,
          category_id VARCHAR(36) NOT NULL,
          sub_category_id VARCHAR(36) NOT NULL,
          item_origin VARCHAR(200) NOT NULL,
          letter_number VARCHAR(100) NULL,
          attachment VARCHAR(255) NULL,
          attachment_original_name VARCHAR(255) NULL,
          item_name VARCHAR(200) NOT NULL,
          price DECIMAL(15,2) NOT NULL,
          quantity INT NOT NULL,
          unit VARCHAR(40) NOT NULL,
          total_price DECIMAL(15,2) NOT NULL,
          expired_date DATE NULL,
          incoming_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT fk_incoming_operator FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT fk_incoming_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
          CONSTRAINT fk_incoming_sub_category FOREIGN KEY (sub_category_id) REFERENCES sub_categories(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Migrasi aman kolom letter_number jika tabel dibuat dengan kolom camelCase letterNumber
      try {
        const [hasCol]: any = await conn.query(
          "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'incoming_items' AND column_name = 'letter_number';"
        );
        if (!hasCol || hasCol.length === 0) {
          const [hasOldCol]: any = await conn.query(
            "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'incoming_items' AND column_name = 'letterNumber';"
          );
          if (hasOldCol && hasOldCol.length > 0) {
            await conn.query("ALTER TABLE `incoming_items` CHANGE COLUMN `letterNumber` `letter_number` VARCHAR(100) NULL;");
            console.log("✅ Migrated column letterNumber -> letter_number in incoming_items");
          } else {
            await conn.query("ALTER TABLE `incoming_items` ADD COLUMN `letter_number` VARCHAR(100) NULL AFTER `item_origin`;");
            console.log("✅ Added column letter_number in incoming_items");
          }
        }
      } catch (err: any) {
        console.warn("⚠️ Column migration warning for letter_number:", err.message);
      }

      // Index untuk optimasi pencarian & filter secara aman di MySQL
      await createIndexSafe(conn, "categories", "idx_categories_code", "code");
      await createIndexSafe(conn, "sub_categories", "idx_sub_categories_code", "code");
      await createIndexSafe(conn, "incoming_items", "idx_incoming_category_id", "category_id");
      await createIndexSafe(conn, "incoming_items", "idx_incoming_sub_category_id", "sub_category_id");
      await createIndexSafe(conn, "incoming_items", "idx_incoming_operator_id", "operator_id");
      await createIndexSafe(conn, "incoming_items", "idx_incoming_date", "incoming_date");

      console.log("✅ MySQL database & tables verified and initialized successfully.");
    } finally {
      conn.release();
    }
  } catch (error: any) {
    console.error("⚠️ Failed to auto-initialize MySQL database tables:", error.message || error);
    throw error;
  }
}
