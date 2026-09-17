import { useNavigate, useSearchParams } from 'react-router';
import { PrintPageShell } from '@/components/common/sheet-export';
import { LibraryPane } from '@/components/catalog/library-pane';
import { isLibraryKey, libraryLabel, libraryQuery } from '@/components/catalog/library-keys';

/**
 * One Comms Library pane, chrome free and read only, for print and Save as
 * PDF. Read only so the add form and the row pencils never reach paper,
 * whatever the reader's role. Portrait: a library is a list.
 *
 * The pane prints in its own dark palette. It has one palette, the compare
 * preview's Dark, and a paper version would be a second table; a reader who
 * wants ink-on-white has the CSV export.
 */
export function CommsLibraryPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const param = searchParams.get('lib');
  const lib = isLibraryKey(param) ? param : 'waveforms';
  const label = libraryLabel(lib);

  return (
    <PrintPageShell
      orientation="portrait"
      rootAttr="data-library-print-root"
      backLabel="Back to library"
      onBack={() => { void navigate(`/catalog/comms-library${libraryQuery(lib)}`); }}
      rootAriaLabel={`${label} library, print view`}
    >
      <LibraryPane lib={lib} readOnly />
    </PrintPageShell>
  );
}
