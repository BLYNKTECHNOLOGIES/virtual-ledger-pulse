import type { ImgHTMLAttributes } from 'react';
import { useThemeMode } from '@/contexts/ThemeContext';
import { brandLogos } from '@/lib/brandLogos';
import { cn } from '@/lib/utils';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  variant?: 'full' | 'text' | 'icon';
  theme?: 'light' | 'dark';
};

export function BrandLogo({ variant = 'full', theme, className, alt = 'BlynkEx', ...props }: Props) {
  const globalTheme = useThemeMode();
  const dark = (theme ?? globalTheme.theme) === 'dark';
  const src = variant === 'icon'
    ? brandLogos.icon
    : variant === 'text'
      ? dark ? brandLogos.white : brandLogos.black
      : dark ? brandLogos.whiteWithLogo : brandLogos.blackWithLogo;

  return <img {...props} src={src} alt={alt} className={cn('object-contain shrink-0', className)} />;
}