package middleware

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"backend/internal/auth"

	"github.com/coreos/go-oidc/v3/oidc"
	jose "github.com/go-jose/go-jose/v4"
)

// The first tests in this package to put a real token through a real verifier.
//
// Every other auth test either injects an AuthUser straight into Fiber Locals
// or sends no Authorization header at all, which short-circuits before the
// verifier is ever built - so nothing here asserted what "valid" actually
// means. That is how SkipIssuerCheck: true survived a port, a refactor and
// eight releases without anyone deciding it was wanted.
//
// oidc.NewVerifier with a StaticKeySet is used rather than NewProvider so the
// tests decide the issuer and the key without a discovery endpoint or any
// network. That is the point of extracting verifierConfig: initVerifier talks
// to Entra, verifierConfig decides what is accepted, and only the second is
// worth testing here.

const (
	testTenant    = "11111111-2222-3333-4444-555555555555"
	testClientID  = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	testAuthority = "login.microsoftonline.us"
)

func testConfig() *auth.Config {
	return &auth.Config{
		Mode:          auth.ModeAzure,
		TenantID:      testTenant,
		ClientID:      testClientID,
		AuthorityHost: testAuthority,
	}
}

// mint signs a token with the given claims. Returns the compact serialization.
func mint(t *testing.T, key *rsa.PrivateKey, alg jose.SignatureAlgorithm, claims map[string]any) string {
	t.Helper()

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: alg, Key: key}, nil)
	if err != nil {
		t.Fatalf("NewSigner(%s): %v", alg, err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	jws, err := signer.Sign(payload)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	tok, err := jws.CompactSerialize()
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	return tok
}

func validClaims(cfg *auth.Config) map[string]any {
	now := time.Now()
	return map[string]any{
		"iss": cfg.Authority(),
		"aud": cfg.Audience(),
		"sub": "test-subject",
		"oid": "00000000-0000-0000-0000-000000000001",
		"exp": now.Add(time.Hour).Unix(),
		"iat": now.Add(-time.Minute).Unix(),
		"nbf": now.Add(-time.Minute).Unix(),
	}
}

// newVerifier builds the verifier the middleware would build, against a key
// set the test controls. cfg.Authority() is the expected issuer, exactly as
// oidc.NewProvider would have discovered it.
func newVerifier(cfg *auth.Config, key *rsa.PrivateKey) *oidc.IDTokenVerifier {
	return oidc.NewVerifier(
		cfg.Authority(),
		&oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}},
		verifierConfig(cfg),
	)
}

func TestVerifierAcceptsAWellFormedToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	tok := mint(t, key, jose.RS256, validClaims(cfg))

	if _, err := newVerifier(cfg, key).Verify(context.Background(), tok); err != nil {
		t.Fatalf("a correctly issued token was rejected: %v", err)
	}
}

// The one this exists for. Same key, same audience, different issuer - which
// is precisely the token SkipIssuerCheck: true used to wave through.
func TestVerifierRejectsAnUnexpectedIssuer(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	for _, iss := range []string{
		// A different tenant on the same authority host.
		"https://" + testAuthority + "/99999999-9999-9999-9999-999999999999/v2.0",
		// The commercial cloud rather than the configured government-cloud endpoint.
		"https://login.microsoftonline.com/" + testTenant + "/v2.0",
		// The v1 issuer shape for the right tenant.
		"https://sts.windows.net/" + testTenant + "/",
		"",
	} {
		t.Run(iss, func(t *testing.T) {
			claims := validClaims(cfg)
			claims["iss"] = iss

			_, err := newVerifier(cfg, key).Verify(context.Background(), mint(t, key, jose.RS256, claims))
			if err == nil {
				t.Fatalf("token with iss=%q was accepted; the issuer is not being checked", iss)
			}

			// Rejected for the right reason, and diagnosably. The message is
			// echoed into the 401 body by authenticate(), so if an authority
			// ever does return an issuer other than the one it is discovered
			// at, this names both halves rather than leaving someone guessing.
			// go-oidc's wording is "issued by a different provider" and does
			// not contain the word "issuer", so match on the values instead.
			if !strings.Contains(err.Error(), cfg.Authority()) {
				t.Errorf("rejection does not name the expected issuer %q: %v", cfg.Authority(), err)
			}
			if iss != "" && !strings.Contains(err.Error(), iss) {
				t.Errorf("rejection does not name the offending issuer %q: %v", iss, err)
			}
		})
	}
}

func TestVerifierRejectsAnUnexpectedAudience(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	claims := validClaims(cfg)
	claims["aud"] = "some-other-client-id"

	if _, err := newVerifier(cfg, key).Verify(context.Background(), mint(t, key, jose.RS256, claims)); err == nil {
		t.Fatal("token for a different audience was accepted")
	}
}

// SupportedSigningAlgs pins RS256 rather than inheriting the library default.
// RS512 is a perfectly good algorithm; the point is that the accepted set is
// stated here rather than being whatever go-oidc ships with.
func TestVerifierRejectsAnAlgorithmOutsideThePin(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	tok := mint(t, key, jose.RS512, validClaims(cfg))

	if _, err := newVerifier(cfg, key).Verify(context.Background(), tok); err == nil {
		t.Fatal("an RS512 token was accepted despite SupportedSigningAlgs pinning RS256")
	}
}

// A token signed by a key the authority does not publish must fail even when
// every claim is right. This is the guarantee the issuer check was resting on
// alone, and it still has to hold.
func TestVerifierRejectsAnUnknownSigningKey(t *testing.T) {
	good, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	attacker, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	tok := mint(t, attacker, jose.RS256, validClaims(cfg))

	if _, err := newVerifier(cfg, good).Verify(context.Background(), tok); err == nil {
		t.Fatal("a token signed by an unpublished key was accepted")
	}
}

func TestVerifierRejectsAnExpiredToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()

	claims := validClaims(cfg)
	claims["exp"] = time.Now().Add(-time.Hour).Unix()

	if _, err := newVerifier(cfg, key).Verify(context.Background(), mint(t, key, jose.RS256, claims)); err == nil {
		t.Fatal("an expired token was accepted")
	}
}

// The configuration itself, asserted directly, so a future edit that reaches
// for SkipIssuerCheck has to delete a test that says why it is not there.
func TestVerifierConfigPinsWhatItClaimsTo(t *testing.T) {
	cfg := verifierConfig(testConfig())

	if cfg.SkipIssuerCheck {
		t.Error("SkipIssuerCheck is set; the iss claim would not be validated")
	}
	if cfg.SkipExpiryCheck {
		t.Error("SkipExpiryCheck is set; expired tokens would be accepted")
	}
	if cfg.ClientID != testClientID {
		t.Errorf("ClientID = %q, want the bare client ID %q", cfg.ClientID, testClientID)
	}
	if len(cfg.SupportedSigningAlgs) != 1 || cfg.SupportedSigningAlgs[0] != oidc.RS256 {
		t.Errorf("SupportedSigningAlgs = %v, want exactly [RS256]", cfg.SupportedSigningAlgs)
	}
}
