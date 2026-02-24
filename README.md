# React + TypeScript + Vite + Docker + PostgreSQL

## This template provides a minimal setup to get the dockerized application running.

# Executing "npm run devo" command for application startup

1. Make sure Docker Engine is running either through Docker Engine itself or with an active Docker Desktop
2. In the root directory (e.g C:\username\Project) execute command "npm run devo" which will execute "npm install" which will install all necessary node modules and dev dependencies. Then it will execute "docker compose up -d" in the command line interface (CLI) which will build and start all services defined in the docker-compose.yml file (including frontend, backend, and database), install dependencies as specified in the Dockerfile during the build process.
3. The following scripts will automatically execute in the CLI:
   a. "npm run csv-agno" which runs src/server/sql_db/convertData_agnostic.ts file that converts all JSON files in src/server/data folder to [originalFileName].csv files
   b. "npm run seed-agno" which runs src/server/sql_db/seed_agnostic.ts that seeds the local postgreSQL database on port 5432 with data from all converted .csv files.
   c. "npm run types-agno" which runs src/server/sql_db/types-agno that generates Typescript schemas from database data
4. The docker container monitor for file changes to automatically sync updates to running containers without manual rebuilds.
5. If you run into an error during Step #2 due to postgres already occupying port 5432, make sure to stop postgres to free up port 5432. Then run "npm run devo" again. (On Linux, you might have to run "sudo systemctl stop postgresql" to free up port 5432. If you get "Error connecting to Docker PostgreSQL: ECONNRESET" after freeing up port 5432, run "npm run devo" again.)
6. To see all scripts, see package.json file.
7. You can visit http://localhost:5173/ to view the frontend, i.e. active application, which shows Trust Controls and FAQs with the appropriate data fetched from the offline postgreSQL database.
8. A simple keyword search is displayed at the top of the page, and it should be used for filtering categories.
9. Visit http://localhost:3000/api/[endpoint] to view the backend (see router.ts for all endpoints.)
10. Visit http://localhost:5050/browser to view pgAdmin (local postgreSQL database).
11. Note: Original data has been modified to include category fields for every table.

# Executing "npm run tear" command for docker container teardown

12. This will run "docker compose down" in the CLI.
13. Then it will run "docker system prune –all --volumes –force"  which removes all unused containers, networks, images (both dangling and unused), and optionally, volumes.
    **IMPORTANT: If you have other Docker containers and volumes present for other projects, be very careful when using this command since it will delete ALL docker containers regardless of project.**
