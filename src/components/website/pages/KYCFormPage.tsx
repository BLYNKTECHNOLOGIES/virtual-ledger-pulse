
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Upload, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep', 'Puducherry', 'Andaman and Nicobar Islands'
];

const documentTypes = [
  'Aadhar Card',
  'PAN Card', 
  'Voter ID',
  'Driving License',
  'Passport'
];

const purposeOptions = [
  'Trading',
  'Investing',
  'Sending Funds',
  'Gaming',
  'Others'
];

export function KYCFormPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    state: '',
    monthlyTradingVolume: '',
    documentType: '',
    purpose: '',
    otherPurpose: '',
    monthlyVolume: ''
  });
  const [document, setDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  const takeSelfie = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (context) {
        context.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        setSelfie(imageData);
        
        // Stop camera
        const stream = video.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setIsCameraActive(false);
      }
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocument(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.address || !formData.state || !formData.documentType || !formData.purpose || !document || !selfie) {
      alert('Please fill all required fields and complete document upload and selfie verification.');
      return;
    }

    if (formData.purpose === 'Others' && !formData.otherPurpose) {
      alert('Please specify the purpose when selecting Others.');
      return;
    }

    console.log('KYC Form submitted:', formData);
    setIsSubmitted(true);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 p-3 bg-green-100 rounded-full w-16 h-16 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-700">KYC Submitted Successfully!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Your KYC has been submitted. We will be reverting you back within 24 hours once our Compliance executive verifies your documentation.
            </p>
            <p className="text-gray-600 font-medium">Thank you!</p>
            <Button 
              onClick={() => navigate('/website/vasp-home')}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              Back to VASP Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center text-gray-900">
              KYC Verification Form
            </CardTitle>
            <p className="text-center text-gray-600">
              Complete your Know Your Customer verification to start trading
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Personal Information</h3>
                
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address *</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="Enter your complete address"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="state">State *</Label>
                  <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your state" />
                    </SelectTrigger>
                    <SelectContent>
                      {indianStates.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="monthlyTradingVolume">Monthly Trading Volume (₹)</Label>
                  <Input
                    id="monthlyTradingVolume"
                    value={formData.monthlyTradingVolume}
                    onChange={(e) => handleInputChange('monthlyTradingVolume', e.target.value)}
                    placeholder="Enter expected monthly trading volume"
                    type="number"
                  />
                </div>
              </div>

              {/* Document Verification */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Document Verification</h3>
                
                <div>
                  <Label htmlFor="documentType">Document Type *</Label>
                  <Select value={formData.documentType} onValueChange={(value) => handleInputChange('documentType', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((docType) => (
                        <SelectItem key={docType} value={docType}>
                          {docType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="document">Attach Document *</Label>
                  <div className="mt-2">
                    <input
                      id="document"
                      type="file"
                      onChange={handleDocumentUpload}
                      accept="image/*,.pdf"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        document.getElementById('document')?.click();
                      }}
                      className="w-full flex items-center justify-center space-x-2"
                    >
                      <Upload className="h-4 w-4" />
                      <span>{document ? document.name : 'Choose File'}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Trading Purpose */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Trading Information</h3>
                
                <div>
                  <Label htmlFor="purpose">Purpose of Buying *</Label>
                  <Select value={formData.purpose} onValueChange={(value) => handleInputChange('purpose', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      {purposeOptions.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {purpose}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.purpose === 'Others' && (
                  <div>
                    <Label htmlFor="otherPurpose">Please specify *</Label>
                    <Input
                      id="otherPurpose"
                      value={formData.otherPurpose}
                      onChange={(e) => handleInputChange('otherPurpose', e.target.value)}
                      placeholder="Please specify your purpose"
                      required
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="monthlyVolume">Approximate Monthly Volume (₹)</Label>
                  <Input
                    id="monthlyVolume"
                    value={formData.monthlyVolume}
                    onChange={(e) => handleInputChange('monthlyVolume', e.target.value)}
                    placeholder="Enter approximate monthly volume"
                    type="number"
                  />
                </div>
              </div>

              {/* Live Selfie */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Live Selfie Verification *</h3>
                
                {!isCameraActive && !selfie && (
                  <Button
                    type="button"
                    onClick={startCamera}
                    className="w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center space-x-2"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Start Camera for Live Selfie</span>
                  </Button>
                )}

                {isCameraActive && (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full max-w-md mx-auto rounded-lg border"
                    />
                    <Button
                      type="button"
                      onClick={takeSelfie}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      Take Selfie
                    </Button>
                  </div>
                )}

                {selfie && (
                  <div className="text-center">
                    <img
                      src={selfie}
                      alt="Live Selfie"
                      className="w-full max-w-md mx-auto rounded-lg border"
                    />
                    <p className="text-green-600 font-medium mt-2">✓ Selfie captured successfully</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelfie(null);
                        startCamera();
                      }}
                      className="mt-2"
                    >
                      Retake Selfie
                    </Button>
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Submit Button */}
              <div className="pt-6">
                <Button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 text-lg font-medium"
                >
                  Submit KYC Application
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
