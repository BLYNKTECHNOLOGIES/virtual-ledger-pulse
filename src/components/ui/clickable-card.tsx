import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export interface ClickableCardProps extends React.HTMLAttributes<HTMLDivElement> {
  to?: string;
  searchParams?: Record<string, string>;
  children: React.ReactNode;
  showIndicator?: boolean;
  disabled?: boolean;
}

/**
 * ClickableCard - A wrapper component that makes any card navigable
 * When clicked, navigates to the specified route with optional search params
 * 
 * @param to - The route to navigate to (e.g., "/sales", "/clients")
 * @param searchParams - Query params to append (e.g., { status: "COMPLETED", tab: "all" })
 * @param showIndicator - Whether to show a visual indicator that the card is clickable
 * @param disabled - Whether the click functionality is disabled
 */
export function ClickableCard({
  to,
  searchParams,
  children,
  showIndicator = false,
  disabled = false,
  className,
  ...props
}: ClickableCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (disabled || !to) return;

    let url = to;
    if (searchParams && Object.keys(searchParams).length > 0) {
      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url = `${to}?${queryString}`;
      }
    }
    navigate(url);
  };

  if (!to || disabled) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "cursor-pointer transition-all duration-200 group relative",
        "hover:ring-2 hover:ring-primary/20 hover:ring-offset-2",
        className
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      {...props}
    >
      {children}
      {showIndicator && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to build filter params for different transaction types
 */
export function buildTransactionFilters(options: {
  dateFrom?: Date;
  dateTo?: Date;
  type?: string;
  status?: string;
  category?: string;
  tab?: string;
}): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (options.dateFrom) {
    params.dateFrom = options.dateFrom.toISOString().split('T')[0];
  }
  if (options.dateTo) {
    params.dateTo = options.dateTo.toISOString().split('T')[0];
  }
  if (options.type) {
    params.type = options.type;
  }
  if (options.status) {
    params.status = options.status;
  }
  if (options.category) {
    params.category = options.category;
  }
  if (options.tab) {
    params.tab = options.tab;
  }
  
  return params;
}

/**
 * Hook to read filter params from URL
 */
export function useFilterParams() {
  const [searchParams] = useSearchParams();
  
  return {
    dateFrom: searchParams.get('dateFrom'),
    dateTo: searchParams.get('dateTo'),
    type: searchParams.get('type'),
    status: searchParams.get('status'),
    category: searchParams.get('category'),
    tab: searchParams.get('tab'),
    getAll: () => Object.fromEntries(searchParams.entries())
  };
}
