# Implementation: stop repeated rebuilds of a missing study-level series index

Status: SQR-I1 to SQR-I6 implemented. SQR-I7 is a plan for a later change. Applies to
create-dicomweb and static-wado-webserver 1.7.6 to 1.7.10.

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

The study job reads the generation of the study first. Then it calls `ensureSeriesLevel` as a
nested job for each series, so it builds only the series that have a missing file. Then it
calls `studyMain(studyUID, { dicomdir, generation })`. That call writes `series/index.json`
and `index.json`.

The studies list is a best-effort helper (SQR-D17), outside the generation protocol:

- After a study job commits, it calls `addStudyToStudiesIndex(root, studyUID)`, unless
  `options.studyIndex` is false. The controllers and the upload handlers pass
  `params.studyIndex`. The function calls
  `indexSummary(root, [studyUID], { onlyMissing: true })`. That call reads
  `studies/index.json`, and writes nothing when the file lists the study or when the file is
  missing. Otherwise it adds the entry of the study.
- When `studies/index.json` is missing, the studies job calls `ensureStudyLevel` as a nested
  job for each study, and then builds the full list with `indexSummary(root, [])`.
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
- `whenIdle()` resolves when no job runs and the queue is empty. `stats()` gives the counts.

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
   the result of that round. When that job fails, the call returns `undefined`, and does not
   get the error. A call never takes over the job of a different caller. A top-level call for
   a key that is in the queue joins that queued job.
4. **Start the next round (SQR-D6).** When `fn()` returns `{ committed: false }`, the job
   manager resolves the callers of the first round, and then calls
   `run(key, needsBuild, fn, { background: true })`. The job manager logs a warning after each
   10 rounds of one key, and continues.
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
8. **Reject new work (SQR-D14).** When the queue holds `maxQueued` jobs, `run` rejects a new
   request job with a `QueueFullError`. The error has `retryAfterSeconds` (default 10). The
   controller answers `503` with a `Retry-After` header. A call with `background: true` enters
   the queue and is not rejected.

A job that a client abandons still completes, and the next request then finds the file.

These rules prevent a deadlock. A running job waits only for jobs at lower levels, so the waits
cannot form a loop. A nested job never waits for a slot, and a queued job holds nothing. Thus
each running job completes.

The caller of the first round needs the result of that round, also when the round did not
commit (SQR-D7). Thus `seriesSummary`, `studySummary` and `indexSummary` return
`{ committed, payload }`, and the controller sends the payload when the file does not exist.

The webserver has one shared instance, `getBuildJobManager(params)` in
`packages/static-wado-webserver/lib/util/buildJobManager.mjs`. It reads the server params
`maxRunningJobs` (default 2) and `maxQueuedJobs` (default 20), in the same way as
`createIndexOnDemand`. `params.jobManager` replaces the instance in the tests.

The CLI does not use the job manager. The CLI runs one build in its own process, and no upload
runs in that process, so the generation does not change during a CLI build.

### SQR-I3. Add a generation tracker, and change the order in `deleteStaleSummaries`

Applies SQR-D2, SQR-D5 and SQR-D8 to the upload path. `create-dicomweb` has a generation
tracker (`packages/create-dicomweb/lib/instance/generationTracker.mjs`):

- `current(studyUID)` returns the current generation of the study.
- `advance(studyUID)` changes the generation.

The studies list has no generation (SQR-D17). The base design uses an in-memory tracker: a
`Map<studyUID, number>`. Both operations are synchronous. The module exports one shared instance,
`generationTracker`. The upload path and the builds use that instance.

`deleteStaleSummaries` calls `advance()` for each study, and then deletes the files. It uses
synchronous calls only, with no `await` between the `advance()` calls and the deletions
(SQR-D8). It deletes all series files of the levels table (`metadata`,
`series-singleton.json` and `instances/index.json`) and the study files. Before this change,
the function did not delete `instances/index.json`. It does not delete `studies/index.json`
(SQR-D17).

`deleteStaleSummaries` already runs after the STOW request stores all of its instances
(`streamPostController.mjs`, in `completePostController`), so the order of SQR-D5 is already
correct.

