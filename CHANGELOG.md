# Changelog

All notable changes to the NOVA extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-17

### Added

- Languages `nova` (`.nova`), `nova-schema` (`.novs`) and `nova-patch` (`.patch` files that start with `@patch`, detected by content, and `.nova-patch`).
- TextMate grammars for documents (including templates, queries, tables, block strings and the positional profile), patches and schemas, with grammar tests.
- Language configuration: `#` comments, bracket pairs, auto-closing, 2-space indentation and on-enter rules, indentation-based folding.
- Language client for the `nvf-lsp` server (diagnostics, hover, document symbols, completion, formatting), with the settings `novafile.server.path`, `novafile.server.args`, `novafile.server.enable` and `novafile.trace.server`, plus install instructions when the binary is missing.
- Commands **NOVA: Restart Language Server** and **NOVA: Show Language Server Output**.
