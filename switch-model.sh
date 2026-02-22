#!/bin/bash
# switch-model.sh - Switch between text2sql models
# Make executable: chmod +x switch-model.sh
# Usage: ./switch-model.sh [arctic|qwen7b|distil]
# switches between SQL models to test models

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_usage() {
  echo "Usage: ./switch-model.sh [arctic|qwen7b|distil]"
  echo ""
  echo "Options:"
  echo "  arctic   - Switch to Arctic-Text2SQL (4.7GB) + qwen2.5-coder:14b judge"
  echo "  qwen7b   - Switch to qwen2.5:7b + qwen2.5-coder:14b judge"
  echo "  distil   - Switch to distil-qwen3-4b:latest + qwen2.5-coder:14b judge"
  echo ""
  echo "Current models in Ollama:"
  ollama list | grep -E "arctic|qwen|distil|sqlcoder|phi" || echo "  (run 'ollama list' to see all)"
}

if [ $# -eq 0 ]; then
  show_usage
  exit 1
fi

case "$1" in
  "arctic")
    cat > .env << 'ENV_CONTENT'
# Arctic Text2SQL + qwen2.5-coder:14b Judge
TEXT2SQL_MODEL=arctic-text2sql:latest
AI_RESPONSE_MODEL=qwen2.5-coder:7b
JUDGE_MODEL=qwen2.5-coder:7b
MODEL_URL=http://ollama:11434/v1/chat/completions
ENV_CONTENT
    echo -e "${GREEN}✓ Switched to Arctic model (judge: qwen2.5-coder:14b)${NC}"
    ;;

  "qwen7b")
    cat > .env << 'ENV_CONTENT'
# qwen2.5:7b Text2SQL + qwen2.5-coder:14b Judge
TEXT2SQL_MODEL=qwen2.5:7b
AI_RESPONSE_MODEL=qwen2.5-coder:7b
JUDGE_MODEL=qwen2.5-coder:7b
MODEL_URL=http://ollama:11434/v1/chat/completions
ENV_CONTENT
    echo -e "${GREEN}✓ Switched to qwen2.5:7b model (judge: qwen2.5-coder:14b)${NC}"
    ;;

  "distil")
    cat > .env << 'ENV_CONTENT'
# distil-qwen3-4b:latest Text2SQL + qwen2.5-coder:14b Judge
TEXT2SQL_MODEL=distil-qwen3-4b:latest
AI_RESPONSE_MODEL=qwen2.5-coder:7b
JUDGE_MODEL=qwen2.5-coder:7b
MODEL_URL=http://ollama:11434/v1/chat/completions
    echo -e "${GREEN}✓ Switched to distil-qwen3-4b:latest model (judge: qwen2.5-coder:14b)${NC}"
    ;;

  *)
    echo -e "${YELLOW}Unknown option: $1${NC}"
    show_usage
    exit 1
    ;;
esac

# Show new .env content
echo -e "\n${YELLOW}=== New .env file ===${NC}"
cat .env
echo "====================="

# Verify models are pulled (will pull if missing)
echo -e "\n${YELLOW}Checking if models are available...${NC}"
TEXT2SQL_MODEL=$(grep TEXT2SQL_MODEL .env | cut -d '=' -f2)
JUDGE_MODEL=$(grep JUDGE_MODEL .env | cut -d '=' -f2)

# Check if models exist using EXACT names
if ! ollama list | grep -q "$TEXT2SQL_MODEL"; then
  echo "Pulling $TEXT2SQL_MODEL (first time only)..."
  ollama pull $TEXT2SQL_MODEL
  if [ $? -eq 0 ]; then
    echo "$TEXT2SQL_MODEL pulled successfully"
  else
    echo "Failed to pull $TEXT2SQL_MODEL"
    exit 1
  fi
else
  echo "$TEXT2SQL_MODEL already exists"
fi

if ! ollama list | grep -q "$JUDGE_MODEL"; then
  echo "Pulling $JUDGE_MODEL (first time only)..."
  ollama pull $JUDGE_MODEL
  if [ $? -eq 0 ]; then
    echo "$JUDGE_MODEL pulled successfully"
  else
    echo "Failed to pull $JUDGE_MODEL"
    exit 1
  fi
else
  echo "$JUDGE_MODEL already exists"
fi

# Restart just the backend
echo -e "\n${YELLOW}Restarting backend container...${NC}"
docker compose up -d backend --no-deps

# Wait a moment and verify
sleep 3
echo -e "\n${YELLOW}=== Recent logs (should show model initialization) ===${NC}"
docker compose logs backend --tail=10 | grep -E "model.*initialized|using model|Model.*:" || echo "  (wait a moment for model to load)"

echo -e "\n${GREEN}Done!${NC}"