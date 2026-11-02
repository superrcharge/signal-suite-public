// Package trust makes the CA certificates App Service mounts into the container
// usable whatever file format they were uploaded in, and logs what it found.
//
// In an air-gapped deployment every outbound TLS connection (Entra, blob storage) chains to an NSS
// root that no public trust store carries, so the backend trusts them only
// through certificates uploaded to the App Service, which the platform mounts
// under SSL_CERT_DIR. Go reads that directory with AppendCertsFromPEM alone
// (crypto/x509/root_unix.go), so a certificate uploaded as DER is skipped with
// no error. That took photo storage down in one deployment on 2026-09-30: the storage
// endpoint moved to the NSS Root CA 5 chain, the new root was uploaded as DER,
// and the app kept failing with "certificate signed by unknown authority"
// while the portal showed the certificate in place.
//
// The portal shows neither a certificate's format nor its expiry, and the app
// container has no shell, so the startup log written here is the only place
// either can be read.
package trust

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const certDirEnv = "SSL_CERT_DIR"

// Cert is one certificate found in a trust directory.
type Cert struct {
	File     string
	Format   string // "pem" or "der"
	Subject  string
	NotAfter time.Time
}

// Report is what Prepare found and did.
type Report struct {
	Certs []Cert
	// Skipped lists files that held no certificate in either format.
	Skipped []string
	// ConvertedDir is where DER certificates were rewritten as PEM, or "" when
	// there were none.
	ConvertedDir string
}

// Prepare scans every directory in SSL_CERT_DIR and, when any certificate in
// them is DER, writes PEM copies to a new directory under tmpRoot and appends
// it to SSL_CERT_DIR.
//
// It must run before anything opens a TLS connection: Go loads the system
// trust store once, on first use, and never rereads the environment.
func Prepare(tmpRoot string) (Report, error) {
	// SSL_CERT_DIR is only read by Go on Unix; Windows uses the system store.
	if runtime.GOOS == "windows" {
		return Report{}, nil
	}
	env := os.Getenv(certDirEnv)
	if env == "" {
		return Report{}, nil
	}
	rep, err := prepare(strings.Split(env, ":"), tmpRoot)
	if err != nil {
		return rep, err
	}
	if rep.ConvertedDir != "" {
		if err := os.Setenv(certDirEnv, env+":"+rep.ConvertedDir); err != nil {
			return rep, fmt.Errorf("trust: set %s: %w", certDirEnv, err)
		}
	}
	return rep, nil
}

func prepare(dirs []string, tmpRoot string) (Report, error) {
	var rep Report
	var converted [][]byte
	var convertedNames []string

	for _, dir := range dirs {
		if dir == "" {
			continue
		}
		// os.Root confines every read to this directory, so a file name can
		// never walk out of it.
		root, err := os.OpenRoot(dir)
		if err != nil {
			// A configured directory that is absent is worth saying out loud:
			// it means no uploaded certificate is reaching the container. The
			// error already names the directory.
			log.Printf("warning: trust: %v", err)
			continue
		}
		entries, err := fs.ReadDir(root.FS(), ".")
		if err != nil {
			log.Printf("warning: trust: %v", err)
			_ = root.Close()
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			path := filepath.Join(dir, e.Name())
			data, err := root.ReadFile(e.Name())
			if err != nil {
				rep.Skipped = append(rep.Skipped, path)
				continue
			}
			certs, format := parse(data)
			if len(certs) == 0 {
				rep.Skipped = append(rep.Skipped, path)
				continue
			}
			for _, c := range certs {
				rep.Certs = append(rep.Certs, Cert{File: path, Format: format, Subject: subject(c), NotAfter: c.NotAfter})
			}
			if format == "der" {
				var buf bytes.Buffer
				for _, c := range certs {
					_ = pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})
				}
				converted = append(converted, buf.Bytes())
				convertedNames = append(convertedNames, e.Name())
			}
		}
		_ = root.Close()
	}

	if len(converted) == 0 {
		return rep, nil
	}
	out, err := os.MkdirTemp(tmpRoot, "shf-ca-")
	if err != nil {
		return rep, fmt.Errorf("trust: create PEM directory: %w", err)
	}
	outRoot, err := os.OpenRoot(out)
	if err != nil {
		return rep, fmt.Errorf("trust: open PEM directory: %w", err)
	}
	defer func() { _ = outRoot.Close() }()
	for i, data := range converted {
		// The index keeps two same-named files from different directories apart.
		name := fmt.Sprintf("%d-%s.pem", i, convertedNames[i])
		if err := outRoot.WriteFile(name, data, 0o600); err != nil {
			return rep, fmt.Errorf("trust: write %s: %w", name, err)
		}
	}
	rep.ConvertedDir = out
	return rep, nil
}

// parse reads data as PEM when it carries a PEM header, otherwise as one or
// more concatenated DER certificates.
func parse(data []byte) ([]*x509.Certificate, string) {
	if bytes.Contains(data, []byte("-----BEGIN")) {
		var certs []*x509.Certificate
		rest := data
		for {
			var block *pem.Block
			block, rest = pem.Decode(rest)
			if block == nil {
				break
			}
			if block.Type != "CERTIFICATE" {
				continue
			}
			if c, err := x509.ParseCertificate(block.Bytes); err == nil {
				certs = append(certs, c)
			}
		}
		return certs, "pem"
	}
	certs, err := x509.ParseCertificates(data)
	if err != nil {
		return nil, ""
	}
	return certs, "der"
}

func subject(c *x509.Certificate) string {
	if c.Subject.CommonName != "" {
		return c.Subject.CommonName
	}
	return c.Subject.String()
}

// Log writes one line per certificate, flagging any already expired, so the
// trust store a deployment is running with can be read from its log stream.
func (r Report) Log(now time.Time) {
	for _, c := range r.Certs {
		state := "valid"
		if now.After(c.NotAfter) {
			state = "EXPIRED"
		}
		log.Printf("trust: %s (%s) %q expires %s, %s", filepath.Base(c.File), c.Format, c.Subject, c.NotAfter.Format("2006-01-02"), state)
	}
	for _, f := range r.Skipped {
		log.Printf("warning: trust: %s holds no certificate, skipped", f)
	}
	if r.ConvertedDir != "" {
		log.Printf("trust: DER certificates rewritten as PEM in %s, which Go would otherwise skip", r.ConvertedDir)
	}
}
