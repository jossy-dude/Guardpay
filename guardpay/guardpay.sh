#!/bin/bash
# GuardPay launcher script
# This script starts the GuardPay server from the test instance with the latest fixes

SCRIPT_DIR="/home/jossy/Documents/Projects/Payment-tracker/guardpay"
cd "$SCRIPT_DIR"

# Parse args before starting the server
PORT=8420
NO_BROWSER=false
LOCAL=false
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift 1
      ;;
    --no-browser)
      NO_BROWSER=true
      shift 1
      ;;
    --local)
      LOCAL=true
      shift 1
      ;;
    *)
      ARGS+=("$1")
      shift 1
      ;;
  esac
done

# Build args for server.py
SERVER_ARGS=()
if [[ "$NO_BROWSER" == true ]]; then
  SERVER_ARGS+=("--no-browser")
fi
if [[ "$LOCAL" == true ]]; then
  SERVER_ARGS+=("--local")
fi

# Check if Python 3 is available
if command -v python3 &>/dev/null; then
    python3 server.py "$PORT" "${SERVER_ARGS[@]}" "${ARGS[@]}"
elif command -v python &>/dev/null; then
    python server.py "$PORT" "${SERVER_ARGS[@]}" "${ARGS[@]}"
else
    echo "Error: Python 3 is required to run GuardPay"
    echo "Please install Python 3 and try again"
    exit 1
fi
