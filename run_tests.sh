#!/bin/bash
set -e

echo "Running Unit Tests..."
PYTHONPATH=. ./venv/bin/pytest tests/unit

echo "Running Integration Tests..."
PYTHONPATH=. ./venv/bin/pytest tests/integration

echo "Running Server Tests..."
PYTHONPATH=. ./venv/bin/pytest tests/server

echo "Running E2E Tests..."
PYTHONPATH=. ./venv/bin/pytest tests/e2e

echo "All tests passed!"
