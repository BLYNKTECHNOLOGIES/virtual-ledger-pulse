import { render, screen } from '@testing-library/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describe, it, expect } from 'vitest';

describe('radix select closed value', () => {
  it('plain text', () => {
    render(<Select value="a"><SelectTrigger><SelectValue placeholder="PH" /></SelectTrigger><SelectContent><SelectItem value="a">Wallet A</SelectItem></SelectContent></Select>);
    expect(document.body.textContent).toContain('Wallet A');
  });
  it('nested div', () => {
    render(<Select value="b"><SelectTrigger><SelectValue placeholder="PH2" /></SelectTrigger><SelectContent><SelectItem value="b"><div><span>Wallet B</span></div></SelectItem></SelectContent></Select>);
    expect(document.body.textContent).toContain('Wallet B');
  });
});
