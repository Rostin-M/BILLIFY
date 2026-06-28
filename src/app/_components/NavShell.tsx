"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import type { UserRole } from "./nav-config";

type Props = {
  role: UserRole;
  children: React.ReactNode;
};

export function NavShell({ role, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex">
      <Sidebar
        role={role}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}
