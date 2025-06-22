
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Square, Play, Pause } from 'lucide-react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const requestScreenShare = async () => {
    try {
      setIsRequesting(true);
      
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });

      setStream(displayStream);
      setIsSharing(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
      }

      // Handle stream end when user stops sharing
      displayStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      onStreamStart?.(displayStream);
      
      toast({
        title: "Screen Share Started",
        description: `Now monitoring ${username}'s screen`,
      });

    } catch (error) {
      console.error('Screen share request failed:', error);
      toast({
        title: "Screen Share Failed",
        description: "User denied screen sharing permission or an error occurred",
        variant: "destructive",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsSharing(false);
    onStreamEnd?.();
    
    toast({
      title: "Screen Share Ended",
      description: `Stopped monitoring ${username}'s screen`,
    });
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Screen Monitoring</CardTitle>
          <Badge variant={isSharing ? "default" : "secondary"}>
            {isSharing ? "Live" : "Offline"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {!isSharing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={requestScreenShare}
              disabled={isRequesting}
              className="flex items-center gap-2"
            >
              <Monitor className="h-4 w-4" />
              {isRequesting ? "Requesting..." : "Request Screen Access"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopScreenShare}
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              Stop Monitoring
            </Button>
          )}
        </div>
        
        {isSharing && (
          <div className="space-y-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full h-32 bg-black rounded border object-contain"
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.play();
                }
              }}
            />
            <p className="text-xs text-gray-500">
              Live screen feed from {username}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
