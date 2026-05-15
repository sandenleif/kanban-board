import { z } from "zod";

const emailField = z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim());

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Login accepts either a full email or a plain username (e.g. "leif.sanden")
export const loginSchema = z.object({
  email: z.string().min(1, "Username or email required").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
