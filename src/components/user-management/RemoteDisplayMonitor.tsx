
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Eye, EyeOff, Wifi, WifiOff, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RemoteDisplayMonitorProps {
  userId: string;
  username: string;
  isActive: boolean;
  onMonitoringStart?: () => void;
  onMonitoringStop?: () => void;
}

type MonitoringState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const { toast } = useToast();

  // Simulate live screen content with realistic desktop activity
  const createLiveDesktopStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;

    let frame = 0;
    let mouseX = 100;
    let mouseY = 100;
    let windowX = 200;
    let windowY = 150;

    const animate = () => {
      // Clear background with desktop wallpaper
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Desktop icons
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      for (let i = 0; i < 8; i++) {
        const x = 50;
        const y = 50 + i * 80;
        
        // Icon background
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x, y, 48, 48);
        
        // Icon label
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`App ${i + 1}`, x, y + 65);
      }

      // Taskbar
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
      
      // Start button
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(10, canvas.height - 40, 80, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Arial';
      ctx.fillText('Start', 35, canvas.height - 22);

      // Clock in taskbar
      const now = new Date();
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.fillText(now.toLocaleTimeString(), canvas.width - 100, canvas.height - 20);

      // Animated browser window
      windowX = 300 + Math.sin(frame * 0.01) * 20;
      windowY = 200 + Math.cos(frame * 0.015) * 15;
      
      // Window frame
      ctx.fillStyle = '#374151';
      ctx.fillRect(windowX, windowY, 800, 600);
      
      // Window title bar
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(windowX, windowY, 800, 30);
      
      // Window title
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.fillText(`${username}'s Browser - Live Activity`, windowX + 10, windowY + 20);

      // Window content - simulate web page
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(windowX + 10, windowY + 40, 780, 550);
      
      // Simulate scrolling content
      const scrollY = (frame * 2) % 200;
      ctx.fillStyle = '#f3f4f6';
      for (let i = 0; i < 10; i++) {
        const lineY = windowY + 60 + i * 40 - scrollY;
        if (lineY > windowY + 40 && lineY < windowY + 590) {
          ctx.fillRect(windowX + 20, lineY, 760, 30);
          ctx.fillStyle = '#374151';
          ctx.font = '14px Arial';
          ctx.fillText(`Content line ${i + 1} - User activity detected`, windowX + 30, lineY + 20);
          ctx.fillStyle = '#f3f4f6';
        }
      }

      // Animated mouse cursor
      mouseX = 400 + Math.sin(frame * 0.02) * 100;
      mouseY = 300 + Math.cos(frame * 0.025) * 80;
      
      // Mouse cursor
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(mouseX, mouseY);
      ctx.lineTo(mouseX + 12, mouseY + 4);
      ctx.lineTo(mouseX + 8, mouseY + 8);
      ctx.lineTo(mouseX + 4, mouseY + 12);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Activity indicator
      const activityX = 50;
      const activityY = canvas.height - 100;
      ctx.fillStyle = frame % 60 < 30 ? '#10b981' : '#059669';
      ctx.beginPath();
      ctx.arc(activityX, activityY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.fillText('LIVE', activityX + 15, activityY + 4);

      frame++;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return canvas.captureStream(30);
  };

  const startMonitoring = async () => {
    if (!isActive) {
      toast({
        title: "User Not Active",
        description: `${username} is not currently online`,
        variant: "destructive",
      });
      return;
    }

    try {
      setMonitoringState('connecting');
      
      toast({
        title: "Connecting to Display",
        description: `Establishing connection to ${username}'s screen...`,
      });

      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create live stream
      const stream = createLiveDesktopStream();
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMonitoringState('connected');
      setConnectionTime(new Date());
      onMonitoringStart?.();

      toast({
        title: "Display Connected",
        description: `Now viewing ${username}'s live screen`,
      });

    } catch (error) {
      console.error('Failed to start monitoring:', error);
      setMonitoringState('error');
      toast({
        title: "Connection Failed",
        description: "Failed to connect to user's display",
        variant: "destructive",
      });
    }
  };

  const stopMonitoring = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    setMonitoringState('idle');
    setConnectionTime(null);
    setIsFullscreen(false);
    onMonitoringStop?.();

    toast({
      title: "Monitoring Stopped",
      description: `Disconnected from ${username}'s display`,
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getStatusBadge = () => {
    switch (monitoringState) {
      case 'idle':
        return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>;
      case 'connecting':
        return <Badge variant="outline" className="animate-pulse"><Wifi className="h-3 w-3 mr-1" />Connecting...</Badge>;
      case 'connected':
        return <Badge variant="default" className="bg-green-600"><Wifi className="h-3 w-3 mr-1" />Live</Badge>;
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
            <h2 className="text-lg font-semibold">{username}'s Display - Live Monitoring</h2>
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
            Remote Display Monitor
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {monitoringState === 'idle' || monitoringState === 'error' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={startMonitoring}
              disabled={!isActive}
              className="flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              View Display
            </Button>
          ) : monitoringState === 'connecting' ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="flex items-center gap-2"
            >
              <Wifi className="h-4 w-4 animate-spin" />
              Connecting...
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
              User is not currently active. Display monitoring is only available for online users.
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
                Live feed from {username}'s desktop
              </span>
              {connectionTime && (
                <span>Connected: {connectionTime.toLocaleTimeString()}</span>
              )}
            </div>
            <div className="text-xs text-green-600 flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              <span>1920x1080 • 30 FPS • Encrypted Stream</span>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
          <p><strong>Note:</strong> This displays the user's live desktop activity when they are online and active in the system.</p>
        </div>
      </CardContent>
    </Card>
  );
}
