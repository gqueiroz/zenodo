#!/usr/bin/env bash
#
# This file is part of GEO Knowledge Hub.
# Copyright (C) 2019 GEO.
#
# GEO Knowledge Hub is free software; you can redistribute it and/or modify it
# under the terms of the MIT License; see LICENSE file for more details.
#

set -e

# Find setup.sh script path
script_path=$(dirname "$0")

# Activate the virtual environment or exit
source "${script_path}/../venv/bin/activate"

if [ $? -ne 0 ]; then
    echo "Python virtual environment not found!"
    exit 1
fi

# Start Celery workers
celery worker -A zenodo.celery -l INFO & pid_celery=$!

# Start GEO Knowledge Hub server
zenodo run \
       --host=0.0.0.0 --port=443 \
       --cert "$script_path"/../docker/nginx/test.crt \
       --key "$script_path"/../docker/nginx/test.key & pid_server=$!

trap 'kill $pid_celery $pid_server &>/dev/null' EXIT

wait $pid_celery $pid_server
