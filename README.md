# provenance

Details on npm provenance

## Packages

- [`@npmcli/provenance-cli`](./packages/cli) - Command line interface for generating SLSA provenance on supported CI/CD vendors.

## Demo: Generating signed SLSA provenance

### GitHub Actions
[`.github/workflows/provenance.yml`](https://github.com/npm/provenance/blob/main/.github/workflows/provenance.yml)
```
name: SLSA Provenance

on:
  workflow_dispatch:

permissions:
  id-token: write

jobs:
  provenance:
    name: Generate signed SLSA provenance with Sigstore
    runs-on: ubuntu-latest
    steps:
      - name: Setup node
        uses: actions/setup-node@8f152de45cc393bb48ce5d89d36b731f54556e65 # v4
      - name: Generate dummy package
        run: echo "hello world" > pkg && tar -czvf pkg.tgz pkg
      - name: Generate provenance statement with package as attestation subject
        run: npx @npmcli/provenance-cli generate pkg.tgz -o provenance-statement.json
      - name: Sign provenance statement
        run: npx @sigstore/cli attest ./provenance-statement.json -o provenance.sigstore.json
      - name: Verify provenance statement (TODO: Verify source identity)
        run: npx @sigstore/cli verify provenance.sigstore.json
      - name: Upload artifact
        uses: actions/upload-artifact@a8a3f3ad30e3422c9c7b888a15615d19a852ae32 # v3
        with:
          name: provenance-sigstore.json
          path: provenance.sigstore.json
```

## Publishing with provenance
### Overview
- [npm/cli](https://github.com/npm/cli)
	- [Generate provenance statement](https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/provenance.js)
	- [Publish](https://github.com/npm/cli/blob/0dc63323f6566e6c94e03044c03d14f9a0a5142c/workspaces/libnpmpublish/lib/publish.js#L131-L164): Upload the signing certificate, signed provenance and package to the npm registry
- [sigstore/sigstore-js](https://github.com/sigstore/sigstore-js)
	- [Sign package](https://github.com/sigstore/sigstore-js/tree/main/packages/sign)
	- Request workflow identity (OIDC ID token) from CI/CD
	- Create a temporary public/private key pair
	- Send a proof of private key possession, ID token and public key to Fulcio
	- Fulcio verifies and returns a signing certificate valid for 10 mins
	- Sign the provenance statement and uploads it to Rekor and deletes the keys

### Server-side provenance verification and proof
npm performs server-side verifications and integrity checks on the provenance bundle before accepting the publish:

- Validate the `Issuer` extension in the [signing cert](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md#1361415726418--issuer-v2) is supported
- Validate provenance was generated on a cloud-hosted runner by comparing the `Runner Environment`  extension in the [signing cert](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md#13614157264111--runner-environment)  against allowed values 
- Validate provenance was generated on a public repository/project by comparing the `Source Repository Visibility At Signing`  extension in the [signing cert](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md#13614157264122--source-repository-visibility-at-signing) against allowed values
- Verify extensions in the [signing certificate](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md) (non-falsifiable) match what's in the SLSA provenance statement ([generated in the npm/cli]( https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/provenance.js) and falsifiable by modifying the env vars during build)
- Verify provenance was signed and uploaded to Sigstore: `sigstore.verify(provenanceBundle)`
  - Downloads the latest root certificate and public keys for Sigstore public good by  using tuf-js
- Verify the published package name, version (PURL) and tarball `sha-512` matches what's in the signed [provenance statement subject](https://github.com/npm/cli/blob/0dc63323f6566e6c94e03044c03d14f9a0a5142c/workspaces/libnpmpublish/lib/publish.js#L133-L136)
- Verify the `repository` / `repository.url` in the uploaded `package.json` matches what's in the [signing certificate](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md#13614157264112--source-repository-uri) `Source Repository URI` extension

When verification is succesful npm attests the publish with by signing a [publish attestation](https://github.com/npm/attestation/tree/main/specs/publish/v0.1). This proves the registry accepted the published version /w proof on Rekor to keep the registry honest.

Public signing keys for the signed `publish attestation` are distributed via the public [Sigstore Trust Root](https://github.com/sigstore/root-signing) in a target that matches the registry hostname: [registry.npmjs.org](https://github.com/sigstore/root-signing/tree/main/repository/repository/targets/registry.npmjs.org). 

This means another npm registry can distribute public keys using the same hostname scheme and these will be [discovered by the npm cli](https://github.com/npm/cli/blob/latest/lib/commands/audit.js#L199-L200) during verification.

## Verifying attestations with `npm audit signatures`
### Overview
- [npm/cli](https://github.com/npm/cli)
	- [Audit command](https://github.com/npm/cli/blob/latest/lib/commands/audit.js)
		- [verifySignatures](https://github.com/npm/cli/blob/0dc63323f6566e6c94e03044c03d14f9a0a5142c/lib/commands/audit.js#L308-L328)
		- [pacote.manifest](https://github.com/npm/pacote/blob/a07758b200d8b16e2fcf639467b2ed7cfd9769c2/lib/registry.js#L209-L321)
	- Invokes `sigstore.verify` on each downloaded bundle
	- Verify the attestation matches the installed package name, version and tarball by comparing the in-toto attestation subject name and digest
	- Verify that the registry accepted the publish by an authorized user/token by verifying at least on attestation using a trusted public key from the sigstore trust-root
- [sigstore/root-signing](https://github.com/sigstore/root-signing)
	- [npm's public keys](https://github.com/sigstore/root-signing/tree/main/repository/repository/targets/registry.npmjs.org) 
- [sigstore/sigstore-js](https://github.com/sigstore/sigstore-js)
	- [sigstore.verify](https://github.com/sigstore/sigstore-js/tree/main/packages/client#verifybundle-payload-options)
	- Update Sigstore trusted root using [tuf-js](https://github.com/theupdateframework/tuf-js)
	- Verify artifact signature using public key in signing certificate
	- Verify signing certificate was issued by Sigstore trusted root certificate
	- Verify Fulcio signed the certificate values/extensions at a given time (SCT)
	- Verify Rekor received the signed attestation while the signing certificate was valid

## Viewing provenance on npmjs.com
- [Example package with provenance](https://www.npmjs.com/package/sigstore#provenance)

## Compatibility
Summary of Sigstore provenance verification support in npm registry
- The registry supports verifying sigstore v0.1 and v0.2 bundles generated by sigstore-js 1.0+ (from npm cli 9.5.0+)
- Support verifying both slsa v0.2 and v1.0 provenance predicate's from GHA and slsa v0.2 provenance predicates from GitLab
- Verify the latest version of the Fulcio Signing Certificate as any client sigstore combo will always get the latest one from Fulcio
	- See list of current [Fulcio signing cert extensions](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md)

The following table documents which combinations of Sigstore bundle versions, `sigstore` client versions, `npm` CLI versions and SLSA predicate versions that are supported by the npm registry.

| sigstore       | 1.0..1.5           | 1.6                | 1.7..2.0           | 2.1                |
|----------------|--------------------|--------------------|--------------------|--------------------|
| npm            | 9.5.0..9.6.7       | 9.7.2              | 9.8.0              | 10.0.0             |
| Bundle Version |                    |                    |                    |                    |
| v0.1           | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| v0.2           |                    |                    |                    | :white_check_mark: |
| SLSA Predicate |                    |                    |                    |                    |
| v0.2 (GHA)     | :white_check_mark: | :white_check_mark: |                    |                    |
| v1.0 (GHA)     |                    |                    | :white_check_mark: | :white_check_mark: |
| v0.2 (GitLab)  |                    | :white_check_mark: | :white_check_mark: | :white_check_mark: | 

## Adding support for new CI vendors
- [npm/cli](https://github.com/npm/cli)
	- Generate a SLSA v1.0 (as of writing) provenance statement during build, [see example for GHA/GitLab](https://github.com/npm/cli/blob/0dc63323f6566e6c94e03044c03d14f9a0a5142c/workspaces/libnpmpublish/lib/provenance.js#L18-L195)
	- Check pre-requisites are met for provenance generation, [see example](https://github.com/npm/cli/blob/0dc63323f6566e6c94e03044c03d14f9a0a5142c/workspaces/libnpmpublish/lib/publish.js#L172-L223)
	- [See example for added gitlab support](https://github.com/npm/cli/pull/6526)
- [sigstore/sigstore-js](https://github.com/sigstore/sigstore-js)
	- Mint an ID token, [see example for GHA/GitLab](https://github.com/sigstore/sigstore-js/blob/main/packages/sign/src/identity/ci.ts)
	- [See example for added gitlab support](https://github.com/sigstore/sigstore-js/pull/394)

## Updating the SLSA predicate
- [npm/cli](https://github.com/npm/cli)
  - [Update provenance generation](https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/provenance.js)
  - [See example PR for updating to SLSA v1](https://github.com/npm/cli/pull/6613)

## Resources
- [Talk: Build provenance for package registries](https://docs.google.com/presentation/d/1OO86MsN4rHlL6i2rzoEkvql0vCpxjB-wQyGIpZQoQBg/edit)
- [Blog: Introducing npm package provenance](https://github.blog/2023-04-19-introducing-npm-package-provenance/)
- [Docs: Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements)
- [Article: Build Provenance for All Package Registries](https://repos.openssf.org/build-provenance-for-all-package-registries)
- [Example: Publishing npm package with provenance](https://github.com/npm/provenance-demo)
- [RFC: Link npm packages to the originating source code repository and build](https://github.com/npm/rfcs/blob/main/accepted/0049-link-packages-to-source-and-build.md)
