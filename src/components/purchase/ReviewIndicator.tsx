import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Check, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface Review {
  id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  created_by: string | null;
}

interface ReviewIndicatorProps {
  orderId: string;
  onNewReview?: () => void;
}

export function ReviewIndicator({ orderId, onNewReview }: ReviewIndicatorProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const unreadCount = reviews.filter(r => !r.is_read).length;

  // Fetch reviews for this order
  const fetchReviews = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_order_reviews")
        .select("id, message, created_at, is_read, created_by")
        .eq("purchase_order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Mark a single review as read
  const markAsRead = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from("purchase_order_reviews")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          read_by: user?.id || null,
        })
        .eq("id", reviewId);

      if (error) throw error;
      
      setReviews(prev =>
        prev.map(r => (r.id === reviewId ? { ...r, is_read: true } : r))
      );
    } catch (error) {
      console.error("Error marking review as read:", error);
    }
  };

  // Mark all reviews as read
  const markAllAsRead = async () => {
    const unreadIds = reviews.filter(r => !r.is_read).map(r => r.id);
    if (unreadIds.length === 0) return;

    try {
      const { error } = await supabase
        .from("purchase_order_reviews")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          read_by: user?.id || null,
        })
        .in("id", unreadIds);

      if (error) throw error;
      
      setReviews(prev => prev.map(r => ({ ...r, is_read: true })));
    } catch (error) {
      console.error("Error marking all reviews as read:", error);
    }
  };

  useEffect(() => {
    fetchReviews();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`reviews-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "purchase_order_reviews",
          filter: `purchase_order_id=eq.${orderId}`,
        },
        (payload) => {
          const newReview = payload.new as Review;
          setReviews(prev => [newReview, ...prev]);
          onNewReview?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, onNewReview]);

  if (reviews.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1 relative",
            unreadCount > 0 && "border-primary text-primary animate-pulse"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-medium text-sm">Reviews</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-64">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : (
            <div className="divide-y">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    !review.is_read && "bg-primary/5"
                  )}
                  onClick={() => !review.is_read && markAsRead(review.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{review.message}</p>
                    {review.is_read && (
                      <Check className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(review.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
