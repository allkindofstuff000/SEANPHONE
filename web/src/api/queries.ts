import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type PhoneNumber = {
  id: string;
  e164Number: string;
  twilioSid: string | null;
  status: string;
  operationalStatus: 'active' | 'idle' | 'released';
  assignedUserId: string | null;
  assignedUser: { id: string; email: string } | null;
  messagesToday: number;
  lastActivityAt: string | null;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  contactNumber: string;
  workerNumber: { id: string; e164Number: string; assignedUserId: string | null };
  assignedWorker: { id: string; email: string } | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  unread: boolean;
  messageCount: number;
  lastMessage: {
    body: string;
    direction: 'inbound' | 'outbound';
    createdAt: string;
  } | null;
};

export type ConversationDetail = {
  id: string;
  contactNumber: string;
  workerNumber: { id: string; e164Number: string; assignedUserId: string | null };
  assignedWorker: { id: string; email: string } | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  messages: Message[];
};

// Query-key registry — used for fetching and for invalidation after mutations.
export const qk = {
  numbers: ['numbers'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  me: ['me'] as const,
};

export function usePhoneNumbers() {
  return useQuery({
    queryKey: qk.numbers,
    queryFn: () =>
      api.get<{ numbers: PhoneNumber[] }>('/numbers').then((r) => r.numbers),
    refetchInterval: 15_000,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () =>
      api
        .get<{ conversations: ConversationSummary[] }>('/conversations')
        .then((r) => r.conversations),
    refetchInterval: 10_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? qk.conversation(id) : ['conversation', 'none'],
    enabled: !!id,
    queryFn: () =>
      api
        .get<{ conversation: ConversationDetail }>(`/conversations/${id}`)
        .then((r) => r.conversation),
    refetchInterval: 5_000,
  });
}

export function useReleaseNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/numbers/${id}/release`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.numbers });
      qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/conversations/${id}/read`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      qc.invalidateQueries({ queryKey: qk.conversation(id) });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fromNumberId: string; toNumber: string; body: string }) =>
      api.post<{ message: Message }>('/messages', vars),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      qc.invalidateQueries({ queryKey: qk.numbers });
      qc.invalidateQueries({ queryKey: qk.me });
      if (data?.message?.conversationId) {
        qc.invalidateQueries({
          queryKey: qk.conversation(data.message.conversationId),
        });
      }
    },
  });
}

// Dev-only: simulate an inbound SMS (mock provider) so receiving is demoable.
export function useSimulateInbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { toNumber: string; fromNumber: string; body: string }) =>
      api.post('/dev/simulate-inbound', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      qc.invalidateQueries({ queryKey: qk.numbers });
    },
  });
}
