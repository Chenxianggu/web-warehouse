import { hash, compare } from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "密码至少需要 12 个字符")
  .max(72, "密码过长")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "密码最多允许 72 字节");

export function hashPassword(password: string) {
  return hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
