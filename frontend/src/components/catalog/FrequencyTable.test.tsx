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

  it('shows S- and C-band entries, one row per module', () => {
    const { container } = render(
      <FrequencyTable
        terminalType="radio"
        bands={[
          { band: 'L', freq_min: 1350, freq_max: 1390, freq_unit: 'MHz' },
          { band: 'S', freq_min: 2025, freq_max: 2150, freq_unit: 'MHz' },
          { band: 'S', freq_min: 2200, freq_max: 2507, freq_unit: 'MHz' },
          { band: 'C', freq_min: 4400, freq_max: 5000, freq_unit: 'MHz' },
        ]}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('2025–2150');
    expect(text).toContain('2200–2507');
    expect(text).toContain('4400–5000');
    expect(text.indexOf('1350')).toBeLessThan(text.indexOf('2025'));
    expect(text.indexOf('2507')).toBeLessThan(text.indexOf('4400'));
  });

  it('leaves out the bands a radio does not have', () => {
    const { container, queryByText } = render(
      <FrequencyTable terminalType="radio" bands={[{ band: 'VHF', freq_min: 30, freq_max: 225, freq_unit: 'MHz' }]} />,
    );
    expect(container.textContent).not.toContain('N/A');
    expect(queryByText('HF')).toBeNull();
    expect(queryByText('C')).toBeNull();
  });

  it('keeps an entry whose band is not in the list', () => {
    const { container } = render(
      <FrequencyTable terminalType="radio" bands={[{ band: 'SHF', freq_min: 7, freq_max: 8, freq_unit: 'GHz' }]} />,
    );
    expect(container.textContent).toContain('7–8');
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
