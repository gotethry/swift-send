import type { Beneficiary, CreateBeneficiaryCommand, UpdateBeneficiaryCommand } from './domain';

export interface BeneficiaryRepository {
  findById(id: string): Promise<Beneficiary | null>;
  findByUserId(userId: string): Promise<Beneficiary[]>;
  findFavoritesByUserId(userId: string): Promise<Beneficiary[]>;
  create(command: CreateBeneficiaryCommand): Promise<Beneficiary>;
  update(id: string, command: UpdateBeneficiaryCommand): Promise<Beneficiary | null>;
  delete(id: string): Promise<boolean>;
}
