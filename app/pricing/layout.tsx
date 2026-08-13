import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/session";

const PricingLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await requirePageUser("/pricing");

  return (
    <AppShell
      appName="Pricing Calculator"
      appHref="/pricing"
      nav={[
        { href: "/pricing", label: "Documents" },
        { href: "/pricing/report", label: "Summary report" },
      ]}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
};

export default PricingLayout;
