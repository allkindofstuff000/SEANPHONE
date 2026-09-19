// Loads and validates environment variables once, at startup.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  AUTH_COOKIE_NAME: z.string().default('pd_token'),

  // CPaaS provider. Defaults to Twilio when creds are present, else a mock
  // provider so the app is fully usable without a Twilio account. Force with
  // PROVIDER=mock or PROVIDER=twilio.
  PROVIDER: z.enum(['mock', 'twilio']).optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  SMS_COST_CREDITS: z.coerce.number().int().nonnegative().default(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
