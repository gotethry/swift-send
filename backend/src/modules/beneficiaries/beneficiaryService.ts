import { createLogger } from '../../logger';
import type { Beneficiary, CreateBeneficiaryCommand, UpdateBeneficiaryCommand } from './domain';
import type { BeneficiaryRepository } from './repository';

export class BeneficiaryService {
  private readonly logger;

  constructor(private readonly repo: BeneficiaryRepository) {
    this.logger = createLogger({ component: 'beneficiaryService' });
  }

  async listBeneficiaries(userId: string): Promise<Beneficiary[]> {
    const all = await this.repo.findByUserId(userId);
    return all.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return b.isFavorite ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  async getFavorites(userId: string): Promise<Beneficiary[]> {
    return this.repo.findFavoritesByUserId(userId);
  }

  async createBeneficiary(command: CreateBeneficiaryCommand): Promise<Beneficiary> {
    const beneficiary = await this.repo.create(command);
    this.logger.info({ id: beneficiary.id, userId: beneficiary.userId }, 'beneficiary created');
    return beneficiary;
  }

  async updateBeneficiary(id: string, command: UpdateBeneficiaryCommand): Promise<Beneficiary> {
    const updated = await this.repo.update(id, command);
    if (!updated) throw new Error(`Beneficiary ${id} not found`);
    this.logger.info({ id }, 'beneficiary updated');
    return updated;
  }

  async toggleFavorite(id: string): Promise<Beneficiary> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(`Beneficiary ${id} not found`);
    return this.updateBeneficiary(id, { isFavorite: !existing.isFavorite });
  }

  async deleteBeneficiary(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new Error(`Beneficiary ${id} not found`);
    this.logger.info({ id }, 'beneficiary deleted');
  }
}
