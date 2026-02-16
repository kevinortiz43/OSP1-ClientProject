#!/bin/bash
# switching models overwrites .env file
# make executable: chmod +x switch-model.sh
# run script in terminal: ./switch-model.sh

if [ "$1" == "arctic" ]; then
  cat > .env << 'ENV_CONTENT'
# Arctic Text2SQL + phi4-reasoning Judge
TEXT2SQL_MODEL=arctic-text2sql
JUDGE_MODEL=phi4-reasoning
ENV_CONTENT
  echo "Switched to Arctic model (judge: phi4-reasoning)"

elif [ "$1" == "sqlcoder" ]; then
  cat > .env << 'ENV_CONTENT'
# SQLCoder Text2SQL + phi4-reasoning Judge
TEXT2SQL_MODEL=sqlcoder
JUDGE_MODEL=phi4-reasoning
ENV_CONTENT
  echo "Switched to SQLCoder model (judge: phi4-reasoning)"

else
  echo "Usage: ./switch-model.sh [arctic|sqlcoder]"
  exit 1
fi

# Show new .env content
echo "=== New .env file ==="
cat .env
echo "====================="

# Restart just the backend
docker compose up -d backend --no-deps

# Verify the switch
sleep 2
docker compose logs backend --tail=20 | grep -i "model.*initialized\|using model" | tail -3
