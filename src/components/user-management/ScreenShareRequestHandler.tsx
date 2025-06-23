
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, Check, X, AlertCircle } from 'lucide-react';
import { useScreenShareService } from '@/hooks/useScreenShareService';

export function ScreenShareRequestHandler() {
  const { 
    incomingRequests, 
    acceptScreenShare, 
    declineScreenShare,
    currentStream,
    stopScreenShare 
  } = useScreenShareService();

  // If currently sharing screen, show the sharing indicator
  if (currentStream) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <Monitor className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  Screen is being shared
                </span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => stopScreenShare()}
              >
                Stop Sharing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show incoming requests
  if (incomingRequests.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {incomingRequests.map((request) => (
        <Card key={request.id} className="bg-blue-50 border-blue-200 min-w-80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              Screen Share Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              <strong>{request.admin_username}</strong> is requesting to view your screen for monitoring purposes.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => acceptScreenShare(request.id)}
                className="flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                Allow
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => declineScreenShare(request.id)}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Decline
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              This will share your entire screen. You can stop sharing at any time.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
