import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Shield } from "lucide-react";

interface ClickableUserProps {
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  avatarUrl?: string;
  className?: string;
}

export function ClickableUser({ 
  userId, 
  username, 
  firstName, 
  lastName, 
  email,
  phone,
  role,
  avatarUrl,
  className = ""
}: ClickableUserProps) {
  const [showDialog, setShowDialog] = useState(false);

  if (!userId && !username) {
    return <span className="text-muted-foreground">-</span>;
  }

  const displayName = firstName && lastName 
    ? `${firstName} ${lastName}` 
    : username || 'Unknown User';

  const initials = firstName && lastName 
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : username ? username.slice(0, 2).toUpperCase() : 'U';

  return (
    <>
      <Button
        variant="link"
        className={`p-0 h-auto font-medium text-primary hover:underline ${className}`}
        onClick={() => setShowDialog(true)}
      >
        {displayName}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Details
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* User Avatar and Name */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{displayName}</h3>
                {username && (
                  <p className="text-sm text-muted-foreground">@{username}</p>
                )}
              </div>
            </div>

            {/* User Details */}
            <div className="space-y-3 pt-2 border-t">
              {userId && (
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <p className="text-sm font-mono">{userId.slice(0, 8)}...</p>
                  </div>
                </div>
              )}
              
              {email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm">{email}</p>
                  </div>
                </div>
              )}
              
              {phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm">{phone}</p>
                  </div>
                </div>
              )}
              
              {role && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <Badge variant="secondary">{role}</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
