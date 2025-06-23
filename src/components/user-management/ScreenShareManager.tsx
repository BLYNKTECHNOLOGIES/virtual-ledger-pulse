
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Square, Play, Pause, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ScreenShareManagerProps {
  userId: string;
  username: string;
  onStreamStart?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
}

export function ScreenShareManager({ userId, username, onStreamStart, onStreamEnd }: ScreenShareManagerProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'requesting' | 'connected' | 'permission_required'>('disconnected');
  const [hasPermission, setHasPermission] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  // Simulate remote connection request
  const requestRemoteAccess = async () => {
    try {
      setIsRequesting(true);
      setConnectionStatus('requesting');
      
      toast({
        title: "Requesting Remote Access",
        description: `Sending screen access request to ${username}...`,
      });

      // Simulate network delay for remote request
      await new Promise(resolve => setTimeout(resolve, 2000));

      // For demo purposes, we'll still need to request local screen share
      // In a real implementation, this would send a request to the remote user
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true
      });

      setStream(displayStream);
      setIsSharing(true);
      setConnectionStatus('connected');
      setHasPermission(true);
      
      // Set up video element
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.error('Video play failed:', playError);
        }
      }

      // Handle stream end
      displayStream.getVideoTracks()[0].onended = () => {
        stopRemoteAccess();
      };

      onStreamStart?.(displayStream);
      
      toast({
        title: "Remote Access Granted",
        description: `Now viewing ${username}'s screen remotely`,
      });

    } catch (error) {
      console.error('Remote access request failed:', error);
      setConnectionStatus('permission_required');
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Permission Required",
          description: `${username} needs to grant screen sharing permission`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Unable to establish remote connection",
          variant: "destructive",
        });
      }
    } finally {
      setIsRequesting(false);
    }
  };

  // Simulate reconnection with stored permission
  const reconnectWithPermission = async () => {
    if (!hasPermission) {
      await requestRemoteAccess();
      return;
    }

    try {
      setIsRequesting(true);
      setConnectionStatus('requesting');

      toast({
        title: "Reconnecting",
        description: `Reconnecting to ${username}'s screen...`,
      });

      // Simulate reconnection delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Request new stream (browsers still require fresh permission)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true
      });

      setStream(displayStream);
      setIsSharing(true);
      setConnectionStatus('connected');
      
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }

      displayStream.getVideoTracks()[0].onended = () => {
        stopRemoteAccess();
      };

      onStreamStart?.(displayStream);
      
      toast({
        title: "Reconnected Successfully",
        description: `Resumed viewing ${username}'s screen`,
      });

    } catch (error) {
      console.error('Reconnection failed:', error);
      setConnectionStatus('permission_required');
      setHasPermission(false);
      
      toast({
        title: "Reconnection Failed",
        description: "Permission may have been revoked. Please request access again.",
        variant: "destructive",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const stopRemoteAccess = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsSharing(false);
    setConnectionStatus('disconnected');
    onStreamEnd?.();
    
    toast({
      title: "Remote Access Ended",
      description: `Stopped viewing ${username}'s screen`,
    });
  };

  useEffect(() => {
    if (stream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      
      const playVideo = async () => {
        try {
          await video.play();
          console.log('Remote screen view is now playing');
        } catch (error) {
          console.error('Failed to play remote screen:', error);
        }
      };
      
      video.addEventListener('loadedmetadata', playVideo);
      
      return () => {
        video.removeEventListener('loadedmetadata', playVideo);
      };
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Connected
        </Badge>;
      case 'requesting':
        return <Badge variant="secondary">
          <div className="animate-spin h-3 w-3 mr-1 border border-gray-400 border-t-transparent rounded-full"></div>
          Connecting
        </Badge>;
      case 'permission_required':
        return <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Permission Required
        </Badge>;
      default:
        return <Badge variant="outline">Disconnected</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Remote Screen Access</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {!isSharing ? (
            <>
              <Button
                size="sm"
                variant={hasPermission ? "default" : "outline"}
                onClick={hasPermission ? reconnectWithPermission : requestRemoteAccess}
                disabled={isRequesting}
                className="flex items-center gap-2"
              >
                <Monitor className="h-4 w-4" />
                {isRequesting 
                  ? "Connecting..." 
                  : hasPermission 
                    ? "Reconnect to Screen" 
                    : "Request Remote Access"
                }
              </Button>
              {hasPermission && (
                <p className="text-xs text-green-600 flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Permission granted
                </p>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopRemoteAccess}
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>
        
        {connectionStatus === 'permission_required' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-xs text-yellow-800">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              The remote user needs to grant screen sharing permission. In a real implementation, 
              this would be handled automatically by the remote monitoring agent.
            </p>
          </div>
        )}
        
        {isSharing && (
          <div className="space-y-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-40 bg-gray-900 rounded border object-contain"
              style={{ 
                backgroundColor: '#1a1a1a',
                minHeight: '160px'
              }}
              onError={(e) => {
                console.error('Remote video error:', e);
              }}
              onLoadStart={() => {
                console.log('Remote video load started');
              }}
              onCanPlay={() => {
                console.log('Remote video can play');
              }}
            />
            <div className="flex justify-between items-center text-xs">
              <p className="text-gray-500">
                Live remote screen from {username}
              </p>
              {stream && (
                <p className="text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full inline-block mr-1 animate-pulse"></div>
                  {stream.getVideoTracks().length} video track(s) active
                </p>
              )}
            </div>
          </div>
        )}
        
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs text-blue-800">
            <Monitor className="h-4 w-4 inline mr-1" />
            Note: Due to browser security, true remote monitoring requires specialized software. 
            This demo simulates the interface for such a system.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
