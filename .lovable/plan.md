

# Plan: Volume Drop Detection System & Client Age Filter

## Overview
Add two new powerful features to the Client Directory:
1. **Volume Trend Indicator** - Visually identify clients whose trading volume has dropped over configurable periods (Month-on-Month or 10-day rolling windows)
2. **Client Age Filter** - Filter clients based on how long they've been onboarded (useful for targeting established vs new clients)

---

## Feature 1: Volume Drop Detection System

### Concept
Compare a client's recent trading volume against their previous period to calculate a **Volume Change %**. Display this as a visual indicator in the table and allow filtering by trend direction.

### Period Options
| Period Type | Current Period | Previous Period | Use Case |
|-------------|---------------|-----------------|----------|
| 10-Day Rolling | Last 10 days | Previous 10 days (day 11-20) | High-frequency business tracking |
| Month-on-Month | Current month | Previous month | Standard monthly comparison |

### Volume Trend Categories
| Category | Change % | Badge Color | Icon |
|----------|----------|-------------|------|
| Growing | > +10% | Green | TrendingUp |
| Stable | -10% to +10% | Gray | Minus |
| Declining | -10% to -30% | Yellow | TrendingDown |
| Dropping | < -30% | Red | TrendingDown (bold) |
| New | No previous data | Blue | Sparkles |

### UI Implementation

**Table Column** - Add a "Volume Trend" column showing:
```
+------------------+
| ▲ +25%           |  <- Green badge with up arrow
| ▼ -45%           |  <- Red badge with down arrow  
| ─ +3%            |  <- Gray badge with stable icon
| ✦ New            |  <- Blue badge for new clients
+------------------+
```

**Filter Options**:
- Period Selector: Dropdown to choose "10-Day" or "Month-on-Month"
- Trend Filter: Multi-select for Growing/Stable/Declining/Dropping/New
- Volume Change Range: Min-Max inputs for exact % range (e.g., find clients with -50% to -30% drop)

---

## Feature 2: Client Age Filter

### Concept
Filter clients based on `date_of_onboarding` field to identify:
- Recently onboarded clients (for follow-up)
- Established clients (for loyalty programs)
- Long-term dormant clients (for win-back)

### Filter UI
```
Client Age (Days Since Onboarding)
Min [____] to Max [____] days
```

**Common Use Cases**:
| Filter Setting | Purpose |
|---------------|---------|
| Min: 0, Max: 30 | New clients in first month |
| Min: 90, Max: ∞ | Established clients (3+ months) |
| Min: 180, Max: ∞ | Long-term clients (6+ months) |

---

## Technical Implementation

### 1. Extend `useClientTypeFromOrders` Hook

Add new fields to `ClientOrderData` interface:
```typescript
interface ClientOrderData {
  // ... existing fields ...
  
  // Volume trend metrics
  currentPeriodValue: number;      // Value in current period
  previousPeriodValue: number;     // Value in previous period
  volumeChangePercent: number | null;  // % change
  volumeTrend: 'growing' | 'stable' | 'declining' | 'dropping' | 'new';
  
  // For 10-day comparison
  last10DaysValue: number;
  prev10DaysValue: number;
  
  // For month comparison  
  currentMonthValue: number;
  previousMonthValue: number;
}
```

Query modifications to fetch orders with dates for period-based aggregation:
```typescript
// Group orders by period
const last10Days = subDays(today, 10);
const prev10Days = subDays(today, 20);
const currentMonthStart = startOfMonth(today);
const previousMonthStart = startOfMonth(subMonths(today, 1));
const previousMonthEnd = endOfMonth(subMonths(today, 1));

// Calculate period values
const last10DaysOrders = clientOrders.filter(o => 
  new Date(o.order_date) >= last10Days
);
const prev10DaysOrders = clientOrders.filter(o => 
  new Date(o.order_date) >= prev10Days && 
  new Date(o.order_date) < last10Days
);
```

### 2. Update `ClientFilters` Interface

