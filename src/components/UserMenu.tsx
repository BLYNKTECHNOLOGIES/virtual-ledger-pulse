
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { User, LogOut, Shield } from 'lucide-react';
import { EmployeeProfileDialog } from '@/components/employee/EmployeeProfileDialog';

export function UserMenu() {
  const { user, logout, isAdmin, hasRole } = useAuth();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

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

  const handleLogout = () => {
    logout();
  };

  const handleProfileClick = () => {
    console.log('Profile clicked - opening dialog');
    setProfileDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
              <AvatarFallback className={`text-white ${isAdmin ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}>
                {getInitials(user.firstName, user.lastName, user.email)}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <div className="absolute -top-1 -right-1">
                <Shield className="h-4 w-4 text-red-600" />
              </div>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 bg-white border shadow-lg z-50" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-none">
                  {user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.username}
                </p>
                {isAdmin && (
                  <Badge variant="destructive" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
              {user.roles && user.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="outline" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* User Profile Button */}
          <div className="p-1">
            <button 
              className="flex items-center w-full px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
              onClick={handleProfileClick}
              type="button"
            >
              <User className="mr-2 h-4 w-4" />
              <span>User Profile</span>
            </button>
          </div>
          
          <DropdownMenuSeparator />
          
          {/* Logout Button */}
          <div className="p-1">
            <button 
              className="flex items-center w-full px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <EmployeeProfileDialog 
        open={profileDialogOpen} 
        onOpenChange={setProfileDialogOpen} 
      />
    </>
  );
}
