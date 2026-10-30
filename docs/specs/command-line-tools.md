# Specification: results of the command line tools

Status: implemented for `createdicomweb`, `mkdicomweb` and the `lei` command of the
healthlake tools. The other tools are not checked (see "Known limitations").

## Scope

This specification states what a command line tool tells its caller about its inputs. An
input is a path on the command line, or a file in a directory of such a path. A caller is a
person, or a script that runs the tool. The specification applies to each tool of this
repository that reads inputs: `createdicomweb`, `mkdicomweb`, and the healthlake tools. It
does not apply to a server, for example `dicomwebserver` or `dicomwebscp`.

The specification has one requirement section:

- `§ User requirements` (prefix `CLI-U`) state what the caller of a tool must get. Change a
  user requirement only when it describes the behaviour wrongly, or when the intended
  user-facing behaviour changes.

The implementation requirements (prefix `CLI-I`) are not in this document. They are in
[`docs/implementation/command-line-tools.md`](../implementation/command-line-tools.md). An
implementation that is inconvenient is never a reason to change a user requirement.

[Updates of derived data](derived-data-updates.md) (SQR-U5) states the result of each file
for the upload commands `createdicomweb instance`, `create` and `stow`. Those commands also
follow this specification.

## § User requirements

- **CLI-U1. A failed input gives a non-zero exit code.** Each command line tool exits with a
  code that is not `0` when the tool did not process one or more of its inputs. An input path
  that does not exist, or that the tool cannot read, is an input that the tool did not
  process. A file that is not DICOM is also an input that the tool did not process. The tool
  continues with the other inputs, and reports each failed input.
- **CLI-U2. An option that deletes failed inputs deletes only bad data.** An option that
  deletes failed inputs, for example `--delete-failed`, deletes only a file that the tool read
  and could not store. The option never deletes a directory, or a path that the tool could not
  read. The option also keeps a file that failed because of a system error, for example
  `EIO`, or `ENOSPC` on the output storage. Such an error says nothing about the data of the
  file.

## Known limitations

- The exit codes of `deploydicomweb` and of the `curiestore` commands other than `lei` are
  not checked against CLI-U1.
- The `healthlakestore` bin does not start, and `commonMain` does not wait for a deployment
  (issue #149).
