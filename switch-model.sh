#!/bin/bash
# switching models overwrites .env file
# make executable: chmod +x switch-model.sh
# run script in terminal: ./switch-model.sh

if [ "$1" == "arctic" ]; then
  cat > .env << 'ENV_CONTENT'
# Arctic Text2SQL Model
OLLAMA_MODEL=hf.co/mradermacher/Arctic-Text2SQL-R1-7B-GGUF:Q4_K_M
OLLAMA_ALIAS=arctic-text2sql
TEXT2SQL_MODEL=arctic-text2sql
ENV_CONTENT
  echo "Switched to Arctic model"

elif [ "$1" == "sqlcoder" ]; then
  cat > .env << 'ENV_CONTENT'
# SQLCoder Model
OLLAMA_MODEL=hf.co/TheBloke/sqlcoder-7B-GGUF:Q4_K_M
OLLAMA_ALIAS=sqlcoder
TEXT2SQL_MODEL=sqlcoder
ENV_CONTENT
  echo "Switched to SQLCoder model"

elif [ "$1" == "qwen" ] || [ "$1" == "qwen-coder" ]; then
  cat > .env << 'ENV_CONTENT'
# Qwen2.5-Coder Model
OLLAMA_MODEL=qwen2.5-coder:32b-instruct-q4_K_M
OLLAMA_ALIAS=qwen-coder
TEXT2SQL_MODEL=qwen-coder
ENV_CONTENT
  echo "Switched to Qwen2.5-Coder model"

else
  echo "Usage: ./switch-model.sh [arctic|sqlcoder|qwen]"
  exit 1
fi

# Show new .env content
echo "=== New .env file ==="
cat .env
echo "====================="

# Restart just the backend
docker compose up -d backend --no-deps

# Verify the switch in logs
echo "Checking backend logs for model initialization..."
sleep 2
docker compose logs backend --tail=20 | grep -i "model.*initialized\|using model" | tail -3
