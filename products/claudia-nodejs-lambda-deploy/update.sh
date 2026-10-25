#!/bin/sh
set -eu
# Deploys a new Lambda version to the existing Claudia-managed function.
npx claudia update
