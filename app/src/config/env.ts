import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl:
    process.env.DATABASE_URL ||
    "mysql://root:@localhost:3306/warehouse_db",
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
