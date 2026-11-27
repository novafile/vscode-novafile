# Changelog

All notable changes to the NOVA extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Quoted variant tags (`!"at start"(…)`, `!"="`) are highlighted as variants in documents, and quoted enum variant names (`enum Op = "="(T) | "at start"(T)`) in schemas, in both enum forms.

## [0.3.0] - 2026-11-19

### Changed

- Bundled `nvf-lsp` updated to 0.3.0: schemas support ordered unions (`A | B`) and quoted field names, and the server warns about union members in a questionable order.
- The schema grammar highlights `|` in type expressions (aliases, field types, enum variant payloads).

## [0.2.0] - 2026-11-18

### Added

- Bundled WebAssembly (WASI) build of `nvf-lsp` 0.2.0, used when no native server is configured or on `PATH`. The language server now also works in VS Code for the Web. Requires the `ms-vscode.wasm-wasi-core` extension, which is installed as a dependency.

### Changed

- `novafile.server.path` and `novafile.server.args` are read from user settings only (scope `machine`); workspace settings can no longer choose the server binary. Relative paths are rejected. The default for `novafile.server.path` is now empty.
- Requires VS Code 1.91 or newer.

## [0.1.0] - 2026-11-18

### Added

- Languages `nova` (`.nova`), `nova-schema` (`.novs`) and `nova-patch` (`.patch` files that start with `@patch`, detected by content, and `.nova-patch`).
- TextMate grammars for documents (including templates, queries, tables, block strings and the positional profile), patches and schemas, with grammar tests.
- Language configuration: `#` comments, bracket pairs, auto-closing, 2-space indentation and on-enter rules, indentation-based folding.
- Language client for the `nvf-lsp` server (diagnostics, hover, document symbols, completion, formatting), with the settings `novafile.server.path`, `novafile.server.args`, `novafile.server.enable` and `novafile.trace.server`, plus install instructions when the binary is missing.
- Commands **NOVA: Restart Language Server** and **NOVA: Show Language Server Output**.

[Unreleased]: https://github.com/novafile/vscode-novafile/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/novafile/vscode-novafile/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/novafile/vscode-novafile/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/novafile/vscode-novafile/releases/tag/v0.1.0
