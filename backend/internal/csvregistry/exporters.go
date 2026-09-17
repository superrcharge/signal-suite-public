package csvregistry

import (
	"context"

	"backend/internal/csvbulk"
	"backend/internal/domain/contract"
	"backend/internal/domain/equipment"
	"backend/internal/domain/kit"
	"backend/internal/domain/pace"
	"backend/internal/domain/platform"
	"backend/internal/domain/radionet"
	"backend/internal/domain/satcomservice"
	"backend/internal/domain/terminal"
	"backend/internal/domain/transport"
	"backend/internal/domain/waveform"
)

// Services is every export-capable service, supplied by main.go.
//
// A struct rather than nine arguments so adding domain ten is one field and one
// Dataset, and so a test can pass the zero value to check the registry's shape
// without constructing anything.
type Services struct {
	Terminal  *terminal.Service
	Kit       *kit.Service
	Contract  *contract.Service
	Equipment *equipment.Service
	Waveform  *waveform.Service
	Service   *satcomservice.Service
	Transport *transport.Service
	Net       *radionet.Service
	Pace      *pace.Service
	Platform  *platform.Service
}

// Exporters wires every domain to the bundle endpoint.
//
// This is the second list of nine in this package, alongside All(). They can
// fall out of step, so a test compares their resource sets - it runs this with a
// zero-value Services, which is safe because the closures are never invoked.
//
// The nine differing signatures get flattened here, in the one file that already
// imports every domain, rather than being hidden behind a uniform interface
// every service would have to implement. Equipment filters by terminal_type and
// search; contracts by fiscal year; terminals and kits by section and status;
// nets and pace by squadron. Those differences are real and stay visible.
func Exporters(s Services) []csvbulk.Dataset {
	return []csvbulk.Dataset{
		{
			Resource:   "contracts",
			FilePrefix: "signal-suite-contracts",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Contract.ExportContracts(ctx, sel.FiscalYears, sel.Columns)
			},
			// Export-only: no batch of contracts has ever needed loading, and the
			// table has no unique index to dedupe an upload against.
			Template: nil,
		},
		{
			Resource:   "equipment",
			FilePrefix: "signal-suite-equipment",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Equipment.ExportEquipment(ctx, sel.TerminalType, sel.Search, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Equipment.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:   "kits",
			FilePrefix: "signal-suite-kits",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Kit.ExportKits(ctx, kit.ExportFilter{Sections: sel.Sections, Statuses: sel.Statuses, Types: sel.Types}, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Kit.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:      "nets",
			FilePrefix:    "signal-suite-nets",
			SectionScoped: true,
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Net.ExportNets(ctx, sel.Section, sel.Columns)
			},
			// The template is shared across squadrons, so it takes no section.
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Net.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:      "pace-channels",
			FilePrefix:    "signal-suite-pace-channels",
			SectionScoped: true,
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Pace.ExportChannels(ctx, sel.Section, sel.Columns)
			},
			// Export-only by construction: a channel row is meaningless without a
			// plan and a net that already exist.
			Template: nil,
		},
		{
			Resource:   "services",
			FilePrefix: "signal-suite-services",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Service.ExportServices(ctx, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Service.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:   "platforms",
			FilePrefix: "signal-suite-platforms",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Platform.ExportPlatforms(ctx, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Platform.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:   "terminals",
			FilePrefix: "signal-suite-terminals",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Terminal.ExportTerminals(ctx, terminal.ExportFilter{Sections: sel.Sections, Statuses: sel.Statuses, Models: sel.Models}, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Terminal.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:   "transports",
			FilePrefix: "signal-suite-transports",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Transport.ExportTransports(ctx, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Transport.GetImportTemplate(ctx, sel.Columns)
			},
		},
		{
			Resource:   "waveforms",
			FilePrefix: "signal-suite-waveforms",
			Export: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Waveform.ExportWaveforms(ctx, sel.Columns)
			},
			Template: func(ctx context.Context, sel csvbulk.Selector) (string, error) {
				return s.Waveform.GetImportTemplate(ctx, sel.Columns)
			},
		},
	}
}
