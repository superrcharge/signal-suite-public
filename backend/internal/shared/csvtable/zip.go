package csvtable

import (
	"archive/zip"
	"bytes"
	"time"
)

// ZipEntry is one file inside a bundle.
type ZipEntry struct {
	Name string
	Body string
}

// Zip writes entries into a deterministic archive.
//
// Deterministic is not cosmetic. archive/zip stamps each entry with a modified
// time, and taking that from the clock would make two identical bundles differ
// byte for byte, which is exactly what stops a golden test of a bundle being
// possible at all. The caller supplies one time for every entry, and entries are
// written in the order given.
//
// Same reasoning as Bound.Export emitting canonical column order rather than the
// caller's: the same selection should always produce the same bytes.
func Zip(entries []ZipEntry, modified time.Time) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	for _, e := range entries {
		header := &zip.FileHeader{
			Name:     e.Name,
			Method:   zip.Deflate,
			Modified: modified.UTC(),
		}
		f, err := w.CreateHeader(header)
		if err != nil {
			return nil, err
		}
		if _, err := f.Write([]byte(e.Body)); err != nil {
			return nil, err
		}
	}

	// Close, not Flush: the central directory is written by Close, and an archive
	// without one is not a zip file. Deferring it would swallow that error.
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
