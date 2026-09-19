import type {
  PhoneProvider,
  SearchParams,
  BoughtNumber,
  SendSmsParams,
  SendSmsResult,
  InboundSms,
  AvailableNumber,
} from './types';

function randDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function randHex(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// A fully in-process provider so the whole app works without a Twilio account.
// Numbers, SIDs and sends are simulated; inbound can be simulated via the
// webhook endpoint or the dev-only simulate route.
export class MockProvider implements PhoneProvider {
  readonly name = 'mock';

  async searchNumbers({
    areaCode = '415',
    limit = 10,
  }: SearchParams): Promise<AvailableNumber[]> {
    const count = Math.min(Math.max(limit, 1), 20);
    return Array.from({ length: count }, () => {
      const num = `+1${areaCode}${randDigits(7)}`;
      return {
        e164Number: num,
        friendlyName: num,
        locality: 'Mock City',
        region: 'CA',
      };
    });
  }

  async buyNumber(e164Number: string): Promise<BoughtNumber> {
    return { e164Number, providerSid: `PNmock${randHex(30)}` };
  }

  async releaseNumber(): Promise<void> {
    // no-op
  }

  async sendSms(_params: SendSmsParams): Promise<SendSmsResult> {
    return { providerSid: `SMmock${randHex(30)}`, status: 'sent' };
  }

  validateInbound(): boolean {
    // No signature to validate in mock mode.
    return true;
  }

  parseInbound(body: Record<string, unknown>): InboundSms {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = body[k];
        if (v != null && v !== '') return String(v);
      }
      return '';
    };
    return {
      from: pick('From', 'from'),
      to: pick('To', 'to'),
      body: pick('Body', 'body'),
      providerSid: pick('MessageSid', 'messageSid', 'sid') || `SMmock${randHex(30)}`,
    };
  }
}
