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

## § User requirements

- **SQR-U1. Correct result.** A valid query or retrieve for data that the server stores
  returns that data, at every level: studies, series, instances and metadata. The server does
  not return an error for such a request. The 404 of a series query is a defect. This
  specification corrects the defect, and it does not change the user contract.
  A response includes all data whose storage completed before the update for that response
  started. Data whose storage completes during that update can be missing from that response.
  That data is in the responses after the next update.
- **SQR-U2. Acceptable performance.** A query or a retrieve returns in a time that a client can
  accept, for each study size that the server stores. The time does not increase each time
  that a client sends the same request again.
- **SQR-U3. Server stability.** A retrieve, a query, or a storage of new data does not stop
  the webserver, when the request fails or when the request is slow. Other requests continue
  to work. When the server has too much update work in its queue, the server answers a new
  request that needs an update with `503 Service Unavailable` and a `Retry-After` header. A
  request that needs no update does not get this response. This response and SQR-U4 are
  the only exceptions to SQR-U1. The client can send the request again later.
- **SQR-U4. The studies list is a best-effort helper.** The studies list
  (`GET /studies` without `StudyInstanceUID`) is a helper for the local files of a single
  system. It lists each stored study. The summary values of an entry, for example the
  counts of series and instances, can be older than the study. A query with
  `StudyInstanceUID` gives the current values of the study (SQR-U1). This is the exception to
  SQR-U1 for the studies list. Some deployments do not update the studies list on upload at
  all (`studyIndex: false`), so the helper is optional.

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

Each file at the series, study and studies levels serves one response path. For example,
`series/index.json` serves `GET /studies/<studyUID>/series`.

The design uses one **generation** for each study. A generation is a value that changes each
time that new data for the study is stored. The series files and the study files of a study
use the generation of that study. The studies list has no generation: it is a best-effort
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
  message or a stopped process never leaves a wrong file, only a missing file. Supports SQR-U1
  and SQR-U3.
- **SQR-D3. Store each build.** Each build stores all files of its level. After a build, each
  response path of that level has a stored file. Supports SQR-U1 and SQR-U2.
- **SQR-D4. Build only when necessary, and stop at the stored data.** The server builds a level
  only when a file of the level is missing. A build of a level can work on all of the levels
  below it. For each lower level, the build uses the stored files when they exist, and does
  not go further down. When a file of a lower level is missing, the build first builds that
  level in the same way. For example, a study build uses the stored files of each series, and
  builds only the series that have a missing file. Supports SQR-U1 and SQR-U2.
- **SQR-D5. Store the data, then change the generation, then delete.** An upload first stores
  the new instances. Then the upload changes the generation of each affected study. Then the
  upload deletes the derived files that the new data affects: the series files and the study
  files. The upload does not delete `studies/index.json` (SQR-D17). Supports SQR-U1.
- **SQR-D6. Commit only a build of the current generation.** A build reads the generation
  before it reads any data. The build writes its files to temporary files. The build moves a
  temporary file to its final name only when the generation did not change. After the move,
  the build reads the generation again. If the generation changed, the build deletes the
  files that it moved. In both cases of a change, the build starts again. The build continues
  until one round commits with no change of the generation. Supports SQR-U1.
- **SQR-D7. Respond after the first build.** A caller that waits for a build gets the result of
  the first round of that build, also when the build must start again. The caller does not
  wait for the next rounds. The next rounds continue in the background. Supports SQR-U1 and
  SQR-U2.
- **SQR-D8. Make the check and the move atomic on one node.** On one node, the check of the
  generation and the move of the file run with no other work between them. The upload changes
  the generation and deletes the files with no other work between them. Thus on one node, an
  upload cannot fall between the check and the move, and a build never commits a stale file.
  Supports SQR-U1.
- **SQR-D9. Delete only a corrupt file.** The server deletes a derived file because of a read
  only when the file is corrupt, for example when the gunzip step or the JSON parse fails. An
  I/O error does not cause a deletion. Supports SQR-U1.
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
- **SQR-D14. Reject new work when the queue is too long.** When the queue of top-level jobs
  has more than a configured number of jobs, the server does not add a job for a new request.
  The request gets the `503` response of SQR-U3. A job of an upload message, or a next round of
  SQR-D6, is not rejected. Supports SQR-U3.

- **SQR-D17. Keep the studies list as a best-effort list.** The studies list has no
  generation, and an upload does not delete it. When the server commits the study level of
  a study, and the studies list is enabled (`studyIndex`), the server reads
  `studies/index.json`. When the file lists the study, the server does not change the file.
  When the file does not list the study, the server adds the entry of the study, and saves
  the file. When the file is missing, a `GET /studies` request builds it from the study
  level of each study (SQR-D2). The updates of the file in one process run one after the
  other. The design gives no guarantee for updates from different processes. Supports SQR-U4.

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
| One node, base design | yes | yes |
| Several nodes, all work for one study on one node, base design | yes | yes |
| Several nodes, any routing, SQR-D15 | yes | no, a stale file can stay until the next upload |
| Several nodes, any routing, SQR-D15 and SQR-D16 | yes | yes |

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
