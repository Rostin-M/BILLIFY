import "server-only";

import { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authorizeCredentials } from "./credentials";
import { edgeAuthConfig } from "./edge.config";

/**
 * Configuración completa (Node): la de Edge + el proveedor de credenciales,
 * que necesita Prisma y bcrypt. Sin adapter: la estrategia es JWT y las
 * tablas Account/Session/VerificationToken ya no existen.
 */
export const authConfig = {
  ...edgeAuthConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: (credentials, request) => authorizeCredentials(credentials, request),
    }),
  ],
} satisfies NextAuthConfig;
