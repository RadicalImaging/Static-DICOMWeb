# Specification: updates of derived data

Status: base design implemented in create-dicomweb and static-wado-webserver after 1.7.10.
The multi-node extension is not implemented.

## Scope

This specification states how the webserver keeps its derived files correct and available
when new data arrives, when a file is missing, and when the process stops. The derived files
are the files that the server makes from the stored DICOM instances, for example
`studies/<studyUID>/series/index.json.gz`, the study-level series index.

The specification has two requirement sections. Each section has its own prefix and its own
change rule:

- `§ User requirements` (prefix `SQR-U`) state what a client of the webserver must get.
  Change a user requirement only when it describes the behaviour wrongly, or when the
  intended user-facing behaviour changes.
- `§ Design requirements` (prefix `SQR-D`) state how the server keeps its derived files:
  which files it stores, when it updates them, and in which order. Each design requirement
  names the user requirements that it supports. Change a design requirement only when the
  change still satisfies all user requirements, and record the reason.

The implementation requirements (prefix `SQR-I`) are not in this document. They are in
[`docs/implementation/series-index-rebuild.md`](../implementation/series-index-rebuild.md).
An implementation that is inconvenient is never a reason to change a user requirement.

## Problem summary

A deployment that runs create-dicomweb 1.7.7 lost the study-level series index of a large CT
study. After that, each `GET /studies/<studyUID>/series` request had these results:

1. The request took minutes, and each client timed out.
2. The webserver then answered `404 Not found`, because the rebuild did not write the index.
3. The clients and the proxies retried. The webserver continued each abandoned rebuild, so the
   rebuilds accumulated. One client request started several concurrent rebuilds of the same study.
4. The memory of the webserver increased until the container stopped with `OutOfMemoryError`.
   All uploads and all image requests on that server failed until a new container started.

A smaller study on the same server returned its series in less than 1 s. The causes in the
code are in the implementation document.

The `404` of the series query was a defect. This specification corrects the defect, and it
does not change the user contract (SQR-U1).

## § User requirements

- **SQR-U1. Correct result.** A valid query or retrieve for data that the server stores
  returns that data, at every level: studies, series, instances and metadata. The server does
  not return an error for such a request.
  Data that a client stores during a request, or very shortly before it, can be missing from
  the response to that request. That data is in the later responses.
  Stored data that the server cannot read because it is corrupt or incomplete (SQR-D9) is
  missing from the responses. A series in which no instance is readable can give `404` for
  its own series, instances and metadata requests, and the study responses leave it out.
  After new data for that series is stored, the series is back in the responses with its
  readable instances. An instance whose stored metadata is corrupt stays missing until a
  client stores that instance again.
- **SQR-U2. Acceptable performance.** A query or a retrieve returns in a time that a client can
  accept, for each study size that the server stores. The time does not increase each time
  that a client sends the same request again.
- **SQR-U3. Server stability.** A retrieve, a query, or a storage of new data does not stop
  the webserver, when the request fails or when the request is slow. Other requests continue
  to work. When the server has too much update work in its queue, the server answers a new
  request that needs an update with `503 Service Unavailable` and a `Retry-After` header. A
  request that needs no update does not get this response. The client can send the request
  again later.
  A storage outage is outside SQR-U1. When the server cannot read, list or write stored data
  because of an I/O error, a query or a metadata request whose summary file is missing, and a
  study metadata request, get `503 Service Unavailable` with a `Retry-After` header. A
  request for a stored file that the server sends as it is (for example a summary file that
  exists, a frame or a bulk data item) gets the error of the file server. After the storage
  recovers, the next request gets the correct result, with no upload and no restart.
- **The exceptions to SQR-U1.** SQR-U1 has only these exceptions:
  - corrupt or incomplete stored data (SQR-U1);
  - a full queue (SQR-U3);
  - a storage outage (SQR-U3);
  - the studies list of SQR-U4;
  - a deployment that turns off the builds on demand (`createIndexOnDemand: false`): a
    query or a metadata request whose summary file is missing then gives `404`;
  - a deployment that uses `hashStudyUidPath`: the server does not build a missing summary
    file there, so such a request gives `404`;
  - the limits of the section "Safety of each deployment" of the design requirements.
