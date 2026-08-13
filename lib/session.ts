import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export const getSessionUser = async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
};

// Server-side page guard: sends signed-out visitors to the login screen.
export const requirePageUser = async (returnTo?: string): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  };
  return user;
};
