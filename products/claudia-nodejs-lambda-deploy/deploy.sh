#!/bin/sh
set -eu
# Review AWS account, IAM role, region, API module, and Claudia plan before running.
# First deployment provisions resources and can incur AWS charges.
npx claudia create --region "${AWS_REGION:?set AWS_REGION}" --handler app.handler --deploy-proxy-api
