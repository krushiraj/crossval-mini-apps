import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/session";

const OrdersLayout = async ({ children }: { children: ReactNode }) => {
  const user = await requirePageUser("/orders");

  return (
    <AppShell
      appName="Orders & Settlements"
      appHref="/orders"
      nav={[{ href: "/orders", label: "Dashboard" }]}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
};

export default OrdersLayout;
