# Specification: updates of derived data

Status: base design implemented in create-dicomweb and static-wado-webserver after 1.7.10.
The multi-node extension is not implemented.

## Scope

This specification states how the webserver keeps its derived files correct and available
when new data arrives, when a file is missing, and when the process stops. The derived files
are the files that the server makes from the stored DICOM instances, for example
`studies/<studyUID>/series/index.json.gz`, the study-level series index. It also states the
result that an upload reports for each instance (SQR-U5), because the derived files depend on
the stored instances.

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
  A response includes each instance whose storage the server confirmed before it received
  the request. An instance that a client stores while the server works on a request can be
  missing from the response to that request. That instance is in the later responses.
  Stored data that the server cannot read because it is corrupt or incomplete (SQR-D9) can be
  missing from the responses. A series in which no instance is readable can give `404` for
  its own series, instances and metadata requests, and the study responses leave it out.
  After new data for that series is stored, the series is back in the responses with its
  readable instances. An instance whose stored metadata is corrupt can be missing until a
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
  because of an I/O error, and builds on demand are on, a request that needs an update (a
  query, or a series or study metadata request) gets `503 Service Unavailable` with a
  `Retry-After` header. A study metadata request can get this response also when it needs no
  update. A request for a stored file that the server sends as it is (for example a summary
  that is already stored, a frame or a bulk data item) gets a `5xx` response. Its status
  code and headers are outside this specification. An upload also gets `503` with a
  `Retry-After` header in one more case: the server cannot write to its storage, and it
  stored no instance of the upload (SQR-U5).
  After the storage recovers, the next request gets the correct result, with no upload and no
  restart. The one exception is a storage failure during an upload (see the exceptions to
  SQR-U1).
- **The exceptions to SQR-U1.** SQR-U1 has only these exceptions:
  - corrupt or incomplete stored data (SQR-U1). A stored file that the server can neither
    read nor repair gives a `5xx` response;
  - a full queue (SQR-U3);
  - a storage outage (SQR-U3);
  - the studies list of SQR-U4;
  - a deployment that turns off the builds on demand (`createIndexOnDemand: false`): a
    query or a metadata request whose summary file does not exist then gives `404`. A thumbnail
    request after an upload also gives `404`, until the series files exist again;
  - a process stop or a storage failure during an upload: the responses can then leave out
    the instances of that upload, or give older summary values, until the next upload to
    that series, or until an operator does the recovery procedure of the section "Safety of
    each deployment" of the design requirements;
  - a deployment with several nodes that does not send all work for one study to one node.

  The section "Known limitations" gives the current limits of the implementation. They are
  not user requirements.
- **SQR-U4. The studies list is a best-effort helper.** The studies list
  (`GET /studies` without `StudyInstanceUID`) is a helper for the local files of a single
  system. It lists the stored studies. When the deployment updates the list on upload, a new
  study is in the list after the study build that follows its upload commits, or after the
  first query that builds that study. For a large study, that build can end minutes after
  the response to the upload. A study with only corrupt data is not added to the list. A
  study that the server cannot read does not stop the list: the response leaves out that
  study. When the cause is a storage outage (SQR-U3), the next request after the outage
  gives the list with that study. The
  summary values of an entry, for example the counts of series and instances, can be older
  than the study. A query with `StudyInstanceUID` gives the current values of the study
  (SQR-U1). This is the exception to SQR-U1 for the studies list. A deployment can turn off
  the update of the studies list on upload (SQR-D17), so the helper is optional.
