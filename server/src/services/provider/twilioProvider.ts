import twilio, { type Twilio } from 'twilio';
import type {
  PhoneProvider,
  SearchParams,
  BoughtNumber,
  SendSmsParams,
  SendSmsResult,
  InboundSms,
  AvailableNumber,
} from './types';

// twilio.validateRequest is attached to the module but not always in the types;
// grab it through a narrow cast so this file compiles regardless of SDK typings.
type ValidateFn = (
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
) => boolean;
const validateRequest = (twilio as unknown as { validateRequest: ValidateFn })
  .validateRequest;

export class TwilioProvider implements PhoneProvider {
  readonly name = 'twilio';
  private client: Twilio;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
  }

  async searchNumbers({
    areaCode,
    country = 'US',
    contains,
    limit = 10,
  }: SearchParams): Promise<AvailableNumber[]> {
    const list = await this.client
      .availablePhoneNumbers(country)
      .local.list({
        areaCode: areaCode ? Number(areaCode) : undefined,
        contains,
        smsEnabled: true,
        limit,
      });
    return list.map((n) => ({
      e164Number: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality,
      region: n.region,
    }));
  }

  async buyNumber(
    e164Number: string,
    opts: { smsWebhookUrl?: string },
  ): Promise<BoughtNumber> {
    const res = await this.client.incomingPhoneNumbers.create({
      phoneNumber: e164Number,
      smsUrl: opts.smsWebhookUrl,
      smsMethod: 'POST',
    });
    return { e164Number: res.phoneNumber, providerSid: res.sid };
  }

  async releaseNumber(providerSid: string): Promise<void> {
    await this.client.incomingPhoneNumbers(providerSid).remove();
  }

  async configureNumberWebhooks(
    providerSid: string,
    opts: { smsWebhookUrl?: string },
  ): Promise<void> {
    await this.client.incomingPhoneNumbers(providerSid).update({
      smsUrl: opts.smsWebhookUrl,
      smsMethod: 'POST',
    });
  }

  async findOwnedNumber(e164Number: string): Promise<BoughtNumber | null> {
    const list = await this.client.incomingPhoneNumbers.list({
      phoneNumber: e164Number,
      limit: 1,
    });
    const n = list[0];
    return n ? { e164Number: n.phoneNumber, providerSid: n.sid } : null;
  }

  async sendSms({
    from,
    to,
    body,
    statusCallbackUrl,
  }: SendSmsParams): Promise<SendSmsResult> {
    const msg = await this.client.messages.create({
      from,
      to,
      body,
      statusCallback: statusCallbackUrl,
    });
    return { providerSid: msg.sid, status: msg.status };
  }

  validateInbound({
    signature,
    url,
    params,
  }: {
    signature?: string;
    url: string;
    params: Record<string, unknown>;
  }): boolean {
    if (!signature) return false;
    return validateRequest(
      this.authToken,
      signature,
      url,
      params as Record<string, string>,
    );
  }

  parseInbound(body: Record<string, unknown>): InboundSms {
    return {
      from: String(body.From ?? ''),
      to: String(body.To ?? ''),
      body: String(body.Body ?? ''),
      providerSid: String(body.MessageSid ?? ''),
    };
  }
}
