type PillStatus = 'operational' | 'caution' | 'nogo' | 'info' | 'standby';

interface StatusPillProps {
  status?: PillStatus;
  label?: string;
}

const variants: Record<PillStatus, { bg: string; fg: string; bd: string; pip: string; text: string }> = {
  operational: { bg: 'rgba(79,174,91,0.12)',  fg: '#2E6B36', bd: 'rgba(79,174,91,0.4)',   pip: '#4FAE5B', text: 'Operational' },
  caution:     { bg: 'rgba(245,162,31,0.16)', fg: '#7A4F0A', bd: 'rgba(245,162,31,0.5)',  pip: '#F5A21F', text: 'Caution'     },
  nogo:        { bg: 'rgba(212,58,47,0.12)',  fg: '#8A1F18', bd: 'rgba(212,58,47,0.45)',  pip: '#D43A2F', text: 'No-Go'       },
  info:        { bg: 'rgba(59,143,214,0.12)', fg: '#1F4F7A', bd: 'rgba(59,143,214,0.45)', pip: '#3B8FD6', text: 'Info'        },
  standby:     { bg: '#25292D',               fg: '#F4F2EC', bd: '#25292D',               pip: '#9AA0A8', text: 'Standby'     },
};

export function StatusPill({ status = 'operational', label }: StatusPillProps) {
  const v = variants[status] ?? variants.operational;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 11px', borderRadius: 999,
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.pip }} />
      {label ?? v.text}
    </span>
  );
}