- **SQR-U5. Correct upload result.** The response to an upload (STOW-RS) reports an instance
  as stored only when the server stored all of the data of that instance: its metadata, its
  frames and its bulk data. The response reports an instance as failed only when the server
  did not store that instance. A failed upload of an instance keeps the data that the server
  stored for that instance before the upload. An upload of a stored instance replaces that
  instance: its metadata, its frames, and its Part 10 rendition. The frames above the frame
  count of the new upload are deleted. The section "Known limitations" gives the exceptions,
  for example a process stop between the commit and the deletion of the old frames.
  - After the last part of the body, the server waits for the work of each instance: the
    writes, the validation and the commit. The wait is at least 6 minutes. It has no limit
    while the writes of the request continue to complete. The section "Deployment guidance"
    of the implementation document gives the values for a proxy. When the work of an
    instance did not end in this wait, the server cannot know the result of each instance.
    The usual cause is a storage that does not respond. The request then gets
    `503 Service Unavailable` with a `Retry-After` header of some minutes, and not `400`. An
    instance of that request can still be stored after this response. The client can send
    all instances of the request again, because a new upload of a stored instance replaces
    it.
  - When too many instances of earlier uploads are stalled, the server answers a new upload
    at once with `503 Service Unavailable` and a `Retry-After` header. An instance is stalled
    in these cases:
    - its work did not end in the wait above;
    - its upload stopped before the end of the body, and its work did not end;
    - its work failed, and a file write of that work does not return.

    The usual cause is a storage that does not respond. The server stores none of the
    instances of that request. The instances of one large upload can be enough to cause this
    response. SQR-D20 gives the design. The section "Known limitations" gives a case in which
    the server cannot send this response.
  - The HTTP status of the response obeys PS3.18 Table 10.5.3-1: `200` when the server stored
    all instances of the request, `202` when it stored some instances and others failed, and
    `409` when the request has instances and the server stored none of them. The section
    "Known limitations" gives the cases of a request with no DICOM part, and of a media type
    that the server does not support.
  - When the server cannot write to its storage, the upload stops at the first instance
    that the server cannot write. The response can come before the client sent the whole
    body. The server reports each instance that it started:
    - `503 Service Unavailable` with a `Retry-After` header when it stored no instance. This
      is the exception to `409` for a storage outage (SQR-U3);
    - `202` with the failed instances when it stored some instances.

    The body lists each failed instance. An instance whose data did not arrive in full before
    the stop is a failed instance. An instance that the server did not start gets no item, so
    a client must not count a missing item as stored. After the storage recovers, the client
    can send each instance that the server did not store again. SQR-D21 gives the design.
  - Each failed instance is in the Failed SOP Sequence `(0008,1198)`. The item has the SOP
    Class UID `(0008,1150)` and the SOP Instance UID `(0008,1155)` of the instance when the
    server read them before the failure. The item has no UID that the server did not read.
    This is a deliberate deviation from PS3.3. The SOP Instance Reference Macro makes both
    UIDs Type 1, but the server cannot get them from data that it cannot read. Its Failure
    Reason `(0008,1197)` obeys PS3.18 Table I.2-2:
    - `C000` (cannot understand) only when the server cannot read the data of the instance,
      for example a part that is not a DICOM instance, a part that ends too early, or a
      validation that rejects the instance;
    - `A700` (refused, out of resources) when the server cannot write to its storage because
      the storage or the server has no free space or resources;
    - `0110` (processing failure) for each other failure that the server causes, for example
      another storage error, or an instance that the server stopped.

    An instance that the stop after a storage failure cuts gets the Failure Reason of that
    failure, `A700` or `0110`.
  - A request body that ends without its closing boundary, after one or more complete parts,
    gets a report of each instance: each stored instance as stored, and the incomplete part
    as failed. The status obeys the rules above. A body in which no part is complete gets
    `400 Bad Request`. A part header that the server cannot parse, before the end of the
    body, also gets `400 Bad Request`, because the server cannot read the later parts. The
    instances of the earlier parts can be stored, and the client can send the request again.
  - After an upload, with builds on demand, a thumbnail request for the series or for an
    instance of the upload does not give `404`. It gives a thumbnail of the stored data.
  - The `createdicomweb instance`, `create` and `stow` commands exit with a code that is not
    `0` when they did not store one or more files. An input path that does not exist, or that
    the command cannot read, is a file that the command did not store. When the `stow`
    command cannot read a file of a group, all files of that group are failed files. The
    command continues with the other groups. The server can have stored some files of that
    group.
  - The `stow` command sends a group of files again after a `503` response or a connection
    reset, up to 3 times for each group. Before a retry after a `503`, the command waits for
    the time of the `Retry-After` header. Before a retry after a reset, the command waits
    10 seconds. After the last retry, the files of that group are failed files, and the
    command continues with the other groups.

## Known limitations

These limits come from the current implementation. They are not user requirements, and a
later change can remove them:

- **A file that the server cannot parse for a reason other than corruption.** For example, a
  stored file that is too large to parse gives `500` to a request that needs an update.
