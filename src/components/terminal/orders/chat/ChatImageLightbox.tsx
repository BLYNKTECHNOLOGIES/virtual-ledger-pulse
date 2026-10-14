import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';

interface Props {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
}

export function ChatImageLightbox({ isOpen, imageUrl, onClose }: Props) {
  const [zoom, setZoom] = useState(1);

  const toggleZoom = useCallback(() => {
    setZoom((z) => (z === 1 ? 2 : 1));
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Chat image</DialogTitle>
        <div className="relative flex items-center justify-center w-full h-[80vh]">
          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-20 h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={onClose}
            aria-label="Close image"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Download */}
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="absolute top-3 right-14 z-20 h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
          >
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open image in new tab"
              title="Open image in new tab"
            >
              <Download className="h-4 w-4" />
            </a>
          </Button>

          {/* Image */}
          <img
            src={imageUrl}
            alt="Chat image"
            className="max-w-full max-h-full object-contain transition-transform duration-200 cursor-zoom-in"
            style={{ transform: `scale(${zoom})` }}
            onClick={toggleZoom}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
