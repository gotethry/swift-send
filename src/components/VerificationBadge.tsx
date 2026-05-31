import { CheckCircle2, Shield, Zap, Building2, UserPlus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type BadgeType = 'verified_recipient' | 'trusted_recipient' | 'frequent_recipient' | 'business_verified' | 'new_recipient';

export interface VerificationBadgeData {
  type: BadgeType;
  label: string;
  description: string;
  color: string;
  level: number;
}

const badgeIcons: Record<BadgeType, LucideIcon> = {
  verified_recipient: CheckCircle2,
  trusted_recipient: Shield,
  frequent_recipient: Zap,
  business_verified: Building2,
  new_recipient: UserPlus,
};

interface VerificationBadgeProps {
  badge: VerificationBadgeData;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: { icon: 'w-3 h-3', text: 'text-[10px]', gap: 'gap-1' },
  md: { icon: 'w-4 h-4', text: 'text-xs', gap: 'gap-1.5' },
  lg: { icon: 'w-5 h-5', text: 'text-sm', gap: 'gap-2' },
};

export function VerificationBadge({ badge, size = 'sm', showLabel = true, className }: VerificationBadgeProps) {
  const Icon = badgeIcons[badge.type] || CheckCircle2;
  const sizes = sizeClasses[size];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
              'bg-muted/50 border border-border/50',
              sizes.gap,
              className,
            )}
          >
            <Icon className={cn(sizes.icon, badge.color)} />
            {showLabel && (
              <span className={cn(sizes.text, 'text-foreground')}>
                {badge.label}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs font-medium">{badge.label}</p>
          <p className="text-xs text-muted-foreground">{badge.description}</p>
          {badge.level > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Level {badge.level} trust</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface BadgeListProps {
  badges: VerificationBadgeData[];
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  limit?: number;
  className?: string;
}

export function BadgeList({ badges, size = 'sm', showLabel = true, limit, className }: BadgeListProps) {
  const displayBadges = limit ? badges.slice(0, limit) : badges;
  const remaining = limit ? Math.max(0, badges.length - limit) : 0;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {displayBadges.map((badge) => (
        <VerificationBadge key={badge.type} badge={badge} size={size} showLabel={showLabel} />
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/50 border border-border/50 text-muted-foreground">
          +{remaining}
        </span>
      )}
    </div>
  );
}
