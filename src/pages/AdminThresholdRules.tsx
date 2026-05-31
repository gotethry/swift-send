import { useCallback, useEffect, useState } from 'react';
import { Shield, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface ThresholdRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  condition: string;
  config: Record<string, unknown>;
  action: string;
  approvalLevel: number;
  notifyAdmins: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface ApprovalLevel {
  level: number;
  name: string;
  description: string;
  requiredApprovers: number;
  approverRoles: string[];
}

const defaultFormData = {
  name: '',
  description: '',
  condition: 'amount_above',
  config: '{}',
  action: 'require_approval',
  approvalLevel: 1,
  priority: 50,
  notifyAdmins: true,
};

export default function AdminThresholdRules() {
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [levels, setLevels] = useState<ApprovalLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultFormData);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, levelsRes] = await Promise.all([
        apiFetch('/admin/thresholds'),
        apiFetch('/admin/thresholds/levels'),
      ]);
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (levelsRes.ok) setLevels(await levelsRes.json());
    } catch (error) {
      console.error('Failed to load thresholds:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(defaultFormData);
    setShowDialog(true);
  };

  const openEdit = (rule: ThresholdRule) => {
    setEditingId(rule.id);
    setFormData({
      name: rule.name,
      description: rule.description,
      condition: rule.condition,
      config: JSON.stringify(rule.config, null, 2),
      action: rule.action,
      approvalLevel: rule.approvalLevel,
      priority: rule.priority,
      notifyAdmins: rule.notifyAdmins,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      description: formData.description,
      condition: formData.condition,
      config: JSON.parse(formData.config || '{}'),
      action: formData.action,
      approvalLevel: formData.approvalLevel,
      priority: formData.priority,
      notifyAdmins: formData.notifyAdmins,
    };

    const url = editingId
      ? `/admin/thresholds/${editingId}`
      : '/admin/thresholds';
    const method = editingId ? 'PUT' : 'POST';

    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setShowDialog(false);
      void fetchData();
    }
  };

  const handleDelete = async (ruleId: string) => {
    const response = await apiFetch(`/admin/thresholds/${ruleId}`, { method: 'DELETE' });
    if (response.ok) {
      void fetchData();
    }
  };

  const handleToggle = async (ruleId: string) => {
    const response = await apiFetch(`/admin/thresholds/${ruleId}/toggle`, { method: 'POST' });
    if (response.ok) {
      void fetchData();
    }
  };

  const actionBadgeVariant = (action: string) => {
    switch (action) {
      case 'allow': return 'default';
      case 'require_approval': return 'secondary';
      case 'require_second_approval': return 'warning';
      case 'require_compliance_review': return 'destructive';
      case 'block': return 'destructive';
      default: return 'outline';
    }
  };

  const actionLabel = (action: string) => {
    switch (action) {
      case 'allow': return 'Allow';
      case 'require_approval': return 'Approval';
      case 'require_second_approval': return '2nd Approval';
      case 'require_compliance_review': return 'Compliance';
      case 'block': return 'Block';
      default: return action;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Approval Threshold Rules
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure transfer approval thresholds, multi-level approvals, and rule management
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {levels.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.level}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Level {level.level}</CardTitle>
                <CardDescription>{level.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-1">{level.description}</p>
                <p className="text-xs text-muted-foreground">
                  {level.requiredApprovers} approver(s) needed · {level.approverRoles.join(', ')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Threshold Rules</CardTitle>
          <CardDescription>
            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured · {rules.filter((r) => r.enabled).length} active
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No rules configured yet
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border ${
                    rule.enabled ? 'border-border/60 bg-muted/30' : 'border-dashed border-border/30 bg-muted/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{rule.name}</h3>
                        <Badge variant={actionBadgeVariant(rule.action)} className="text-xs">
                          {actionLabel(rule.action)}
                        </Badge>
                        {!rule.enabled && (
                          <Badge variant="outline" className="text-xs">Disabled</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Condition: {rule.condition}</span>
                        <span>Priority: {rule.priority}</span>
                        {rule.approvalLevel > 0 && (
                          <span>Approval Level: {rule.approvalLevel}</span>
                        )}
                        {rule.notifyAdmins && <span>Notifies admins</span>}
                      </div>
                      <div className="mt-2">
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {JSON.stringify(rule.config)}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(rule.id)}>
                        {rule.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
            <DialogDescription>
              Configure the threshold rule conditions and action
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Large Transfer"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this rule does"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="condition">Condition</Label>
                <Select
                  value={formData.condition}
                  onValueChange={(value) => setFormData({ ...formData, condition: value })}
                >
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount_above">Amount Above</SelectItem>
                    <SelectItem value="amount_below">Amount Below</SelectItem>
                    <SelectItem value="amount_range">Amount Range</SelectItem>
                    <SelectItem value="destination_country">Destination Country</SelectItem>
                    <SelectItem value="risk_score">Risk Score</SelectItem>
                    <SelectItem value="user_tier">User Tier</SelectItem>
                    <SelectItem value="daily_volume">Daily Volume</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="action">Action</Label>
                <Select
                  value={formData.action}
                  onValueChange={(value) => setFormData({ ...formData, action: value })}
                >
                  <SelectTrigger id="action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="require_approval">Require Approval</SelectItem>
                    <SelectItem value="require_second_approval">Require 2nd Approval</SelectItem>
                    <SelectItem value="require_compliance_review">Compliance Review</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="approvalLevel">Approval Level</Label>
                <Select
                  value={String(formData.approvalLevel)}
                  onValueChange={(value) => setFormData({ ...formData, approvalLevel: Number(value) })}
                >
                  <SelectTrigger id="approvalLevel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None</SelectItem>
                    {levels.map((l) => (
                      <SelectItem key={l.level} value={String(l.level)}>
                        Level {l.level} - {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="config">Configuration (JSON)</Label>
              <Textarea
                id="config"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                placeholder='{"amount": 10000, "currency": "USDC"}'
                className="font-mono text-xs"
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="notifyAdmins"
                checked={formData.notifyAdmins}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyAdmins: checked })}
              />
              <Label htmlFor="notifyAdmins">Notify admins when triggered</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
