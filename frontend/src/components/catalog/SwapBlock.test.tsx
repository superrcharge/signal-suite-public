import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils';
import { SwapBlock } from './SwapBlock';

describe('SwapBlock - weight', () => {
  it('renders legacy lbs (no weight_unit) as pounds', () => {
    const { container } = render(<SwapBlock swap={{ weight: 2 }} />);
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('lbs');
    expect(container.textContent).not.toContain('oz');
  });

  it('renders oz-only mode as ounces', () => {
    const { container } = render(<SwapBlock swap={{ weight_oz: 32, weight_unit: 'oz' }} />);
    expect(container.textContent).toContain('32');
    expect(container.textContent).toContain('oz');
  });

  it('renders combined lbs + oz', () => {
    const { container } = render(
      <SwapBlock swap={{ weight: 2, weight_oz: 4, weight_unit: 'lbs_oz' }} />,
    );
    expect(container.textContent).toContain('2 lbs 4 oz');
  });

  it('omits a zero part in combined mode', () => {
    const { container } = render(
      <SwapBlock swap={{ weight: 2, weight_oz: 0, weight_unit: 'lbs_oz' }} />,
    );
    expect(container.textContent).toContain('2 lbs');
    expect(container.textContent).not.toContain('0 oz');
  });

  it('renders N/A when weight is absent', () => {
    const { container } = render(<SwapBlock swap={{ power: '70 W' }} />);
    // The Weight row should show N/A (Size and Power rows exist too, so at least one N/A).
    expect(container.textContent).toContain('N/A');
  });
});
