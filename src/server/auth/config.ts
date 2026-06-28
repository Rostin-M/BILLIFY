import { PrismaAdapter } from "@auth/prisma-adapter";
import { type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

import { env } from "~/env";
import { db } from "~/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      businessId: string | null;
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

type BillifyJWT = {
  sub?: string;
  role?: UserRole;
  businessId?: string | null;
  isActive?: boolean;
  [key: string]: unknown;
};

type AuthorizeResult = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole;
  businessId: string | null;
  isActive: boolean;
};

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials): Promise<AuthorizeResult | null> {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            businessId: true,
            isActive: true,
            image: true,
          },
        });

        if (!user?.passwordHash || !user.isActive) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          businessId: user.businessId,
          isActive: user.isActive,
        };
      },
    }),
    ...(env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET
      ? [
          DiscordProvider({
            clientId: env.AUTH_DISCORD_ID,
            clientSecret: env.AUTH_DISCORD_SECRET,
          }),
        ]
      : []),
  ],
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as AuthorizeResult;
        const jwt = token as BillifyJWT;
        jwt.role = u.role;
        jwt.businessId = u.businessId;
        jwt.isActive = u.isActive;
      }
      return token;
    },
    session({ session, token }) {
      const jwt = token as BillifyJWT;
      return {
        ...session,
        user: {
          ...session.user,
          id: jwt.sub ?? "",
          role: jwt.role ?? "OWNER",
          businessId: jwt.businessId ?? null,
          isActive: jwt.isActive ?? true,
        },
      };
    },
  },
} satisfies NextAuthConfig;