- **`hashStudyUidPath`.** The builds use paths with no hash (Q3 of the implementation
  document), so the server does not build a missing summary file in that layout. A query, a
  metadata request or a studies list request whose summary file is missing gives `404`. This
  was the behaviour before the builds on demand.
- **A rename that fails during the commit of an instance (issue #143).** The response reports
  the instance as failed (SQR-U5). The files of the instance that moved before the failed
  rename stay. For a new upload of a stored instance, the stored data can then be a mix of
  the two uploads, until the next upload of that instance. The commit renames the instance
  `metadata` last (SQR-D18), so the builds do not see a new instance whose rename failed.
  The deletion of the frames above the new frame count comes after the commit, in a
  different step. A process stop between the two steps keeps those old frames. An upload of
  the same instance on a different node at that time can also keep them. The metadata of
  the instance is correct. A client that follows the metadata does not request the old
  frames. A request for such a frame number gets the old pixel data, and not `404`, until
  the next upload of that instance.
- **A thumbnail request during an upload.** A thumbnail request can read the stored data of
  an instance before the commit of that instance. The request can then store the old
  thumbnail again after the upload deleted it. The old thumbnail then stays until the next
  upload of that instance. An upload does not delete the `rendered` files, or the
  `thumbnail-<n>` files that the CLI makes.
- **The `503` of an unknown result does not list the stored instances.** The body is plain
  text. Thus a client sends all instances of the request again, also the instances that the
  server stored. A new upload of a stored instance replaces it, so the result is correct,
  but the storage does the work again.
- **A request with no DICOM part, and the media types.** The server stores Part 10 instances
  only. A request with no DICOM part gets `200` with an empty response. The server does not
  answer `415 Unsupported Media Type` for `application/dicom+json` or `application/dicom+xml`.
  It reads such a part as a Part 10 instance, so the part fails with `C000`, and a request
  with only such parts gets `409`.
- **A `TypeError`, `RangeError` or `ReferenceError` gives `0110`.** The server cannot tell
  such an error of corrupt data from an error of the program. Thus corrupt data that causes
  such an error gets `0110`, and not `C000`.
- **The removal of temporary files on several nodes.** A node that starts removes the old
  temporary files of each study on the storage. This includes a study whose uploads run on a
  different node. The safety of that removal depends on the configured age and on the clocks
  (SQR-D19).
- **A storage that does not answer a synchronous file call.** The writer uses synchronous
  file calls: `openSync`, `statSync`, `existsSync`, `mkdirSync`, `readdirSync`, `renameSync`
  and `unlinkSync`. When the storage does not answer such a call, the call stops the whole
  server. The server
  then answers no request until the storage answers. Thus it sends no `503` (SQR-U5,
  SQR-D20), no status page and no health check. A proxy then gives its own error, for
  example `504`.

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
helper, and SQR-D17 states its rule. The generation rules (SQR-D5, SQR-D6, SQR-D8, SQR-D15
and SQR-D16) apply to the series level and the study level only.

The design has two parts:

- The **base design** works without a message service and without shared state between
  systems. It is safe on a single node, also when the process stops. It is also safe on
  several nodes when all uploads and all builds of one study run on one node.
- The **multi-node extension** moves the generations to shared storage. It is safe on several
  nodes with any routing. A check at serve time makes it safe also when a node stops.

### Base design requirements

- **SQR-D1. Serve the stored version.** A response comes from the stored file of its level.
  When the file exists, the server does no other check. An upload can delete the file after
  that check (SQR-D5). When the file is then missing at the time of the send, the server
  builds the level one time (SQR-D2), and sends the data of that build. Supports SQR-U1 and
  SQR-U2.
- **SQR-D2. A missing file is always safe.** With builds on demand, a missing derived file
  of the series, study or studies level means "build this file". The server builds a missing
  file on the request path that needs it. Thus a lost update message or a stopped process
  leaves a missing file, and not a wrong file, except in the cases of notes 1 and 2 of
  "Safety of each deployment". The exceptions to "build this file":
  - a series with no instances has no series files;
  - a series with no readable data (rule 3 of SQR-D3) is not built again until its
    generation changes;
  - a deleted instance `metadata` is not built again (SQR-D9);
  - a deployment with `createIndexOnDemand: false` or `hashStudyUidPath` builds no file on
    the request path.

  Supports SQR-U1 and SQR-U3.
- **SQR-D3. Store each build.** A build that commits stores each file of its level for which
  it has data. The rules below give the cases with no data. The terms of this requirement:
  - A **missing path** is a path that does not exist (`ENOENT`, `ENOTDIR`), or a path whose
    name is too long (`ENAMETOOLONG`), because no stored path has such a name. An upload can
    delete a derived file during a build, so a missing path is not an error.
  - A **corrupt file** is a file whose gunzip step or JSON parse fails (SQR-D9).
  - A **permanent error** is a file system error that a retry cannot change, because the
    layout of the files is wrong: `ELOOP`, `EISDIR`, `EINVAL`, `ENOTEMPTY`, `EEXIST`,
    `EXDEV`. It gives `500`, and not the `503` of SQR-U3.
  - An **I/O error** is each other file system error with an error code of the operating
    system, for example `ESTALE`, `EIO`, `EACCES` or `ENOSPC`. An error with no such code
    (for example a program error) is not an I/O error.

  The rules:
  1. When a read, an existence check or a directory listing of the stored data, or a write
     or a move of a derived file, fails with an I/O error, the build fails with that error
     and records nothing, also when other reads are corrupt or succeed. The callers that wait
     get the error (SQR-D7), and a request gets the `503` response of SQR-U3. A later request
     builds the level again. Any other read error of the stored data that is not a missing
     path and not a corrupt file also fails the build (it gives `500`), so a build never
     counts an unreadable file as missing data. The checks that the writer does on its own
     temporary files, and on the modification time of a final file, are not in this rule.
  2. A series with no instance directories needs no build, and stores no series files.
  3. A series build that finds instance directories, but no readable instance metadata
     (corrupt files or missing paths) and no entry for those instances in the current series
     `metadata`, stores no `series-singleton.json` and no `instances/index.json`, and keeps
     the current series `metadata`. The server records that result with the generation of
     the series, and does not build the series again until the generation changes.
  4. A study build that finds a corrupt `series-singleton.json` deletes it (SQR-D9), builds
     that series again, and then builds the study files. It does not store study files
     without that series, unless the series build finds no readable data (rule 3). When the
     deletion fails, or the file still gives no data after the series build and no upload
     changed the study, the study build fails (`500` or `503`), and starts no next round.
     Other corrupt files that a build cannot delete are left out (rule 5).
  5. A build leaves out data only when the data is corrupt or missing: an instance with no
     readable metadata and no entry in the current series metadata, or a series with no
     readable data (rule 3).

  Supports SQR-U1, SQR-U2 and SQR-U3.
- **SQR-D4. Build only when necessary, and stop at the stored data.** The server builds a level
  only when a file of the level is missing. A build of a level can work on all of the levels
  below it. For each lower level, the build uses the stored files when they exist, and does
  not go further down. When a file of a lower level is missing, the build first builds that
  level in the same way. For example, a study build uses the stored files of each series, and
  builds only the series that have a missing file. One exception: a study build reads
  instance metadata until it finds one readable instance, to get the patient and study
  attributes. Supports SQR-U1 and SQR-U2.
- **SQR-D5. Store the data, then change the generation, then delete.** An upload stores each
  new instance. Immediately after the commit of each instance, the upload changes the
  generation of its series and of its study. Then the upload deletes the derived files that the instance
  affects: the files of its series, the study files, the series `thumbnail` and the
  `thumbnail` of the instance. The server makes a missing thumbnail on request. The upload
  does not delete the `thumbnail-<n>` files that the CLI makes. The upload does these steps for each
  instance, so an upload that stops before its end leaves no stale derived file, except in
  the cases of notes 1 and 2 of "Safety of each deployment". The upload
  does the steps again for all affected series when it ends. The upload does not delete
  `studies/index.json` (SQR-D17). Supports SQR-U1.
  Reason for the change in pull request #146: the server makes a thumbnail from the stored
  instances, so a thumbnail is a derived file. Before the change, an upload kept the
  thumbnails, and a thumbnail request after the upload got the image of the old data.
- **SQR-D6. Commit only a build of the current generation.** A build reads the generation
  of its level (its series, or its study) before it reads any data. The build writes its files to temporary files. The build moves a
  temporary file to its final name only when the generation did not change. After the move,
  the build reads the generation again. If the generation changed, the build deletes the
  files that it moved. In both cases of a change, the build starts again after a delay. The
  delay increases after each round that does not commit, up to a maximum (30 s on the
  server), and goes back to its start value after a commit. A build has at most one round
  that waits for its delay. Thus a build does not use a slot without
  a stop while new data arrives. The build continues until one round commits with no change
  of the generation, a round fails, or a round finds that its files exist. A study round whose build of a series did not commit (also a series
  round that the study round joined, SQR-D7) does not commit either, because its files
  would leave out that series. Its result for the waiting callers uses the data of that
  series round for the series, so the response does not leave out the series. The study
  round starts again after a delay in the same way. When the generation of the study
  changed during a study round, and the round finds a series with no stored files and no
  series round, the round builds that series, so its result keeps that series. Supports
  SQR-U1 and SQR-U3.
- **SQR-D7. Respond after the first build.** A caller that waits for a build gets the result of
  the first round of that build, also when the build must start again. Each caller sends the
  data of that round, also after a commit, so an upload that deletes the committed file does
  not change the response. The caller does not
  wait for the next rounds. The next rounds continue in the background. A caller joins only
  a round that started at the generation that the caller read when it arrived, or at a later
  generation. For an older round, the caller waits until that round ends, and then joins or
  starts a round. That round starts after the caller arrived, so the caller waits for at most
  one older round, and the result has each upload that changed the generation before the
  caller arrived. A study metadata request uses the generation of its study. Supports SQR-U1
  and SQR-U2.
- **SQR-D8. Make the check and the move atomic on one node.** On one node, the check of the
  generation and the move of the file run with no other work between them. The upload changes
  the generation and deletes the files with no other work between them. Thus on one node, an
  upload cannot fall between the check and the move. A build can commit in the short time
  between the store of an instance and the change of the generation, but the upload deletes
  that file before the server answers a request, so no request gets a stale file.
  Supports SQR-U1.
- **SQR-D9. Delete only a corrupt file.** The server deletes a derived file because of a read
  only when the file is corrupt, for example when the gunzip step or the JSON parse fails. An
  I/O error does not cause a deletion. With builds on demand, the server builds a deleted file
  of the series, study and studies levels again (SQR-D2). The server cannot build a deleted instance `metadata` again,
  because only an upload makes it from the stored DICOM instance. Supports SQR-U1.
- **SQR-D10. Force a build from the CLI.** A `createdicomweb` command that builds derived data,
  for example `series` or `study`, builds its own level again when you use `--force`. The
  command does this also when the files exist. For the lower levels, the command obeys SQR-D4.
  Without `--force`, the `series` and `study` commands obey SQR-D1 and SQR-D4 at all levels.
  `study --force` does not build a series whose files exist; use `series --force` for that
  series. The CLI runs in a different process from the server, so the CLI does not see the
  generations of the server. In the base design, run a CLI build only while no upload to
  that study runs. Supports SQR-U1.

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
  configuration value. A request job can also use a small number of extra slots that a
  background job (SQR-D14) cannot use, and a request job in the queue starts before each
  background job. A request that needs the job of a queued background job moves that job
  to the request queue. Thus the background work of an upload does not take the slots of
  request jobs. A request that needs a key whose older round runs still waits for that round
  (SQR-D7). A waiting background job starts after a fixed number of request jobs (8 on the
  server), so a constant request load does not stop the background work of an upload.
  Supports SQR-U2 and SQR-U3.
- **SQR-D13. A started job always progresses.** A nested job does not wait for a slot of the
  top-level limit. A running job can always start at least one nested job, or wait for one,
  at a time. The job can do its nested jobs one after the other, in one thread of work. A job
  in the queue holds nothing that a running job waits for. Thus a job that has started always
  completes, for each number of levels. Supports SQR-U1 and SQR-U3.
- **SQR-D14. Reject new work when the queue is too long.** When the queue holds the
  configured number of request jobs, the server does not add a job for a new request. The
  request gets the `503` response of SQR-U3. A job of an upload message, or a next round of
  SQR-D6, is a background job. A background job is not rejected, and it does not count to the
  limit, so an upload alone does not make other requests get `503`. A request that moves a
  queued background job to the request queue counts to the limit, and gets `503` when the
  queue is full. Supports SQR-U3.

- **SQR-D17. Keep the studies list as a best-effort list.** The studies list has no
  generation, and an upload does not delete it. When the server commits the study level of
  a study, and the studies list is enabled (`studyIndex`), the server reads
  `studies/index.json`. When the file lists the study, the server does not change the file.
  When the file does not list the study, the server adds the entry of the study, and saves
  the file. When the file is missing, a `GET /studies` request builds it from the study
  level of each study (SQR-D2). A study whose build fails is left out. After an I/O error of
  a study, the server sends the list, and does not store it, so the next request builds the
  list again. The server logs a warning that names each such study, because a lasting I/O
  error (for example `EACCES`) makes each `GET /studies` scan all studies. After any other error, the server stores the list without that study, and a
  later commit of that study adds it. A study whose round did not commit during that build is not
  in the file at first. The next round of that study adds it, in the same way as after an
  upload. The updates of the file in one process run one after the
  other. The design gives no guarantee for updates from different processes. The server
  parameter `studyIndex: false` turns off the update of the file after a study build. The
  server parameter `disableSummary: true` stops the update messages of an upload, so no
  study build starts after an upload, and the file changes only after a query builds a
  study. Supports SQR-U4.
- **SQR-D18. Commit an instance only when all of its writes succeeded.** An upload writes
  each file of an instance to a temporary file. When one write fails, the upload of that
  instance fails, and the upload moves no file of that instance. The upload changes no stored
  file of the instance before the move. A stored file that the new instance replaces with a
  different name (for example `1.mht.gz` that `1.mht` replaces) is deleted after the move.
  The upload deletes the stored Part 10 rendition of an earlier upload with the move of the
  instance `metadata`. It deletes the stored frames above the frame count of the new upload
  after the move. After the move, the instance is stored. A failure of a later step does not
  report the instance as failed. The later steps are the deletions of this requirement and
  of SQR-D5, and the new Part 10 rendition. Until the upload stores the new rendition, the server makes the
  rendition from the stored files on request. Supports SQR-U5.
- **SQR-D19. Remove the temporary files of a stopped process.** A process that stops during a
  write leaves its temporary files. The server removes a temporary file only when all of these
  conditions are true: the file is in a temporary directory of the writer, its name is a
  temporary file name of the writer, and its last write is older than a configured age. The
  server removes it only when it starts, so a write of the same process is always newer. The
  safety for another process on the same storage (a CLI, or another node) depends on the
  configuration and on the clocks:
  - the age must be longer than the upload of one instance, because an upload keeps the
    temporary files of an instance until the commit of that instance;
  - the age must also be much longer than the difference between the clock of the server and
    the clock of the storage, because the time of the last write comes from the storage.

  With an age that obeys both conditions, the server does not remove a file of a running
  write. The default age (24 hours) obeys them for the usual uploads and clocks. The server
  keeps the temporary directories, because a writer can open a file in them at any time.
  Supports SQR-U3.
- **SQR-D20. Refuse a new upload while too much upload work is stalled.** The server counts
  the stalled instances of all uploads. An instance is stalled in these cases:
  - Its work did not end in the wait of its upload (SQR-U5), or its upload stopped before
    the end of the body. The instance stays in the count until its work ends. Until then,
    the work holds its buffers and its files, and the server does not stop it.
  - Its work failed, and a file write that the server stopped did not close. An asynchronous
    file system call holds a thread of the server until the call returns, also after the
    server stops the write. The instance stays in the count until each such write closes.

  The count holds the work that the server waits for. It does not measure the memory or the
  threads. The other file system calls of an instance (for example a delete) are not in the
  count. The limit counts instances, and not uploads, so the instances of one upload can
  reach the limit. Thus the retries of clients on a stuck storage do not add work until the
  server has no memory.

  When the count reaches a configured limit, the server answers a new upload with `503` and
  a `Retry-After` header before it reads the body. SQR-D14 does the same for builds. The
  response has no `Connection: close`. A close before the end of the body resets the
  connection, and the client then does not get the `503`. After the response, Node.js stops
  the read of the body after some hundred KB at most. It closes the connection after the
  `keepAliveTimeout` of the server (5 s).

  Thus a client that reads the response while it sends the body gets the `503`. A client
  that reads the response only after it sent the whole body can get a connection reset after
  5 s, and not the `503`. The count applies only while asynchronous file calls stall. The
  writer also uses synchronous file calls: `openSync`, `statSync`, `existsSync`, `mkdirSync`,
  `readdirSync`, `renameSync` and `unlinkSync`. A storage that does not answer such a call
  blocks the whole server, which then cannot send the `503` (Known limitations). Supports
  SQR-U3 and SQR-U5.
- **SQR-D21. Stop an upload at the first instance that the storage cannot write.** When the
  work of an instance fails with an I/O error of the storage, the server stops the upload at
  once. Examples of such an error are `EIO`, `ENOSPC`, `EACCES` and `EROFS` (SQR-D3). The
  stop has these steps:
  - It stops the read of the body, and starts no new part.
  - A part whose body did not arrive in full stops. It fails with the Failure Reason of the
    I/O error: `A700` for no free space or resources, and `0110` for each other I/O error.
    It never gets `C000`.
  - A part whose body arrived in full continues. It can still commit, and the response then
    reports it as stored.

  The server waits for the started instances as after the last part (SQR-U5), and then
  reports each of them. The response has `503` and a `Retry-After` header when no instance
  is stored, and `202` otherwise. An error that is not an I/O error (for example `C000`)
  does not stop the upload. Supports SQR-U3 and SQR-U5.

  After the stop, the server does not read the rest of the body. As after the `503` of
  SQR-D20, Node.js closes the connection after `keepAliveTimeout` (5 s). A client that reads
  the response while it sends the body gets the response. Reason for the change in
  pull request #146: each later instance needs the same storage, and a body can be some GB.
  Before this requirement, the server read the whole body, and tried each instance, before
  it sent the response.

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
| Several nodes, all work for one study on one node, base design | yes, except notes 2 and 3 | yes, with the exceptions of notes 1 and 3 |
| Several nodes, any routing, SQR-D15 | yes, except notes 2 and 3 | no, a stale file can stay until the next upload |
| Several nodes, any routing, SQR-D15 and SQR-D16 | yes, except notes 2 and 3 | yes, except note 3 |

Note 1: in that short time, the process can stop after the instance is stored and before its
derived files are deleted. The old derived files then stay until the next upload to that series,
or until an operator does the recovery procedure below.

Note 2: the same old derived files stay in three more cases on each deployment. Each case
needs a storage failure:

- The storage refuses the deletion of a derived file during an upload with an I/O error (the
  server logs the error).
- The commit of an instance fails after it moved some of the files of that instance (issue
  #143), and the upload then does not delete the derived files. The commit renames the
  instance `metadata` last (SQR-D18). Thus for a new instance, the old derived files stay
  correct, because the builds do not see the instance. For a new upload of a stored
  instance, the old derived files stay.
- A rename of a build commit fails, and the storage refuses the deletion of the new files
  that moved and of all old files of that round (the server logs the error).

Note 3: a node that starts removes the old temporary files of each study on the shared
storage (SQR-D19). This includes a study whose uploads run on a different node. The removal
is safe only when the configured age is longer than the upload of one instance. The age must
also be much longer than the difference between the clocks of the nodes and of the storage.

Recovery procedure for notes 1 and 2, after the storage recovers. Do one of these:

- Delete the series files (the series `metadata`, `series-singleton.json` and
  `instances/index.json`) of each affected series, and the study files (`series/index.json`
  and the study `index.json`). Also delete the series `thumbnail` of each affected series,
  and the `thumbnail` of each affected instance. With builds on demand, the next request
  builds them (SQR-D2), and the next thumbnail request makes the thumbnails.
- Stop the uploads to that study. Run `series --force` for each affected series, and then
  `study --force` for the study (SQR-D10). Delete the thumbnails as in the item above.

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
4. The request that waited for B1 gets the result of round 1, without S (SQR-D7). That
   request arrived before the upload of S. A request that arrives after step 2 does not join
   round 1. It waits for round 1 to end, and then starts or joins a new round, and gets its
   result, with S.
5. Round 2 reads generation 8. It builds S as a nested job, uses the stored files of the other
   series, and commits `series/index.json` with S. The generation is still 8, so the build
   ends.

If the process stops after step 3, `series/index.json` is missing. The next query builds it
with S.
