#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the RPC instance that we started (if we started one and if it's still running).
  if [ -n "$pid" ] && ps -p $pid > /dev/null; then
    kill -9 $pid
  fi

  # Remove local deploy file in case it was created
  clean_deploy
}

setup_testing_variables() {
  PORT=${PORT-8545}
  BALANCE=${BALANCE-100000}
  GAS_LIMIT=${GAS_LIMIT-8000000}
  NETWORK_ID=${NETWORK_ID-15}
  ACCOUNTS=${ACCOUNTS-200}
}

start_ganache() {
  echo "Starting ganache-cli..."
  npx ganache-cli -i ${NETWORK_ID} -l ${GAS_LIMIT} -a ${ACCOUNTS} -e ${BALANCE} -p ${PORT} > /dev/null &
  pid=$!
  sleep 3
  echo "Running ganache-cli with pid ${pid} in port ${PORT}"
}

deploy_template() {
  echo "Deploying template..."
  npm run deploy:rpc
}

clean_deploy() {
  rm -f arapp_local.json
}

run_tests() {
  echo "Running tests $@..."
  npx truffle test --network rpc $@
}

setup_testing_variables
start_ganache
clean_deploy
deploy_template
run_tests $@
