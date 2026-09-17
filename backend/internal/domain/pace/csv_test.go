package pace

import (
	"context"
	"strings"
	"testing"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"section", "radio_type", "plan_label", "channel_number",
	"net_name", "net_id", "net_radio_type",
	"tx_freq", "rx_freq", "freq_unit", "is_overridden", "label_override",
}

func boundOrFail(t *testing.T) *csvtable.Bound[channelRow] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, nil)
}

// The structural guarantee: a card cannot be created from a file, and no future
// edit can turn this into an importable table without deleting this test.
func TestCSVTable_IsExportOnly(t *testing.T) {
	if csvTable.New != nil {
		t.Fatal("pace must stay export-only - a channel row needs a plan and a net that already exist")
	}
	if _, err := boundOrFail(t).Parse("section,net_name\nasqd,X\n", nil); err == nil {
		t.Fatal("Parse must refuse on an export-only table")
	}
}

func card() *CommsCard {
	return &CommsCard{
		Plans: []*ChannelPlan{
			{
				Section: "asqd", RadioType: RadioJEM, Label: "JEM",
				Assignments: []*ChannelAssignment{
					{
						ChannelNumber: 4, NetID: "n1",
						Net: &NetRef{Name: "NET ONE", NetID: "N01", RadioType: "jem",
							TxFreq: "30.5", RxFreq: "30.5", FreqUnit: "MHz"},
					},
					{
						// An override: the effective columns must show the override, and
						// is_overridden must say the difference is deliberate.
						ChannelNumber: 7, NetID: "n2", TxFreqOverride: "41.0",
						Net: &NetRef{Name: "NET TWO", NetID: "N02", RadioType: "both",
							TxFreq: "30.5", RxFreq: "31.5", FreqUnit: "MHz"},
					},
					// Unassigned: skipped rather than padded as a blank row.
					{ChannelNumber: 9},
				},
			},
		},
	}
}

func TestFlattenCard_SkipsUnassignedPositions(t *testing.T) {
	rows := flattenCard(card())
	if len(rows) != 2 {
		t.Fatalf("want 2 assigned rows, got %d", len(rows))
	}
	for _, r := range rows {
		if r.NetName == "" {
			t.Errorf("row %d has no net and should have been skipped", r.ChannelNumber)
		}
	}
}

func TestFlattenCard_UsesEffectiveFrequencies(t *testing.T) {
	rows := flattenCard(card())
	plain, overridden := rows[0], rows[1]

	if plain.TxFreq != "30.5" || plain.Overridden {
		t.Errorf("unoverridden row should carry the net's own frequency: %+v", plain)
	}
	// The override wins for TX; RX falls back to the net's, and the row is still
	// marked overridden because one field departs.
	if overridden.TxFreq != "41.0" {
		t.Errorf("tx = %q, want the override 41.0", overridden.TxFreq)
	}
	if overridden.RxFreq != "31.5" {
		t.Errorf("rx = %q, want the net's own 31.5", overridden.RxFreq)
	}
	if !overridden.Overridden {
		t.Error("a row departing from its net must say so")
	}
}

func TestExportChannels(t *testing.T) {
	svc := NewService(&MockRepository{
		SectionExistsFunc: func(ctx context.Context, s string) (bool, error) { return s == "asqd", nil },
		FindCardFunc:      func(ctx context.Context, s string) (*CommsCard, error) { return card(), nil },
	})

	out, err := svc.ExportChannels(context.Background(), "asqd", nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 3 {
		t.Fatalf("want a header and 2 rows, got %d lines:\n%s", len(lines), out)
	}
	if lines[0] != strings.Join(wantColumns, ",") {
		t.Errorf("header = %q", lines[0])
	}
	// The channel number is kept off the printed dial, so this column is the only place
	// a reader of the file can reach it.
	if !strings.Contains(out, "N01") {
		t.Errorf("export should carry the net ID:\n%s", out)
	}
}

func TestExportChannels_UnknownSection(t *testing.T) {
	svc := NewService(&MockRepository{
		SectionExistsFunc: func(ctx context.Context, s string) (bool, error) { return false, nil },
	})
	if _, err := svc.ExportChannels(context.Background(), "zsqd", nil); err == nil {
		t.Fatal("expected an unknown squadron to be refused")
	}
}
