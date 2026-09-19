import type { User } from '@prisma/client';

// The user shape safe to send to clients (never the password hash).
export type PublicUser = {
  id: string;
  email: string;
  role: User['role'];
  isActive: boolean;
  creditBalance: number;
  createdAt: Date;
};

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    creditBalance: u.creditBalance,
    createdAt: u.createdAt,
  };
}
