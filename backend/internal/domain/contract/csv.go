package contract

import (
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export reads.
//
// Contract is export-only: New is nil, so Parse refuses by construction rather
// than by anyone remembering not to wire an import route. There is no template
// either - a template exists to be filled in and uploaded, and without an import
// it would be a file that leads nowhere.
//
// Identity is empty on purpose. The contracts table has no unique index and two
// contracts may legitimately share a title across fiscal years, so LabelKey names
// rows in errors instead.
var csvTable = csvtable.Table[Contract]{
	Domain:     "CONTRACT",
	Noun:       "contract",
	NounPlural: "contracts",
	FilePrefix: "signal-suite-contracts",
	LabelKey:   "title",

	Columns: []csvtable.Column[Contract]{
		{
			// Exported first and by default, so a row can be correlated with the
			// API and the audit log. No RejectOnImport: contract is export-only,
			// so there is no importer for it to guard.
			Key: "id", Label: "ID",
			Get: csvtable.Str(func(c *Contract) string { return c.ID }),
		},
		{
			Key: "title", Label: "Contract Title", Required: true,
			Get: csvtable.Str(func(c *Contract) string { return c.Title }),
		},
		{
			Key: "company", Label: "Company",
			Get: csvtable.Str(func(c *Contract) string { return c.Company }),
		},
		{
			Key: "poc_name", Label: "POC Name",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.POCName }),
		},
		{
			Key: "poc_email", Label: "POC Email",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.POCEmail }),
		},
		{
			Key: "poc_phone", Label: "POC Phone",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.POCPhone }),
		},
		{
			Key: "pop_start", Label: "Start Date",
			Get: csvtable.DateOnly(func(c *Contract) *time.Time { return c.POPStart }),
		},
		{
			Key: "pop_end", Label: "End Date",
			Get: csvtable.DateOnly(func(c *Contract) *time.Time { return c.POPEnd }),
		},
		{
			Key: "execution_quarter", Label: "Quarter",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.ExecutionQuarter }),
		},
		{
			Key: "fiscal_year", Label: "Fiscal Year",
			Get: csvtable.Str(func(c *Contract) string { return c.FiscalYear }),
		},
		{
			Key: "notes", Label: "Notes",
			Get: csvtable.Str(func(c *Contract) string { return c.Notes }),
		},
		{
			// The two columns the export dialog never offered until the drift was
			// fixed. They have been exported since Logform shipped.
			Key: "logform_number", Label: "Logform #",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.LogformNumber }),
		},
		{
			Key: "logform_url", Label: "Logform URL",
			Get: csvtable.PtrStr(func(c *Contract) *string { return c.LogformURL }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(c *Contract) string { return c.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(c *Contract) time.Time { return c.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(c *Contract) time.Time { return c.CreatedAt }),
		},
	},
}

// boundCSV binds the table. Contract has no dynamic vocabulary, so this cannot
// fail in practice; the error is returned rather than swallowed so a column
// gaining one later does not silently stop validating.
func boundCSV() (*csvtable.Bound[Contract], error) {
	return csvTable.Bind(nil)
}

// CSVColumns is the wire shape of this domain's CSV columns, in canonical order.
// Consumed by the csvregistry package, which emits the manifest the frontend
// column picker reads, so the picker cannot describe a different set of columns
// from the one the exporter emits.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }
