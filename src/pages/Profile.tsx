import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BottomNav } from '@/components/BottomNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import WalletConnectionDialog, { WalletStatusIndicator } from '@/components/WalletConnection';
import { ComplianceDashboard } from '@/components/ComplianceDashboard';
import { TrustedDeviceIndicator } from '@/components/TrustedDeviceIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { updateBusinessProfile } from '@/lib/auth';
import {
  User,
  Phone,
  Mail,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Wallet,
  ExternalLink,
  Settings,
  Share2,
  Twitter,
  Linkedin,
  Send as SendIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { useBandwidth } from '@/contexts/BandwidthContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, refreshSession } = useAuth();
  const { connectionState, disconnectWallet } = useWallet();
  const { setMode, isLowBandwidth } = useBandwidth();
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [businessDraft, setBusinessDraft] = useState({
    companyName: '',
    role: 'owner' as 'owner' | 'finance_admin' | 'operator',
    teamMembers: [] as Array<{
      name: string;
      email: string;
      role: 'owner' | 'admin' | 'approver' | 'viewer';
      status: 'active' | 'invited';
    }>,
  });
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    role: 'viewer' as 'owner' | 'admin' | 'approver' | 'viewer',
  });

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  const handleWalletDisconnect = () => {
    disconnectWallet();
    toast.success('External wallet disconnected');
  };

  const completenessCriteria = [
    { label: 'Verify Account', weight: 25, completed: !!user?.isVerified },
    { label: 'Add Email', weight: 15, completed: !!user?.email },
    { label: 'Set Local Currency', weight: 20, completed: !!user?.localCurrency && user.localCurrency !== 'USD' },
    { label: 'Connect External Wallet', weight: 20, completed: connectionState.isConnected },
    { label: 'Complete KYC', weight: 20, completed: user?.kycStatus === 'verified' },
  ];

  const totalCompleteness = completenessCriteria.reduce((acc, curr) => acc + (curr.completed ? curr.weight : 0), 0);
  const missingItems = completenessCriteria.filter(c => !c.completed);

  useEffect(() => {
    const profile = user?.businessProfile;
    setBusinessDraft({
      companyName: profile?.companyName || '',
      role: profile?.role || 'owner',
      teamMembers: profile?.teamMembers || [],
    });
  }, [user?.businessProfile]);

  const isBusinessAccount = user?.accountType === 'business' || !!user?.businessProfile;

  const persistBusinessProfile = async () => {
    const companyName = businessDraft.companyName.trim() || `${user?.name || 'Business'} Holdings`;

    try {
      await updateBusinessProfile({
        companyName,
        role: businessDraft.role,
        teamMembers: businessDraft.teamMembers.length > 0
          ? businessDraft.teamMembers
          : [
              {
                name: user?.name || 'Owner',
                email: user?.email || '',
                role: 'owner',
                status: 'active',
              },
            ],
      });
      await refreshSession();
      toast.success('Business profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update business profile');
    }
  };

  const addTeamMember = () => {
    if (!newMember.name.trim() || !newMember.email.trim()) {
      toast.error('Enter a name and email');
      return;
    }
    setBusinessDraft((prev) => ({
      ...prev,
      teamMembers: [
        ...prev.teamMembers,
        {
          name: newMember.name.trim(),
          email: newMember.email.trim(),
          role: newMember.role,
          status: 'invited',
        },
      ],
    }));
    setNewMember({ name: '', email: '', role: 'viewer' });
  };

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const title = `Check out my profile on SwiftSend!`;
    const text = `Join me on SwiftSend for instant global remittances.`;
    
    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'copy':
        navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
        break;
      case 'native':
        if (navigator.share) {
          navigator.share({ title, text, url }).catch(console.error);
        } else {
          handleShare('copy');
        }
        break;
    }
  };

  const menuItems = [
    {
      icon: Wallet,
      label: 'Wallet Settings',
      onClick: () => {},
      rightContent: connectionState.isConnected ? (
        <WalletStatusIndicator />
      ) : null
    },
    {
      icon: Shield,
      label: 'Account Verification & Limits',
      onClick: () => navigate('/verification'),
      description: 'View your account status and upgrade limits'
    },
    { icon: Bell, label: 'Notifications', onClick: () => navigate('/notification-preferences'), description: 'Manage email, SMS and push alert preferences' },
    { icon: HelpCircle, label: 'Help & Support', onClick: () => {} },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="gradient-hero px-6 pt-8 pb-12">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-primary-foreground mb-6">Profile</h1>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold text-primary-foreground">
                {user?.name || 'User'}
              </p>
              <p className="text-primary-foreground/80">{user?.phone}</p>
            </div>
          </div>
          
          {/* Social Share Buttons */}
          <div className="mt-6 flex gap-3">
            <Button 
              variant="secondary" 
              size="sm" 
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 border-none text-primary-foreground"
              onClick={() => handleShare('native')}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share Profile
            </Button>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground/70 hover:text-primary-foreground" onClick={() => handleShare('twitter')}>
                <Twitter className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground/70 hover:text-primary-foreground" onClick={() => handleShare('linkedin')}>
                <Linkedin className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground/70 hover:text-primary-foreground" onClick={() => handleShare('telegram')}>
                <SendIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 -mt-4">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Profile Completeness Indicator */}
          {totalCompleteness < 100 && (
            <div className="bg-card rounded-2xl p-5 shadow-soft animate-slide-up border-l-4 border-primary">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-foreground text-sm">Profile Completeness</h3>
                <span className="text-sm font-bold text-primary">{totalCompleteness}%</span>
              </div>
              <Progress value={totalCompleteness} className="h-2 mb-4" />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Boost your trust by completing your profile:</p>
                <div className="flex flex-wrap gap-2">
                  {missingItems.map(item => (
                    <button 
                      key={item.label}
                      className="text-[10px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded-full text-secondary-foreground transition-colors"
                      onClick={() => {
                        if (item.label === 'Verify Account' || item.label === 'Complete KYC') navigate('/verification');
                        if (item.label === 'Connect External Wallet') setShowWalletDialog(true);
                      }}
                    >
                      + {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Account Info Card */}
          <div className="bg-card rounded-2xl p-5 shadow-soft animate-slide-up">
            <h2 className="font-semibold text-foreground mb-4">Account Details</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Appearance</p>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm text-muted-foreground">Low-bandwidth mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Reduce animations and data usage
                  </p>
                </div>
                <Switch
                  checked={isLowBandwidth}
                  onCheckedChange={(checked) => setMode(checked ? 'low' : 'auto')}
                  aria-label="Toggle low-bandwidth mode"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Phone className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium text-foreground">{user?.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">
                    {user?.email || 'Not provided'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Business Account Support */}
          <div className="bg-card rounded-2xl p-5 shadow-soft animate-slide-up" style={{ animationDelay: '50ms' }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Badge variant="secondary" className="rounded-full">Business</Badge>
                  Business Account
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isBusinessAccount
                    ? 'Manage your company profile, team access, and approval roles.'
                    : 'Upgrade to a business account for team workflows and delegated approvals.'}
                </p>
              </div>
              {!isBusinessAccount && (
                <Button size="sm" variant="outline" onClick={persistBusinessProfile}>
                  Convert
                </Button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Company name</Label>
                <Input
                  value={businessDraft.companyName}
                  onChange={(e) => setBusinessDraft((prev) => ({ ...prev, companyName: e.target.value }))}
                  placeholder="Enter your company name"
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Default role</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { value: 'owner', label: 'Owner' },
                    { value: 'finance_admin', label: 'Finance' },
                    { value: 'operator', label: 'Operator' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBusinessDraft((prev) => ({ ...prev, role: option.value as typeof prev.role }))}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        businessDraft.role === option.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-muted/20 text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-medium text-foreground">Team management</h3>
                    <p className="text-xs text-muted-foreground">
                      Invite teammates and assign approval permissions.
                    </p>
                  </div>
                  <Badge variant="outline">{businessDraft.teamMembers.length} members</Badge>
                </div>

                <div className="space-y-2">
                  {businessDraft.teamMembers.map((member, index) => (
                    <div key={`${member.email}-${index}`} className="rounded-lg border border-border/60 bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                          {member.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wide">{member.role}</span>
                        <span>•</span>
                        <span>{member.status === 'active' ? 'Can approve transfers' : 'Invite pending'}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={newMember.name}
                    onChange={(e) => setNewMember((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Teammate name"
                  />
                  <Input
                    value={newMember.email}
                    onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Teammate email"
                  />
                  <Button type="button" variant="outline" onClick={addTeamMember}>
                    Invite
                  </Button>
                </div>
              </div>

              <Button className="w-full" onClick={persistBusinessProfile}>
                Save Business Profile
              </Button>
            </div>
          </div>

          {/* Wallet Management Section */}
          <div className="bg-card rounded-2xl p-5 shadow-soft animate-slide-up" style={{ animationDelay: '75ms' }}>
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallet Management
            </h2>
            
            {connectionState.isConnected ? (
              <div className="space-y-4">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="font-medium text-green-800 dark:text-green-200">
                        {connectionState.provider} Connected
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleWalletDisconnect}
                      className="text-red-600 hover:text-red-700"
                    >
                      Disconnect
                    </Button>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-300 font-mono">
                    {connectionState.account?.publicKey.slice(0, 8)}...{connectionState.account?.publicKey.slice(-8)}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm text-green-700 dark:text-green-300">Balance</span>
                    <span className="font-semibold text-green-800 dark:text-green-200">
                      ${connectionState.account?.balance.toFixed(2)}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://stellar.expert/explorer/public/account/${connectionState.account?.publicKey}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Explorer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {}}
                  >
                    <Settings className="w-4 h-4" />
                    Wallet Settings
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect your own Stellar wallet for enhanced control and transparency over your transactions.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-green-500" />
                    <span>Self-custody</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 text-blue-500" />
                    <span>On-chain visibility</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWalletDialog(true)}
                >
                  <Wallet className="w-4 h-4" />
                  Connect External Wallet
                </Button>
              </div>
            )}
          </div>

          {/* Compliance Dashboard */}
          <div className="animate-slide-up" style={{ animationDelay: '90ms' }}>
            <ComplianceDashboard compact={false} showUpgradePrompt={true} />
          </div>

          {/* Security & Trusted Devices */}
          <div className="animate-slide-up" style={{ animationDelay: '95ms' }}>
            <TrustedDeviceIndicator variant="card" />
          </div>

          {/* Menu Items */}
          <div
            className="bg-card rounded-2xl shadow-soft overflow-hidden animate-slide-up"
            style={{ animationDelay: '100ms' }}
          >
            {menuItems.map(({ icon: Icon, label, onClick, rightContent, description }, index) => (
              <button
                key={label}
                onClick={onClick}
                className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-foreground">{label}</div>
                    {description && (
                      <div className="text-sm text-muted-foreground">{description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rightContent}
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>

          {/* Logout Button */}
          <Button
            variant="destructive"
            size="lg"
            className="w-full animate-slide-up"
            style={{ animationDelay: '200ms' }}
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            SwiftSend v1.0.0 • Powered by Stellar
          </p>
        </div>
      </main>

      <BottomNav />

      {/* Wallet Connection Dialog */}
      <WalletConnectionDialog
        isOpen={showWalletDialog}
        onClose={() => setShowWalletDialog(false)}
        onConnect={() => {
          toast.success('Wallet connected successfully!');
        }}
      />
    </div>
  );
}
