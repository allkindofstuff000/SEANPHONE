// Single entry point for all CPaaS (Twilio) interaction. The rest of the app
// imports `provider` from here and never imports the Twilio SDK directly, so
// swapping to Telnyx later means adding one implementation and editing `build()`.
import { env } from '../env';
import type { PhoneProvider } from './provider/types';
import { MockProvider } from './provider/mock';
import { TwilioProvider } from './provider/twilioProvider';

export * from './provider/types';

function build(): PhoneProvider {
  const wantTwilio =
    env.PROVIDER === 'twilio' ||
    (env.PROVIDER == null &&
      !!env.TWILIO_ACCOUNT_SID &&
      !!env.TWILIO_AUTH_TOKEN);

  if (wantTwilio) {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw new Error(
        'PROVIDER=twilio but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set',
      );
    }
    return new TwilioProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return new MockProvider();
}

export const provider: PhoneProvider = build();

// The public URL Twilio should POST inbound SMS to. Undefined in local dev
// without a tunnel (the mock provider doesn't need it).
export function smsWebhookUrl(): string | undefined {
  return env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/webhooks/twilio/sms`
    : undefined;
}
