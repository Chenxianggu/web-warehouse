"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  const rememberLogin = formData.get("remember") === "on";

  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      remember: rememberLogin ? "on" : "off",
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      redirect("/login?error=credentials");
    }
    throw error;
  }
}
