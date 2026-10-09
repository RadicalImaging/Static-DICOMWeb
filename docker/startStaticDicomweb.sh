#!/bin/bash

cd /app || exit 1

# The image has no DIMSE SCP (dicomwebscp), so this starts the DICOMweb server
# only, the same as the default command of the image.
exec monitordicomwebserver
