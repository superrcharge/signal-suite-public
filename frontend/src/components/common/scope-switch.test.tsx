import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@/test/utils';
import { renderWithRoute } from '@/test/utils';
import { ScopeSwitch } from './scope-switch';
import { useTerminals, useKits } from '@/services';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/services', () => ({
  useTerminals: vi.fn(),
  useKits: vi.fn(),
}));

const mockUseTerminals = vi.mocked(useTerminals);
const mockUseKits = vi.mocked(useKits);

// Only `total` is read off the query result, so the rest is not worth faking.
function mockTotal<T>(total: number | undefined): T {
  return { data: total == null ? undefined : { total } } as T;
}

describe('ScopeSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTerminals.mockReturnValue(mockTotal(87));
    mockUseKits.mockReturnValue(mockTotal(4));
  });

  it('shows the host total on the active side and the fetched total on the other', () => {
    renderWithRoute(<ScopeSwitch active="terminals" count={12} />, '/terminals?sections=noc');

    expect(screen.getByRole('button', { name: /terminals/i })).toHaveTextContent('Terminals12');
    expect(screen.getByRole('button', { name: /kits/i })).toHaveTextContent('Kits4');
  });

  it('fetches the counterpart list scoped to the active sections filter', () => {
    renderWithRoute(<ScopeSwitch active="terminals" count={12} />, '/terminals?sections=noc,ram');

    expect(mockUseKits).toHaveBeenCalledWith({ sections: 'noc,ram', limit: 1 });
    expect(mockUseTerminals).not.toHaveBeenCalled();
  });

  it('scopes the counterpart count to the search term as well', () => {
    renderWithRoute(
      <ScopeSwitch active="terminals" count={0} search="nakamura" />,
      '/terminals?sections=asqd',
    );

    expect(mockUseKits).toHaveBeenCalledWith({
      sections: 'asqd',
      search: 'nakamura',
      limit: 1,
    });
  });

  it('ignores a search term below the two-character threshold', () => {
    renderWithRoute(<ScopeSwitch active="terminals" count={12} search="n" />, '/terminals');

    expect(mockUseKits).toHaveBeenCalledWith({
      sections: undefined,
      search: undefined,
      limit: 1,
    });
  });

  it('carries the live search term across the switch', async () => {
    const user = userEvent.setup();
    renderWithRoute(
      <ScopeSwitch active="terminals" count={0} search="nakamura" />,
      '/terminals?sections=asqd&search=stale',
    );

    await user.click(screen.getByRole('button', { name: /kits/i }));

    expect(navigateMock).toHaveBeenCalledWith('/kits?sections=asqd&search=nakamura');
  });

  it('drops a stale ?search= when the box has been cleared', async () => {
    const user = userEvent.setup();
    renderWithRoute(
      <ScopeSwitch active="terminals" count={12} search="" />,
      '/terminals?sections=asqd&search=stale',
    );

    await user.click(screen.getByRole('button', { name: /kits/i }));

    expect(navigateMock).toHaveBeenCalledWith('/kits?sections=asqd');
  });

  it('marks the active scope as selected', () => {
    renderWithRoute(<ScopeSwitch active="kits" count={4} />, '/kits');

    expect(screen.getByRole('button', { name: /kits/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /terminals/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('carries the shared params across and drops entity-specific and drawer state', async () => {
    const user = userEvent.setup();
    renderWithRoute(
      <ScopeSwitch active="terminals" count={12} />,
      '/terminals?sections=noc&status=up&limit=100&model=mini&tag=exercise&drawer=edit&id=abc&focus=notes',
    );

    await user.click(screen.getByRole('button', { name: /kits/i }));

    expect(navigateMock).toHaveBeenCalledWith('/kits?sections=noc&status=up&limit=100');
  });

  it('does not navigate when the active scope is clicked again', async () => {
    const user = userEvent.setup();
    renderWithRoute(<ScopeSwitch active="terminals" count={12} />, '/terminals?sections=noc');

    await user.click(screen.getByRole('button', { name: /terminals/i }));

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('omits the query string when there is nothing to carry', async () => {
    const user = userEvent.setup();
    renderWithRoute(<ScopeSwitch active="kits" count={4} />, '/kits?type=ifk');

    await user.click(screen.getByRole('button', { name: /terminals/i }));

    expect(navigateMock).toHaveBeenCalledWith('/terminals');
  });
});