- **SQR-U4. The studies list is a best-effort helper.** The studies list
  (`GET /studies` without `StudyInstanceUID`) is a helper for the local files of a single
  system. It lists the stored studies. A new study is in the list after the server builds
  the summary of that study, when the deployment updates the list on upload. A study with
  only corrupt data is not in the list. The summary values of an entry, for example the
  counts of series and instances, can be older than the study. A query with
  `StudyInstanceUID` gives the current values of the study (SQR-U1). This is the exception to
  SQR-U1 for the studies list. A deployment can turn off the update of the studies list on
  upload (SQR-D17), so the helper is optional.

## § Design requirements

### Levels and generations

The server keeps derived files at four levels. Each level is made from the level directly
below it:

| Level | Files | Made from |
| --- | --- | --- |
| Instance | the instance `metadata` | the stored DICOM instance |
| Series | the series `metadata`, `series-singleton.json`, `instances/index.json` | the instance level of that series |
| Study | `series/index.json`, the study `index.json` | the series level of that study |
| Studies | `studies/index.json` (best effort, SQR-D17) | the study level of each study |

Each file at the series, study and studies levels serves at least one response path. For
example, `series/index.json` serves `GET /studies/<studyUID>/series`, and the series
`metadata` serves the series metadata and a part of the study metadata.

The design uses one **generation** for each series and one for each study. A generation is a
value that changes each time that new data for the series or the study is stored. The series
files use the generation of their series, and the study files use the generation of their
study. Thus an upload into one series does not stop the build of a different series of the
same study. The studies list has no generation: it is a best-effort
helper, and SQR-D17 states its rule. SQR-D1 to SQR-D16 apply to the series level and the
study level.

The design has two parts:

- The **base design** works without a message service and without shared state between
  systems. It is safe on a single node, also when the process stops. It is also safe on
  several nodes when all uploads and all builds of one study run on one node.
- The **multi-node extension** moves the generations to shared storage. It is safe on several
  nodes with any routing. A check at serve time makes it safe also when a node stops.

### Base design requirements

- **SQR-D1. Serve the stored version.** A response comes from the stored file of its level.
  When the file exists, the server does no other check. Supports SQR-U1 and SQR-U2.
- **SQR-D2. A missing file is always safe.** A missing derived file means "build this file".
  The server builds a missing file on the request path that needs it. Thus a lost update
  message or a stopped process leaves a missing file, and not a wrong file, except in the
  cases of notes 1 and 2 of "Safety of each deployment". Two exceptions to "build this
  file": a series with no instances has no series files, and a series with no readable data
  (rule 3 of SQR-D3) is not built again until its generation changes. Supports SQR-U1 and
  SQR-U3.
- **SQR-D3. Store each build.** A build that commits stores each file of its level for which
  it has data. The rules below give the cases with no data. The terms of this requirement:
  - A **missing path** is a path that does not exist (`ENOENT`, `ENOTDIR`). An upload can
    delete a derived file during a build, so a missing path is not an error.
  - A **corrupt file** is a file whose gunzip step or JSON parse fails (SQR-D9).
  - An **I/O error** is each other file system error with an error code of the operating
    system, for example `ESTALE`, `EIO`, `EACCES` or `ENOSPC`. An error with no such code
    (for example a program error) is not an I/O error, because a retry does not change it.

  The rules:
  1. When a read, an existence check or a directory listing of the stored data, or a write
     or a move of a derived file, fails with an I/O error, the build fails with that error
     and records nothing, also when other reads are corrupt or succeed. The callers that wait
     get the error (SQR-D7), and a request gets the `503` response of SQR-U3. A later request
     builds the level again. The checks that the writer does on its own temporary files are
     not in this rule.
  2. A series with no instance directories needs no build, and stores no series files.
  3. A series build that finds instance directories, but no readable instance metadata
     (corrupt files or missing paths) and no entry for those instances in the current series
     `metadata`, stores no `series-singleton.json` and no `instances/index.json`, and keeps
     the current series `metadata`. The server records that result with the generation of
     the series, and does not build the series again until the generation changes.
  4. A study build that finds a corrupt `series-singleton.json` deletes it (SQR-D9), builds
     that series again, and then builds the study files. It does not store study files
     without that series.
  5. A build leaves out data only when the data is corrupt or missing: an instance with no
     readable metadata and no entry in the current series metadata, or a series with no
     readable data (rule 3).

  Supports SQR-U1, SQR-U2 and SQR-U3.
