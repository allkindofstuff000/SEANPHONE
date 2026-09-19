// Provider-agnostic types. The rest of the app imports the provider through
// providerService.ts and never touches Twilio (or Telnyx) directly.

export type AvailableNumber = {
  e164Number: string;
  friendlyName?: string;
  locality?: string;
  region?: string;
};

export type SearchParams = {
  areaCode?: string;
  country?: string; // ISO country, default US
  contains?: string;
  limit?: number;
};

export type BoughtNumber = {
  e164Number: string;
  providerSid: string;
};

export type SendSmsParams = {
  from: string;
  to: string;
  body: string;
  statusCallbackUrl?: string;
};

export type SendSmsResult = {
  providerSid: string;
  status: string;
};

export type InboundSms = {
  from: string;
  to: string;
  body: string;
  providerSid: string;
};

export type StatusUpdate = {
  providerSid: string;
  status: string; // raw provider status: queued/sent/delivered/failed/undelivered
  errorCode?: string;
};

export interface PhoneProvider {
  readonly name: string;

  searchNumbers(params: SearchParams): Promise<AvailableNumber[]>;
  buyNumber(
    e164Number: string,
    opts: { smsWebhookUrl?: string },
  ): Promise<BoughtNumber>;
  releaseNumber(providerSid: string): Promise<void>;
  // Re-apply a number's webhook config on the provider (idempotent).
  configureNumberWebhooks(
    providerSid: string,
    opts: { smsWebhookUrl?: string },
  ): Promise<void>;
  // Look up a number already owned on the provider account, so an existing /
  // trial number can be imported instead of bought. Returns null if not found.
  findOwnedNumber(e164Number: string): Promise<BoughtNumber | null>;
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;

  // Inbound webhook helpers (normalize per-provider payloads/signatures).
  validateInbound(opts: {
    signature?: string;
    url: string;
    params: Record<string, unknown>;
  }): boolean;
  parseInbound(body: Record<string, unknown>): InboundSms;
  parseStatus(body: Record<string, unknown>): StatusUpdate;
}
