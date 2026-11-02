import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils';
import { buildMatrix } from './compat-matrix-model';
import { MatrixPrintPreview } from './matrix-print-preview';
import type { MatrixParams } from './compat-matrix-params';

const navigate = vi.fn();
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => navigate,
}));

const model = buildMatrix({
  platforms: [{
    id: 'p1', designation: 'UH-60L', popular_name: 'Black Hawk', category: ['USA'], type: 'aircraft',
    waveform_abbrevs: ['L16'], equipment_ids: [],
  }],
  equipment: [],
  waveforms: [{ id: 'w1', abbrev: 'L16', name: 'Link 16' }] as never,
  selected: ['all'],
  omitEmptyRows: true,
});

const params = { fit: false, branches: [] } as unknown as MatrixParams;

function setup(over: { print?: boolean; ready?: boolean } = {}) {
  const onToggleFit = vi.fn();
  const onPrint = vi.fn();
  const view = render(
    <MatrixPrintPreview
      model={model} params={params} ready={over.ready ?? true}
      title="Matrix: print preview" backHref="/back?x=1"
      onToggleFit={onToggleFit} onPrint={onPrint} print={over.print ?? false}
    />,
  );
  return { ...view, onToggleFit, onPrint };
}

const pageCss = () => [...document.head.querySelectorAll('style')]
  .map(s => s.textContent ?? '').filter(t => t.includes('@page'));

// jsdom has no FontFaceSet; print mode waits on `document.fonts.ready`.
Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  document.head.querySelectorAll('style').forEach(s => { if (s.textContent?.includes('@page')) s.remove(); });
});

describe('MatrixPrintPreview', () => {
  it('renders the toolbar title and a back link that navigates to backHref', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByText('Matrix: print preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to compatibility/i }));
    expect(navigate).toHaveBeenCalledWith('/back?x=1');
  });

  it('toggles Fit through its handler', async () => {
    const user = userEvent.setup();
    const { onToggleFit } = setup();
    await user.click(screen.getByRole('button', { name: 'Fit to one page' }));
    expect(onToggleFit).toHaveBeenCalledTimes(1);
  });

  it('does not print, or inject @page, in the preview', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup({ print: false });
    await new Promise(r => setTimeout(r, 50));
    expect(print).not.toHaveBeenCalled();
    expect(pageCss()).toHaveLength(0);
  });

  it('calls window.print once when print and ready', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup({ print: true });
    await waitFor(() => { expect(print).toHaveBeenCalledTimes(1); }, { timeout: 4000 });
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('does not print before ready', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup({ print: true, ready: false });
    await new Promise(r => setTimeout(r, 50));
    expect(print).not.toHaveBeenCalled();
  });

  it('keeps the @page style in document.head while mounted and removes it on unmount', () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { unmount } = setup({ print: true });
    expect(pageCss().join(' ')).toContain('size: letter landscape');
    unmount();
    expect(pageCss()).toHaveLength(0);
  });

  it('draws the default heading, or a given title and subtitle', () => {
    const { unmount } = setup();
    expect(screen.getAllByText('Joint Compatibility Matrix').length).toBeGreaterThan(0);
    unmount();
    render(
      <MatrixPrintPreview
        model={model} params={params} ready title="t" backHref="/b"
        heading={{ title: 'Operation Matrix', subtitle: 'Phase 2' }}
        onToggleFit={vi.fn()} onPrint={vi.fn()} print={false}
      />,
    );
    expect(screen.getAllByText('Operation Matrix').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Phase 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Joint Compatibility Matrix')).not.toBeInTheDocument();
  });
});
