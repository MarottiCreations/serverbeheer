#!/bin/bash

# Kill any existing instances
pkill -f "electron.*serverbeheer" 2>/dev/null
pkill -f "node.*server.js.*serverbeheer" 2>/dev/null

# Wait a moment
sleep 1

# Start the app
cd "$(dirname "$0")"
npm run app
