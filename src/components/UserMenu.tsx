
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <Button
      variant="ghost"
      className="relative h-10 w-10 rounded-full"
      onClick={() => navigate('/profile')}
    >
      <Avatar className="h-10 w-10">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="Profile" className="object-cover w-full h-full" />
        ) : (
          <AvatarFallback className={`text-white ${isAdmin ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}>
            {getInitials(user.firstName, user.lastName, user.email)}
          </AvatarFallback>
        )}
      </Avatar>
      {isAdmin && (
        <div className="absolute -top-1 -right-1">
          <Shield className="h-4 w-4 text-red-600" />
        </div>
      )}
    </Button>
  );
}
