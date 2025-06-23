
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
        audio: true // Enable audio for better experience
      });

      setStream(displayStream);
      setIsSharing(true);
      
      // Set up video element properly
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.muted = true; // Prevent audio feedback
        videoRef.current.playsInline = true;
        
        // Ensure video plays
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.error('Video play failed:', playError);
        }
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
          console.log('Video is now playing');
        } catch (error) {
          console.error('Failed to play video:', error);
        }
      };
      
      // Wait for metadata to load before playing
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
              playsInline
              className="w-full h-40 bg-gray-900 rounded border object-contain"
              style={{ 
                backgroundColor: '#1a1a1a',
                minHeight: '160px'
              }}
              onError={(e) => {
                console.error('Video error:', e);
              }}
              onLoadStart={() => {
                console.log('Video load started');
              }}
              onCanPlay={() => {
                console.log('Video can play');
              }}
            />
            <p className="text-xs text-gray-500">
              Live screen feed from {username}
            </p>
            {stream && (
              <p className="text-xs text-green-600">
                Stream active • {stream.getVideoTracks().length} video track(s)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
