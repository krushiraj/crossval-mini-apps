import { requirePageUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

const PlannerLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await requirePageUser("/planner");

  return (
    <AppShell
      appName="Plan vs Actual"
      appHref="/planner"
      nav={[
        { href: "/planner", label: "Plans & actuals" },
        { href: "/planner/report", label: "Report" },
        { href: "/planner/categories", label: "Categories" },
      ]}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
};

export default PlannerLayout;
