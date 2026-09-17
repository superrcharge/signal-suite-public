import { WaveformLibraryPane } from './WaveformLibraryPane';
import { ServiceLibraryPane } from './ServiceLibraryPane';
import { TransportLibraryPane } from './TransportLibraryPane';
import { PlatformLibraryPane } from './PlatformLibraryPane';
import type { LibraryKey } from './library-keys';

/**
 * The pane for a library key. The Comms Library page and its print route both
 * render it, so it lives here rather than in either page module: a page that
 * exports a second component drags MainLayout and the header into the print
 * route's chunk, and fast refresh wants one component per page file.
 *
 * Each pane owns its own data hook and write gate; `readOnly` is the print
 * route's way of dropping the add form and the row pencils whatever the
 * reader's role. A fifth pane without the prop fails to type-check here.
 */
export function LibraryPane({ lib, readOnly = false }: { lib: LibraryKey; readOnly?: boolean }) {
  switch (lib) {
    case 'waveforms': return <WaveformLibraryPane readOnly={readOnly} />;
    case 'services': return <ServiceLibraryPane readOnly={readOnly} />;
    case 'transports': return <TransportLibraryPane readOnly={readOnly} />;
    case 'platforms': return <PlatformLibraryPane readOnly={readOnly} />;
  }
}
