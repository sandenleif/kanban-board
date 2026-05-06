const required = ["DATABASE_URL", "JWT_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const secret = process.env.JWT_SECRET!;
if (secret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

if (
  process.env.NODE_ENV === "production" &&
  secret.includes("change-me")
) {
  throw new Error("JWT_SECRET must not use the default value in production");
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: secret,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