Before this change, the `updateStudy` handler merged the study into `studies/index.json` on
each upload, also when the file listed the study. Now the study job adds the study only when
the file does not list it (SQR-I1).

### SQR-I4. Check the generation before the move of each file

Applies SQR-D3, SQR-D6 and SQR-D8 to `writeMultipleWithRetry` and `FileDicomWebWriter`.
`writeWithRetry` (the studies list) does not change (SQR-D17).

1. `writeMultipleWithRetry` gets a new option `generation`: the tracker, the study UID, and
   the generation `value` that the build read when it started. `seriesSummary` and
   `studySummary` read the generation as their first step,
   before they read or scan any data, or get the value from the caller (for example the study
   job of SQR-I1). Without a value, the write function reads `current()` before it calls
   `generatePayload()`.
2. `FileDicomWebWriter` gets a new option `canCommit()`. `_moveTempToFinal` calls `canCommit()`
   after the `await filesAreIdentical(...)` step. The code from that call to `fs.renameSync`
   is synchronous, so no upload can run between them (SQR-D8). When `canCommit()` returns
   `false`, `_moveTempToFinal` deletes the temporary file, and sets `writeStatus` to
   `'generation-changed'`.
3. After all moves, the write function reads `current()` again. If the value changed, it
   deletes each file that it moved. On one node, this step finds no change, because of
   step 2. The step is necessary for the multi-node extension.
4. The write function returns `{ committed: false, payload }` when a file has the status
   `'generation-changed'`, or when step 3 found a change. The current retry loop for
   `'updated-stale'` stays.

### SQR-I5. Restore the early return in `seriesSummary`, and add a `force` option

Applies SQR-D4 and SQR-D10 to `seriesSummary`, `studySummary` and the CLI. The `return` in
`seriesSummary` is restored. It returns early only when all of these conditions are true:

- The instance UIDs in the series `metadata` are the same as the instance directories.
- `series-singleton.json` and `instances/index.json` exist.

The upload path is not affected. `deleteStaleSummaries` deletes the series `metadata` before
`updateSeries` runs, so the UID sets do not match after an upload.

`seriesMain`, `seriesSummary`, `studyMain` and `studySummary` have a `force` option. The
`--force` flag of the `series` command and of the `study` command sets it. The option skips
the early return of its own level only.

`studyMain` first builds each series that has a missing file (`seriesFilesExist`), without
`force`, and uses the stored files of the other series. Thus the `study` command with
`--force` does not build a series whose files exist again.

### SQR-I6. Delete a file only after a parse error

Applies SQR-D9 to the reader. In `FileDicomWebReader.readJsonFile`, the reader deletes the
file only when the gunzip step or `JSON.parse` fails (`isCorruptFileError`). The reader does
not delete the file after an I/O error such as `ESTALE`, `EIO` or `ENOENT`. It logs the I/O
error and returns `undefined`. This change removes the second path of C5.

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
- **SQR-I5.** `studyMain` builds only the series that have a missing file. It does not call
  `seriesSummary` for each series.
- **SQR-I6.** The reader no longer removes an old-format metadata directory after a read
  error. The writer still removes such a directory when it commits the new file.

## Deployment guidance

This section is not a requirement of the code.

- Each retry of a slow query adds a full copy of the work, until this fix is in place. Tell
  operators not to retry `GET /studies/<studyUID>/series` on a timeout, at the proxy or at
  the client. After the fix, a retry is cheap, but a retry still holds a connection.
- A client or a proxy that gets `503` must wait for the time in `Retry-After` before it sends
  the request again.
- The server params `maxRunningJobs` (default 2) and `maxQueuedJobs` (default 20) set the
  limits of SQR-D12 and SQR-D14.
- With the base design, run one node. Or route all requests for one study to one node, for
  example with a hash of the Study Instance UID in the load balancer. Otherwise use SQR-I7.
- Run a CLI build only when the server stores no data for that study (SQR-D10).
- A plugin that sends `updateSeries` or `updateStudy` through `getStowMessaging()` must first
  call `deleteStaleSummaries` for the changed series. The handlers build only missing files.

## Open questions

- **Q1.** The response of the first round of SQR-D7 comes from memory when the round did not
  commit. Is it acceptable that this response is a little older than the data that the next
  round stores? SQR-U1 permits it, because the new data arrived during the build.
