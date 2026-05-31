import { Home, Send, MapPin, Clock, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: Home, label: 'Home', path: '/dashboard' },
  { icon: Send, label: 'Send', path: '/send' },
  { icon: MapPin, label: 'Track', path: '/remittance' },
  { icon: Clock, label: 'History', path: '/history' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = (path: string) => {
    // Haptic feedback for mobile devices
    if ('vibrate' in navigator && navigator.vibrate) {
      navigator.vibrate(10);
    }
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border/50 px-2 pb-safe pt-2 z-50" aria-label="Main navigation">
      <div className="max-w-lg mx-auto flex items-center justify-around">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => handleNavClick(path)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[64px] min-h-[64px] rounded-2xl transition-all duration-200',
                'active:scale-95 active:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              aria-label={`${label}${isActive ? ' (current page)' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'w-6 h-6 transition-all duration-200',
                  isActive && 'scale-110'
                )}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium leading-tight">{label}</span>
              {isActive && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
