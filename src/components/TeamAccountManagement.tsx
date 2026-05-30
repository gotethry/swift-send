import { Users, UserPlus, Shield, Crown, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type TeamRole = 'owner' | 'admin' | 'operator';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

interface TeamAccountManagementProps {
  members?: TeamMember[];
  onInvite?: () => void;
  onChangeRole?: (id: string, role: TeamRole) => void;
  onRemove?: (id: string) => void;
}

const ROLE_META: Record<TeamRole, { label: string; icon: React.ReactNode; color: string }> = {
  owner:    { label: 'Owner',    icon: <Crown    className="h-3 w-3" />, color: 'text-yellow-600' },
  admin:    { label: 'Admin',    icon: <Shield   className="h-3 w-3" />, color: 'text-blue-600'   },
  operator: { label: 'Operator', icon: <Wrench   className="h-3 w-3" />, color: 'text-green-600'  },
};

const DEFAULT_MEMBERS: TeamMember[] = [
  { id: '1', name: 'Alice Johnson', email: 'alice@corp.com', role: 'owner',    joinedAt: '2024-01' },
  { id: '2', name: 'Bob Smith',     email: 'bob@corp.com',   role: 'admin',    joinedAt: '2024-03' },
  { id: '3', name: 'Carol White',   email: 'carol@corp.com', role: 'operator', joinedAt: '2024-06' },
];

export function TeamAccountManagement({
  members = DEFAULT_MEMBERS,
  onInvite,
  onChangeRole,
  onRemove,
}: TeamAccountManagementProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Team Management</h2>
        </div>
        <button
          onClick={onInvite}
          className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" /> Invite
        </button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {members.map((m) => {
            const meta = ROLE_META[m.role];
            return (
              <div key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                    {meta.icon} {meta.label}
                  </span>
                  {m.role !== 'owner' && (
                    <div className="flex items-center gap-1">
                      {onChangeRole && (
                        <select
                          value={m.role}
                          onChange={(e) => onChangeRole(m.id, e.target.value as TeamRole)}
                          className="text-xs border rounded px-1 py-0.5 bg-background"
                        >
                          <option value="admin">Admin</option>
                          <option value="operator">Operator</option>
                        </select>
                      )}
                      {onRemove && (
                        <button
                          onClick={() => onRemove(m.id)}
                          className="text-xs text-destructive hover:underline ml-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