- **Q2 (closed).** The proposal deleted `studies/index.json` on each upload, and the rebuild
  of the full list did many rounds with no commit during a long upload. Decision: the studies
  list is a best-effort helper for a local single system (SQR-U4, SQR-D17). The upload does
  not delete it, and a committed study build adds a missing study to it. Some deployments do
  not update the studies list on upload at all (`studyIndex: false`).
- **Q3.** The builds use the paths of `FileDicomWebReader`, which do not use the
  `hashStudyUidPath` layout. This limit was in the code before this change. Does a deployment
  with `hashStudyUidPath` need the builds on demand?
- **Q4.** `studyMetadataQueryController` (`GET /studies/<studyUID>/metadata`) still calls
  `seriesMain` directly for a missing series metadata, outside the job manager. Must it use
  `ensureSeriesLevel`?

## Tests

The tests are in two categories.

The API must do this:

1. Delete `series/index.json.gz` of a test study, and send a series query. The response has
   status 200 and lists all series. The file exists after the query (SQR-D2, SQR-D3).
2. Send the series query a second time. `seriesSummary` and `studySummary` read and write no
   file (SQR-D1, SQR-D11).
3. Send two concurrent series queries for a study that has no series index. `studyMain` runs
   one time (SQR-D7).
4. Keep the study `index.json`, delete `series/index.json.gz`, and send a study query with
   `StudyInstanceUID`. The series index exists after the query (SQR-D4).
5. Store one new instance in a series of a test study. The upload deletes the series files
   and the study files, and keeps `studies/index.json`. A series query then builds only the changed
   series, and the index shows the new instance count (SQR-D4, SQR-D5).
6. Start a study build. After its scan of the series, store a new series. The request that
   waited gets the result without the new series. The build does not commit that result. The
   next round commits the index with the new series (SQR-D6, SQR-D7, SQR-D8).
7. Run `studyMain` with `force` (the `createdicomweb study --force` command) on a study whose
   files exist. The study files are written again, and no series is built again (SQR-D10).
8. Set `maxRunning` to 1. Start a job that needs three levels of nested jobs, and queue a
   top-level job for one of the nested keys. The first job completes. The queued job then
   starts, finds its file, and does no build (SQR-D13).
9. Fill the queue to `maxQueued`. A new series query that needs a build gets `503` with a
   `Retry-After` header. A series query for a study whose files exist gets `200` (SQR-D11,
   SQR-D14).
10. Upload a new study. The study build adds its entry to the existing `studies/index.json`.
    A second upload to the same study does not rewrite the file (SQR-D17).

The user experience must have this: test 1 checks SQR-U1, the correct result with status 200.
Test 6 checks the data rule of SQR-U1 for data that arrives during a build. Test 9 checks the
`503` response of SQR-U3. Tests 2 and 3 cover SQR-U2 and SQR-U3, because the cost of a request
does not increase with repeated or concurrent requests. A test of memory use or of response
time is not reliable in a unit test, so there is no such test.

Test 10 checks SQR-U4, the user experience of the studies list.

Test 8 is in `packages/static-wado-webserver/test/unit/buildJobManager.jest.mjs`. The other
tests are in `packages/static-wado-webserver/test/unit/derivedDataBuild.jest.mjs`. One more
test, in `packages/create-dicomweb/test/readJsonFileDelete.jest.mjs`, checks SQR-D9: the reader
deletes a file that fails the gunzip step, and keeps a file that has an `ESTALE` error. There
are no tests for each branch of the early returns. Tests 2 and 7 cover the early returns.

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
is a later change. The pull request has one commit for each item, in this order, so that a
reviewer can read the items one at a time:

1. SQR-I6, the reader change. It does not depend on the other items.
2. SQR-I3, the generation tracker and the change to `deleteStaleSummaries`.
3. SQR-I4, the check of the generation before each move.
4. SQR-I2, the job manager.
5. SQR-I1, the shared functions and the controller changes. This commit also changes the
   upload message handlers to use the jobs of SQR-I2.
6. SQR-I5, the early return and the `--force` option.

A last commit adds this document and the specification.
