export type IdentifierType = 'email' | 'phone' | 'wallet';

export interface Beneficiary {
  id: string;
  userId: string;
  name: string;
  identifier: string;
  identifierType: IdentifierType;
  walletAddress?: string;
  nickname?: string;
  isFavorite: boolean;
  country?: string;
  currency?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBeneficiaryCommand {
  userId: string;
  name: string;
  identifier: string;
  identifierType: IdentifierType;
  walletAddress?: string;
  nickname?: string;
  country?: string;
  currency?: string;
  tags?: string[];
}

export interface UpdateBeneficiaryCommand {
  name?: string;
  nickname?: string;
  isFavorite?: boolean;
  country?: string;
  currency?: string;
  tags?: string[];
}
