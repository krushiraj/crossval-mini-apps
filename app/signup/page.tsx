import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/session";

const SignupPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) => {
  const user = await getSessionUser();
  const { next } = await searchParams;
  const destination = next && next.startsWith("/") ? next : "/";

  if (user) {
    redirect(destination);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <AuthForm mode="signup" next={destination} />
    </div>
  );
};

export default SignupPage;
