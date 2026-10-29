# Implementation: stop repeated rebuilds of a missing study-level series index

Status: SQR-I1 to SQR-I6, and SQR-I8 to SQR-I10 implemented. SQR-I7 is a plan for a later change.
Applies to create-dicomweb and static-wado-webserver 1.7.6 to 1.7.10.

This document applies the design requirements of
[Updates of derived data](../specs/derived-data-updates.md) (`SQR-U`, `SQR-D`) to the code.
The specification holds the user requirements, the design requirements, and the problem.
You can change an implementation requirement (`SQR-I`) freely when a better approach
appears. Record the change in [Changes from the proposal](#changes-from-the-proposal).

## Cause

The code paths below were in master at v1.7.10.

### C1. The series query rebuilds every series, and not the index

`packages/static-wado-webserver/lib/controllers/server/seriesQueryController.mjs` calls
`seriesMain(studyUID, { dicomdir: root })` when `series/index.json.gz` does not exist.
`seriesMain` calls `seriesSummary` for every series of the study. `seriesSummary` writes the
files of one series only. Only `studySummary` writes `series/index.json.gz`, and the controller
does not call `studySummary`. Thus `seriesSingleMap` finds no file, and the request ends in a
404. The next request does all of the work again.

### C2. `seriesSummary` always does the full work

`packages/create-dicomweb/lib/instance/SeriesSummary.mjs:220` has the early return in a
comment: `// return; // Metadata is up to date`. The comment was in the first version of the
file (#107). Thus each call reads the metadata of every instance of the series, and builds
three files. `compareOnClose` prevents a rename of an identical file, but the read and the
JSON work stay. For a large study, this work is the source of the memory increase.

### C3. Concurrent rebuilds of one study are not merged

The controller starts a new rebuild for each request. The rebuild does not stop when the client
disconnects. `SagaBusMessaging` merges duplicate `updateSeries` and `updateStudy` messages, but
the query controllers do not use it.

### C4. The study query does not repair a missing series index

`ensureSingleStudyIndex` in `indexOnDemandController.mjs` returns immediately when the study
`index.json` exists. It does not look for `series/index.json`.

### C5. How the index goes missing (probable, not proven)

The incident did not show the exact sequence. The code has one path that matches the logs:

1. Each STOW request calls `deleteStaleSummaries` (`streamPostController.mjs:481`). That
   function deletes `series/index.json` and the study `index.json` of each study in the upload.
2. The STOW request then sends `updateSeries` messages. Each `updateSeries` handler sends an
   `updateStudy` message, and the `updateStudy` handler calls `studyMain`.
3. The default transport is in memory (`createInMemoryTransport`). When the process stops
   before `updateStudy` runs, the message is lost. No other path writes the index again,
   because of C1 and C4.

A second possible path: `FileDicomWebReader.readJsonFile` with `deleteFileOnError: true` deletes
a file after any read error, and not only after a parse error. On a network file system, a read
that overlaps a rename can fail with an I/O error such as `ESTALE`. In that case the reader
deletes a correct file.

## § Implementation requirements

Each item below applies one or more design requirements to one part of the code. The item
does not add a new rule. If an item seems to need a new rule, add the rule to
`§ Design requirements` of the specification first.

| Design requirement | Implementation items |
| --- | --- |
| SQR-D1 Serve the stored version | SQR-I1 |
| SQR-D2 A missing file is always safe | SQR-I1, SQR-I3 |
| SQR-D3 Store each build | SQR-I1, SQR-I4 |
| SQR-D4 Build only when necessary | SQR-I1, SQR-I5 |
| SQR-D5 Data, then generation, then delete | SQR-I3 |
| SQR-D6 Commit only the current generation | SQR-I2, SQR-I4 |
| SQR-D7 Respond after the first build | SQR-I2 |
| SQR-D8 Atomic check and move on one node | SQR-I3, SQR-I4 |
| SQR-D9 Delete only a corrupt file | SQR-I6 |
| SQR-D10 Force a build from the CLI | SQR-I5 |
| SQR-D11 Check the file before the queue | SQR-I1 |
| SQR-D12 Limit the top-level jobs | SQR-I2 |
| SQR-D13 A started job always progresses | SQR-I2 |
| SQR-D14 Reject new work when the queue is too long | SQR-I2 |
| SQR-D15, SQR-D16 Multi-node extension | SQR-I7 (not in this fix) |
| SQR-D17 Best-effort studies list | SQR-I1, SQR-I3 |
| SQR-D18 Commit an instance only when all of its writes succeeded | SQR-I8 |
| SQR-D19 Remove the temporary files of a stopped process | SQR-I9 |
| SQR-D20 Refuse a new upload while too much upload work is stalled | SQR-I10 |
| SQR-D21 Stop an upload at the first instance that the storage cannot write | SQR-I8 |

### SQR-I1. Share one "ensure the level" function for each level

Applies SQR-D1 to SQR-D4 and SQR-D11 to the query controllers and the upload message
handlers. `indexOnDemandController.mjs` exports three functions:

- `ensureSeriesLevel(root, studyUID, seriesUID, options)` for the series level.
- `ensureStudyLevel(root, studyUID, options)` for the study level.
- `ensureStudiesLevel(root, options)` for the studies list (best effort, SQR-D17).

Each function:

1. Returns immediately, outside the job manager of SQR-I2, when all files of its level exist.
   `seriesFilesExist` (exported from create-dicomweb) checks the three series files.
2. Otherwise runs one job in the job manager. With `options.context`, the job is a nested
   job. Otherwise the job is a top-level job.

Two cases return before any job:

- `ensureStudyLevel` returns when the study has no series directory, for example for an
  unknown Study Instance UID. `studySummary` also returns before it opens a stream when it
  finds no series. Thus a query for an unknown study writes no directory, and uses no slot.
- `ensureSeriesLevel` returns when `seriesNeedsBuild` is false: all series files exist, the
  series has no instance directories, or an earlier build of the current generation found
  instance directories with no readable metadata (`noneReadable`, SQR-D3). An in-memory map
  in `indexOnDemandController.mjs` keeps the `noneReadable` results. A build that fails with
  an I/O error throws before the commit (SQR-I6), so the map gets no entry, and the next
  request builds the series again.

The study job reads the generation of the study first. Then it calls
`studyMain(studyUID, { dicomdir, generation, buildSeries })`. `studyMain` calls `buildSeries`
for each series that has a missing file, and the study job gives a `buildSeries` that runs
`ensureSeriesLevel` as a nested job. Thus each series build of the server runs in the job
manager, and one key has one running build. Then `studyMain` writes `series/index.json` and
`index.json`. When a series build returns `committed: false` (also a running series round
that the nested job joined), `studyMain` gives `studySummary` the option `pendingSeries`: a
map from that series UID to the `seriesQuery` of its round. `studySummary` then builds the
study data for the response from the stored series files and those series queries, writes
nothing, and returns `committed: false` (SQR-D6).

The studies list is a best-effort helper (SQR-D17), outside the generation protocol:

- After a study job commits, it calls `addStudyToStudiesIndex(root, studyUID)`, unless
  `options.studyIndex` is false. The controllers and the upload handlers pass
  `params.studyIndex`. The function calls
  `indexSummary(root, [studyUID], { onlyMissing: true })`. That call reads
  `studies/index.json`, and writes nothing when the file lists the study or when the file is
  missing. Otherwise it adds the entry of the study.
- When `studies/index.json` is missing, the studies job calls `ensureStudyLevel` as a nested
  job for each study, and then builds the full list with `indexSummary(root, [])`. The
  nested jobs use the `studyIndex` option of the caller, so that the next round of a study
  that did not commit adds the study to the new list.
- A promise chain in `indexOnDemandController.mjs` serializes all writes of
  `studies/index.json` in one process. Nothing serializes writes from different processes.

The controllers use these functions:

- `seriesQueryController` serves `series/index.json` or `series-singleton.json` when the file
  exists (SQR-D1). Otherwise it calls `ensureStudyLevel`, or `ensureSeriesLevel` when the query
  has `SeriesInstanceUID`. The call of `seriesMain` for the full study is removed (C1).
- `studyQueryController` calls `ensureStudyLevel` for a query with `StudyInstanceUID`, so it
  also repairs a missing `series/index.json` (C4). Without `StudyInstanceUID`, it calls
  `ensureStudiesLevel` (best effort).
- `seriesMetadataQueryController` and the new `instancesQueryController` call
  `ensureSeriesLevel` when their file is missing.
- `studyMetadataQueryController` first reads the metadata of all series. For the series whose
  read gave no data, it runs one top-level job, `study-metadata:<studyUID>:<series UIDs>`,
  when one of them needs a build (`seriesNeedsBuild`). Thus a series with no readable data
  starts no job on each request. Two requests with different missing series each have their
  own job, and share the nested series jobs. The job runs `ensureSeriesLevel` as a nested
  job for each of those series, and returns the metadata of each build. The controller uses
  that data for a series whose build did not commit.
- The `updateSeries` handler calls `ensureSeriesLevel`. The `updateStudy` handler calls
  `ensureStudyLevel`, which also adds a missing study to the studies list. Both use
  `background: true`.

When a round did not commit, the file does not exist after the call. The controller then sends
the data of that round from memory (SQR-D7). When the job manager rejects the job, the
controller answers `503` with a `Retry-After` header (SQR-D14).

### SQR-I2. Add a job manager for top-level and nested jobs

Applies SQR-D6, SQR-D7 and SQR-D12 to SQR-D14 to each caller of a build in the server: the
query controllers and the upload message handlers.

No current dependency fits:

- `SagaBusMessaging` serializes by key and merges pending messages. But `sendMessage` does not
  wait for the handler. A handler that waits for a nested message holds one of the 20 slots of
  the bus, so nested waits can use all slots, and the bus stops (a deadlock).
- A flat limiter such as `p-limit` or `p-queue` has the same deadlock when nested jobs share
  the limit. A separate limit for each level fails when the levels are deeper than the
  configuration expects.
- BullMQ flows have parent and child jobs, but they need Redis and a separate worker process.
  They do not run a nested job inside the request of its parent.

Thus `@radicalimaging/static-wado-util` has a small job manager,
`createJobManager({ maxRunning, maxQueued, retryAfterSeconds })`
(`packages/static-wado-util/lib/createJobManager.mjs`). Its API:

- `run(key, needsBuild, fn, { background })` runs a top-level job for one caller. The job
  manager gives `fn` a job context.
- `context.child(key, needsBuild, fn)` runs a nested job inside the job of the caller.
- `whenIdle()` resolves when no job runs, the queue is empty, and no next round waits for its
  delay. `stats()` gives the counts.

The key is the level and the UIDs, for example `study:<studyUID>` or
`series:<studyUID>/<seriesUID>`. `needsBuild()` is the check of SQR-D11. `fn()` does one round
of the build, and returns `{ committed }`.

The job manager obeys these rules:

1. **Check first (SQR-D11).** Each job runs `needsBuild()` when it starts. If the file exists,
   the job returns, and does no build.
2. **One running job for each key.** The job manager keeps a `Map<key, promise>` of its running
   jobs, top-level and nested. A job in the queue has no entry.
3. **Wait for a build in progress, and then respond (SQR-D7).** When `run` or `child` finds a
   running job for its key, the call waits for the first round of that job, and then returns
   the result of that round. When that job fails, the call gets the same error as the caller
   that started the job. Thus all requests that wait for one failed build get the same
   response. A call never takes over the job of a different caller. A top-level call for
   a key that is in the queue joins that queued job. With the `version` option, the job
   manager records the version of each job when it starts. A call joins a running job only
   when that version is at least the version that the call read when it arrived. Otherwise
   the call waits until the job ends, and then looks again with the same arrival version. The
   server passes the generation of the series, or of the study, as the version (`runJob`).
4. **Start the next round (SQR-D6).** When `fn()` returns `{ committed: false }`, the job
   manager resolves the callers of the first round. After a delay, it calls
   `run(key, needsBuild, fn, { background: true })`. The delay is `roundDelayMs` (default
   1 s) for the first next round, and doubles after each round that does not commit, up to
   `maxRoundDelayMs` (default 30 s; the server uses the defaults). A commit or a failure of
   the key sets the delay back to `roundDelayMs`. The job manager logs a warning after each
   10 rounds of one key, and continues. A key has at most one next round that waits for its
   delay. A request for the key during the delay starts a new job at once. When that job
   commits, the delayed round finds the file. When it does not commit, it starts no second
   delayed round.
5. **Limit the top-level jobs only (SQR-D12).** At most `maxRunning` top-level jobs run at the
   same time, with a default of 2. Other top-level jobs wait in a first-in, first-out queue. A
   top-level call does the wait of rule 3 before it enters the queue, so the wait holds no
   slot.
6. **Never limit a nested job (SQR-D13).** `child` runs its job at once, in the slot of the
   top-level job of the caller. A job awaits each `child` call before the next one, so a job
   does its nested work one item at a time. Parallel nested work is not necessary.
7. **A queued job blocks nothing (SQR-D13).** A job in the queue has no entry in the map. Thus
   `child` for that key runs at once, by rule 6. When the queued job starts later, rule 1
   finds the file, and the job returns immediately.
8. **Reject new work (SQR-D14).** When the queue holds `maxQueued` request jobs, `run` rejects
   a new request job with a `QueueFullError`. The error has `retryAfterSeconds` (default 10).
   The controller answers `503` with a `Retry-After` header. A call with `background: true`
   enters the queue, is not rejected, and does not count to `maxQueued`.

A job that a client abandons still completes, and the next request then finds the file.

These rules prevent a deadlock. A running job waits only for jobs at lower levels, so the waits
cannot form a loop. A nested job never waits for a slot, and a queued job holds nothing. Thus
each running job completes.

The caller of the first round needs the result of that round, also when the round did not
commit (SQR-D7). Thus `seriesSummary`, `studySummary` and `studyMain` return
`{ committed, payload }`, and the controller sends the payload when the file does not exist.
`indexSummary` (the studies list, SQR-D17) returns nothing.

The webserver has one shared instance, `getBuildJobManager(params)` in
`packages/static-wado-webserver/lib/util/buildJobManager.mjs`. It reads the server params
`maxRunningJobs` (default 2) and `maxQueuedJobs` (default 20), in the same way as
`createIndexOnDemand`. `params.jobManager` replaces the instance in the tests.

The CLI does not use the job manager. The CLI runs one build in its own process, and no upload
runs in that process, so the generation does not change during a CLI build.

### SQR-I3. Add a generation tracker, and change the order in `deleteStaleSummaries`

Applies SQR-D2, SQR-D5 and SQR-D8 to the upload path. `create-dicomweb` has a generation
tracker (`packages/create-dicomweb/lib/instance/generationTracker.mjs`):

- `current(key)` returns the current generation of the key.
- `advance(key)` changes the generation of the key.

The key of a study is its UID. The key of a series is `seriesGenerationKey(studyUID,
seriesUID)`, which is `<studyUID>/<seriesUID>`. The studies list has no generation (SQR-D17).
The base design uses an in-memory tracker: a `Map<key, number>`. Both operations are
synchronous. The module exports one shared instance, `generationTracker`. The upload path and
the builds use that instance.

`deleteStaleSummaries` calls `advance()` for each series and for each study, and then deletes
the files. A build of a series that the upload does not change can thus commit during the
upload. A study build that reads its data before a later instance of the upload is stored
does not commit. A study build that commits between two instances of the upload has its files
deleted by the next instance. It uses
synchronous calls only, with no `await` between the `advance()` calls and the deletions
(SQR-D8). It deletes all series files of the levels table (`metadata`,
`series-singleton.json` and `instances/index.json`) and the study files. Before this change,
the function did not delete `instances/index.json`. It does not delete `studies/index.json`
(SQR-D17).

The STOW listener calls `deleteStaleSummaries` for the series of each instance, immediately
after the commit of that instance (the `afterCommit` option of `instanceFromStream`, which runs
after `commitPendingMoves()` resolves, with no I/O between them; SQR-D8 states the result).
Thus an upload that aborts later (a client
disconnect, the listener timeout) leaves no stale derived file. `completePostController` still
calls `deleteStaleSummaries` for all series at the end of the request. The cost for each
instance is two `advance()` calls and the `unlink` calls of the derived files of one series and one
study. `FileDicomWebWriter.delete` ignores a file that does not exist (`ENOENT`).

Before this change, the `updateStudy` handler merged the study into `studies/index.json` on
each upload, also when the file listed the study. Now the study job adds the study only when
the file does not list it (SQR-I1).

### SQR-I4. Check the generation before the move of each file

Applies SQR-D3, SQR-D6 and SQR-D8 to `writeMultipleWithRetry` and `FileDicomWebWriter`.
`writeWithRetry` (the studies list) has no generation (SQR-D17). When `generateData()`
throws, it removes its temporary file and throws the error. When the write or the rename
fails, it throws `toStorageError` of the error. `FileDicomWebWriter` opens each temporary
file synchronously (`fs.openSync`), so a cleanup after a failure always finds the file.

1. `writeMultipleWithRetry` gets a new option `generation`: the tracker, the generation
   `key`, and the generation `value` that the build read when it started. `seriesSummary`
   reads the generation of its series, and `studySummary` reads the generation of its study,
   as their first step,
   before they read or scan any data, or get the value from the caller (for example the study
   job of SQR-I1). Without a value, the write function reads `current()` before it calls
   `generatePayload()`.
2. `FileDicomWebWriter` gets a new option `canCommit()`. `writeMultipleWithRetry` uses the
   existing `deferFinalMove` mode of the writer. `commitPendingMoves()` first compares all
   files (`filesAreIdentical`, asynchronous). Then it calls `canCommit()` one time, and does
   all renames in one synchronous step. Thus no upload can run between the check and the
   renames (SQR-D8), and on one node the files of a round commit all together, or not at all.
   When `canCommit()` returns `false`, the writer deletes the temporary files, and sets
   `writeStatus` to `'generation-changed'`. `_moveTempToFinal` (no deferred moves) does the
   same for one file.
3. After all moves, the write function reads `current()` again. If the value changed, it
   deletes each file that it moved. On one node, an upload can change the generation after
   the last rename. The step then deletes files that the upload also deletes, which is safe
   (SQR-D2). With generations in shared storage, the step also removes a commit that the
   check of step 2 did not stop.
4. The write function returns `{ committed: false, payload }` when a file has the status
   `'generation-changed'`, or when step 3 found a change. The current retry loop for
   `'updated-stale'` stays.
5. When an open, `generatePayload()` or `getData()` throws, for example on an I/O error
   (SQR-I6), the write function deletes the temporary files of the round, and throws the
   error. It does not return `committed: false`, because that result starts the next rounds
   of SQR-D6, and those rounds are for a change of the generation, not for a storage outage.
6. When a rename of `commitPendingMoves()` throws, the writer deletes the temporary files
   that did not move, and the write function deletes the files that moved before the error.
   Thus a failed commit leaves missing files, which are safe (SQR-D2), and not a part of a
   commit.
7. `_finishMove` sets the `writeStatus` of a file only after its rename. Thus a failed
   rename never reports a moved file, and step 6 never deletes the old final file.

### SQR-I5. Restore the early return in `seriesSummary`, and add a `force` option

Applies SQR-D4 and SQR-D10 to `seriesSummary`, `studySummary` and the CLI. The `return` in
`seriesSummary` is restored. It returns early only when all of these conditions are true:

- The instance UIDs in the series `metadata` are the same as the instance directories.
- `series-singleton.json` and `instances/index.json` exist.

The upload path is not affected. `deleteStaleSummaries` deletes the series `metadata` before
`updateSeries` runs, so the UID sets do not match after an upload.

`studySummary` returns early only when the series UIDs of `series/index.json` are the same as
the series directories, and both study files exist (`studyFilesExist`, exported from
create-dicomweb). Thus a missing study `index.json` is built again also when
`series/index.json` is current.

`seriesMain`, `seriesSummary`, `studyMain` and `studySummary` have a `force` option. The
`--force` flag of the `series` command and of the `study` command sets it. The option skips
the early return of its own level only.

`studyMain` first builds each series that has a missing file (`seriesFilesExist`), without
`force`, and uses the stored files of the other series. Thus the `study` command with
`--force` does not build a series whose files exist again. The CLI builds a series with a
direct `seriesSummary` call. The server gives the `buildSeries` option (SQR-I1).

### SQR-I6. Delete a file only after a parse error

Applies SQR-D9 to the reader. In `FileDicomWebReader.readJsonFile`, the reader deletes the
file only when the gunzip step or `JSON.parse` fails (`isCorruptFileError`). The reader does
not delete the file after a missing path or an I/O error (the terms of SQR-D3), for example
`ENOENT` or `ESTALE` (SQR-D9). Without `throwOnIoError` (below), it logs the error and
returns `undefined`. This change removes the second path of C5.

Applies SQR-D3 and SQR-U3 to the reads of a build. `@radicalimaging/static-wado-util` has the
classification of SQR-D3: `isMissingPathError`, `isCorruptFileError`, and
`toStorageError(path, error)`, which gives a `StorageUnavailableError` for an I/O error and
the error itself otherwise. The `StorageUnavailableError` keeps the `code` and the `cause` of
the file system error.

`FileDicomWebReader` has a constructor option, `throwOnIoError`. With this option,
`fileExists`, `directoryExists`, `scanDirectory` (and thus `listDirectories`) and
`readJsonFile` throw the `StorageUnavailableError` of an I/O error. A missing path, and a
corrupt file, still give "missing". The reader uses `fs.statSync` and `fs.lstatSync`, and
not `fs.existsSync`, because `existsSync` returns `false` for each error. The `Retry-After`
value of a `StorageUnavailableError` is 10 seconds.

`createBuildReader(baseDir)` (create-dicomweb) creates a reader with this option. These
callers use it:

- `seriesSummary`, `studySummary`, `seriesMain`, `studyMain` and `indexSummary`, so each
  read, existence check and listing of a build obeys SQR-D3. Thus also the CLI commands fail
  on an I/O error, and do not report "no series".
- The checks before a build in the webserver (the default reader of `ensureSeriesLevel`,
  `ensureStudyLevel` and `ensureStudiesLevel`). The controllers first check their response
  file with `fs.existsSync`. A failed check there only leads to the `ensure*` call, which
  checks again with the build reader. Thus a failed check never counts as a missing file or
  as an unknown study.

`writeMultipleWithRetry` also applies rule 1 of SQR-D3 to its writes: a stream whose write
failed (`closeStream` returns `undefined`) stops the round, and a failed rename stops the
commit, and so does a failed open of a stream. Each throws `toStorageError` of the error.
`toStorageError` gives a `StorageUnavailableError` only for an error with an operating
system code (`E` and capitals) that is not a missing path. Other errors come back unchanged,
and give `500`. The build reader (`_throwIoError`) throws each read error that is not a
missing path and not a corrupt file, also an error with no code. Thus a build never counts
an unreadable file as missing data. A failed deletion of a corrupt file throws only with the
read option `throwIfNotDeleted`, which only the singleton read of `readStudyData` uses (rule
4 of SQR-D3). Other reads leave out a corrupt file that stays (rule 5).

`handleBuildError` answers a `StorageUnavailableError` with `503` and a `Retry-After` header,
in the same way as a `QueueFullError`. `studyMetadataQueryController` lists and reads the
stored files with a build reader, on the path of the request (also with
`hashStudyUidPath`). It reads the `metadata` of all series first, in parallel, with
`deleteFileOnError`. Then it builds only the series whose read gave no data (missing or
corrupt), in one job, and reads those again. Thus an upload that deletes a series file
during the request does not remove that series from the response, and a corrupt file is
built again at once. With builds on demand, a series with no stored metadata after its build
(no readable data, SQR-U1) adds no instances. Without builds on demand
(`createIndexOnDemand: false`, and also with `hashStudyUidPath`, because the builds use
paths with no hash), a series with no stored metadata gives `404` for the study, as before
this change. With `hashStudyUidPath`, `GET /studies` also builds no studies list.
`studyMetadataQueryController` reads at most 16 series files at the same time.

`studySummary` notes each series whose `series-singleton.json` was there at the check but
gave no data (a corrupt file that the read deleted, or a file that an upload deleted after
the check) in `payload.unreadSeries`. It then stores no study file, and returns
`committed: false`. `studyMain` builds those series, and calls `studySummary` one more time
(rule 4 of SQR-D3). When `unreadSeries` is still not empty and the generation of the study
did not change, `studyMain` throws, so the job fails and starts no next round. When an upload
changed the generation, it returns `committed: false`, and a next round builds the study.
`studyMain` reads the generation of the study before its series builds, and gives that
value to both `studySummary` calls.

`indexSummary` with `onlyMissing` reads `studies/index.json` with `deleteFileOnError`, so a
corrupt studies list is deleted, and the next `GET /studies` builds it again.

Other readers keep the lenient mode: `deleteStaleSummaries`, and the CLI commands that read
derived files for other work. In the lenient mode, too, the reader no longer deletes a file
after an I/O error.

Known limit: `_finishMove` removes an old-layout metadata directory (`<name>/index.json`)
before the rename, because an uncompressed file can have the same path. A failed rename
there loses the old directory, and the next build makes the file again.

### SQR-I7. Multi-node extension (not in this fix)

Applies SQR-D15 and SQR-D16. This item is a plan for a later change. It shows that the base
design does not block the extension.

- Add a shared tracker with the same interface as SQR-I3. On a file system, the tracker keeps
  the generation in a file, for example `.generation` in the directory of the study. The value
  is a random string. `advance()` writes a new value to a temporary file, and renames the
  temporary file to `.generation`. `current()` reads the file. The `.generation` file of the
  study and `.generation` in the `studies` directory are the two kinds of generation file.
- The operations of the shared tracker are asynchronous, so SQR-D8 does not apply. Step 3 of
  SQR-I4 then does the work: it finds a change after the move, and deletes the moved files.
- Record the generation of each committed file with the modification time (mtime). The
  generation of a file is the mtime of the `.generation` file of its study.
  - When a build starts, it reads the mtime of `.generation`, as `G`.
  - Before the build moves a temporary file, it sets the mtime of the temporary file to `G`,
    with `fs.utimesSync`. When `compareOnClose` finds an identical file, the build sets the
    mtime of the existing file to `G`.
  - A rename keeps the mtime, so the committed file records `G`.
- Before the server serves a derived file, it compares the two mtimes. When the mtime of the
  derived file is different from the mtime of `.generation`, the file was not built from the
  current generation. Then the server deletes the derived file, and builds it again (SQR-D2).
  The check costs one `stat` of `.generation` for each request. The server already does a
  `stat` of the derived file.
- Compare the two mtimes in whole milliseconds. `fs.utimesSync` does not keep all digits of a
  nanosecond mtime on each file system. A comparison of more digits can find a difference on
  each request, and then the server builds the file again on each request.
- The mtime of the derived file must be `G`, and not the time of the write. A build that
  started before an upload, and moved its file after the upload, has a write time that is
  later than `.generation`. That stale file would pass a check of the write time. With `G`,
  the file has the mtime of the old generation, and the check finds the difference.
- `advance()` must give a new mtime that is different from the old one, in whole
  milliseconds. Thus `advance()` reads the old mtime, and if the new mtime is the same, it
  sets the new mtime to the old mtime plus 1 ms.
- Known limit: two builds can read the same `G`. If the data changes while the generation keeps
  the same mtime, the longer build can commit different content with the same mtime, and the
  serve check does not find it. The rule of `advance()` above makes this case rare. It cannot
  occur in the base design, which does not use the mtime. Thus this fix accepts the limit, and
  the multi-node change must examine it again.
- On S3, the server cannot set the modification time of an object. Use object metadata, for
  example `x-amz-meta-generation`, with the value of the generation. S3 writes the object and
  its metadata together.
- An alternative on a file system is a small file next to each derived file, for example
  `index.json.gz.generation`, that holds the value of the generation. That alternative costs one
  more file and one more read for each request, so the mtime is the recommended approach.

### SQR-I8. Report the result of each instance of an upload correctly

Applies SQR-D18 and SQR-D21 to `instanceFromStream`, the writers, the STOW middleware and the
CLI. Issue
#144 and the reviews of pull request #146 list the defects that this item corrects. The
`afterCommit` call after the rollback `try`, and a `FileDicomWebWriter.delete()` that never
throws, came with #141 (SQR-I3). This item depends on them, and does not change them.

1. `instanceFromStream` throws when the `closeStream` of the instance `metadata` returns
   `undefined`. After `drainOpenStreams`, it throws the first error that the writer recorded
   (`getStreamErrors()`). The frame and bulk data filters only record their errors, so before
   this change an instance with a failed frame write committed.
2. `openFrameStream` no longer deletes `<n>.mht` and `<n>.mht.gz` when the stream opens. It
   gives the other variant in the new stream option `replaces`. `FileDicomWebWriter` deletes
   the files of `replaces` after the rename of the stream, or when `compareOnClose` finds an
   identical file. The rename replaces a file with the same name.
3. The instance `metadata` stream has the new stream option `commitLast: true`.
   `commitPendingMoves` renames it after all other pending files, also when a frame closes
   after the metadata. Thus a failed rename (issue #143) or a process stop never shows a new
   instance without some of its frames. The `metadata` stream also has
   `replaces: ['index.mht', 'index.mht.gz']`. Thus the writer deletes the Part 10 rendition
   of an earlier upload directly after the rename of the `metadata`, in the same synchronous
   step. No request then gets the old rendition with the new metadata. This is also true when
   the instance is no longer a SEG, SR or parametric map. It is also true when the process
   stops before the commit of the new rendition.
4. When the Part 10 rendition fails, `instanceFromStream` deletes `index.mht` and
   `index.mht.gz` of the instance (`writer.delete`). The `part10Controller` then makes the
   rendition from the stored files, as it does before the commit of the new rendition.
5. `multipartStream` waits for the listeners after the last part, in three phases:
   - Phase 1 waits while the stream writes of the request settle. Each round waits up to
     5 minutes (`limitUnsettled`). The phase ends when no write is open, or after a round in
     which no write settled. Thus the phase has no limit while the writes progress. It takes
     no time when no write is open, and it ends at once when the last open write settles.
     When a write does not progress, `drainOpenStreams` of the instance stops that write
     60 s after the last completed write of the instance (`DEFAULT_DRAIN_TIMEOUT_MS`). The
     write promise rejects, and the phase ends. The listener then fails, phase 2 ends at
     once, and the request gets a report of each instance (`409` or `202`), not `503`.
     The drain runs after the parse of the instance. Work that the drain does not stop, for
     example a parse that waits or a slow `validateInstance`, keeps a write open. Then the
     phase ends 5 to 10 minutes after the last write that settled.
   - Phase 2 waits 5 minutes for the listeners. Then `multipartStream` adds the listener
     promises to the count of SQR-I10. It marks the part streams as aborted (`setAborted`),
     which stops each parse that still runs.
   - Phase 3 waits 1 more minute.

   When all listeners settled, the request goes to `completePostController`, which reports
   each instance. Otherwise the request gets `503` with `Retry-After: 300`. Before this
   `503`, the total wait after the last part is at least 6 minutes. When work that the drain
   does not stop keeps a write open, the total wait is at least 11 minutes.
   `TrackableReadBufferStream` keeps a handler on its abort promise, so `setAborted` gives
   no unhandled rejection.
6. A Dicer error (`onBodyError`) gives the report of each instance only when the request body
   ended (`req.readableEnded`) and a part is complete. Only "Unexpected end of multipart
   data" (a body with no closing boundary) comes after the end of the body. Then each part
   before the current part (`dicer._part`) is complete, and the complete parts continue. The
   cut part fails with `failureReason` C000, and `waitForListeners` sends the request to
   `completePostController`. Each other Dicer error (a folded first header line, or a header
   above 64 KB) comes while the body arrives. The pipe from the request to Dicer then stops,
   so the later parts are lost, and the request gets `400` (`abort`). Each part gets a no-op
   `error` listener when it arrives, because Dicer can emit the part error before
   `errorHandler` is attached. `abort` sends no response after `next()`, because
   `completePostController` then owns the response. A part above `limits.parts` counts as
   complete when it ends, so the request does not wait for it.
7. `completePostController` answers with `getStowStatusCode` of the response dataset: `200`,
   `202` or `409`. When the server stored no instance, it answers `503` with
   `Retry-After: 10` in two cases (`isStorageOutage`). In the first case, a storage error
   stopped the upload (`req.uploadStopReason`, item 15). In the second case, each failure is
   a `StorageUnavailableError` of `toStorageError`.
8. `stowFailureReason` gives the Failure Reason of each failed instance: `error.failureReason`
   when it is set, then `A700` for a `StorageUnavailableError` that is out of resources
   (`isOutOfResourcesError` of static-wado-util: `ENOSPC`, `EDQUOT`, `EMFILE`, `ENFILE`,
   `ENOMEM`), then `0110`. `instanceFromStream` sets `failureReason` C000 only on a parse
   error or a `validateInstance` rejection that has no operating system code, no
   `ERR_STREAM_*` code and no `ABORT_ERR` code, and that is not a `TypeError`, a `RangeError`
   or a `ReferenceError` (a program error, or "Array buffer allocation failed"). A stopped
   stream gives a new `ABORTED` error
   with the `failureReason` of the stop reason (C000 for a cut part, none for a stop of the
   server). `stowResponseBuilder` no longer reads `result.streamErrors`, which no code set.
9. `instanceFromStream` puts the UIDs that the parse read on its error
   (`error.information`). `createDatasetResponseFromUploadedFiles` reads them, so a failed
   item has its SOP Class UID and SOP Instance UID.
10. The writer of `instanceFromStream` defaults to `deferFinalMove: true`. Thus the CLI
    (`instance`, `create`) uses the same commit as the server.
11. `storeInstanceFiles` (create-dicomweb) returns `{ studyUIDs, failedFiles }`. `instanceMain`
    keeps its return value. `createMain` returns `{ failedFiles }`. The `instance` and
    `create` commands set `process.exitCode = 1` when a file was not stored. `dirScanner`
    (static-wado-util) uses `lstatSync`: a missing path (`isMissingPathError`) calls the new
    option `onMissing`. Any other error of the stat or of the list of a directory calls the
    new option `onError(path, error)`, and the scan continues. Without `onError`, the error
    throws. `storeInstanceFiles` counts both. The bulk imports of `static-wado-creator`
    (`StaticWado.js`) and `healthlake` (`leiMain.mjs`) pass `onError`, and count the path as
    failed. Thus one unreadable entry does not stop the import.
12. `deleteStaleSummaries` also deletes the series `thumbnail`, and the `thumbnail` of each
    instance whose info has a `sopInstanceUid` (SQR-D5). With builds on demand,
    `createMissingThumbnail` first runs `ensureSeriesLevel` (instance thumbnail) or
    `ensureStudyLevel` (series thumbnail) in the build job manager, with the `studyIndex`
    server param, and answers a build error with `handleBuildError`.
13. After the commit, `instanceFromStream` calls `writer.removeFramesAbove(writer.frameCount)`.
    `openFrameStream` records the highest frame number. `FileDicomWebWriter` deletes each
    `<n>.mht` and `<n>.mht.gz` of the instance with `n` above that number, so a new upload
    with fewer frames leaves no old frame. The call never throws.
14. The `stow` command of the CLI (`stowMain`):
    - It sends a group again after a `503` response, up to 3 times (`stowFilesWithRetry`). It
      waits for the `Retry-After` value (seconds or an HTTP date, 10 s when the header is not
      there, at most 10 minutes). A connection reset (`ECONNRESET` or `EPIPE`) uses the same
      retries, with a wait of 10 s. After the last retry, `runOneStow` counts the group as
      failed, and the other groups continue. Only `ECONNREFUSED`, `ENOTFOUND` and
      `ETIMEDOUT` stop the command at once with `process.exit(1)`.
    - `stowFiles` sends the body with `stream.pipeline`, which destroys the body stream when
      the request fails or closes. When the response ends before the end of the body (the
      `503` of SQR-I10), `stowFiles` destroys the request. Thus the file of the body closes at
      once, and not after `keepAliveTimeout` of the server. A retry does not keep the files
      of the earlier body open.
    - A file that the command cannot open or read destroys the request. Examples are
      `EACCES`, and a file that a different process deleted after the scan. `runOneStow` counts
      the group as failed, with no retry. Before, such a file stopped the command with an
      unhandled `error` event.
    - The command logs the failed instances of a `409` or `503` response, and prints the body
      of a failed response one time for each group. The error message of a file has the
      status only. After a `202`, `parseAndLogDicomJsonErrors` returns the items of the
      Failed SOP Sequence, and the command counts each item as a failed file.
    - Each part of the body has a unique `Content-Location`: the part number, a hyphen, and
      the base name of the file with `encodeURIComponent` (`partContentLocation`, for example
      `2-IM-0001.dcm`, or `1-%C3%A4.dcm` for `ä.dcm`). The server puts this value in the tag
      `(0009,1001)` of the item of each part. Thus two files of a group with the same base
      name in different directories get different values. The encoded value is ASCII, so the
      echo matches also when the server reads the part headers as Latin-1.
    - After a `202`, `filesNotListedAsStored` counts each file that the response does not
      list as stored as failed. The command counts a file as stored only when an item of
      the Referenced SOP Sequence has its `Content-Location`. An example of a failed file is
      a part that the server did not start after the stop of item 15. When a stored item has
      no such value (a different server), the number of stored items gives the number of
      stored files, and the failures name no file. A body that is not DICOM JSON (for
      example XML) lists no stored file, so each file of the group fails.
    - The command sets `process.exitCode = 1` when a file failed, and counts an unreadable
      path as failed.
15. The stop of SQR-D21. `multipartStream` has the option `stopOnError(err)`.
    `streamPostController` passes `storageStopReason` of `stowResponseBuilder`. It gives a
    stop reason for an error that `toStorageError` makes a `StorageUnavailableError`, and
    `null` for each other error. The reason has `failureReason` A700 (`isOutOfResourcesError`)
    or 0110. When the listener of a part rejects with such an error, `stopRequest` of
    `multipartStream` does these steps one time:
    - It sets `req.uploadStopReason`.
    - It unpipes the request from Dicer and pauses the request, so the server reads no more
      of the body.
    - It marks each part stream that is not complete as aborted with the reason (`stopParts`
      with `incompleteOnly`). `instanceFromStream` then throws an `ABORTED` error with the
      `failureReason` of the reason (item 8). A part whose stream is complete continues, and
      can commit.
    - It starts `waitForListeners`, the three phases of item 5.

    A new part, or a part that waits in `beforeProcessPart`, gets no listener, and thus no
    item in the response. After the stop, the `aborted` event of the request does not call
    `abort`. This event comes when the server closes the connection after
    `keepAliveTimeout`, as after the `503` of SQR-I10. `stopRequest` does nothing after
    `abort` or after `next()`.

    A probe on Node.js 24.20.0 (Windows 11, loopback, a body that does not end) gave these
    results:
    - The client got the `503` after about 1 s, while it sent the body. The back-pressure
      wait of 100 ms (`backpressureWaitMs`) causes most of this time.
    - The server closed the connection about 6 s later. The client request then got
      `ECONNRESET`, after the full response.
    - No temporary file stayed.

    `stowFiles` destroys its request at the end of the response (item 14), so it does not
    get this error. A client that reads the response only after it sent the whole body gets
    the `ECONNRESET`, and no response.

The partial commit of issue #143 is not in this item. It is a known limitation of the
specification. Item 3 makes its result safer for a new instance.

### SQR-I9. Remove the orphan temporary files at server start

Applies SQR-D19. `removeOrphanTempFiles(dicomdir, { maxAgeMs })` (create-dicomweb) lists
`studies/temp/` and `studies/<studyUID>/temp/`. It removes each file whose name matches
`TEMP_FILE_NAME_RE` of `FileDicomWebWriter` (`<Date.now()>-<random>-<name>`), and whose mtime
is older than `maxAgeMs`. It keeps the directories. It uses asynchronous calls one after the
other, logs each error, and returns the number of removed files.

The webserver calls it in the background after `listen`, with the server param
`tempMaxAgeHours` (default 24; `0` turns it off). A process makes orphan files only when it
stops, so the next start is the correct time for the removal. The function throws a
`RangeError` for a `maxAgeMs` that is not a finite number above 0. Such a value removes the
files of each upload that runs. It does not follow a temp directory that is a
symbolic link (`lstat`).

### SQR-I10. Count the stalled STOW-RS listeners of the server

Applies SQR-D20. `createStalledStowListeners({ maxStalled, retryAfterSeconds })`
(`packages/static-wado-webserver/lib/util/stalledStowListeners.mjs`) keeps one count for the
server, on a `createPromiseTracker` of static-wado-util. The tracker counts each promise
until it settles. `getStalledStowListeners(params)` returns the shared instance, in the same
way as `getBuildJobManager`. It reads the server param `maxStalledStowListeners`. The default
is `DEFAULT_MAX_STALLED_STOW_LISTENERS` (8) of that module, and the server config uses the
same constant. `0` turns the limit off. `params.stalledStowListeners` replaces the count in
the tests.

- `multipartStream` calls `add(req.uploadListenerPromises)` one time for each request. The
  call comes at the end of phase 2 of item 5 of SQR-I8, or in `abort`, when the request
  aborts first. A promise that already settled leaves the count in a microtask, so before
  the server reads the next request.
- `instanceFromStream` has the option `onStuckWrites(closed)`. `FileDicomWebWriter`
  `recordStreamError` keeps each destroyed `fs.WriteStream` that did not close. When the
  instance fails, `instanceFromStream` calls `onStuckWrites` with
  `whenDestroyedStreamsClosed()`. This promise resolves on the `close` event of each such
  stream. Node.js emits `close` for a destroyed `fs.WriteStream` only after its last file
  operation returns. `streamPostController` adds the promise to the count. Thus an instance
  whose listener rejected after the drain timeout (`drainOpenStreams`) stays in the count
  while its write is stuck.
- At the start of a multipart request, before Dicer reads the body, `multipartStream` calls
  `isFull()`. When the count is at the limit, the request gets `503` with `Retry-After: 60`
  at once. The response has no `Connection: close`. A close while the client still sends
  the body resets the connection, and the client then gets `ECONNRESET` and not the `503`.
  After the response, Node.js does not read and discard the body. A probe on Node.js 24.20.0
  (Windows 11, loopback, `http` and `express`, a body of 50 MB and of 2000 MB) gave these
  results:
  - The client got the `503` within 20 ms.
  - The server read 64 KB to 128 KB of the body (`socket.bytesRead`), and then stopped the
    read.
  - The server closed the connection after `keepAliveTimeout` (5 s). The client `req` then
    emitted `close`, with no `error`.
- While the count is above 0, `StatusMonitor` shows a job of type `stowStalled`, with the
  count (`stalled`) and the limit (`maxStalled`).

The count holds only these promises:

- the listeners past their wait, or of an aborted request;
- the failed instances with a destroyed file stream that did not close.

Thus a slow upload that still progresses does not refuse other uploads. The promises of a
fast abort stay in the count for a short time only. The promise of a failed instance whose
streams close at once also stays for a short time only. Just before a listener rejects, its
instance can be in the count two times for a short time. The limits `maxUnsettledReceives` and
`maxUnsettledStreamWrites` are for one request only.

### Changes from the proposal

The first version of this document was a proposal. The implementation differs from the
proposal in these items:

- **SQR-I1.** The proposal had one function for the study level. The implementation has one
  function for each level (series, study, studies list), and all server callers of a build use
  them. The series metadata query and the instances query also use the series job.
  `seriesQueryController` serves its own file when it exists, before it calls
  `ensureStudyLevel` (SQR-D1). The studies job skips the `studies/temp` directory.
- **SQR-I1, SQR-I3, SQR-I4 (studies list).** The proposal kept the studies list in the
  generation protocol, and the upload deleted `studies/index.json`. After review, the studies
  list became a best-effort helper (SQR-U4, SQR-D17). The upload keeps the file, the studies
  list has no generation, and a committed study build adds a missing study to the file.
- **SQR-I1, SQR-I3.** `deleteStaleSummaries` also deletes `instances/index.json`, because the
  levels table lists it as a series file. The new `instancesQueryController` builds that file
  on demand, so SQR-D2 holds for the instances query.
- **SQR-I2.** Rule 3: a call that waits for a running job gets the result of the first round
  of that job, and not only the end of the wait. Without the result, a caller that waits for a
  round that did not commit has no response data (SQR-D7). A top-level call for a queued key
  joins the queued job. The job manager also has `whenIdle()` and `stats()`. The CLI does not
  use the job manager. The server params are `maxRunningJobs` and `maxQueuedJobs`.
- **SQR-I4.** The summary functions read the generation before their first scan, and not only
  before `generatePayload()`. `seriesSummary` scans data before it calls the write function,
  so a later read can miss a change. The `canCommit()` check runs before the
  removal of old-format metadata directories and before `fs.renameSync`. All of that code is
  synchronous.
- **SQR-I3, SQR-I4 (generation of each series).** The proposal used one generation for each
  study. After review, each series also has a generation, so that an upload into one series
  does not stop the builds of the other series of the study.
- **SQR-I5.** `studyMain` builds only the series that have a missing file. It does not call
  `seriesSummary` for each series.
- **SQR-I6.** The reader no longer removes an old-format metadata directory after a read
  error. The writer still removes such a directory when it commits the new file.
- **SQR-I1, SQR-I4, SQR-I6 (I/O errors).** After the third review, a build fails on an I/O
  error, and the record of a series with no readable data no longer covers an I/O error
  (SQR-D3). Before, an I/O error counted the same as missing data. A short storage outage
  could then make a series give `404` until the next upload or a restart, and a study build
  could commit a series index without a series.
- **SQR-I6 (existence checks and listings).** After the fourth review, the strict mode is an
  option of the reader (`createBuildReader`), and not of each read. It covers the existence
  checks and the directory listings, because `fs.existsSync` returned `false` for an I/O
  error. A storage error gives `503` with `Retry-After`, and not `500`. A series with no
  instances stores no `metadata`, so that no request serves `[]` for it, and starts no build.
  The record of SQR-D3 holds only for `noneReadable`, so an unknown series UID adds no entry.
- **SQR-I1, SQR-I4 (rounds that do not commit).** After the fourth review, a study round does
  not commit when a series build of that round did not commit (`pendingSeries`), and its
  response uses the series query of that series round. Before, a study round that joined
  such a series round committed a series index without that series. The nested study jobs
  of the studies list keep the `studyIndex` option of the caller, so that a study whose
  round did not commit during the build of the list is added by its next round. A failed
  round leaves no temporary file and no part of a commit, and keeps each old file that did
  not get its new version (except the old-layout limit of SQR-I6).
- **After the third internal review round.** A failed write of one file stops the round, and
  gives `503`. A corrupt `series-singleton.json` makes the study build build that series
  again, and does not store study files without it. The study metadata query reads first,
  then builds. The job manager keeps one delayed round for each key. `toStorageError` treats
  only errors with an operating system code as storage errors.
- **After the fourth internal review round.** The build reader throws each read error that is
  not a missing path and not a corrupt file, and a failed deletion of a corrupt file, so a
  build never leaves out an unreadable series and never repeats rounds that cannot change.
  `studyMain` fails when a series file stays unreadable. A failed open of a stream gives
  `503`. The reader reads the older layout `metadata.gz/index.json.gz`. With
  `hashStudyUidPath`, the study metadata query and the studies list start no build.
- **After the fifth internal review round.** A failed deletion of a corrupt file fails a
  build only for the singleton read of a study build (`throwIfNotDeleted`); other reads leave
  the file out. The writer opens temporary files synchronously, so no temporary file stays
  after a failure. `writeWithRetry` throws on a failed write or rename. `studyMain` throws only
  when no upload changed the study. The older `.gz` directory layout applies to `metadata`
  only. `indexSummary` skips `studies/temp`. When an upload fails after the parse (for example
  the metadata file cannot open), `instanceFromStream` aborts and drains the frame and
  bulkdata streams before the rollback, so no temporary file of the instance stays.
  `writeWithRetry` also gives a `StorageUnavailableError` for a failed open and a failed
  rename.
- **After the review of pull request #146 by a maintainer.** A Dicer error gives the report
  of each instance only after the end of the body. A malformed part header gives `400`,
  because the later parts are lost. The server counts the stalled STOW-RS listeners
  (SQR-I10), and the `503` of an unknown result has `Retry-After: 300`. The `metadata` of an
  instance replaces the old Part 10 rendition, and the commit deletes the frames above the
  new count. `dirScanner` has `onError`, so a bulk import continues after an unreadable
  path. The `stow` command retries a `503`, and exits with `1` for a failed group.
  `createMissingThumbnail` passes `studyIndex`. A program error never gives `C000`.
  `removeOrphanTempFiles` rejects an age that is not above 0.
- **After the second review of pull request #146.** The count of SQR-I10 uses
  `createPromiseTracker`, and `StatusMonitor` shows it. The count also holds the listeners of
  an aborted request, and a failed instance with a stuck file write (`onStuckWrites`). The
  `503` of a full count has `Connection: close`. The `stow` command counts the failed
  instances of a `202` as failed.
- **After the third review of pull request #146.** The `503` of a full count has no
  `Connection: close` again, because a client that sends a body got `ECONNRESET` and not
  the `503`. The `stow` command retries a connection reset in the same way as a `503`, and
  does not stop the process.
- **After the fourth review of pull request #146.** A maintainer decided that an upload
  stops at the first instance that the storage cannot write (SQR-D21, item 15 of SQR-I8).
  Before, the server read the whole body, and tried each instance, before it sent the
  response. The text about the read of the body after the early `503` is correct now
  (SQR-I10). The `stow` command sends the body with `stream.pipeline`. It closes the file of
  the body after an early response, and counts a group with a file that it cannot read as
  failed. After a `202`, it counts a file with no item in the response as failed.
- **After the fifth review of pull request #146.** The `stow` command gives each part a
  unique `Content-Location`. Before, two files of a group with the same base name could
  count as one stored file. After a `202`, the command counts a file as stored only when the
  response lists it as stored. The upload tests use `backpressureWaitMs: 1`, so test 47 does
  not time out. Test 65 repeated test 63, and the change removes it. Test 68 shows that a
  `C000` failure does not stop an upload.
- **After the sixth review of pull request #146.** The `stow` command encodes the base name
  in the `Content-Location` of a part with `encodeURIComponent`. Before, the server read the
  part header as Latin-1, so a file name that is not ASCII did not match its echo, and the
  command could name a stored file as failed.

## Compatibility

This change changes two public contracts. The commits have no `BREAKING CHANGE` footer, so
the maintainers must decide the version of the release.

- **`getStowMessaging()` (static-wado-webserver).** The `updateSeries` and `updateStudy`
  handlers now build only the derived files that are missing. Before this change, the handlers
  always built the series and the study again. A plugin that changes stored data and then
  sends these messages must first call `deleteStaleSummaries` for the changed series.
  Otherwise the server keeps the old derived files.
- **`seriesSummary` (create-dicomweb).** The function returns early again, with no write,
  when the instance UIDs of the series metadata are the same as the instance directories, and
  `series-singleton.json` and `instances/index.json` exist. Before this change, each call
  built the series files again. A caller that changes instance metadata in place (with the
  same SOP Instance UIDs) must use the `force` option, or delete the series files first.
  This also applies to the CLI: when you store an instance again with the same SOP Instance
  UID, the `series` command keeps the old series metadata. Use `--force` to build the series
  files again. The webserver is not affected, because each upload deletes the derived files of
  its series (SQR-D5).

The other changes of the exported functions add to the earlier behaviour:
`seriesSummary` and `studyMain` return `{ committed, payload }`, `seriesMain` returns
`{ committed }`, and `seriesSummary` (`force`, `generation`), `seriesMain` (`force`),
`studyMain` (`force`, `generation`, `buildSeries`), `indexSummary` (`onlyMissing`) and
`instanceFromStream` (`afterCommit`, `onStuckWrites`) get new options. `studySummary` is
internal, and is not exported. The `FileDicomWebReader` constructor gets the `throwOnIoError`
option, `readJsonFile` gets the `throwIfNotDeleted` option, and the reader gets
`directoryExists` and `listDirectories`. `FileDicomWebWriter` gets the `canCommit` option and
the `whenDestroyedStreamsClosed()` method, and `commitPendingMoves` cleans up after a failed
rename. create-dicomweb exports `createBuildReader`, `seriesFilesExist`, `studyFilesExist`,
`generationTracker`, `createGenerationTracker` and `seriesGenerationKey`.
`@radicalimaging/static-wado-util` exports `createJobManager`, `QueueFullError`,
`StorageUnavailableError`, `isMissingPathError`, `isCorruptFileError` and `toStorageError`.

These user-facing results also change:

- The builds of create-dicomweb, also in the CLI (`series`, `study`), throw a
  `StorageUnavailableError` on an I/O error of the storage. Before this change, the builds
  treated the data as missing, and the `series` command printed "No series found". A server
  request that needs a build gets `503` with a `Retry-After` header (SQR-U3).
- A request that needs a build gets `503` with a `Retry-After` header when the build queue
  is full (SQR-U3). This status code is new for clients.
- A series with no instances has no series `metadata`. Before this change, a build stored
  `[]`, and a metadata request for that series got `200` with `[]`. Now the request gets
  `404`. A `metadata` file of `[]` that an earlier version stored stays, and the server
  still sends it (SQR-D1).
- With builds on demand, `GET /studies/<studyUID>/metadata` leaves out a series with only
  corrupt data, and gives the other series (SQR-U1). Before this change, the request gave
  `404` for the full study. A corrupt series `metadata` is deleted and built again, where
  before the request gave `500`. When the server cannot delete that file, the request still
  gives `503` for an I/O error, and `500` otherwise. Without builds on demand (`createIndexOnDemand: false`), a
  corrupt series `metadata` is deleted, and the request gives `404` until the next upload to
  that series. Before this change, it gave `500`.
- With `hashStudyUidPath`, `GET /studies/<studyUID>/metadata` gives `404` when the metadata
  of a series is missing, as on master. `GET /studies` builds no missing studies list, and
  gives `404`. Before this change, it stored an empty list, because the build listed the
  hash directories as studies.
- An upload no longer changes the entry of an existing study in `studies/index.json`. The
  counts of that entry in `GET /studies` can be older than the study (SQR-U4). Before this
  change, the `updateStudy` handler merged the study into the file on each upload.
- An upload no longer makes a missing `studies/index.json`. The next `GET /studies` makes
  it. A tool that reads the file from the disk, with no `GET /studies`, does not find it.
- `GET /studies/<studyUID>/series/<seriesUID>/instances` builds a missing
  `instances/index.json` (`instancesQueryController`). Before this change, the request gave
  `404`.
- The `createdicomweb study` command first builds each series that has a missing file. The
  `index` command also fails on an I/O error.
- A write I/O error of a derived file during a build gives `503`, and not `500`. A read error
  of a build that is not an I/O error (for example a file that is too large to parse) gives
  `500`. Before this change, the build treated that file as missing data. A permanent error
  (`ELOOP`, `EISDIR`, `EINVAL`, `ENOTEMPTY`, `EEXIST`, `EXDEV`) gives `500`, and a name that
  is too long (`ENAMETOOLONG`, for example a long UID in a request) counts as a missing path.
- `GET /studies` (the studies list) leaves out a study that the server cannot read, and gives
  `200`. Before, one such study gave `503` or `500` for the full list. After an I/O error,
  the list is sent and not stored.
- A request job uses the new server param `requestJobSlots` (default 1): extra running
  builds for requests only. A request job in the queue starts before the background jobs.
- A query or a metadata request that finds its file, and then loses it to an upload before
  the send, gets the data of a build, and not `404`.
- The STOW-RS upload stores the correct bytes when the request arrives in small chunks.
  Before this change, the server rejected some valid instances.
- An upload reports an instance as failed when the write of its metadata, a frame or a bulk
  data item fails (SQR-U5). Before this change, the upload reported success, and stored the
  instance without that file. The `instance` command of the CLI now prints
  `Couldn't process <file>` for such a file, and continues with the next file.
- The listeners of a STOW-RS request can stay open after the last part. After the wait of
  item 5 of SQR-I8, the response reports each instance, or the request gets `503` with
  `Retry-After: 300`. Before this change, the request got `400`. This status code is new for
  a STOW-RS client.
- The server param `maxStalledStowListeners` (default 8) limits the stalled instances of
  SQR-D20. At the limit, a new STOW-RS request gets `503` with `Retry-After: 60` at once.
  The server does not store its instances. It stops the read of the body, and closes the
  connection after `keepAliveTimeout` (5 s). A client that reads the response only after it
  sent the whole body can get a connection reset, and not the `503`. One upload with 8 or
  more instances can reach the limit. Set `0` to turn the limit off.
- The `stow` command of the CLI retries a connection reset (`ECONNRESET`, `EPIPE`) of a
  group, up to 3 times, and then counts the group as failed. Before this change, the
  command stopped all groups with exit code `1` at the first connection reset.
- The `stow` command counts a group with a file that it cannot open or read as failed, for
  example after `EACCES`. The command then continues with the other groups. Before, the
  command stopped with an unhandled `error` event, and printed no summary. After a `503`
  before the end of the body, the command closes the file of the body at once. The
  `Content-Location` of each part now has the part number in front of the base name of the
  file, for example `2-IM-0001.dcm`. The command encodes the base name with
  `encodeURIComponent`, for example `1-%C3%A4.dcm` for `ä.dcm`.
- A failed new upload of a stored instance keeps the stored frames. A new upload of a stored
  instance deletes its stored Part 10 rendition with the rename of the instance `metadata`.
  It deletes the frames above the new frame count after the commit. Until the upload stores the new
  rendition, a Part 10 request gets a rendition that the server makes from the stored files.
- `openFrameStream` (create-dicomweb) no longer deletes the stored frame when it opens. A
  caller of `DicomWebWriter` that does not use `FileDicomWebWriter` must remove the other
  variant of a frame itself.
- A STOW-RS response now has the status `202` when some instances failed, and `409` when the
  server stored no instance. When the server cannot write to its storage, and stored no
  instance (a storage outage), the response is `503` with `Retry-After: 10`, and not `409`.
  Before this change, each response had `200`. A client that accepts only `200` now reports
  an error for these uploads. The `dicomweb-client` library of OHIF resolves `200`, `202`
  and `204`, and rejects `409` and `503`. Thus an OHIF upload that stored nothing now shows
  an error.

  A client that retries on `503` can send the upload again after a storage outage. The
  `stow` command of the CLI sends a group again after a `503`, up to 3 times. It counts the
  group as failed after a `409` or after the last `503`. After a `202`, it counts each file
  that the response does not list as stored as a failed file, and at least one file. It then
  exits with `1`.
  Before this change, it exited with `0`, also when each group failed.

  The error of each file has the status only, and the command prints the body of the
  response one time for each group.
- An upload stops at the first instance that the storage cannot write (SQR-D21). The
  response can come before the end of the body, and the server does not read the rest of
  the body. The response is `503` with `Retry-After: 10` when the server stored no
  instance, and `202` otherwise. A part whose data did not arrive in full fails with `A700`
  or `0110`. A later part gets no item, and the server does not store it. Before, the server
  read the whole body, and tried each instance.

  A client that reads the response only after it sent the whole body can get a connection
  reset after 5 s, and not the response. The result of the upload is then unknown, and the
  client can send all instances again. A request with a storage failure, a `C000` failure
  and no stored instance now gets `503`, and not `409`. After a `202`, the `stow` command
  counts a file as failed when the response does not list it as stored. With a body that is
  not DICOM JSON (for example XML), each file of the group fails. Before, such a body
  counted one failed file.
- The Failure Reason of a failed instance is `C000` only for data that the server cannot
  read. A storage error with no free space or resources gives `A700`, and each
  other failure that the server causes gives `0110` (for example `EIO`, a permanent storage
  error, an instance that the server stopped, or a drain timeout). Before, each failed
  instance had `C000`. A `TypeError`, a `RangeError` or a `ReferenceError` of the parse or of
  `validateInstance` gives `0110`. A failed item now has its SOP Class UID and SOP Instance
  UID when the parse read them.
- A STOW-RS body that ends without its closing boundary, after one or more complete parts,
  gets the report of each instance (`200`, `202` or `409`), with the cut part as failed with
  `C000`. Before, the request got `400`, also for stored instances. A body with no complete
  part still gets `400`, and so does a part header that the server cannot parse before the
  end of the body.
- The writer of `instanceFromStream` defers the moves by default. A caller that read the
  final files before `instanceFromStream` resolved must pass `deferFinalMove: false`.
- The `instance` and `create` commands exit with `1` when a file was not stored, also when
  an input path does not exist. A directory with a file that is not a DICOM instance (for
  example a `DICOMDIR` or a text file) now gives exit code `1`. The other files are still
  stored, and `create` still builds their series and studies. A path that the command
  cannot read (for example `EACCES`) is a file that was not stored. `dirScanner`
  (static-wado-util) now gives such a path to the new option `onError`, and throws without
  that option. Before, it skipped such a path as a path that does not exist. The bulk imports of
  `static-wado-creator` and `healthlake` pass `onError`: they report the path as failed, and
  continue with the next path.
- An upload deletes the stored series thumbnail and the stored thumbnail of each instance of
  the upload. With builds on demand, the next thumbnail request first builds the series files
  (or the study files for a series thumbnail) that the upload deleted, and then makes the
  thumbnail. It gets `200`, and not `404`. This request can take the time of a series build,
  and a full build queue or a storage outage gives it `503`. Without builds on demand
  (`createIndexOnDemand: false`), the thumbnail request gets `404` until the series files
  exist again.
- At start, the webserver removes the temporary files older than `tempMaxAgeHours` (default
  24). An upload of one instance that takes longer than that age can lose its temporary
  files when the server starts again during the upload. Set a larger value, or `0`, for such
  uploads. `removeOrphanTempFiles` (create-dicomweb) throws a `RangeError` for a `maxAgeMs`
  that is not above 0.
- A thumbnail request uses the `studyIndex` server param for its build, so with
  `studyIndex: false` a series thumbnail request does not add the study to
  `studies/index.json`.

## Deployment guidance

This section is not a requirement of the code.

- Each retry of a slow query adds a full copy of the work, until this fix is in place. Tell
  operators not to retry `GET /studies/<studyUID>/series` on a timeout, at the proxy or at
  the client. After the fix, a retry is cheap, but a retry still holds a connection.
- A client or a proxy that gets `503` must wait for the time in `Retry-After` before it sends
  the request again.
- A proxy in front of the server must wait for a STOW-RS response longer than the upload
  takes. It must also wait for the time of item 5 of SQR-I8 after the last part:
  - at least 6 minutes;
  - at least 11 minutes when work that `drainOpenStreams` does not stop keeps a write open.
    The wait ends at most 16 minutes after the last write that completed in the wait. In
    the usual case, the drain stops a write that does not progress after 60 s, and the
    request gets a report of each instance;
  - no limit while the writes of the request continue to complete. No proxy timeout covers
    this case.

  When the proxy stops first, the client gets the error of the proxy, with no
  `Retry-After`. An example is `504` from nginx, whose default `proxy_read_timeout` is 60 s.
  The client can then send the upload again while the server still works on the first
  upload.
- The server param `maxStalledStowListeners` (default 8) sets the limit of SQR-D20. The
  limit counts instances, so one upload with 8 or more instances can reach it. The default
  is for a storage that does not get uploads of high volume.
- The server params `maxRunningJobs` (default 2), `requestJobSlots` (default 1) and
  `maxQueuedJobs` (default 20) set the limits of SQR-D12 and SQR-D14.
- With the base design, run one node. Or route all requests for one study to one node, for
  example with a hash of the Study Instance UID in the load balancer. Otherwise use SQR-I7.
- Run a CLI build only while no upload to that study runs (SQR-D10). The recovery procedure
  after a storage failure is in the section "Safety of each deployment" of the specification.
- A plugin that sends `updateSeries` or `updateStudy` through `getStowMessaging()` must first
  call `deleteStaleSummaries` for the changed series. The handlers build only missing files.

## Open questions

- **Q1.** The response of the first round of SQR-D7 comes from memory when the round did not
  commit. Is it acceptable that this response is a little older than the data that the next
  round stores? SQR-U1 permits it, because the new data arrived during the build. During a
  long upload, each request for the series starts a full build that does not commit. Then
  the next rounds follow, with a delay that increases up to 30 s. The cost stays limited,
  because one key has only one running job (SQR-I2 rule 2), and the delay increases
  (SQR-D6). A build of a different series of the same study is not affected, because each
  series has its own generation (SQR-I3). The study level can commit between two instances
  of the upload; the next instance then deletes the study files again (SQR-D5).
- **Q2 (closed).** The proposal deleted `studies/index.json` on each upload, and the rebuild
  of the full list did many rounds with no commit during a long upload. Decision: the studies
  list is a best-effort helper for a local single system (SQR-U4, SQR-D17). The upload does
  not delete it, and a committed study build adds a missing study to it. Some deployments do
  not update the studies list on upload at all (`studyIndex: false`).
- **Q5.** A study whose series all have only corrupt data has no study files, so each query
  for that study starts a study job. The job reads no instance data, because each series
  build is skipped (SQR-D3), but it checks each instance metadata path. Under a full queue,
  such a query can get `503`. Is that acceptable?
- **Q6.** The generation tracker keeps one entry for each series and each study that an
  upload changed, and the record of SQR-D3 keeps one entry for each series with no readable
  data, until the process stops. Each entry is small. Does a long-running server need a
  limit?
- **Q3.** The builds use the paths of `FileDicomWebReader`, which do not use the
  `hashStudyUidPath` layout. This limit was in the code before this change. Does a deployment
  with `hashStudyUidPath` need the builds on demand?
- **Q4 (closed).** `studyMetadataQueryController` (`GET /studies/<studyUID>/metadata`) called
  `seriesMain` directly, outside the job manager. It now uses the job manager (SQR-I1).

## Tests

Each test is in one of two categories. The comment of each test in the code gives its number
and its category.

The user experience must have this:

1. Delete `series/index.json.gz` of a test study, and send a series query. The response has
   status 200 and lists all series. The file exists after the query (SQR-U1, SQR-D2, SQR-D3).
6. Start a study build. After its scan of the series, store a new series. The request that
   waited gets the result without the new series. The build does not commit that result. The
   next round commits the index with the new series (SQR-U1, SQR-D6, SQR-D7).
9. Fill the queue to `maxQueued`. A new series query that needs a build gets `503` with a
   `Retry-After` header. A series query for a study whose files exist gets `200` (SQR-U3,
   SQR-D11, SQR-D14).
10. Upload a new study. The study build adds its entry to the existing `studies/index.json`.
    A second upload to the same study does not rewrite the file (SQR-U4, SQR-D17).
17. Build a series while the read of one instance metadata fails with `ESTALE`, and again
    while the existence check of that file fails with `EACCES`. The build fails with a
    `StorageUnavailableError`, and stores no file. After the storage recovers, the next call
    builds the series, with no upload between the two calls (SQR-U3, SQR-D3).
18. Send a series query while the read, and then the existence check, of one series
    singleton fails. The response is `503` with a `Retry-After` header, and no
    `series/index.json` that leaves out that series is stored (SQR-U3, SQR-D3).
19. Send a studies query, and then a study metadata query, while a directory listing fails
    with `EACCES`. The response is `503`. For the studies query, no empty
    `studies/index.json` is stored (SQR-U3, SQR-U4).
20. Send a study metadata query for a study that has a series with corrupt data. The
    response is `200`, and holds the instances of the other series (SQR-U1).
22. Build the studies list while an upload changes a study, so that the round of that study
    does not commit. Before the next round, the list does not hold the study. After the next
    round, the list holds the study (SQR-U4, SQR-D17).
26. Send a study metadata query while an upload deletes the `metadata` of a series during
    the request. The response holds at least the instances of that series that were stored
    before the request (SQR-U1).
21. A series round reads its data, and an upload then changes the series, so the round does
    not commit. A study build that starts after the upload does not join that round. It waits
    for the round, builds the series again, and its response and its commit have the new
    instance count (SQR-U1, SQR-D7).
30. Send a studies query while the series singleton of one study fails with `ESTALE`, and
    again with `ELOOP`. The response is `200` without that study. After `ESTALE`, the list
    is not stored, and the next request lists the study. After `ELOOP`, the list is stored
    without the study (SQR-U4, SQR-D17).
31. Send a series query, and delete `series/index.json` after the check of the request and
    before the send: before the stat, and between the stat and the open. The response is
    `200` with all series, and has no `Content-Encoding` header (SQR-U1, SQR-D1).
33. Store an instance, and then upload it again with a `validateInstance` that rejects it.
    The stored files of the instance do not change. A later upload that commits deletes the
    other variant of a frame (SQR-U5, SQR-D18).
34. Upload a new instance while the write of its `metadata`, and then of one frame, fails
    with `ENOSPC`. The upload of the instance fails, and stores no file (SQR-U5, SQR-D18).
35. Store a SEG, and then upload it again while the open of its Part 10 rendition fails. The
    upload stores the instance, and deletes the old rendition (SQR-D18).
36. Upload an instance again while the delete of the series `metadata` (older layout) fails
    with `EIO`. The response reports the instance as stored, and the study files are deleted
    (SQR-U5, SQR-D18).
37. A STOW-RS listener completes 5.5 minutes after the last part. The request goes to the
    report of each instance. A listener that does not complete gives `503` with
    `Retry-After: 300`. No case gives `400` (SQR-U5).
38. Upload one instance while its `metadata` cannot open. With `ENOSPC` the response is `503`
    with `Retry-After` and Failure Reason `A700`, with `EIO` it is `503` with `0110`, and with
    `EISDIR` (a permanent error) it is `409` with `0110`. The failed item has the SOP Instance
    UID. Then upload a valid instance and a part that is not DICOM. The response is `202`, with
    one stored instance and Failure Reason `C000` (SQR-U3, SQR-U5).
39. Store an instance with `instanceFromFile` (the CLI path) while the write of a frame fails.
    The call fails, and stores no file (SQR-U5, SQR-D18).
41. Store an instance again after its instance thumbnail and the series thumbnail exist. Both
    thumbnails are deleted (SQR-D5).
45. Send one complete part and a part that the end of the body cuts, with no closing
    boundary. The response is `202`: the first instance is stored, and the cut part fails with
    `C000` (SQR-U5).
46. Store a CLI input path that does not exist. `storeInstanceFiles` gives it as a file that
    was not stored, so the command exits with `1` (SQR-U5).
47. Store an instance, build its series, and store the instance again. A request for the
    instance thumbnail then builds the series files, and makes the thumbnail, and does not get
    `404` (SQR-U5, SQR-D5).
49. Send a complete part, then a part whose first header line is folded, and then more parts
    before the end of the body. The response is `400`, and not a report that leaves out the
    later parts (SQR-U5).
53. Store a SEG with 4 frames, and then upload a CT with the same SOP Instance UID and 1
    frame. The old Part 10 rendition and the frames 2 to 4 are deleted (SQR-U5, SQR-D18).
55. The `stow` command sends a group again after two `503` responses, and stores it. After
    the last `503` retry, or after a `409`, the group counts as failed, so the command exits
    with `1`. After a `202` with one failed item, that file counts as failed, and the other
    file as stored (SQR-U5). After a connection reset, the command sends the group again
    and stores it. After the last reset retry, the group counts as failed. A reset does not
    stop the command (no `process.exit`).
59. A bulk import of `static-wado-creator` (`StaticWado.processFiles`) reports a path whose
    stat fails with `EACCES` as failed, and imports the next path (SQR-U5).
60. The stalled count is full. A real HTTP client sends a body of 20 MB with the client code
    of `stowFiles`. The client gets `503` with `Retry-After: 60`, and not `ECONNRESET`
    (SQR-U5, SQR-D20).
61. `stowFiles` sends a body of 8 MB to a server that answers `503` before it reads the body.
    The file of the body closes within 2 s, and not at the close of the connection after
    `keepAliveTimeout` (SQR-U5, SQR-D20).
62. The `stow` command sends each file alone, and cannot open one file (`EACCES`). That file
    counts as failed, the server stores the other file, and the command does not stop
    (SQR-U5).
63. Send one complete part and the first half of a second part, and hold the rest of the
    body. The `metadata` open of the first instance fails with `EIO`. The response comes
    before the end of the body: `503` with `Retry-After: 10`, and two failed items with
    `0110`. The third part gets no item, and no file opens after the response (SQR-U5,
    SQR-D21).
64. Send two complete parts and the first half of a third part. The first instance is
    stored, and the `metadata` open of the second instance fails with `EIO`. The response
    comes before the end of the body: `202`, with the first instance as stored, and the
    second and the third instances as failed with `0110`. No file opens after the response
    (SQR-U5, SQR-D21).
65. Removed: repeated test 63.
66. The `stow` command gets a `202` that names one file as stored and one file as failed, and
    has no item for a third file. The third file also counts as failed (SQR-U5).
67. The `stow` command sends 4 files with the same base name from 4 directories in one
    group. It gets a `202` that lists the first file as stored, the second file as failed,
    and has no item for the other files. The command counts 1 stored file and 3 failed
    files, and names the 3 failed files. A `202` with no `Content-Location` in its items
    gives the same counts, and names no file for the 2 files with no item. Files with the
    base name `ä.dcm` give the same counts and names (SQR-U5).
68. Send a part that is not DICOM, and then a DICOM part. The response is `202`: the first
    part fails with `C000`, and the server stores the second instance. A `C000` failure does
    not stop the upload (SQR-U5, SQR-D21).

The API must do this:

2. Send the series query of test 1 a second time. `seriesSummary` and `studySummary` read and
   write no file (SQR-D1, SQR-D11).
3. Send two series queries for a study that has no series index, and hold the build until the
   second query joins it. `studyMain` runs one time (SQR-D7).
4. Keep the study `index.json`, delete `series/index.json.gz`, and send a study query with
   `StudyInstanceUID`. The series index exists after the query (SQR-D4).
5. Store one new instance in a series of a test study. The upload deletes the series files
   and the study files, and keeps `studies/index.json`. A series query then builds only the
   changed series, and the index shows the new instance count. No file of the other series is
   opened for a write (SQR-D4, SQR-D5).
7. Run `studyMain` with `force` (the `createdicomweb study --force` command) on a study whose
   files exist. The study files are written again, and no series is built again (SQR-D10).
8. Set `maxRunning` to 1. Start a job that needs three levels of nested jobs, and queue a
   top-level job for one of the nested keys. The first job completes. The queued job then
   starts, finds its file, and does no build (SQR-D13).
11. Keep `series/index.json`, delete only the study `index.json`, and send a study query. The
    response has status 200, and the file exists after the query (SQR-D2, SQR-D3).
12. A job fails. Its caller and a call that waited get the same error, and the next call for
    the key builds again (SQR-D7, SQR-D13).
13. An upload stores an instance, and then does not reach `completePostController`. The
    derived files of the series and the study are deleted, and the generations of the series
    and of the study changed (SQR-D5).
14. A build of series A reads its data, and an upload then stores an instance in series B of
    the same study. The build of A commits. A study build that started before the upload
    does not commit (SQR-D6).
15. Send a series query for a study that does not exist. The response has status 404, the
    job manager starts no job, and the server creates no directory (SQR-D11, SQR-D12).
16. Build a series whose instance metadata is corrupt. A second call reads no data.
    After an upload into the series, the next call builds the series (SQR-D3).
23. A series with no instances starts no build, and a build stores no series `metadata` for
    it (SQR-D3, SQR-D11).
24. Call `seriesSummary` for a series whose files are current. The call reads no instance
    metadata, and opens no file for a write (SQR-D4, the early return of SQR-I5 for C2).
25. Three requests for one key each get a round that does not commit. The job manager keeps
    one delayed round, and the key has four rounds in total (SQR-D6).
27. Corrupt the `series-singleton.json` of a valid series, and send a series query. The
    response and the stored `series/index.json` list all series (SQR-U1, SQR-D3).
28. A call with a `version` joins a running round of the same version. A call that arrives
    after the version changed waits for that round, and gets the result of a new round, for
    `run` and for `child` (SQR-D7).
29. With background jobs in the queue, a request job uses a request slot, a queued request
    job starts before the background jobs, a request moves a queued background job of its
    key to the request queue, and a request above `maxQueued` gets `QueueFullError`
    (SQR-D12, SQR-D14).
32. An upload deletes the files of a series after `studyMain` checked them. The study round
    does not commit, and its result has that series with the new instance (SQR-U1, SQR-D6).
43. With `maxRunning: 1` and constant request load, a queued background job starts after
    `backgroundEvery` request jobs (SQR-D12).
40. `storeInstanceFiles` of a directory with a valid file and a file that is not DICOM gives
    one study and the failed file. The CLI uses the failed files for its exit code (SQR-U5).
42. `removeOrphanTempFiles` removes only the temp files of the writer that are older than the
    limit. It keeps a recent temp file, a file with another name, and the stored files
    (SQR-D19). An age that is not above 0 throws a `RangeError`.
44. `stowFailureReason` gives `0110`, and not `C000`, for a stopped instance (`ABORTED`), a
    drain timeout and a Node.js stream error (SQR-U5).
48. A frame closes after the instance `metadata`. The commit still renames the `metadata`
    last (SQR-D18, note 2 of "Safety of each deployment").
50. A listener stays unsettled after the wait of its request. A new upload then gets `503`
    with `Retry-After` and no `Connection: close` at once, and its body is not read. After the
    listener settles, the count is 0 (SQR-D20).
51. With `studyIndex: false`, a series thumbnail request builds the study files, and does
    not add the study to `studies/index.json` (SQR-D17).
52. A `validateInstance` rejection gives `C000`. A `TypeError` or a `RangeError` of
    `validateInstance` gives no `failureReason`, so the response gives `0110` (SQR-U5).
54. `dirScanner` gives a path whose stat fails with `EACCES` to `onError`, and scans the next
    path. Without `onError`, the error throws (SQR-U5).
56. A request aborts while its listener stays unsettled. The request gets `400`, the count
    of SQR-I10 holds the listener, and a new upload gets `503`. After the listener settles,
    the count is 0 (SQR-D20).
57. The write of a frame fails, and its destroyed file stream does not close. The failed
    instance gives `onStuckWrites` a promise that does not settle until the stream closes
    (SQR-D20).
58. A part above `limits.parts` counts as complete. The request goes to `next()` with the
    parts below the limit, and does not wait forever.

Tests 2 and 3 also cover SQR-U2 and SQR-U3, because the cost of a request does not increase
with repeated or concurrent requests. A test of memory use or of response time is not
reliable in a unit test, so there is no such test. Tests 7 and 24 cover the early returns of
`studySummary` and `seriesSummary`. There are no tests for each branch of the early returns.

The numbered tests are in these files:

- `packages/static-wado-webserver/test/unit/buildJobManager.jest.mjs`: 8, 12, 25, 28, 29, 43.
- `packages/static-wado-webserver/test/unit/stowAbort.jest.mjs`: 13.
- `packages/static-wado-webserver/test/unit/stowCommit.jest.mjs`: 36, 38, 41, 44, 45, 47, 51,
  63, 64.
- `packages/static-wado-webserver/test/unit/multipartStream.jest.mjs`: 37, 49, 50, 56, 58, 60,
  65.
- `packages/create-dicomweb/test/writeWithRetryCleanup.jest.mjs`: 33, 34, 39, 40, 42, 46, 48,
  52, 57.
- `packages/static-wado-creator/test/unit/processFiles.jest.js`: 59.
- `packages/create-dicomweb/test/rawPart10.jest.mjs`: 35, 53.
- `packages/create-dicomweb/test/stowMain.jest.mjs`: 55, 61, 62, 66.
- `packages/static-wado-util/test/unit/dirScanner.jest.mjs`: 54.
- `packages/static-wado-webserver/test/unit/derivedDataBuild.jest.mjs`: the other numbered
  tests.

These tests have no number, and check one function each (the API must do this):

- `packages/create-dicomweb/test/readJsonFileDelete.jest.mjs` (SQR-D3, SQR-D9): the reader
  deletes a file that fails the gunzip step, and keeps a file that has an `ESTALE` error. A
  failed existence check with `ENOENT` or `ENOTDIR` gives "missing" in both modes, and one
  with `EACCES` throws only from `createBuildReader`. The reader of a build throws for a read
  error with no code. A corrupt file whose deletion fails is left out, and throws only with
  `throwIfNotDeleted`. The reader reads the older layout `metadata.gz/index.json.gz`, and no
  such layout for another name.
- `packages/create-dicomweb/test/writeWithRetryCleanup.jest.mjs` (SQR-D2, SQR-D3): a failed
  data step, a failed open of a stream, a failed write of one file, or a failed rename of a
  commit, leaves no temporary file and no part of a commit, and keeps each old file that did
  not get its new version, also when the data step fails at once and when the check waits
  100 ms for a late temporary file. `writeWithRetry` (the studies list) throws on a failed
  write. An I/O error there gives a `StorageUnavailableError`.

This test has no number, and the user experience must have it:

- `packages/static-wado-webserver/test/unit/multipartStream.jest.mjs`: the STOW parser gives
  the exact bytes of a part that arrives in small chunks.

## Repair of a study that is already broken

After the fix, a missing `series/index.json.gz` is repaired by the next series query. Before
the fix is in a release, run the `study` command of the CLI one time for each affected study.
Use a time with a low load:

```
createdicomweb study <studyUID> --dicomdir <DICOMweb root>
```

The command runs `studyMain`, which writes `series/index.json.gz`. If the server stopped during
an upload of the study, compare the instance count with the source, and upload the missing
instances again.

## Delivery

SQR-I1 to SQR-I6 are in one pull request, because all of the items fix one report. SQR-I7
is a later change. The first commits of the pull request hold one item each, in this order,
so that a reviewer can read the items one at a time. The later commits hold the changes
after review:

1. SQR-I6, the reader change. It does not depend on the other items.
2. SQR-I3, the generation tracker and the change to `deleteStaleSummaries`.
3. SQR-I4, the check of the generation before each move.
4. SQR-I2, the job manager.
5. SQR-I1, the shared functions and the controller changes. This commit also changes the
   upload message handlers to use the jobs of SQR-I2.
6. SQR-I5, the early return and the `--force` option.

The seventh commit adds this document and the specification. The later commits hold the
changes after each review.
