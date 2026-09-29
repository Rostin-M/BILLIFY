/**
 * Configuración de NextAuth apta para el Edge runtime (middleware).
 *
 * IMPORTANTE: no importar Prisma, bcrypt, node:crypto, "server-only" ni `~/env`
 * aquí. El middleware solo puede verificar la firma y el plazo del JWT; la
 * revalidación contra la BD (isActive, sessionVersion, rol) ocurre en
 * `loadActiveUser` (páginas, tRPC y route handlers).
 */
import { type UserRole } from "@prisma/client";
import { type DefaultSession, type NextAuthConfig } from "next-auth";

import { isLoginFresh, SESSION_MAX_AGE_SEC } from "./sessionPolicy";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      businessId: string | null;
      isActive: boolean;
      /** Epoch ms del login; la sesión vence 24 h después (ver currentUser.ts). */
      loginAt: number;
      /** Debe coincidir con User.sessionVersion en la BD; si no, la sesión se invalida. */
      sessionVersion: number;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

/** Campos que `authorize` (credentials.ts) devuelve y que se copian al JWT. */
export type AuthorizedUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: UserRole;
  businessId: string | null;
  isActive: boolean;
  sessionVersion: number;
  mustChangePassword: boolean;
};

type BillifyJWT = {
  sub?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  role?: UserRole;
  businessId?: string | null;
  isActive?: boolean;
  /** Epoch ms del login. Nunca se renueva: fija el vencimiento absoluto. */
  loginAt?: number;
  /** sessionVersion del usuario al iniciar sesión. */
  sv?: number;
  mustChangePassword?: boolean;
  [key: string]: unknown;
};

const ROLES: readonly UserRole[] = ["OWNER", "CASHIER"];

/** Un token es válido solo si trae todos los campos que emitimos en el login. */
function isCompleteToken(jwt: BillifyJWT): boolean {
  return (
    typeof jwt.sub === "string" &&
    jwt.sub.length > 0 &&
    typeof jwt.role === "string" &&
    ROLES.includes(jwt.role) &&
    typeof jwt.sv === "number" &&
    jwt.isActive === true &&
    typeof jwt.mustChangePassword === "boolean" &&
    isLoginFresh(jwt.loginAt)
  );
}

export const edgeAuthConfig = {
  providers: [],
  pages: { signIn: "/auth/login" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC },
  jwt: { maxAge: SESSION_MAX_AGE_SEC },
  callbacks: {
    jwt({ token, user }) {
      const jwt = token as BillifyJWT;

      if (user) {
        // Inicio de sesión: fija loginAt una sola vez. Las renovaciones
        // posteriores del cookie conservan este valor, así que el plazo
        // absoluto de 24 h nunca se extiende.
        const u = user as unknown as AuthorizedUser;
        jwt.loginAt = Date.now();
        jwt.sv = u.sessionVersion;
        jwt.role = u.role;
        jwt.businessId = u.businessId;
        jwt.isActive = u.isActive;
        jwt.mustChangePassword = u.mustChangePassword;
        return isCompleteToken(jwt) ? jwt : null;
      }

      // Llamadas posteriores: null borra el cookie de sesión (Auth.js
      // limpia el sessionStore cuando el callback jwt devuelve null).
      // Se ignora `trigger: "update"`: el cliente no puede modificar el token.
      return isCompleteToken(jwt) ? jwt : null;
    },
    session({ session, token }) {
      // isCompleteToken ya garantizó todos los campos en el callback jwt.
      const jwt = token as BillifyJWT & {
        sub: string;
        role: UserRole;
        loginAt: number;
        sv: number;
        mustChangePassword: boolean;
      };
      return {
        ...session,
        user: {
          ...session.user,
          id: jwt.sub,
          role: jwt.role,
          businessId: jwt.businessId ?? null,
          isActive: jwt.isActive === true,
          loginAt: jwt.loginAt,
          sessionVersion: jwt.sv,
          mustChangePassword: jwt.mustChangePassword,
        },
      };
    },
  },
} satisfies NextAuthConfig;
