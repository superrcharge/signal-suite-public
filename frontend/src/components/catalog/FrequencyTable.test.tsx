import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils';
import { FrequencyTable } from './FrequencyTable';

describe('FrequencyTable - radio', () => {
  it('renders a numeric min–max range with its unit', () => {
    const { container } = render(
      <FrequencyTable terminalType="radio" bands={[{ band: 'VHF', freq_min: 225, freq_max: 400, freq_unit: 'MHz' }]} />,
    );
    expect(container.textContent).toContain('225–400');
    expect(container.textContent).toContain('MHz');
  });

  it('honors the GHz unit', () => {
    const { container } = render(
      <FrequencyTable terminalType="radio" bands={[{ band: 'L', freq_min: 1.2, freq_max: 1.6, freq_unit: 'GHz' }]} />,
    );
    expect(container.textContent).toContain('1.2–1.6');
    expect(container.textContent).toContain('GHz');
  });

  it('falls back to legacy uplink/downlink strings when no numeric range is set', () => {
    const { container } = render(
      <FrequencyTable terminalType="radio" bands={[{ band: 'HF', downlink: '3–30 MHz' }]} />,
    );
    expect(container.textContent).toContain('3–30 MHz');
  });

  it('renders N/A for bands with no frequency data', () => {
    const { container } = render(<FrequencyTable terminalType="radio" bands={[]} />);
    expect(container.textContent).toContain('N/A');
  });

  it('uses a single Frequency column, not RX/TX', () => {
    const { queryByText } = render(<FrequencyTable terminalType="radio" bands={[]} />);
    expect(queryByText('Frequency')).not.toBeNull();
    expect(queryByText('RX')).toBeNull();
    expect(queryByText('TX')).toBeNull();
  });
});

describe('FrequencyTable - satcom regression', () => {
  it('still renders RX/TX/EIRP/G-T columns', () => {
    const { getByText } = render(
      <FrequencyTable
        terminalType="satcom"
        bands={[{ band: 'Ka', downlink: '19.7–20.2 GHz', uplink: '29.5–30.0 GHz', eirp: 55, gt: 10 }]}
      />,
    );
    expect(getByText('RX')).toBeInTheDocument();
    expect(getByText('TX')).toBeInTheDocument();
    expect(getByText('EIRP')).toBeInTheDocument();
    expect(getByText('G/T')).toBeInTheDocument();
  });
});
