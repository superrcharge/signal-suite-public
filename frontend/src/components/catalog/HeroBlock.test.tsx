import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils';
import { HeroBlock } from './HeroBlock';
import type { EquipmentService } from '@/types';

function renderServices(services: EquipmentService[]) {
  return render(
    <HeroBlock nomenclature="TEST-1" terminalType="satcom" services={services} />,
  );
}

describe('HeroBlock services rates', () => {
  it('renders committed rates for a normal service', () => {
    const { container } = renderServices([
      { abbrev: 'GX', name: 'Global Express', cir: { dl: 4, ul: 1 }, mir: { dl: 10, ul: 2 } },
    ]);
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('Mbps');
    expect(container.textContent).not.toContain('Best Effort');
  });

  it('renders Best Effort in place of both rate cells when flagged', () => {
    const { container } = renderServices([
      { abbrev: 'BE', name: 'Uncommitted Service', best_effort: true },
    ]);
    const matches = container.textContent?.match(/Best Effort/g) ?? [];
    // Exactly two: the CIR cell and the MIR cell.
    expect(matches.length).toBe(2);
    expect(container.textContent).not.toContain('Mbps');
  });

  it('prefers Best Effort over any rates left on the record', () => {
    const { container } = renderServices([
      { abbrev: 'BE', name: 'Legacy', best_effort: true, cir: { dl: 9, ul: 9 } },
    ]);
    expect(container.textContent).toContain('Best Effort');
    expect(container.textContent).not.toContain('9');
  });

  it('still shows N/A for a service with neither rates nor the flag', () => {
    const { container } = renderServices([{ abbrev: 'X', name: 'Unknown' }]);
    expect(container.textContent).toContain('N/A');
    expect(container.textContent).not.toContain('Best Effort');
  });
});
