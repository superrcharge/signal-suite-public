import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { renderWithRoute, screen } from '@/test/utils';
import { SheetExportMenu } from './sheet-export-menu';
import { PACE_SLIDE } from './slide-geometry';

const spec = () => ({
  root: document.createElement('div'),
  width: 1056,
  height: 816,
  slide: PACE_SLIDE,
  stem: 'signal-suite-pace-card-asqd',
  title: 'A SQD comms card',
});

function stubClipboard(supported: boolean, secure = true) {
  vi.stubGlobal('isSecureContext', secure);
  if (supported) {
    vi.stubGlobal('ClipboardItem', class {});
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { write: vi.fn() },
      configurable: true,
    });
  } else {
    vi.stubGlobal('ClipboardItem', undefined);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'share this sheet' }));
};

describe('SheetExportMenu', () => {
  it('names its trigger by aria-label, since it is an icon at every width', () => {
    stubClipboard(true);
    renderWithRoute(<SheetExportMenu spec={spec} />, '/pace/asqd');
    expect(screen.getByRole('button', { name: 'share this sheet' })).toBeInTheDocument();
  });

  it('offers the three outputs behind one trigger', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={spec} />, '/pace/asqd');
    await open(user);

    expect(screen.getByRole('menuitem', { name: /^Download \.pptx/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Copy image/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Download \.png/ })).toBeInTheDocument();
  });

  it('says the pptx slide is sized to the sheet, not to a fixed deck shape', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={spec} />, '/pace/asqd');
    await open(user);

    expect(screen.getByRole('menuitem', { name: /Download \.pptx/ })).toHaveTextContent(
      'One slide, sized to this sheet',
    );
  });

  // Disabled with a stated reason rather than hidden: a capability that
  // silently vanishes reads as a broken build.
  it('disables Copy image and says why when the browser cannot do it', async () => {
    stubClipboard(false);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={spec} />, '/pace/asqd');
    await open(user);

    const item = screen.getByRole('menuitem', { name: /^Copy image/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Not supported in this browser');
  });

  it('blames the insecure context specifically when that is the reason', async () => {
    stubClipboard(false, false);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={spec} />, '/pace/asqd');
    await open(user);

    expect(screen.getByRole('menuitem', { name: /^Copy image/ })).toHaveTextContent(
      'Needs a secure connection',
    );
  });

  it('reports rather than throwing when the sheet is not on the page yet', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={() => null} />, '/pace/asqd');
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: /^Download \.png/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The sheet is not ready yet');
  });
});

describe('SheetExportMenu with a deck', () => {
  const never = () => new Promise<never>(() => undefined);

  it('keeps the same three items, and only the .pptx caption says it is the whole deck', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    renderWithRoute(<SheetExportMenu spec={spec} deck={{ hint: 'One slide per phase, drawn as shown', run: never }} />, '/operations/op-1');
    await open(user);

    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Download .pptxOne slide per phase, drawn as shown',
      'Copy imagePaste straight onto a slide',
      'Download .pngFor documents and other apps',
    ]);
  });

  it('runs the deck, not the sheet on screen, for the .pptx item', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    const run = vi.fn(() => Promise.resolve({ ok: true }));
    const onScreen = vi.fn(spec);
    renderWithRoute(<SheetExportMenu spec={onScreen} deck={{ hint: 'h', run }} />, '/operations/op-1');
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: /^Download \.pptx/ }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(onScreen).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('PowerPoint file downloaded.');
  });

  it('shows which slide it is on, and is disabled until the build ends', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    let finish: (r: { ok: boolean }) => void = () => undefined;
    const run = vi.fn((progress: (n: number, of: number) => void) => {
      progress(3, 4);
      return new Promise<{ ok: boolean }>((resolve) => { finish = resolve; });
    });
    renderWithRoute(<SheetExportMenu spec={spec} deck={{ hint: 'h', run }} />, '/operations/op-1');
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: /^Download \.pptx/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Building slide 3 of 4…');
    expect(screen.getByRole('button', { name: 'share this sheet' })).toBeDisabled();
    // The progress line has no close button: it is not something to dismiss mid-build.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();

    finish({ ok: true });
    expect(await screen.findByText('PowerPoint file downloaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'share this sheet' })).toBeEnabled();
  });

  it('surfaces a failed deck through the same error path as a failed slide', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    renderWithRoute(
      <SheetExportMenu spec={spec} deck={{ hint: 'h', run: () => Promise.resolve({ ok: false, error: 'Could not lay out Infil.' }) }} />,
      '/operations/op-1',
    );
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: /^Download \.pptx/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not lay out Infil.');
  });

  it('leaves Copy image and Download .png on the sheet on screen', async () => {
    stubClipboard(true);
    const user = userEvent.setup();
    const onScreen = vi.fn(() => null);
    renderWithRoute(<SheetExportMenu spec={onScreen} deck={{ hint: 'h', run: never }} />, '/operations/op-1');
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: /^Download \.png/ }));

    expect(onScreen).toHaveBeenCalledTimes(1);
  });
});
