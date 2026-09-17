package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"backend/config"
	"backend/docs"
	"backend/internal/blob"
	"backend/internal/csvbulk"
	"backend/internal/csvregistry"
	"backend/internal/domain/audit"
	"backend/internal/domain/contract"
	"backend/internal/domain/equipment"
	"backend/internal/domain/kit"
	"backend/internal/domain/pace"
	"backend/internal/domain/platform"
	"backend/internal/domain/radionet"
	"backend/internal/domain/satcomservice"
	"backend/internal/domain/section"
	"backend/internal/domain/terminal"
	"backend/internal/domain/transport"
	"backend/internal/domain/user"
	"backend/internal/domain/waveform"
	"backend/internal/infrastructure/database"
	"backend/internal/middleware"
	"backend/internal/shared/validator"
	"backend/migrations"

	"github.com/gofiber/fiber/v3"
)

func main() {
	cfg := config.Load()

	// The resolved values, not the configured intent. The incident behind it was about a
	// downgrade nothing reported: losing DB_SSLMODE dropped encryption while
	// both health probes stayed green, so there was no way to tell an
	// encrypted deployment from an unencrypted one without reading the app
	// settings. Never log the password or the token.
	log.Printf("database: sslmode=%s auth_mode=%s", cfg.Database.SSLMode, cfg.Database.AuthMode)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	migrationDSN, err := database.MigrationDSN(ctx, cfg.Database)
	if err != nil {
		log.Fatalf("failed to build migration DSN: %v", err)
	}
	if err := migrations.Run(migrationDSN); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	db, err := database.NewPostgresPool(ctx, cfg.Database)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	app := fiber.New(fiber.Config{
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		BodyLimit:    5 * 1024 * 1024,

		// Proxy trust. Without this, c.IP() is the socket address, which behind
		// App Service is the front end - so every user on earth would share one
		// rate-limit bucket. The old workaround read X-Forwarded-For directly in
		// the limiter's KeyGenerator and believed whatever it said, which meant
		// any caller could mint a fresh 300/min allowance by changing a header.
		// Both problems are the same missing piece: the framework
		// was never told which peers are allowed to speak for someone else.
		//
		// With TrustProxy set, c.IP() walks the X-Forwarded-For chain
		// right-to-left, skips trusted hops, and returns the first untrusted
		// address. A forged entry only wins if everything to its right is
		// trusted, which a public client cannot arrange.
		TrustProxy:       true,
		TrustProxyConfig: middleware.TrustProxyConfig(cfg.Server.TrustedProxies),
		// ProxyHeader is deliberately NOT set. With it set, c.IP() tries to parse
		// the forwarded chain itself, and neither of its two modes is usable
		// here: validation off returns the whole raw header, validation on
		// discards App Service's "<ip>:<port>" entry as invalid and falls back
		// to the caller-supplied one. The middleware derives the client address
		// explicitly instead (see clientKey), so c.IP() stays the plain socket
		// address and is used only as the untrusted-peer fallback.
	})

	middleware.Setup(app, cfg.Frontend.Mode == "proxy", cfg.Auth)

	// User domain (required for auth sync)
	userValidator := user.NewValidator()
	userRepo := user.NewRepository(db)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService, userValidator, cfg.Auth.Enabled())

	authMiddleware := middleware.NewAuthMiddleware(cfg.Auth, userService)

	user.RegisterRoutes(app, userHandler, authMiddleware)

	// Section domain
	sectionValidator := section.NewValidator()
	sectionRepo := section.NewRepository(db)
	sectionService := section.NewService(sectionRepo)
	sectionHandler := section.NewHandler(sectionService, sectionValidator)

	section.RegisterRoutes(app, sectionHandler, authMiddleware)

	// Terminal domain (depends on sectionService for import validation).
	// After terminalService exists, inject it back into sectionService so
	// section deletes can count + reassign terminals. This circular-looking
	// wiring is actually two independent cross-domain interfaces declared
	// in shared/contracts; setter injection avoids a constructor cycle.
	terminalValidator := terminal.NewValidator()
	terminalRepo := terminal.NewRepository(db)
	terminalService := terminal.NewService(terminalRepo, sectionService)
	terminalHandler := terminal.NewHandler(terminalService, terminalValidator)
	sectionService.SetReassigner(terminalService)

	terminal.RegisterRoutes(app, terminalHandler, authMiddleware)

	// Kit domain (parallel to Terminal; also depends on sectionService for
	// import validation, and injects back so section deletes reassign kits).
	kitValidator := kit.NewValidator()
	kitRepo := kit.NewRepository(db)
	kitService := kit.NewService(kitRepo, sectionService)
	kitHandler := kit.NewHandler(kitService, kitValidator)
	sectionService.SetKitReassigner(kitService)

	kit.RegisterRoutes(app, kitHandler, authMiddleware)

	// Contract domain (independent - no cross-domain dependencies)
	contractValidator := contract.NewValidator()
	contractRepo := contract.NewRepository(db)
	contractService := contract.NewService(contractRepo)
	contractHandler := contract.NewHandler(contractService, contractValidator)

	contract.RegisterRoutes(app, contractHandler, authMiddleware)

	// Equipment domain (catalog - independent)
	var blobClient *blob.Client
	if cfg.Blob.Enabled() {
		var blobErr error
		blobClient, blobErr = blob.NewClient(cfg.Blob.ServiceURL, cfg.Blob.Container)
		if blobErr != nil {
			log.Printf("warning: blob storage unavailable: %v", blobErr)
		}
	}

	equipmentValidator := equipment.NewValidator()
	equipmentRepo := equipment.NewRepository(db)
	// A nil *blob.Client assigned straight to an interface yields a non-nil
	// interface wrapping a nil pointer, which would defeat every "storage not
	// configured" guard and panic on first use. Keep the interface value nil.
	var photoStore equipment.PhotoStore
	if blobClient != nil {
		photoStore = blobClient
	}

	equipmentService := equipment.NewService(equipmentRepo)
	equipmentHandler := equipment.NewHandler(equipmentService, equipmentValidator, photoStore)
	if photoStore != nil {
		equipmentService.SetBlobStore(photoStore)
	}

	equipment.RegisterRoutes(app, equipmentHandler, authMiddleware)

	// Waveform library (global reference data - no audit, no blob)
	waveformValidator := waveform.NewValidator()
	waveformRepo := waveform.NewRepository(db)
	waveformService := waveform.NewService(waveformRepo)
	waveformHandler := waveform.NewHandler(waveformService, waveformValidator)

	waveform.RegisterRoutes(app, waveformHandler, authMiddleware)

	// Services library (global SATCOM reference data - the mirror of waveforms
	// on the SATCOM side of the catalog split)
	serviceValidator := satcomservice.NewValidator()
	serviceRepo := satcomservice.NewRepository(db)
	serviceService := satcomservice.NewService(serviceRepo)
	serviceHandler := satcomservice.NewHandler(serviceService, serviceValidator)

	satcomservice.RegisterRoutes(app, serviceHandler, authMiddleware)

	// Transport library (global non-SATCOM reference data - fibre, cellular,
	// MANET and HF paths a PACE tier can name when it is not a terminal)
	transportValidator := transport.NewValidator()
	transportRepo := transport.NewRepository(db)
	transportService := transport.NewService(transportRepo)
	transportHandler := transport.NewHandler(transportService, transportValidator)

	transport.RegisterRoutes(app, transportHandler, authMiddleware)

	// Platforms library (external comms platforms - airframes, ships, coalition
	// assets - the columns of the joint compatibility matrix)
	platformValidator := platform.NewValidator()
	platformRepo := platform.NewRepository(db)
	platformService := platform.NewService(platformRepo)
	platformHandler := platform.NewHandler(platformService, platformValidator)

	platform.RegisterRoutes(app, platformHandler, authMiddleware)

	// Wired both ways, through interfaces, so neither domain imports the other:
	// the waveform library refuses a delete that would strand an abbrev on an
	// equipment record or a platform and carries a rename to both, while
	// platforms reject an abbrev the library does not declare.
	//
	// Two providers, appended rather than set, because waveforms are carried in
	// two places. Miss one and the guard silently half-works: a waveform still
	// used by a platform would delete cleanly because only equipment was asked.
	waveformService.AddWaveformAssets(equipmentService)
	waveformService.AddWaveformAssets(platformService)
	platformService.SetWaveformLookup(waveformService)

	// The SATCOM-side counterpart, and deliberately one-way and one-provider:
	// the service library reads which terminals offer an entry, nothing guards
	// on it, and platforms carry no services.
	serviceService.SetServiceAssets(equipmentService)

	// Nets library (global radio reference data, feeds the PACE Planner wheels)
	netValidator := radionet.NewValidator()
	netRepo := radionet.NewRepository(db)
	netService := radionet.NewService(netRepo)
	netHandler := radionet.NewHandler(netService, netValidator)

	radionet.RegisterRoutes(app, netHandler, authMiddleware)

	// PACE Planner: a squadron's comms card (both channel wheels).
	paceValidator := pace.NewValidator()
	paceRepo := pace.NewRepository(db)
	paceService := pace.NewService(paceRepo)
	// One blob client serves both domains. photoStore is already the nil-safe
	// interface value built above, and pace.EmblemStore is a subset of
	// equipment.PhotoStore, so a nil store stays nil rather than becoming an
	// interface wrapping a nil pointer.
	paceHandler := pace.NewHandler(paceService, paceValidator, photoStore)

	// Wired both ways, through interfaces, so neither domain imports the other:
	// pace validates the nets a channel names, and nets refuses a delete that
	// would strip it off a wheel.
	paceService.SetNetLookup(netService)
	netService.SetNetUsage(paceService)

	// A section delete refuses while the squadron still has nets or PACE card
	// data. Both belong to that squadron and are never moved or cleared, so
	// the section service only asks - see contracts.NetSectionCounter.
	sectionService.SetNetCounter(netService)
	sectionService.SetPaceChecker(paceService)

	pace.RegisterRoutes(app, paceHandler, authMiddleware)

	// Audit domain (depends on nothing; injected into the three
	// mutating domains so they can record events).
	auditValidator := audit.NewValidator()
	auditRepo := audit.NewRepository(db)
	auditService := audit.NewService(auditRepo)
	auditHandler := audit.NewHandler(auditService, auditValidator)

	userService.SetAudit(auditService)
	sectionService.SetAudit(auditService)
	terminalService.SetAudit(auditService)
	kitService.SetAudit(auditService)
	contractService.SetAudit(auditService)
	equipmentService.SetAudit(auditService)
	serviceService.SetAudit(auditService)
	netService.SetAudit(auditService)
	paceService.SetAudit(auditService)
	transportService.SetAudit(auditService)
	platformService.SetAudit(auditService)
	waveformService.SetAudit(auditService)

	audit.RegisterRoutes(app, auditHandler, authMiddleware)

	// Multi-dataset CSV bundle. Registered after every domain, because it needs
	// their services - and csvregistry is the one package that imports them all,
	// so the nine adapters live there rather than here.
	bulkRegistry := csvbulk.New(csvregistry.Exporters(csvregistry.Services{
		Terminal:  terminalService,
		Kit:       kitService,
		Contract:  contractService,
		Equipment: equipmentService,
		Waveform:  waveformService,
		Service:   serviceService,
		Transport: transportService,
		Net:       netService,
		Pace:      paceService,
		Platform:  platformService,
	})...)
	csvbulk.RegisterRoutes(app, csvbulk.NewHandler(bulkRegistry, validator.New()), authMiddleware)

	registerDocsRoutes(app)

	if err := middleware.SetupFrontend(app, cfg.Frontend, cfg.Auth); err != nil {
		log.Fatalf("failed to setup frontend: %v", err)
	}

	go func() {
		if err := app.Listen(":" + cfg.Server.Port); err != nil {
			log.Fatalf("failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	if err := app.Shutdown(); err != nil {
		log.Fatalf("failed to shutdown server: %v", err)
	}
}

func registerDocsRoutes(app *fiber.App) {
	app.Get("/api/docs/openapi.json", func(c fiber.Ctx) error {
		spec, err := docs.GetOpenAPISpec()
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString("Failed to load OpenAPI spec")
		}
		c.Set("Content-Type", "application/json")
		return c.Send(spec)
	})

	app.Get("/api/docs/scalar.js", func(c fiber.Ctx) error {
		js, err := docs.GetScalarJS()
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString("Failed to load Scalar JS")
		}
		c.Set("Content-Type", "application/javascript")
		return c.Send(js)
	})

	app.Get("/api/docs", func(c fiber.Ctx) error {
		c.Set("Content-Type", "text/html")
		return c.SendString(scalarHTML)
	})
}

const scalarHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Signal Suite API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
    <script id="api-reference" data-url="/api/docs/openapi.json"></script>
    <script src="/api/docs/scalar.js"></script>
</body>
</html>`