Add new filter fields:
```typescript
interface ClientFilters {
  // ... existing fields ...
  
  // Volume trend filters
  volumePeriod: '10-day' | 'month';
  volumeTrends: string[];  // ['growing', 'stable', 'declining', 'dropping', 'new']
  volumeChangeMin: string;
  volumeChangeMax: string;
  
  // Client age filter
  clientAgeMin: string;  // days since onboarding
  clientAgeMax: string;
}
```

### 3. Filter Panel UI Updates

Add new section to `ClientDirectoryFilters.tsx`:

```
+------------------------------------------------------------------+
| VOLUME & ENGAGEMENT                                               |
+------------------------------------------------------------------+
| Comparison Period: [10-Day ▼]                                     |
|                                                                   |
| Volume Trend: [▼ Select...] (Growing, Stable, Declining, etc.)   |
|                                                                   |
| Volume Change %: Min [___]% to Max [___]%                        |
+------------------------------------------------------------------+
| CLIENT AGE                                                        |
+------------------------------------------------------------------+
| Days Since Onboarding: Min [___] to Max [___] days               |
+------------------------------------------------------------------+
```

### 4. Table Column Addition

Add "Trend" column to buyer/seller tables in `ClientDashboard.tsx`:
```typescript
<th className="text-left py-3 px-4 font-medium text-gray-600">Trend</th>

// In row rendering:
<td className="py-3 px-4">
  <VolumeTrendBadge 
    changePercent={orderInfo?.volumeChangePercent} 
    trend={orderInfo?.volumeTrend}
  />
</td>
```

### 5. Volume Trend Badge Component

Create a reusable badge component:
```typescript
function VolumeTrendBadge({ changePercent, trend }) {
  const config = {
    growing: { icon: TrendingUp, color: 'bg-green-100 text-green-800', prefix: '+' },
    stable: { icon: Minus, color: 'bg-gray-100 text-gray-600', prefix: '' },
    declining: { icon: TrendingDown, color: 'bg-yellow-100 text-yellow-800', prefix: '' },
    dropping: { icon: TrendingDown, color: 'bg-red-100 text-red-800', prefix: '' },
    new: { icon: Sparkles, color: 'bg-blue-100 text-blue-800', prefix: '' },
  };
  
  const { icon: Icon, color, prefix } = config[trend];
  
  return (
    <Badge className={color}>
      <Icon className="h-3 w-3 mr-1" />
      {trend === 'new' ? 'New' : `${prefix}${changePercent?.toFixed(0)}%`}
    </Badge>
  );
}
```

---

## Re-Targeting Use Cases Enabled

| Scenario | Filter Configuration |
|----------|---------------------|
| Win back declining high-value clients | Volume Trend: Declining/Dropping + Total Value Min: 100000 |
| Target established clients with drops | Client Age Min: 90 + Volume Change: -50% to -20% |
| Engage new clients early | Client Age Max: 30 + Status: Active |
| Identify at-risk VIPs | Priority: Platinum/Gold + Volume Trend: Declining |
| Re-engage dormant veterans | Client Age Min: 180 + Status: Dormant |
| High-frequency users slowing down | Total Orders Min: 20 + Volume Trend: Dropping |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useClientTypeFromOrders.tsx` | Add period-based volume calculations and trend detection |
| `src/components/clients/ClientDirectoryFilters.tsx` | Add Volume Trend section with period selector, trend filter, change % range; Add Client Age range filter |
| `src/components/clients/ClientDashboard.tsx` | Add "Trend" column to tables, update filter application logic, pass new filter state |

---

## Performance Considerations

- All calculations happen client-side after initial data fetch
- Period-based aggregation reuses already-fetched order data
- Memoize trend calculations to avoid recomputation on every render
- Volume period preference persisted in filter state (not localStorage, resets on page refresh)

---

## Summary

This implementation provides:
- **Visual Volume Trend Indicators** in directory tables with color-coded badges
- **Flexible Period Comparison** (10-day for high-frequency tracking, monthly for standard)
- **Custom Range Filters** for precise targeting by volume change percentage
- **Client Age Filter** to segment by relationship duration
- **Powerful Re-Targeting Combinations** for win-back campaigns

