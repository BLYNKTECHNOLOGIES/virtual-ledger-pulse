import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

const InteractiveMap = () => {
  const officeAddress = "BLYNK VIRTUAL TECHNOLOGIES PVT LTD, 1st Floor Balwant Arcade, Plot No. 15, opp. GK Palace Hotel, Maharana Pratap Nagar, Bhopal, Madhya Pradesh 462011";
  // Google Maps Static API with red marker at office location
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=23.2599,77.4126&zoom=15&size=600x300&markers=color:red%7C23.2599,77.4126&key=AIzaSyBFw0Qbyq9zTFTd-tUY6dw901SwHHrrwdo`;
  const directionsUrl = "https://www.google.com/maps/dir//BLYNK+VIRTUAL+TECHNOLOGIES+PVT+LTD,+1st+Floor+Balwant+Arcade,+Plot+No.+15,+opp.+GK+Palace+Hotel,+Maharana+Pratap+Nagar,+Bhopal,+Madhya+Pradesh+462011";

  return (
    <div className="relative h-64 rounded-3xl overflow-hidden border border-primary/10 group cursor-pointer">
      <img
        src={staticMapUrl}
        alt="BLYNK VIRTUAL TECHNOLOGIES Office Location"
        className="w-full h-full object-cover"
        onClick={() => window.open(directionsUrl, '_blank')}
      />
      
      {/* Overlay with office info */}
      <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm border border-primary/10 rounded-xl px-4 py-3 shadow-lg max-w-xs">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-1">BLYNK VIRTUAL TECHNOLOGIES</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Balwant Arcade, Plot No. 15<br/>
              Maharana Pratap Nagar<br/>
              Bhopal, MP 462011
            </p>
          </div>
        </div>
      </div>

      {/* Get Directions Button */}
      <div className="absolute bottom-4 right-4">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg hover:shadow-primary/20"
        >
          <ExternalLink className="h-4 w-4" />
          Get Directions
        </a>
      </div>
    </div>
  );
};

export default InteractiveMap;