- **SQR-D4. Build only when necessary, and stop at the stored data.** The server builds a level
  only when a file of the level is missing. A build of a level can work on all of the levels
  below it. For each lower level, the build uses the stored files when they exist, and does
  not go further down. When a file of a lower level is missing, the build first builds that
  level in the same way. For example, a study build uses the stored files of each series, and
  builds only the series that have a missing file. One exception: a study build reads the
  metadata of one instance, to get the patient and study attributes. Supports SQR-U1 and
  SQR-U2.
- **SQR-D5. Store the data, then change the generation, then delete.** An upload stores each
  new instance. Immediately after the commit of each instance, the upload changes the
  generation of its series and of its study. Then the upload deletes the derived files that the instance
  affects: the files of its series and the study files. The upload does these steps for each
  instance, so an upload that stops before its end leaves no stale derived file, except in
  the cases of notes 1 and 2 of "Safety of each deployment". The upload
  does the steps again for all affected series when it ends. The upload does not delete
  `studies/index.json` (SQR-D17). Supports SQR-U1.
- **SQR-D6. Commit only a build of the current generation.** A build reads the generation
  of its level (its series, or its study) before it reads any data. The build writes its files to temporary files. The build moves a
  temporary file to its final name only when the generation did not change. After the move,
  the build reads the generation again. If the generation changed, the build deletes the
  files that it moved. In both cases of a change, the build starts again after a delay. The
  delay increases after each round that does not commit, up to a maximum (30 s on the
  server), and goes back to its start value after a commit. A build has at most one round
  that waits for its delay. Thus a build does not use a slot without
  a stop while new data arrives. The build continues until one round commits with no change
  of the generation. A study round whose build of a series did not commit (also a series
  round that the study round joined, SQR-D7) does not commit either, because its files
  would leave out that series. Its result for the waiting callers uses the data of that
  series round for the series, so the response does not leave out the series. The study
  round starts again after a delay in the same way. Supports SQR-U1 and SQR-U3.
- **SQR-D7. Respond after the first build.** A caller that waits for a build gets the result of
  the first round of that build, also when the build must start again. The caller does not
  wait for the next rounds. The next rounds continue in the background. Supports SQR-U1 and
  SQR-U2.
- **SQR-D8. Make the check and the move atomic on one node.** On one node, the check of the
  generation and the move of the file run with no other work between them. The upload changes
  the generation and deletes the files with no other work between them. Thus on one node, an
  upload cannot fall between the check and the move. A build can commit in the short time
  between the store of an instance and the change of the generation, but the upload deletes
  that file before the server answers a request, so no request gets a stale file.
  Supports SQR-U1.
- **SQR-D9. Delete only a corrupt file.** The server deletes a derived file because of a read
  only when the file is corrupt, for example when the gunzip step or the JSON parse fails. An
  I/O error does not cause a deletion. The server builds a deleted file of the series, study
  and studies levels again. The server cannot build a deleted instance `metadata` again,
  because only an upload makes it from the stored DICOM instance. Supports SQR-U1.
- **SQR-D10. Force a build from the CLI.** A `createdicomweb` command that builds derived data,
  for example `series` or `study`, builds its own level again when you use `--force`. The
  command does this also when the files exist. For the lower levels, the command obeys SQR-D4.
  Without `--force`, the command obeys SQR-D1 and SQR-D4 at all levels. The CLI runs in a
  different process from the server, so the CLI does not see the generations of the server.
  In the base design, run a CLI build only when the server stores no data for that study.
  Supports SQR-U1.

The next requirements use these terms:

- A **top-level job** is the build that one request or one upload message needs, for example
  the build of the study level for a series query.
- A **nested job** is a build that a running job needs at a lower level, for example the build
  of one series for a study build.

- **SQR-D11. Check the file before the queue.** The server accepts a request and checks if its
  file exists, without the job limits. A request whose file exists gets its response
  immediately, within the limit of the server on requests. Only a request that needs a build
  starts a job, or waits for a job. Supports SQR-U2.
- **SQR-D12. Limit the top-level jobs.** The server limits the number of top-level jobs that run
  at the same time. A top-level job above the limit waits in a queue. The limit is a
  configuration value. Supports SQR-U3.
- **SQR-D13. A started job always progresses.** A nested job does not wait for a slot of the
  top-level limit. A running job can always start at least one nested job, or wait for one,
  at a time. The job can do its nested jobs one after the other, in one thread of work. A job
  in the queue holds nothing that a running job waits for. Thus a job that has started always
  completes, for each number of levels. Supports SQR-U1 and SQR-U3.
