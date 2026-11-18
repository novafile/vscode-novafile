# Changelog

All notable changes to the NOVA extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Bundled WebAssembly (WASI) build of `nvf-lsp`, used when no native server is configured or on `PATH`. The language server now also works in VS Code for the Web. Requires the `ms-vscode.wasm-wasi-core` extension, which is installed as a dependency.

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

[Unreleased]: https://github.com/novafile/vscode-novafile/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/novafile/vscode-novafile/releases/tag/v0.1.0
