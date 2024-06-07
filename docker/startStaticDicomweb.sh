#!/bin/bash

cd /app

# Start the first process
dicomwebserver &

# Start the second process
dicomwebscp

