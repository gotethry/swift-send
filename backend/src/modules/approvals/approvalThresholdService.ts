import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

export type ThresholdRuleAction = 'require_approval' | 'require_second_approval' | 'require_compliance_review' | 'block' | 'allow';
export type ThresholdRuleCondition = 'amount_above' | 'amount_below' | 'amount_range' | 'destination_country' | 'risk_score' | 'user_tier' | 'daily_volume';

export interface ThresholdRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  condition: ThresholdRuleCondition;
  config: Record<string, unknown>;
  action: ThresholdRuleAction;
  approvalLevel: number;
  notifyAdmins: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ApprovalLevel {
  level: number;
  name: string;
  description: string;
  requiredApprovers: number;
  approverRoles: string[];
}

const DEFAULT_LEVELS: ApprovalLevel[] = [
  { level: 1, name: 'Standard', description: 'Requires one admin approval', requiredApprovers: 1, approverRoles: ['admin'] },
  { level: 2, name: 'Enhanced', description: 'Requires two admin approvals', requiredApprovers: 2, approverRoles: ['admin', 'senior_admin'] },
  { level: 3, name: 'Executive', description: 'Requires three senior approvals', requiredApprovers: 3, approverRoles: ['senior_admin', 'compliance_officer'] },
];

export class ApprovalThresholdService {
  private rules: ThresholdRule[] = [];
  private approvalLevels: ApprovalLevel[] = DEFAULT_LEVELS;

  constructor() {
    this.seedDefaultRules();
  }

  private seedDefaultRules() {
    const now = new Date().toISOString();
    this.rules = [
      {
        id: 'rule_default_1',
        name: 'Large Transfer',
        description: 'Transfers above $10,000 require approval',
        enabled: true,
        priority: 100,
        condition: 'amount_above',
        config: { amount: 10000, currency: 'USDC' },
        action: 'require_approval',
        approvalLevel: 1,
        notifyAdmins: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rule_default_2',
        name: 'Very Large Transfer',
        description: 'Transfers above $50,000 require second-level approval',
        enabled: true,
        priority: 90,
        condition: 'amount_above',
        config: { amount: 50000, currency: 'USDC' },
        action: 'require_second_approval',
        approvalLevel: 2,
        notifyAdmins: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rule_default_3',
        name: 'High-Risk Destination',
        description: 'Transfers to restricted countries require compliance review',
        enabled: true,
        priority: 80,
        condition: 'destination_country',
        config: { countries: ['RU', 'BY', 'IR', 'KP', 'VE', 'CU'] },
        action: 'require_compliance_review',
        approvalLevel: 1,
        notifyAdmins: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rule_default_4',
        name: 'Block High Risk',
        description: 'High risk score transfers are blocked',
        enabled: true,
        priority: 70,
        condition: 'risk_score',
        config: { minScore: 80, maxScore: 100 },
        action: 'block',
        approvalLevel: 0,
        notifyAdmins: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rule_default_5',
        name: 'Small Transfer Bypass',
        description: 'Transfers under $500 skip approval',
        enabled: true,
        priority: 60,
        condition: 'amount_below',
        config: { amount: 500, currency: 'USDC' },
        action: 'allow',
        approvalLevel: 0,
        notifyAdmins: false,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  getRules(): ThresholdRule[] {
    return [...this.rules].sort((a, b) => b.priority - a.priority);
  }

  getRuleById(ruleId: string): ThresholdRule | undefined {
    return this.rules.find((r) => r.id === ruleId);
  }

  createRule(input: {
    name: string;
    description: string;
    condition: ThresholdRuleCondition;
    config: Record<string, unknown>;
    action: ThresholdRuleAction;
    approvalLevel: number;
    priority: number;
    notifyAdmins: boolean;
    createdBy?: string;
  }): ThresholdRule {
    const now = new Date().toISOString();
    const rule: ThresholdRule = {
      id: `threshold_rule_${uuidv4().slice(0, 8)}`,
      name: input.name,
      description: input.description,
      enabled: true,
      priority: input.priority,
      condition: input.condition,
      config: input.config,
      action: input.action,
      approvalLevel: input.approvalLevel,
      notifyAdmins: input.notifyAdmins,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    };

    this.rules.push(rule);
    return rule;
  }

  updateRule(ruleId: string, input: Partial<Omit<ThresholdRule, 'id' | 'createdAt' | 'createdBy'>>): ThresholdRule | null {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) return null;

    if (input.name !== undefined) rule.name = input.name;
    if (input.description !== undefined) rule.description = input.description;
    if (input.enabled !== undefined) rule.enabled = input.enabled;
    if (input.priority !== undefined) rule.priority = input.priority;
    if (input.condition !== undefined) rule.condition = input.condition;
    if (input.config !== undefined) rule.config = input.config;
    if (input.action !== undefined) rule.action = input.action;
    if (input.approvalLevel !== undefined) rule.approvalLevel = input.approvalLevel;
    if (input.notifyAdmins !== undefined) rule.notifyAdmins = input.notifyAdmins;

    rule.updatedAt = new Date().toISOString();
    return rule;
  }

  deleteRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }

  toggleRule(ruleId: string): ThresholdRule | null {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) return null;
    rule.enabled = !rule.enabled;
    rule.updatedAt = new Date().toISOString();
    return rule;
  }

  getApprovalLevels(): ApprovalLevel[] {
    return this.approvalLevels;
  }

  evaluateRules(transfer: {
    amount: number;
    currency?: string;
    destinationCountry?: string;
    riskScore?: number;
    userTier?: string;
    dailyVolume?: number;
  }): Array<{ rule: ThresholdRule; matched: boolean }> {
    const sortedRules = [...this.rules]
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    return sortedRules.map((rule) => {
      let matched = false;

      switch (rule.condition) {
        case 'amount_above':
          matched = transfer.amount > (rule.config.amount as number);
          break;
        case 'amount_below':
          matched = transfer.amount < (rule.config.amount as number);
          break;
        case 'amount_range':
          matched = transfer.amount >= (rule.config.minAmount as number || 0)
            && transfer.amount <= (rule.config.maxAmount as number || Infinity);
          break;
        case 'destination_country':
          matched = (rule.config.countries as string[] || [])
            .some((c) => c === transfer.destinationCountry?.toUpperCase());
          break;
        case 'risk_score':
          matched = (transfer.riskScore || 0) >= (rule.config.minScore as number || 0)
            && (transfer.riskScore || 0) <= (rule.config.maxScore as number || 100);
          break;
        case 'user_tier':
          matched = (rule.config.tiers as string[] || [])
            .some((t) => t === transfer.userTier);
          break;
        case 'daily_volume':
          matched = (transfer.dailyVolume || 0) > (rule.config.volume as number || 0);
          break;
      }

      return { rule, matched };
    });
  }

  getHighestRequiredLevel(amount: number, destinationCountry?: string, riskScore?: number): number {
    const results = this.evaluateRules({ amount, destinationCountry, riskScore });

    let maxLevel = 0;
    for (const { rule, matched } of results) {
      if (matched && rule.approvalLevel > maxLevel) {
        maxLevel = rule.approvalLevel;
      }
    }

    return maxLevel;
  }
}
