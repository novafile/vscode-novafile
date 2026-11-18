#!/usr/bin/env bash
# Downloads the WASI nvf-lsp release asset into server/nvf-lsp.wasm after
# checking it against SHA256SUMS and its build-provenance attestation.
#   scripts/fetch-server.sh [TAG]   (default: the pinned release below)
# Needs gh, authenticated (GH_TOKEN in CI).
set -euo pipefail

tag="${1:-v0.2.0}"
asset="nvf-lsp-$tag.wasm"
dir=".task/nvf-lsp-$tag"

rm -rf "$dir"
mkdir -p "$dir" server
gh release download "$tag" -R novafile/nova -D "$dir" -p "$asset" -p SHA256SUMS
(cd "$dir" && grep -E "[ *]${asset//./\\.}\$" SHA256SUMS | sha256sum --check --strict -)
gh attestation verify "$dir/$asset" -R novafile/nova \
  --signer-workflow novafile/nova/.github/workflows/release.yml \
  --deny-self-hosted-runners
cp "$dir/$asset" server/nvf-lsp.wasm
