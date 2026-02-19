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

# Step 3: Check for models (informational only - no auto-pulling)
echo "Checking available models from your Ollama installation:"
docker compose exec ollama ollama list

# Optional: Uncomment any of these sections if you need to pull models

# # Arctic Text2SQL model (uncomment if needed)
# if ! docker compose exec ollama ollama list | grep -q "arctic-text2sql:latest"; then
#   echo "Pulling Arctic model..."
#   docker compose exec ollama ollama pull hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M
#   docker compose exec ollama ollama cp hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M arctic-text2sql:latest
#   echo "Arctic model pulled"
# fi

# # Distil-Qwen3 Text2SQL model (uncomment if needed)
# if ! docker compose exec ollama ollama list | grep -q "distil-qwen3-4b:latest"; then
#   echo "Pulling Distil-Qwen3 model..."
#   docker compose exec ollama ollama pull hf.co/distil-labs/distil-qwen3-4b-text2sql-gguf-4bit
#   docker compose exec ollama ollama cp hf.co/distil-labs/distil-qwen3-4b-text2sql-gguf-4bit distil-qwen3-4b:latest
#   echo "Distil-Qwen3 model pulled"
# fi

# # Qwen2.5-Coder-7B SQL generator model (uncomment if needed)
# if ! docker compose exec ollama ollama list | grep -q "qwen2.5-coder-7b:latest"; then
#   echo "Pulling Qwen2.5-Coder-7B model from Hugging Face..."
#   docker compose exec ollama ollama pull hf.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M
#   # Optional: create a shorter name for convenience
#   docker compose exec ollama ollama cp hf.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M qwen2.5-coder-7b:latest
#   echo "Qwen2.5-Coder-7B model pulled and available as 'qwen2.5-coder-7b:latest'"
# fi

# # Qwen2.5-Coder-14B judge model (uncomment if needed)
# if ! docker compose exec ollama ollama list | grep -q "qwen2.5-coder:14b"; then
#   echo "Pulling Qwen2.5-Coder-14B model..."
#   docker compose exec ollama ollama pull qwen2.5-coder:14b
#   echo "Qwen2.5-Coder-14B model pulled"
# fi

# Step 4: Pre-load models into VRAM via API
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

# Load ONLY 2 models total (one SQL generator + one judge)
# Choose ONE SQL generator by uncommenting it, and keep the judge
# check .env and docker-compose.yml to make sure model choices are consistent
echo "Loading SQL generator model (choose one)..."
# load_model "arctic-text2sql:latest"        # Option 1: Arctic
load_model "distil-qwen3-4b:latest"        # Option 2: Distil-Qwen3
# load_model "qwen2.5-coder-7b:latest"       # Option 3: Qwen2.5-Coder-7B

echo "Loading judge model..."
load_model "qwen2.5-coder:14b" &           # Judge model (loads in background)

echo "Model loading initiated in background. Continuing setup..."
# Give models a moment to start loading
sleep 5

# Step 5: Verify VRAM usage (optional)
echo "Current VRAM usage:"
docker compose exec ollama nvidia-smi | grep "MiB /" | head -1

# Step 6A: 1st time setup only: Run database setup 
# npm run setup

# Step 6B: Subsequent starting app (after database already set up, backend, models)
# do NOT use --watch flag since it'll interfere with judge evaluation step
docker compose up -d