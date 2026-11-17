# Implementation: results of the command line tools

Status: CLI-I1 to CLI-I3 implemented.

This document applies the user requirements of
[Results of the command line tools](../specs/command-line-tools.md) (`CLI-U`) to the code.
You can change an implementation requirement (`CLI-I`) freely when a better approach appears.
Record the change in this document.

## Cause

Pull request #146 changed `dirScanner` (static-wado-util). An unreadable path now goes to
`options.onError`, and the scan continues. `mkdicomweb` (`StaticWado.js`) and the `lei`
command (`leiMain.mjs`) count that path as failed, but nothing set `process.exitCode`. Before
#146, the error stopped the process with exit code `1`. `mkdicomweb` also never set an exit
code for a file that is not DICOM.

With `--delete-failed`, `Failure()` (`resultsReport.ts`) called `unlinkSync` for each failed
path. For an unreadable directory, the call threw `EISDIR` (Linux) or `EPERM` (Windows), and
the import stopped. A file with a temporary `EIO` was deleted.

## § Implementation requirements

### CLI-I1. `mkdicomweb` (static-wado-creator)

- `Failure()` counts its calls in the property `count` of the function that it returns.
- `StaticWado.executeCommand` sets `process.exitCode = 1` when that count is above `0`. Only
  the CLI calls `executeCommand`. The SCP server (`DcmjsDimseScp.mjs`) uses `StaticWado`
  in-process and does not call `executeCommand`, so the server gets no exit code.
- `Failure()` gets the error as its fourth argument. With `deleteFailed`, it deletes the file
  only when the error has no `code`. A parse error has no `code`. A system error (`EACCES`,
  `EIO`, `ENOSPC`, `EISDIR`) has a `code`. The `onError` callback of `processFiles` gives the
  `lstat` or `readdir` error, so an unreadable path is never deleted.

### CLI-I2. The `lei` command (healthlake)

- `leiConvert` declares `n` with `let`. Before, the assignment to an undeclared variable threw
  a `ReferenceError` in strict ESM, and the command could not run.
- `leiConvert` catches the error of each file conversion and counts it as failed, because
  `dirScanner` logs a callback error and does not report it.
- `leiConvert` sets `process.exitCode = 1` when one or more paths failed.

### CLI-I3. The progress bar (static-wado-util)

`createProgressReporter` limits the filled part of the bar to its length. A failed path that
the first count did not see takes the processed count above the total. Before, `'-'.repeat()`
then threw a `RangeError`, and that error gave the exit code `1` by accident.

## Tests

1. `processFiles.jest.js`, "exits with 1 after an unreadable path" (CLI-U1). The real
   `executeCommand`, `processFiles` and `Failure` scan a directory with an unreadable file and
   a readable file. The exit code is `1`.
2. `processFiles.jest.js`, "deletes only a file with bad data for --delete-failed" (CLI-U2).
   One file is unreadable (`EACCES`), one file fails with a parse error, and one file fails
   with `EIO`. Only the file with the parse error is deleted.

A probe with `bun mkdicomweb instance -o out in`, where `in` holds a DICOM file, a file that is
not DICOM, and a directory that the user cannot read: the exit code is `1` with `--quiet`,
with `--quiet --delete-failed`, and with the progress bar. `--delete-failed` deleted only the
file that is not DICOM.
