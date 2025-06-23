
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Eye, EyeOff, Wifi, WifiOff, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RemoteDisplayMonitorProps {
  userId: string;
  username: string;
  isActive: boolean;
  onMonitoringStart?: () => void;
  onMonitoringStop?: () => void;
}

type MonitoringState = 'idle' | 'requesting' | 'connected' | 'error' | 'permission-denied';

export function RemoteDisplayMonitor({ 
  userId, 
  username, 
  isActive, 
  onMonitoringStart, 
  onMonitoringStop 
}: RemoteDisplayMonitorProps) {
  const [monitoringState, setMonitoringState] = useState<MonitoringState>('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionTime, setConnectionTime] = useState<Date | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const startScreenShare = async () => {
    if (!isActive) {
      toast({
        title: "User Not Active",
        description: `${username} is not currently online`,
        variant: "destructive",
      });
      return;
    }

    try {
      setMonitoringState('requesting');
      
      toast({
        title: "Requesting Screen Access",
        description: "Please select the screen or window you want to share...",
      });

      // Request screen sharing permission
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true
      });

      setStream(displayStream);
      setMonitoringState('connected');
      setConnectionTime(new Date());

      // Set up video element
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.muted = true; // Prevent audio feedback
        await videoRef.current.play();
      }

      // Handle stream end when user stops sharing
      displayStream.getVideoTracks()[0].onended = () => {
        handleStreamEnd();
      };

      onMonitoringStart?.();

      toast({
        title: "Screen Sharing Started",
        description: `Now viewing ${username}'s screen display`,
      });

    } catch (error: any) {
      console.error('Screen share request failed:', error);
      
      if (error.name === 'NotAllowedError') {
        setMonitoringState('permission-denied');
        toast({
          title: "Permission Denied",
          description: "Screen sharing permission was denied. Please try again and allow access.",
          variant: "destructive",
        });
      } else if (error.name === 'NotSupportedError') {
        setMonitoringState('error');
        toast({
          title: "Not Supported",
          description: "Screen sharing is not supported in this browser.",
          variant: "destructive",
        });
      } else {
        setMonitoringState('error');
        toast({
          title: "Screen Share Failed",
          description: "Failed to start screen sharing. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleStreamEnd = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setMonitoringState('idle');
    setConnectionTime(null);
    setIsFullscreen(false);
    onMonitoringStop?.();

    toast({
      title: "Screen Sharing Ended",
      description: `Stopped viewing ${username}'s display`,
    });
  };

  const stopMonitoring = () => {
    handleStreamEnd();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Effect to handle video stream changes
  useEffect(() => {
    if (stream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      
      const playVideo = async () => {
        try {
          await video.play();
          console.log('Screen share video is now playing');
        } catch (error) {
          console.error('Failed to play screen share video:', error);
        }
      };
      
      video.addEventListener('loadedmetadata', playVideo);
      
      return () => {
        video.removeEventListener('loadedmetadata', playVideo);
      };
    }
  }, [stream]);

  const getStatusBadge = () => {
    switch (monitoringState) {
      case 'idle':
        return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>;
      case 'requesting':
        return <Badge variant="outline" className="animate-pulse"><Wifi className="h-3 w-3 mr-1" />Requesting Permission...</Badge>;
      case 'connected':
        return <Badge variant="default" className="bg-green-600"><Wifi className="h-3 w-3 mr-1" />Live</Badge>;
      case 'permission-denied':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Permission Denied</Badge>;
      case 'error':
        return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">{username}'s Display - Live Screen Share</h2>
            {getStatusBadge()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </Button>
            <Button variant="destructive" size="sm" onClick={stopMonitoring}>
              <EyeOff className="h-4 w-4 mr-2" />
              Stop Monitoring
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain rounded-lg"
            style={{ maxHeight: 'calc(100vh - 80px)' }}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Screen Share Monitor
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {monitoringState === 'idle' || monitoringState === 'error' || monitoringState === 'permission-denied' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={startScreenShare}
              disabled={!isActive}
              className="flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Request Screen Share
            </Button>
          ) : monitoringState === 'requesting' ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="flex items-center gap-2"
            >
              <Wifi className="h-4 w-4 animate-spin" />
              Waiting for Permission...
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleFullscreen}
                className="flex items-center gap-2"
              >
                <Maximize2 className="h-4 w-4" />
                Fullscreen
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                className="flex items-center gap-2"
              >
                <EyeOff className="h-4 w-4" />
                Stop
              </Button>
            </div>
          )}
        </div>

        {!isActive && (
          <div className="p-2 bg-amber-50 rounded border border-amber-200">
            <p className="text-xs text-amber-700">
              User is not currently active. Screen sharing is only available for online users.
            </p>
          </div>
        )}

        {monitoringState === 'permission-denied' && (
          <div className="p-2 bg-red-50 rounded border border-red-200">
            <p className="text-xs text-red-700">
              Screen sharing permission was denied. Click "Request Screen Share" to try again.
            </p>
          </div>
        )}

        {monitoringState === 'connected' && (
          <div className="space-y-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-48 bg-gray-900 rounded border object-contain"
              style={{ backgroundColor: '#000000' }}
            />
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live screen share from {username}
              </span>
              {connectionTime && (
                <span>Connected: {connectionTime.toLocaleTimeString()}</span>
              )}
            </div>
            {stream && (
              <div className="text-xs text-green-600 flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                <span>
                  Stream active • {stream.getVideoTracks().length} video track(s) • 
                  {stream.getVideoTracks()[0]?.getSettings().frameRate || 30} FPS
                </span>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
          <p><strong>Note:</strong> This feature requires the user to grant screen sharing permission through their browser.</p>
        </div>
      </CardContent>
    </Card>
  );
}
