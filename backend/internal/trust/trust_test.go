package trust

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newCA(t *testing.T, cn string, notAfter time.Time) *x509.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              notAfter,
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	c, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func write(t *testing.T, dir, name string, data []byte) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func pemOf(c *x509.Certificate) []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})
}

// goPool loads a directory the way crypto/x509/root_unix.go does: every file
// through AppendCertsFromPEM, nothing else.
func goPool(t *testing.T, dir string) *x509.CertPool {
	t.Helper()
	pool := x509.NewCertPool()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		pool.AppendCertsFromPEM(data)
	}
	return pool
}

func trusted(pool *x509.CertPool, c *x509.Certificate) bool {
	_, err := c.Verify(x509.VerifyOptions{Roots: pool})
	return err == nil
}

// The 2026-09-30 outage, reproduced: a root uploaded as DER sits in the
// directory, Go's loader skips it, and only the PEM copy makes it trusted.
func TestDERRootIsSkippedByGoUntilConverted(t *testing.T) {
	dir := t.TempDir()
	pemRoot := newCA(t, "NSS Root CA 2", time.Now().AddDate(5, 0, 0))
	derRoot := newCA(t, "NSS Root CA 5", time.Now().AddDate(5, 0, 0))
	write(t, dir, "disa-ca.pem", pemOf(pemRoot))
	write(t, dir, "nss-root-ca-5.der", derRoot.Raw)

	before := goPool(t, dir)
	if !trusted(before, pemRoot) {
		t.Fatal("PEM root should be trusted from the original directory")
	}
	if trusted(before, derRoot) {
		t.Fatal("DER root was trusted without conversion; the premise of this package no longer holds")
	}

	rep, err := prepare([]string{dir}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if rep.ConvertedDir == "" {
		t.Fatal("expected a PEM directory for the DER root")
	}
	if !trusted(goPool(t, rep.ConvertedDir), derRoot) {
		t.Fatal("DER root is still not trusted after conversion")
	}
}

func TestReportsFormatSubjectAndExpiry(t *testing.T) {
	dir := t.TempDir()
	expiry := time.Date(2031, 3, 4, 0, 0, 0, 0, time.UTC)
	write(t, dir, "a.cer", pemOf(newCA(t, "PEM CA", expiry)))
	write(t, dir, "b.cer", newCA(t, "DER CA", expiry).Raw)

	rep, err := prepare([]string{dir}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]Cert{}
	for _, c := range rep.Certs {
		got[c.Subject] = c
	}
	for subject, format := range map[string]string{"PEM CA": "pem", "DER CA": "der"} {
		c, ok := got[subject]
		if !ok {
			t.Fatalf("%s not reported; got %+v", subject, rep.Certs)
		}
		if c.Format != format {
			t.Errorf("%s: format %q, want %q", subject, c.Format, format)
		}
		if !c.NotAfter.Equal(expiry) {
			t.Errorf("%s: NotAfter %v, want %v", subject, c.NotAfter, expiry)
		}
	}
}

func TestAllPEMNeedsNoConversion(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "a.cer", pemOf(newCA(t, "PEM CA", time.Now().AddDate(1, 0, 0))))

	rep, err := prepare([]string{dir}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if rep.ConvertedDir != "" {
		t.Fatalf("no DER present, but a PEM directory was created: %s", rep.ConvertedDir)
	}
	if len(rep.Certs) != 1 {
		t.Fatalf("got %d certs, want 1", len(rep.Certs))
	}
}

func TestNonCertificateFilesAreSkipped(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "notes.txt", []byte("not a certificate"))
	write(t, dir, "broken.pem", []byte("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n"))
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}

	rep, err := prepare([]string{dir}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Certs) != 0 || rep.ConvertedDir != "" {
		t.Fatalf("expected nothing loaded, got %+v", rep)
	}
	if len(rep.Skipped) != 2 {
		t.Fatalf("got %d skipped, want 2: %v", len(rep.Skipped), rep.Skipped)
	}
}

func TestMissingAndEmptyDirectoriesAreTolerated(t *testing.T) {
	rep, err := prepare([]string{"", filepath.Join(t.TempDir(), "absent")}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Certs) != 0 || rep.ConvertedDir != "" {
		t.Fatalf("expected an empty report, got %+v", rep)
	}
}
