import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { config } from "../config/env";
import { UserRoleType } from "../db/schema";

export interface JWTPayload {
  id: string;
  username: string;
  role: UserRoleType;
  jti?: string;
}

export const jwtPlugin = new Elysia({ name: "jwtPlugin" })
  .use(
    jwt({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      exp: config.jwt.accessExpiration,
    })
  )
  .use(
    jwt({
      name: "refreshJwt",
      secret: config.jwt.refreshSecret,
      exp: config.jwt.refreshExpiration,
    })
  );
