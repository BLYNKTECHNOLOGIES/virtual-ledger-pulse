// AM-SEC-2: row/group selection checkboxes only for users who can run a bulk action.
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { useAdsRights } from './adsRights';

export const Checkbox = forwardRef<ElementRef<typeof UiCheckbox>, ComponentPropsWithoutRef<typeof UiCheckbox>>(
  (props, ref) => {
    const { canBulk } = useAdsRights();
    if (!canBulk) return null;
    return <UiCheckbox ref={ref} {...props} />;
  },
);
Checkbox.displayName = 'AdsSelectCheckbox';
