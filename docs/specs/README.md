# Specifications

This directory holds the specifications of Static-DICOMWeb. A specification holds two kinds
of requirements:

- **User requirements**: what a user or a client must be able to do, or must get.
- **Design requirements**: how the system keeps its data, and in which order it does the work.

The implementation requirements (how the code applies the design) do not go here. They go
in [`docs/implementation/`](../implementation/README.md). Each implementation document
links to its specification.

Each requirement section has its own prefix and its own change rule. The Scope section of
each specification states the change rules.

| Specification | Prefixes | Implementation |
| --- | --- | --- |
| [Updates of derived data](derived-data-updates.md) | `SQR-U`, `SQR-D` | [Series index rebuild](../implementation/series-index-rebuild.md) (`SQR-I`) |
| [Results of the command line tools](command-line-tools.md) | `CLI-U` | [Command line tools](../implementation/command-line-tools.md) (`CLI-I`) |
