import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { FacetSidebar } from './FacetSidebar';

const noop = () => {};

function renderRail(height?: string) {
  render(
    <FacetSidebar
      models={[]}
      appliedCount={0}
      shownCount={0}
      paused={[]}
      onToggleValue={noop}
      onToggleBlank={noop}
      onSetRange={noop}
      onClearAll={noop}
      onClearTerm={noop}
      onClearPaused={noop}
      expanded={new Set()}
      expandedTails={new Set()}
      onToggleCollapsed={noop}
      onToggleTail={noop}
      onSetAllExpanded={noop}
      height={height}
    />,
  );
  return screen.getByRole('complementary', { name: 'Filters' });
}

describe('FacetSidebar height', () => {
  it('uses an explicit height when one is passed', () => {
    const root = renderRail('400px');
    expect(root.style.height).toBe('400px');
    expect(root.getAttribute('style')).not.toContain('100vh');
  });

  it('defaults to the viewport below the header', () => {
    const root = renderRail();
    expect(root.getAttribute('style')).toContain('100vh');
  });
});
