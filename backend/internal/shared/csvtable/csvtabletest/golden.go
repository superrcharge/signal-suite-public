package csvtabletest

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// update rewrites the golden files instead of comparing against them:
//
//	go test ./internal/domain/... -update
//
// Regenerate deliberately and read the diff. A golden file that is refreshed
// without anyone looking at what changed is worse than no golden file, because
// it carries the authority of a test while asserting nothing.
var update = flag.Bool("update", false, "rewrite csv golden files instead of comparing")

// Golden compares got against testdata/<name>, or writes it when -update is set.
//
// These exist so the csvtable migration is a refactor with proof rather than a
// rewrite with hope: the fixtures are captured from the code as it shipped, and
// the migrated code has to reproduce them byte for byte.
func Golden(t *testing.T, name, got string) {
	t.Helper()

	// Cleaned and joined from a literal directory, so the name cannot escape
	// testdata even if a caller passes something careless.
	path := filepath.Join("testdata", filepath.Clean("/"+name))
	if *update {
		if err := os.MkdirAll("testdata", 0o750); err != nil {
			t.Fatalf("creating testdata: %v", err)
		}
		if err := os.WriteFile(path, []byte(got), 0o600); err != nil {
			t.Fatalf("writing %s: %v", path, err)
		}
		t.Logf("wrote %s", path)
		return
	}

	want, err := os.ReadFile(path) // #nosec G304 -- fixture path is testdata/ joined with a cleaned literal name
	if err != nil {
		t.Fatalf("reading %s: %v\n\nRun the test with -update to create it.", path, err)
	}
	if got == string(want) {
		return
	}
	t.Errorf("%s does not match.\n\n%s", path, diff(string(want), got))
}

// diff reports the first differing line, which for CSV is almost always more
// useful than dumping two whole files side by side.
func diff(want, got string) string {
	wantLines := strings.Split(want, "\n")
	gotLines := strings.Split(got, "\n")
	for i := 0; i < len(wantLines) || i < len(gotLines); i++ {
		w, g := at(wantLines, i), at(gotLines, i)
		if w == g {
			continue
		}
		return "first difference at line " + itoa(i+1) + ":\n" +
			"  want: " + w + "\n" +
			"   got: " + g + "\n\n" +
			"If this change is intended, re-run with -update and read the diff."
	}
	return "files differ only in trailing content"
}

func at(lines []string, i int) string {
	if i < len(lines) {
		return lines[i]
	}
	return "(no line)"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
