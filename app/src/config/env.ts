import "dotenv/config";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;
  if (process.env.MYSQL_PRIVATE_URL) return process.env.MYSQL_PRIVATE_URL;
  if (process.env.MYSQLHOST) {
    const user = process.env.MYSQLUSER || "root";
    const pass = process.env.MYSQLPASSWORD ? `:${encodeURIComponent(process.env.MYSQLPASSWORD)}` : "";
    const host = process.env.MYSQLHOST;
    const port = process.env.MYSQLPORT || 3306;
    const db = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || "railway";
    return `mysql://${user}${pass}@${host}:${port}/${db}`;
  }
  return "mysql://root:@localhost:3306/warehouse_db";
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: getDatabaseUrl(),
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ||
      "warehouse_access_token_secret_key_default",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      "warehouse_refresh_token_secret_key_default",
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || "15m",
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || "7d",
  },
};