- **SQR-D14. Reject new work when the queue is too long.** When the queue holds the
  configured number of request jobs, the server does not add a job for a new request. The
  request gets the `503` response of SQR-U3. A job of an upload message, or a next round of
  SQR-D6, is a background job. A background job is not rejected, and it does not count to the
  limit, so an upload alone does not make other requests get `503`. Supports SQR-U3.

- **SQR-D17. Keep the studies list as a best-effort list.** The studies list has no
  generation, and an upload does not delete it. When the server commits the study level of
  a study, and the studies list is enabled (`studyIndex`), the server reads
  `studies/index.json`. When the file lists the study, the server does not change the file.
  When the file does not list the study, the server adds the entry of the study, and saves
  the file. When the file is missing, a `GET /studies` request builds it from the study
  level of each study (SQR-D2). A study whose round did not commit during that build is not
  in the file at first. The next round of that study adds it, in the same way as after an
  upload. The updates of the file in one process run one after the
  other. The design gives no guarantee for updates from different processes. The server
  parameter `studyIndex: false` turns off the update of the file after a study build.
  Supports SQR-U4.

### Multi-node extension requirements

These requirements are not part of the base design. The base design must not block them.

- **SQR-D15. Keep the generations in shared storage.** All nodes read and change the same
  generations, for example a small file in the directory of each study. The rules of SQR-D5
  and SQR-D6 do not change. Supports SQR-U1.
- **SQR-D16. Record the generation in each committed file, and check it at serve time.** Each
  committed derived file records the generation that it was built from. Before the server
  serves a derived file, it compares that value with the current generation. When the two
  values are different, the server deletes the derived file, and builds it again (SQR-D2).
  The check is "different", and not "older", because a node with a different clock, or a
  build that started before the current generation, can record an older or a newer value.
  Supports SQR-U1.

With SQR-D15 only, one case is not safe: a node commits a file, and then stops before it reads
the generation again. If an upload changed the generation between the check and the move, the
stale file stays until the next upload to that study. SQR-D16 removes that case. The stale file
records the old generation, so the next request finds the difference, and builds the file
again.

The value to compare is the generation, and not a sha1 of the file. A sha1 shows that the
content of a file is complete. It does not show that the file includes the newest data. The
generation shows that.

### Safety of each deployment

| Deployment | Safe while all nodes run | Safe when a node stops |
| --- | --- | --- |
| One node, base design | yes, except note 2 | yes, except a stop in the short time between the commit of an instance and the deletion of its derived files (note 1) |
| Several nodes, all work for one study on one node, base design | yes, except note 2 | yes, with the exception of note 1 |
| Several nodes, any routing, SQR-D15 | yes, except note 2 | no, a stale file can stay until the next upload |
| Several nodes, any routing, SQR-D15 and SQR-D16 | yes, except note 2 | yes |

Note 1: in that short time, the process can stop after the instance is stored and before its
derived files are deleted. The old derived files then stay until the next upload to that series,
or until an operator runs a forced build (SQR-D10).

Note 2: the same old derived files stay in two more cases on each deployment. The storage can
refuse the deletion of a derived file with an I/O error (the server logs the error). Or the
commit of an instance can fail after it moved some of the files of that instance, and the
upload then does not delete the derived files. Both cases need a storage failure during the
upload.

The table applies to the series level and the study level. The studies list (SQR-D17) is
safe on one node only, and only to the level of SQR-U4.

"All work for one study on one node" includes the builds that a query starts. A query for a
study on a different node must go to the node of that study, or that deployment needs SQR-D15.

### Example: a new series arrives during a study build, on one node

1. A series query finds no `series/index.json` for study X. Build B1 reads generation 7, and
   then scans the series of X.
2. An upload stores the new series S. Then, in one step, the upload changes the generation of
   X to 8, and deletes the files of S and the study files of X.
3. B1 completes its files. Before the move, B1 finds generation 8. B1 does not move its files,
   and starts round 2 in the background.
4. The request that waited for B1 gets the result of round 1, without S (SQR-D7).
5. Round 2 reads generation 8. It builds S as a nested job, uses the stored files of the other
   series, and commits `series/index.json` with S. The generation is still 8, so the build
   ends.

If the process stops after step 3, `series/index.json` is missing. The next query builds it
with S.
