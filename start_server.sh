#!/bin/bash

# Activate virtual environment
source venv/bin/activate

# Set PYTHONPATH to include the project root
export PYTHONPATH="/Users/joelvillarino/Projects/The-Drone-Rangers:$PYTHONPATH"

# Start the server
python3 ./server/main.py
