"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui";
import { signOut } from "@/lib/auth-client";

// Ends the session and returns to the login screen.
//
// Lives in its own client component so server components — the landing page,
// for one — can offer sign-out without becoming client components themselves.
export const SignOutButton = ({
  variant = "secondary",
  size = "sm",
  className,
}: Pick<ButtonProps, "variant" | "size" | "className">) => {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleSignOut} loading={signingOut}>
      Sign out
    </Button>
  );
};
