Vendored from dicer (MIT), https://github.com/mscdex/dicer

Copyright Brian White. See upstream LICENSE in the dicer repository.

This copy is inlined to avoid the unmaintained `dicer` npm package (GHSA-wm7h-9275-46v2)
while preserving streaming multipart parsing behavior required for STOW-RS
(`multipart/related`), which differs from `busboy`'s `multipart/form-data` parser.
