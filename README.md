# NOVA for Visual Studio Code

Language support for [NOVA](https://github.com/novafile/spec), the *Notation for Objects, Values & Agents*: a typed, indentation-exact serialization format with schemas, conditional patches and total templates.

The extension provides syntax highlighting for every kind of NOVA file and connects VS Code to the `nvf-lsp` language server from the [reference implementation](https://github.com/novafile/nova).

![NOVA document, schema and patch in VS Code](images/screenshot.png)

> *Screenshot placeholder: replace `images/screenshot.png` before publishing.*

## Features

| | `.nova` documents and templates | `.novs` schemas | patches |
| --- | --- | --- | --- |
| Syntax highlighting | ✓ | ✓ | ✓ |
| Diagnostics (syntax, schema validation, lints) | ✓ | ✓ | ✓ |
| Hover | ✓ | ✓ | ✓ |
| Outline / document symbols | ✓ | ✓ | ✓ |
| Completion | ✓ | ✓ | ✓ |
| Formatting | ✓ | ✓ | ✓ |

Highlighting, comment toggling, bracket matching and indentation work without the language server. Diagnostics, hover, outline, completion and formatting come from `nvf-lsp`.

**Highlighting covers the whole text syntax ([spec §4](https://github.com/novafile/spec/blob/main/SPEC.md)):**

- directives (`@nova`, `@schema name@1.2.0#fingerprint`, `@revision`, `@scope`, `@mode positional`, `@compat`, `@get`, `x-` extensions);
- block records and lists, quoted keys, tables (`services[2]{id,port}:` and their rows);
- plain scalars, classified exactly like the parser: `8080` is an integer, `22/7` a rational, `1.5e3` a float, `true`/`false`/`null` keywords, while `1.2.3`, `08080` and `yes` stay strings;
- quoted strings with escapes (`\n`, `\u00e9`, `\u{1F600}`, `\$`) and invalid escapes;
- block strings (`|`, `|-`), which end at the first line that is not indented deeper;
- flow values `[…]`, `{…}`, `(…)`, `@set[…]`, `@map{k => v}`;
- typed literals `@timestamp(…)`, `@duration(…)`, `@decimal(…)`, `@rational(…)`, `@bytes(…)`, `@float(…)` and variants `!active`, `!failed("disk full")`;
- **templates** (§9): `@template`, `@param`, `@let`, `@import`, `$references.with[paths]`, `${interpolation}` (only inside template documents), `...spreads`, and `@if` / `@else if` / `@else` / `@for i, x in $xs:` control lines;
- **patches** (§7.4): `@patch`, `@base`, `@scope`, and the operations `path: old -> new`, `= p: v`, `+ p: v`, `- p`, `? p`;
- **schemas** (§6.1): `record Name @open:`, `enum Name:` / `enum Name = a | b(T)`, `type X = T`, field lines `name?: list<u16 @range(1..1024)>[]? @key @id(1) @len(..64, utf8) @deprecated = default`.

### Languages and files

| Language id | Files |
| --- | --- |
| `nova` | `*.nova` (data documents, templates such as `*.tpl.nova`, query responses, positional documents) |
| `nova-schema` | `*.novs` |
| `nova-patch` | `*.patch` files whose first non-comment line is `@patch`; also `*.nova-patch` |

`.patch` is normally owned by VS Code's built-in *Diff* language, so the extension does not claim it by extension. When a `.patch` file opens as Diff, the extension looks at its first non-blank, non-comment line and switches the editor to *NOVA Patch* if it is a `@patch` directive (turn this off with `novafile.patch.detectByContent`). To force it for a folder, add a file association:

```jsonc
"files.associations": { "overlays/*.patch": "nova-patch" }
```

## Installing the language server

The extension starts `nvf-lsp` and talks to it over stdio. Install it with Cargo:

```sh
cargo install novafile-lsp                  # from crates.io
# or, from a checkout of https://github.com/novafile/nova
cargo install --path crates/novafile-lsp
```

Make sure `~/.cargo/bin` is on your `PATH`, or point `novafile.server.path` at the binary. If the server cannot be found, the extension shows an error with these instructions and keeps working as a highlighting-only extension. Run **NOVA: Restart Language Server** after installing or updating it.

The server reads every `.novs` file in the workspace, so a document's `@schema infrastructure@1.0.0` line is validated against the matching schema automatically.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `novafile.server.path` | `"nvf-lsp"` | Path to the language server. A bare name is looked up on `PATH`; `~/` and workspace-relative paths work too. |
| `novafile.server.args` | `[]` | Extra arguments for the server. |
| `novafile.server.enable` | `true` | Set to `false` to use highlighting only. |
| `novafile.trace.server` | `"off"` | `messages` or `verbose` logs LSP traffic to the *NOVA Language Server Trace* output channel. |
| `novafile.patch.detectByContent` | `true` | Switch `.patch` files that start with `@patch` to NOVA Patch. |

The extension also sets `editor.tabSize: 2` and `editor.insertSpaces: true` for its languages, because NOVA indentation is exactly two spaces per level.

## Commands

- **NOVA: Restart Language Server** (`novafile.restartServer`)
- **NOVA: Show Language Server Output** (`novafile.showOutput`)

## Development

```sh
npm install
npm run compile        # type-check and bundle to dist/ with esbuild
npm test               # grammar tests (vscode-tmgrammar-test)
npm run package        # build vscode-novafile-<version>.vsix with @vscode/vsce
```

Press <kbd>F5</kbd> in VS Code to start an Extension Development Host.

The TextMate grammars in `syntaxes/` are generated from `scripts/build-grammars.mjs`, which keeps the regular expressions readable. Edit that file, then run `npm run build:grammars` and commit both. Grammar tests live in `test/`. Each file starts with a `# SYNTAX TEST "<scope>"` header, and lines with `^` or `<-` markers assert the scopes of the source line above them.

## Links

- Specification: <https://github.com/novafile/spec> ([SPEC.md](https://github.com/novafile/spec/blob/main/SPEC.md))
- Reference implementation, CLI `nvf` and language server `nvf-lsp`: <https://github.com/novafile/nova>
- Issues: <https://github.com/novafile/vscode-novafile/issues>

## License

The extension code is licensed under either the [EUPL-1.2](LICENSE-EUPL) or the [MPL-2.0](LICENSE-MPL), at your option. The grammar definitions (`syntaxes/` and `scripts/build-grammars.mjs`) are part of the format definition and licensed under [Apache-2.0](LICENSE-APACHE), like the [specification](https://github.com/novafile/spec); the grammar test files are CC0-1.0. See [REUSE.toml](REUSE.toml).
