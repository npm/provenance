# @npm/provenance-cli

CLI for generating SLSA provenance on GitHub Actions and GitLab CI.

# Usage

<!-- usage -->

```sh-session
$ npm install -g @npm/provenance-cli
$ provenance COMMAND
running command...
$ provenance (--version)
@npm/provenance-cli/0.0.1 darwin-arm64 node-v18.17.1
$ provenance --help [COMMAND]
USAGE
  $ provenance COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`provenance generate [SUBJECT-PATH]`](#provenance-generate-subject-path)
- [`provenance help [COMMANDS]`](#provenance-help-commands)

## `provenance generate [SUBJECT-PATH]`

Generate SLSA provenance information on supported cloud CI/CD vendors.

```
USAGE
  $ provenance generate [SUBJECT-PATH] [--subject-name <value>] [--subject-digest <value>] [-o <value>]

ARGUMENTS
  SUBJECT-PATH  subject file to generate statement for

FLAGS
  -o, --output-file=<value>  write output to file
  --subject-digest=<value>   Subject digest to use in statement
  --subject-name=<value>     Subject name to use in statement

DESCRIPTION
  Generate SLSA provenance information on supported cloud CI/CD vendors.

EXAMPLES
  $ provenance generate
```

## `provenance help [COMMANDS]`

Display help for provenance.

```
USAGE
  $ provenance help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for provenance.
```

<!-- commandsstop -->
