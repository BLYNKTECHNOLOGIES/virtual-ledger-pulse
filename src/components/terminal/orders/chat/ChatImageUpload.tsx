import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useGetChatImageUploadUrl } from '@/hooks/useBinanceActions';
import { toast } from 'sonner';

interface Props {
  orderNo: string;
  onImageSent: (imageUrl: string) => void;
}

export function ChatImageUpload({ orderNo, onImageSent }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const getUploadUrl = useGetChatImageUploadUrl();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      // Step 1: Get pre-signed URL from Binance via SAPI
      const imageName = `${orderNo}_${Date.now()}.jpg`;
      const result = await getUploadUrl.mutateAsync(imageName);
      const data = result?.data?.data || result?.data || result;

      const preSignedUrl = data?.preSignedUrl;
      const imageUrl = data?.imageUrl || data?.imageUr1; // Binance doc has typo "imageUr1"

      if (!preSignedUrl) {
        throw new Error('Failed to get pre-signed upload URL from Binance');
      }
      if (!imageUrl) {
        throw new Error('Failed to get imageUrl from Binance');
      }

      console.log('📸 Got pre-signed URL, uploading image...');

      // Step 2: Upload the image to the pre-signed URL (PUT)
      const uploadResponse = await fetch(preSignedUrl, {
        method: 'PUT',
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      console.log('✅ Image uploaded, sending via WS with imageUrl:', imageUrl);

      // Step 3: Send the imageUrl via WebSocket
      onImageSent(imageUrl);
      
      toast.success('Image sent');
      setPreview(null);
    } catch (err: any) {
      console.error('Image upload error:', err);
      toast.error(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {preview && (
        <div className="absolute bottom-14 left-3 right-3 bg-card border border-border rounded-lg p-2 shadow-lg z-10">
          <div className="flex items-start gap-2">
            <img src={preview} alt="Preview" className="max-h-32 rounded object-contain" />
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={cancelPreview}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {uploading && (
            <p className="text-[10px] text-muted-foreground mt-1">Uploading to Binance...</p>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
