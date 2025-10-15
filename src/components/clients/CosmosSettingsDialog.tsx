import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Settings, AlertTriangle, TrendingUp, Shield } from "lucide-react";

interface CosmosSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

export function CosmosSettingsDialog({ open, onOpenChange, client }: CosmosSettingsDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [settings, setSettings] = useState({
    // Alert Thresholds
    monthlyLimitAlert: 80,
    spikeDetectionPercent: 250,
    consecutiveOrderAlert: 5,
    unusualTimeAlert: true,
    
    // Risk Settings
    autoSuspendEnabled: false,
    autoSuspendThreshold: 95,
    requireApprovalAbove: 90,
    
    // Monitoring
    realTimeMonitoring: true,
    emailAlerts: true,
    smsAlerts: false,
    webhookAlerts: false,
    
    // Pattern Detection
    patternAnalysisEnabled: true,
    anomalyDetection: true,
    behaviorBaseline: 30, // days
  });

  const handleSwitchChange = (field: string, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleInputChange = (field: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    setIsSubmitting(true);
    try {
      // Here you would typically save these settings to the backend
      

      toast({
        title: "Settings Updated",
        description: "Cosmos monitoring settings have been updated successfully.",
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error updating settings:", error);
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Cosmos Settings - {client?.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="alerts" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="alerts">Alert Thresholds</TabsTrigger>
            <TabsTrigger value="risk">Risk Controls</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="patterns">Pattern Detection</TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Alert Thresholds
                </CardTitle>
                <CardDescription>
                  Configure when Cosmos should trigger alerts for unusual activity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthlyLimitAlert">Monthly Limit Alert (%)</Label>
                    <Input
                      id="monthlyLimitAlert"
                      type="number"
                      value={settings.monthlyLimitAlert}
                      onChange={(e) => handleInputChange("monthlyLimitAlert", e.target.value)}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spikeDetectionPercent">Spike Detection (%)</Label>
                    <Input
                      id="spikeDetectionPercent"
                      type="number"
                      value={settings.spikeDetectionPercent}
                      onChange={(e) => handleInputChange("spikeDetectionPercent", e.target.value)}
                      min="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="consecutiveOrderAlert">Consecutive Orders Alert</Label>
                    <Input
                      id="consecutiveOrderAlert"
                      type="number"
                      value={settings.consecutiveOrderAlert}
                      onChange={(e) => handleInputChange("consecutiveOrderAlert", e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="unusualTimeAlert"
                      checked={settings.unusualTimeAlert}
                      onCheckedChange={(value) => handleSwitchChange("unusualTimeAlert", value)}
                    />
                    <Label htmlFor="unusualTimeAlert">Alert on unusual trading hours</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Risk Controls
                </CardTitle>
                <CardDescription>
                  Automated risk management and approval requirements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="autoSuspendEnabled"
                      checked={settings.autoSuspendEnabled}
                      onCheckedChange={(value) => handleSwitchChange("autoSuspendEnabled", value)}
                    />
                    <Label htmlFor="autoSuspendEnabled">Enable auto-suspend</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="autoSuspendThreshold">Auto-suspend threshold (%)</Label>
                    <Input
                      id="autoSuspendThreshold"
                      type="number"
                      value={settings.autoSuspendThreshold}
                      onChange={(e) => handleInputChange("autoSuspendThreshold", e.target.value)}
                      min="0"
                      max="100"
                      disabled={!settings.autoSuspendEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="requireApprovalAbove">Require approval above (%)</Label>
                    <Input
                      id="requireApprovalAbove"
                      type="number"
                      value={settings.requireApprovalAbove}
                      onChange={(e) => handleInputChange("requireApprovalAbove", e.target.value)}
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Monitoring & Notifications</CardTitle>
                <CardDescription>
                  Configure how you want to be notified of alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="realTimeMonitoring"
                      checked={settings.realTimeMonitoring}
                      onCheckedChange={(value) => handleSwitchChange("realTimeMonitoring", value)}
                    />
                    <Label htmlFor="realTimeMonitoring">Real-time monitoring</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="emailAlerts"
                      checked={settings.emailAlerts}
                      onCheckedChange={(value) => handleSwitchChange("emailAlerts", value)}
                    />
                    <Label htmlFor="emailAlerts">Email alerts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="smsAlerts"
                      checked={settings.smsAlerts}
                      onCheckedChange={(value) => handleSwitchChange("smsAlerts", value)}
                    />
                    <Label htmlFor="smsAlerts">SMS alerts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="webhookAlerts"
                      checked={settings.webhookAlerts}
                      onCheckedChange={(value) => handleSwitchChange("webhookAlerts", value)}
                    />
                    <Label htmlFor="webhookAlerts">Webhook alerts</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Pattern Detection
                </CardTitle>
                <CardDescription>
                  Advanced pattern analysis and anomaly detection settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="patternAnalysisEnabled"
                      checked={settings.patternAnalysisEnabled}
                      onCheckedChange={(value) => handleSwitchChange("patternAnalysisEnabled", value)}
                    />
                    <Label htmlFor="patternAnalysisEnabled">Enable pattern analysis</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="anomalyDetection"
                      checked={settings.anomalyDetection}
                      onCheckedChange={(value) => handleSwitchChange("anomalyDetection", value)}
                    />
                    <Label htmlFor="anomalyDetection">Anomaly detection</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="behaviorBaseline">Behavior baseline (days)</Label>
                    <Input
                      id="behaviorBaseline"
                      type="number"
                      value={settings.behaviorBaseline}
                      onChange={(e) => handleInputChange("behaviorBaseline", e.target.value)}
                      min="7"
                      max="365"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}