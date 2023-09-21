#!/bin/bash

echo Hello start static dicomweb
cd /app
cat ./static-dicomweb.json5

# Start the first process
dicomwebserver &

echo Started dicomwebserver

# Start the second process
dicomwebscp

