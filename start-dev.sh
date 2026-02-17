#!/bin/bash

# Note: This script is designed for Linux/WSL2 environments
# Windows users should use WSL2 or adapt for PowerShell

# Make start-dev.sh executable (one-time)
# chmod +x start-dev.sh
# to run in terminal: ./start-dev.sh

# Step 1: Start Ollama and DB
docker compose up -d ollama db

# Step 2: Wait for Ollama
until docker compose exec ollama ollama list &>/dev/null; do
  echo "Waiting for Ollama..."
  sleep 5
done
echo "Ollama ready!"

# Step 3: Ensure models are pulled (or running if already downloaded)
echo "Ensuring models are available..."

# Arctic Text2SQL model
if ! docker compose exec ollama ollama list | grep -q "arctic-text2sql"; then
  echo "Pulling Arctic model..."
  docker compose exec ollama ollama pull hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M
  docker compose exec ollama ollama cp hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M arctic-text2sql
  echo "Arctic model pulled"
fi

# SQLCoder model (optional)
if ! docker compose exec ollama ollama list | grep -q "sqlcoder"; then
  echo "Pulling SQLCoder model..."
  docker compose exec ollama ollama pull hf.co/TheBloke/sqlcoder-7B-GGUF:Q4_K_M
  docker compose exec ollama ollama cp hf.co/TheBloke/sqlcoder-7B-GGUF:Q4_K_M sqlcoder
  echo "SQLCoder model pulled"
fi

# Phi-4-reasoning judge model (14B)
if ! docker compose exec ollama ollama list | grep -q "phi4-reasoning"; then
  echo "Pulling Phi-4-reasoning judge model (14B)..."
  docker compose exec ollama ollama pull phi4-reasoning
  echo "Phi-4-reasoning model pulled"
fi

# Step 4: Pre-load models into VRAM via API (non-blocking)
echo "Pre-loading models into VRAM via API..."

# Function to trigger model load
load_model() {
  local model_name=$1
  echo "Loading ${model_name}..."
  curl -s -X POST http://localhost:11434/api/generate \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"${model_name}\",
      \"prompt\": \"\",
      \"stream\": false,
      \"options\": {\"num_predict\": 1}
    }" > /dev/null
  if [ $? -eq 0 ]; then
    echo "${model_name} load triggered."
  else
    echo "Failed to trigger load for ${model_name}. It will load on first use."
  fi
}

# Load models sequentially (arctic fast, phi4 in background)
load_model "arctic-text2sql"
load_model "phi4-reasoning" &

echo "Model loading initiated in background. Continuing setup..."
# Give models a moment to start loading
sleep 5

# Step 5: Verify VRAM usage (optional)
echo "Current VRAM usage:"
docker compose exec ollama nvidia-smi | grep "MiB /" | head -1

# Step 6A: 1st time setup only: Run database setup 
# npm run setup

# Step 6B: Subsequent starting app (after database already set up, backend, models, i.e. everything already set up)
# do NOT use --watch flag since it'll interfere with judge evaluation step
docker compose up -d