import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SheetHeader } from './SheetHeader';
import { formatCardDate } from './pace-constants';

describe('formatCardDate', () => {
  it('prints a day, an uppercase month name and a year', () => {
    expect(formatCardDate('2026-08-20')).toBe('20 AUG 2026');
  });

  it('echoes back anything it cannot read', () => {
    expect(formatCardDate('20 AUG 2026')).toBe('20 AUG 2026');
    expect(formatCardDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('SheetHeader', () => {
  it('draws the title, the formatted date and the version as separate elements', () => {
    render(<SheetHeader title="Exercise One" effectiveDate="2026-08-20" version="v2" />);
    expect(screen.getByText('Exercise One')).toBeInTheDocument();
    expect(screen.getByText('20 AUG 2026')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    // Siblings, not spans in one line: the slide export emits one text box
    // per laid-out element.
    expect(screen.getByText('20 AUG 2026').parentElement).toBe(screen.getByText('v2').parentElement);
  });

  it('falls back to a placeholder title and no date line', () => {
    const { container } = render(<SheetHeader title="" effectiveDate="" version="" />);
    expect(screen.getByText('Untitled card')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('marks only the changed values', () => {
    render(
      <SheetHeader title="T" effectiveDate="2026-08-20" version="v3" highlights={['version']} />,
    );
    expect(screen.getByText('v3')).toHaveAttribute('data-changed', 'true');
    expect(screen.getByText('20 AUG 2026')).not.toHaveAttribute('data-changed');
    expect(screen.getByText('T')).not.toHaveAttribute('data-changed');
  });
});
