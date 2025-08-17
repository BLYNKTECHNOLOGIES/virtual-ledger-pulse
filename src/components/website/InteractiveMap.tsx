import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

const InteractiveMap = () => {
  const officeAddress = "BLYNK VIRTUAL TECHNOLOGIES PVT LTD, 1st Floor Balwant Arcade, Plot No. 15, opp. GK Palace Hotel, Maharana Pratap Nagar, Bhopal, Madhya Pradesh 462011";
  // Google Maps iframe with proper marker and location
  const googleMapsUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3665.8616442424545!2d77.41017457528654!3d23.259919179047675!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x397c428f8fd68fbd%3A0x2155716d572d4808!2sBalwant%20Arcade%2C%20Plot%20No.15%2C%20opp.%20GK%20Palace%20Hotel%2C%20Zone%20II%2C%20Maharana%20Pratap%20Nagar%2C%20Bhopal%2C%20Madhya%20Pradesh%20462011!5e0!3m2!1sen!2sin!4v1734440000000!5m2!1sen!2sin";
  const directionsUrl = "https://www.google.com/maps/dir//23.2599,77.4126/@23.2599,77.4126,15z";

  return (
    <div className="relative h-64 rounded-3xl overflow-hidden border border-primary/10 group">
      <iframe
        src={googleMapsUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="BLYNK VIRTUAL TECHNOLOGIES Office Location"
        className="w-full h-full"
      />
      
      {/* Custom Red Marker Overlay */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full pointer-events-none">
        <div className="relative">
          <div className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>
          <div className="w-1 h-4 bg-red-500 mx-auto"></div>
        </div>
      </div>
      
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