@echo off
REM Temporary verification runner (safe to delete).
REM Points the API + e2e suite at the local docker Postgres/Redis instead of the
REM developer's remote Supabase instance, then rebuilds the API and runs
REM Playwright (which boots the API and both Vite dev servers itself).
cd /d D:\glambot
set "DATABASE_URL=postgresql://glambot:glambot@localhost:5432/glambot?schema=public"
set "DIRECT_URL=%DATABASE_URL%"
set "REDIS_URL=redis://localhost:6379"
set "QUEUE_ENABLED=true"
call pnpm --filter api build > D:\glambot\e2e.log 2>&1
call pnpm --filter e2e test >> D:\glambot\e2e.log 2>&1
echo EXITCODE:%ERRORLEVEL% >> D:\glambot\e2e.log
