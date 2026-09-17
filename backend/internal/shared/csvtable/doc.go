// Package csvtable declares a domain's CSV contract once, so that export, the
// import template, and import itself all read the same declaration.
//
// It exists because they did not. Three domains each grew their own copy of the
// same 50-line export skeleton, their own 50-case value switch, and their own
// query parser, and the template header was a hand-typed string literal with no
// link to the export column list at all. The result was silent drift in every
// direction: the contracts picker was two columns short of what the backend
// emitted, and adding an export column never once updated a template.
//
// The shape that fixes it is a column that carries its own behaviour:
//
//	Get  renders the column for export. Every column has one.
//	Set  parses a cell on import. A nil Set means the column is server-owned,
//	     which is what keeps it out of the template and out of import - there
//	     is no separate flag anyone can forget to set.
//
// A Table is the whole contract for one row type. Note "row type", not "model":
// eight domains declare a table over their model, and PACE declares one over a
// flattened channel row, so a card that is not a table never has to pretend to
// be one.
//
// The package is deliberately free of Fiber, of domain packages, and of any
// third-party CSV library - the project rule is encoding/csv and nothing else.
// That also means every behaviour here is testable without an HTTP server.
//
// Naming: csvtable rather than csv, because a package named csv that itself
// imports encoding/csv would need an alias in its own files and in every domain
// file touching both. The repo already avoids this collision deliberately -
// radionet exists so it does not shadow net.
package csvtable
