#!/bin/bash
set -e

# Start API server on port 8080 in background
PORT=8080 NODE_ENV=development pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Give API server a moment to start building
sleep 2

# Start frontend on port 5000 (foreground)
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/app run dev &
FRONTEND_PID=$!

# Wait for both, exit if either dies
wait $API_PID $FRONTEND_PID
