import { randomUUID } from 'crypto';
import type { Beneficiary, CreateBeneficiaryCommand, UpdateBeneficiaryCommand } from './domain';
import type { BeneficiaryRepository } from './repository';

export class InMemoryBeneficiaryRepository implements BeneficiaryRepository {
  private readonly store = new Map<string, Beneficiary>();

  async findById(id: string): Promise<Beneficiary | null> {
    return this.store.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Beneficiary[]> {
    return Array.from(this.store.values()).filter((b) => b.userId === userId);
  }

  async findFavoritesByUserId(userId: string): Promise<Beneficiary[]> {
    return Array.from(this.store.values()).filter(
      (b) => b.userId === userId && b.isFavorite,
    );
  }

  async create(command: CreateBeneficiaryCommand): Promise<Beneficiary> {
    const now = new Date().toISOString();
    const beneficiary: Beneficiary = {
      id: randomUUID(),
      userId: command.userId,
      name: command.name,
      identifier: command.identifier,
      identifierType: command.identifierType,
      walletAddress: command.walletAddress,
      nickname: command.nickname,
      isFavorite: false,
      country: command.country,
      currency: command.currency,
      tags: command.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(beneficiary.id, beneficiary);
    return beneficiary;
  }

  async update(id: string, command: UpdateBeneficiaryCommand): Promise<Beneficiary | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Beneficiary = {
      ...existing,
      ...command,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
