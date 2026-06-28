import Link from "next/link";

import { auth } from "~/server/auth";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export async function AppHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/90">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo size="sm" />
        <span className="text-sm font-bold tracking-[0.2em] text-slate-800 dark:text-white">
          BILLIFY
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {session?.user && (
          <UserMenu
            name={session.user.name ?? null}
            role={session.user.role}
          />
        )}
      </div>
    </header>
  );
}
