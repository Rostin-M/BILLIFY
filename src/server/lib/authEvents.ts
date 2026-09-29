import "server-only";

import { db } from "~/server/db";

export type AuthEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "LOGIN_RATE_LIMITED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_FAILED"
  | "PASSWORD_RESET_SUCCESS"
  | "PASSWORD_CHANGED"
  | "VERIFY_CODE_FAILED"
  | "SESSION_REVOKED";

/**
 * Registra un evento de autenticación. Nunca debe romper el flujo principal:
 * si falla la escritura solo se registra el error en el servidor.
 */
export async function logAuthEvent(event: {
  type: AuthEventType;
  email?: string | null;
  userId?: string | null;
  businessId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.authEvent.create({
      data: {
        type: event.type,
        email: event.email?.toLowerCase().slice(0, 254) ?? null,
        userId: event.userId ?? null,
        businessId: event.businessId ?? null,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("[authEvents] no se pudo registrar", event.type, error instanceof Error ? error.message : error);
  }
}
