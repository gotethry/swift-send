import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { login as loginRequest, logout as logoutRequest, verifyCode as verifyCodeRequest, stepUpVerifyCode as stepUpVerifyCodeRequest, resendCode as resendCodeRequest, unlockAccount as unlockAccountRequest, authMe as authMeRequest, parseUserDto } from '@/lib/auth';
import type { AuthUser, User } from '@/types';

interface AuthContextType {
  user: User | null;
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  onboardingStep: string | null;
  forceVerification: boolean;
  transactionSigningSecret: string | null;
  login: (identifier: string) => Promise<ReturnType<typeof loginRequest>>;
  logout: () => Promise<void>;
  verifyCode: (code: string) => Promise<ReturnType<typeof verifyCodeRequest> | ReturnType<typeof stepUpVerifyCodeRequest>>;
  resendCode: () => Promise<ReturnType<typeof resendCodeRequest>>;
  unlockAccount: () => Promise<ReturnType<typeof unlockAccountRequest>>;
  clearForceVerification: () => void;
  setOnboardingStep: (step: string | null) => void;
  completeOnboarding: () => void;
  updateBalance: (newBalance: number) => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);
  const [forceVerification, setForceVerification] = useState(false);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const result = await authMeRequest();
        if (!mounted) return;
        setAuthUser(result.authUser);
        setUser(result.user ? parseUserDto(result.user) : null);
        if (result.onboardingRequired) {
          setOnboardingStep(1);
        }
      } catch {
        // ignore restore failures
      }
    };

    void restoreSession();

    const handleReauthRequired = () => {
      // Preserve auth state but force the UI into OTP verification step.
      setForceVerification(true);
    };

    window.addEventListener('swiftsend:reauth_required', handleReauthRequired);

    return () => {
      mounted = false;
      window.removeEventListener('swiftsend:reauth_required', handleReauthRequired);
    };
  }, []);

  const login = async (identifier: string) => {
    const result = await loginRequest(identifier);
    setAuthUser(result.authUser);
    setUser(result.user ? parseUserDto(result.user) : null);
    setForceVerification(false);
    return result;
  };

  const verifyCode = async (code: string) => {
    if (forceVerification) {
      const result = await stepUpVerifyCodeRequest(code);
      setAuthUser(result.authUser);
      setUser(result.user ? parseUserDto(result.user) : null);
      setForceVerification(false);
      return result;
    }

    const result = await verifyCodeRequest(code);
    setAuthUser(result.authUser);
    setUser(result.user ? parseUserDto(result.user) : null);
    setForceVerification(false);
    return result;
  };

  const resendCode = async () => {
    return await resendCodeRequest();
  };

  const unlockAccount = async () => {
    return await unlockAccountRequest();
  };

  const refreshUser = async () => {
    const result = await authMeRequest();
    setAuthUser(result.authUser);
    const refreshedUser = result.user ? parseUserDto(result.user) : null;
    setUser(refreshedUser);
    return refreshedUser;
  };

  const logout = async () => {
    await logoutRequest();
    setUser(null);
    setAuthUser(null);
    setOnboardingStep(null);
    setForceVerification(false);
  };

  const completeOnboarding = () => {
    setOnboardingStep(null);
  };

  const updateBalance = (newBalance: number) => {
    setUser((previous) => (previous ? { ...previous, usdcBalance: newBalance } : previous));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authUser,
        isAuthenticated: !!user,
        onboardingStep,
        forceVerification,
        transactionSigningSecret: null,
        login,
        logout,
        verifyCode,
        resendCode,
        unlockAccount,
        clearForceVerification: () => setForceVerification(false),
        setOnboardingStep,
        completeOnboarding,
        updateBalance,
        refreshUser,
      }}
    >
      {children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
