"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui";
import { signOut } from "@/lib/auth-client";

// Its own client component so server pages can offer sign-out.
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
