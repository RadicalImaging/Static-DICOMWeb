set cpath=%~dp0
set cpath=%cpath:~0,-1%
bun run %cpath%\..\dist\cs3d.js %*
