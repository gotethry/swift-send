import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { Zap, ArrowLeft, ArrowRight, User, Mail, Phone, Building2, BriefcaseBusiness, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function OnboardingProfile() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    accountType: 'personal' as 'personal' | 'business',
    companyName: '',
    role: 'owner' as 'owner' | 'finance_admin' | 'operator',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { setOnboardingStep, authUser } = useAuth();

  // Pre-populate with existing data
  const existingEmail = authUser?.email || '';
  const existingPhone = authUser?.phone || '';

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleContinue = () => {
    if (!formData.name.trim()) {
      return;
    }
    // Store the form data for the next step
    localStorage.setItem('onboarding-profile', JSON.stringify(formData));
    setOnboardingStep(3);
  };

  const isValid = formData.name.trim().length >= 2;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => setOnboardingStep(1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold">SwiftSend</span>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-1 bg-primary rounded-full"></div>
            <div className="w-8 h-1 bg-primary rounded-full"></div>
            <div className="w-8 h-1 bg-muted rounded-full"></div>
            <span className="text-sm text-muted-foreground ml-2">Step 2 of 3</span>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="flex-1 px-6 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Tell us about yourself
            </h1>
            <p className="text-muted-foreground">
              Help us personalize your experience
            </p>
          </div>

          <div className="space-y-6">
            {/* Account Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, accountType: 'personal' }))}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    formData.accountType === 'personal'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Personal</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Standard wallet for individual transfers
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, accountType: 'business' }))}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    formData.accountType === 'business'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Business</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Company profile with team permissions
                  </p>
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {formData.accountType === 'business' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Company Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <BriefcaseBusiness className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <Input
                      type="text"
                      placeholder="Enter your company name"
                      value={formData.companyName}
                      onChange={(e) => handleInputChange('companyName', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Role in Company
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'owner', label: 'Owner' },
                      { value: 'finance_admin', label: 'Finance' },
                      { value: 'operator', label: 'Operator' },
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setFormData((prev) => ({ ...prev, role: option.value as typeof formData.role }))}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          formData.role === option.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border bg-card text-foreground hover:bg-muted/50',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Controls your initial business permissions
                  </p>
                </div>
              </>
            )}

            {/* Email (if not already set) */}
            {!existingEmail && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll use this for transaction receipts
                </p>
              </div>
            )}

            {/* Phone (if not already set) */}
            {!existingPhone && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <Input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll use this for important notifications
                </p>
              </div>
            )}

            {/* Current Contact Info Display */}
            {(existingEmail || existingPhone) && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium text-foreground mb-2">Contact Information</p>
                {existingEmail && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    {existingEmail}
                  </div>
                )}
                {existingPhone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    {existingPhone}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4">
            <Button
              onClick={handleContinue}
              variant="hero"
              size="lg"
              className="w-full"
            disabled={!isValid || (formData.accountType === 'business' && !formData.companyName.trim())}
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </Button>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                You can update this information anytime in your profile
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
