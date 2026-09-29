import "server-only";

import { type UserRole } from "@prisma/client";
import { type Session } from "next-auth";
import { cache } from "react";

import { db } from "~/server/db";
import { SESSION_MAX_AGE_SEC } from "./sessionPolicy";

export { SESSION_MAX_AGE_SEC };

export type ActiveUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  businessId: string | null;
  canManageCash: boolean;
  mustChangePassword: boolean;
  /** Epoch ms en que vence la sesión (loginAt + 24 h). */
  sessionExpiresAt: number;
};

/**
 * Revalida la sesión JWT contra la base de datos. El JWT solo prueba quién
 * inició sesión; rol, negocio y estado se leen siempre frescos para que
 * desactivar a un empleado o cambiarle el rol tenga efecto inmediato.
 *
 * Devuelve null si: no hay sesión, venció el plazo absoluto de 24 h,
 * el usuario no existe o está inactivo, o su sessionVersion cambió
 * (cambio de contraseña, desactivación, cambio de rol).
 */
export const loadActiveUser = cache(
  async (session: Session | null): Promise<ActiveUser | null> => {
    const sessionUser = session?.user;
    if (!sessionUser?.id) return null;

    const loginAt = sessionUser.loginAt;
    if (typeof loginAt !== "number") return null;
    const sessionExpiresAt = loginAt + SESSION_MAX_AGE_SEC * 1000;
    if (Date.now() >= sessionExpiresAt) return null;

    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true,
        isActive: true,
        canManageCash: true,
        mustChangePassword: true,
        sessionVersion: true,
      },
    });

    if (!user?.isActive) return null;
    if (user.sessionVersion !== sessionUser.sessionVersion) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      canManageCash: user.canManageCash,
      mustChangePassword: user.mustChangePassword,
      sessionExpiresAt,
    };
  },
);
