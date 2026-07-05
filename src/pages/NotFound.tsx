import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, LayoutGrid } from "lucide-react";
import blynkIcon from "@/assets/brand/blynk-icon.svg";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-6 overflow-hidden">
      {/* ultra-subtle brand texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_center,hsl(var(--primary))_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        <img
          src={blynkIcon}
          alt="BLYNK Virtual Technologies"
          className="h-10 w-10 mb-6"
        />

        <h1 className="text-7xl md:text-8xl font-semibold tracking-tight text-foreground leading-none">
          404<span className="text-primary">.</span>
        </h1>

        <p className="mt-4 text-base text-muted-foreground">
          The page you're looking for doesn't exist or has moved.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Back to dashboard
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/utility">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Open tools
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
