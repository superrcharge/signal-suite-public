// Package csvhttp holds the Fiber-facing half of the CSV surface: sending a
// generated file, and the request and response shapes an import uses.
//
// It is separate from csvtable so that package stays free of the web framework
// and can be tested without one.
package csvhttp

import (
	"fmt"
	"time"

	"backend/internal/shared/csvtable"

	"github.com/gofiber/fiber/v3"
)

// SendCSV writes a generated CSV body as a download.
//
// The date-stamped filename is the convention every existing export already
// used, restated once here rather than in each of the handlers.
func SendCSV(c fiber.Ctx, filePrefix, body string, now time.Time) error {
	name := fmt.Sprintf("%s-%s.csv", filePrefix, now.UTC().Format("20060102"))
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.SendString(body)
}

// SendTemplate writes an import template as a download. Separate from SendCSV
// only because the filename reads differently: a template is not dated, since
// it is not a snapshot of anything.
func SendTemplate(c fiber.Ctx, filePrefix, body string) error {
	name := fmt.Sprintf("%s-import-template.csv", filePrefix)
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.SendString(body)
}

// ImportRequest is the body every CSV import accepts: the whole file as text.
//
// A JSON string rather than a multipart upload, matching what terminals and kits
// have always taken, so one frontend code path covers every domain.
type ImportRequest struct {
	CSV string `json:"csv" validate:"required"`
}

// RowError is one rejected row, in the shape the frontend already renders.
type RowError struct {
	Row    int      `json:"row"`
	Name   string   `json:"name"`
	Errors []string `json:"errors"`
}

// ImportResponse is the outcome of an import.
type ImportResponse struct {
	Imported int        `json:"imported"`
	Errors   []RowError `json:"errors"`
	Message  string     `json:"message"`
}

// BuildImportResponse converts a parse result into the wire shape, including the
// summary sentence. Errors is always a slice so the frontend never has to guard
// against null.
func BuildImportResponse[T any](noun, plural string, parsed *csvtable.ParseResult[T]) ImportResponse {
	rows := make([]RowError, 0, len(parsed.Errors))
	for _, re := range parsed.Errors {
		rows = append(rows, RowError{Row: re.Row, Name: re.Name, Errors: re.Errors})
	}
	return ImportResponse{
		Imported: len(parsed.Rows),
		Errors:   rows,
		Message:  csvtable.ImportMessage(noun, plural, len(parsed.Rows), len(parsed.Errors)),
	}
}

// SendZip writes a multi-dataset export bundle as a download.
//
// Dated like the single-dataset exports, because a bundle is a snapshot of the
// same data at the same moment.
func SendZip(c fiber.Ctx, filePrefix string, body []byte, now time.Time) error {
	name := fmt.Sprintf("%s-%s.zip", filePrefix, now.UTC().Format("20060102"))
	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.Send(body)
}

// SendTemplateZip writes a bundle of import templates.
//
// Undated, matching SendTemplate: a template is not a snapshot of anything. And
// named for templates rather than reusing the export stem, or the user gets a
// file called "export" full of blank forms.
func SendTemplateZip(c fiber.Ctx, body []byte) error {
	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", `attachment; filename="signal-suite-import-templates.zip"`)
	return c.Send(body)
}
