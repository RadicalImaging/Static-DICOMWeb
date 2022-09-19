# TODO List for Static DICOMweb

1. Add notification when study is out of date
2. Add upload of notification files to S3
3. Add group command to mkdicomweb
4. Add check command to mkdicomweb
5. Allow mkdicomweb to read instances/deduplicated files from deployment dir
6. Add instance command to mkdicomweb
7. Add better logging on failure types, and set exit codes
8. Add notification in S3

Integration command line into DICOMweb server component

Check/Group steps:
1. Run check command, if up to date, then exit
2. Run group command
3. Schedule a check/group command for 5 minutes in the future

Receive instance steps:
1. Run mkdicomweb instance <FILENAME>
2. Schedule a Check/Group for current+T minutes  (some length of time in future)


