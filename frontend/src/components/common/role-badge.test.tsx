import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/utils';
import { RoleBadge } from './role-badge';
import { ROLES } from '@/types/roles';

describe('RoleBadge', () => {
  it.each(ROLES)('renders the %s role text', (role) => {
    render(<RoleBadge role={role} />);

    expect(screen.getByText(role)).toBeInTheDocument();
  });

  it('renders trailing content when passed', () => {
    render(<RoleBadge role="admin" trailing={<span>chevron</span>} />);

    expect(screen.getByText('chevron')).toBeInTheDocument();
  });

  it('renders without optional props', () => {
    expect(() => render(<RoleBadge role="viewer" />)).not.toThrow();
  });
});
