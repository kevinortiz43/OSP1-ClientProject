#!/bin/bash

# Make start-dev.sh executable (one-time)
# chmod +x start-dev.sh
# to run in terminal: ./start-dev.sh

echo "Starting development environment..."

# Step 1: Start Ollama and DB
docker compose up -d ollama db

# Step 2: Wait for Ollama
until docker compose exec ollama ollama list &>/dev/null; do
  echo "Waiting for Ollama..."
  sleep 5
done
echo "Ollama ready!"

# Step 3: Ensure models are pulled (idempotent)
# only pulls if models aren't found (only should be pulled the 1st time you're downloading the model)
# ollama list will show all installed models  

# change model names as appropriate
echo "Ensuring models are available..."
for model in "hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M" "hf.co/TheBloke/sqlcoder-7B-GGUF:Q4_K_M"; do
  if ! docker compose exec ollama ollama list | grep -q "${model%%:*}"; then
    echo "Pulling $model..."
    docker compose exec ollama ollama pull "$model"
  fi
done

# Step 4: Ensure aliases exist
# 2>/dev/null hides errors like 'alias already exists'
# If the alias exists, it quietly does nothing
# || true makes the script continue even if the cp fails

# change model names as appropriate 
docker compose exec ollama ollama cp hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M arctic-text2sql 2>/dev/null || true
docker compose exec ollama ollama cp hf.co/TheBloke/sqlcoder-7B-GGUF:Q4_K_M sqlcoder 2>/dev/null || true

# Step 5: Pre-load both models into VRAM 
# change model names as appropriate
echo "Pre-loading models into VRAM..."
docker compose exec ollama ollama run arctic-text2sql "SELECT 1;" > /dev/null 2>&1 &
docker compose exec ollama ollama run sqlcoder "SELECT 1;" > /dev/null 2>&1 &
wait
echo "Models loaded and ready"

# Step 6: Run database setup (your existing devo)
npm run devo