$ErrorActionPreference = "Continue"

Write-Host "=== git status --short ==="
git status --short

Write-Host "`n=== git diff --check ==="
git diff --check

Write-Host "`n=== git diff --stat ==="
git diff --stat

Write-Host "`n=== npm run build ==="
npm run build

Write-Host "`n=== npm run typecheck ==="
npm run typecheck

Write-Host "`n=== npm run lint ==="
npm run lint

Write-Host "`n=== npm test ==="
npm test

Write-Host "`n=== NOTIFICATION VARS CHECK ==="
Get-ChildItem backend -Recurse -Filter *.ts | Select-String -Pattern "NOTIFICATION_WORKER_INTERVAL_MS|NOTIFICATION_WORKER_BATCH_SIZE|NOTIFICATION_WORKER_LEASE_SECONDS|NOTIFICATION_MAX_ATTEMPTS" -Context 2,2

Write-Host "`n=== AUTOMATION VARS USAGE ==="
Select-String -Path backend\server.ts,backend\infrastructure\config\environment.ts,.env.example -Pattern "AUTOMATION_WORKER|AUTOMATION_MAX" -Context 2,3

Write-Host "`n=== git diff whatsapp-utils.ts ==="
git diff -- backend/infrastructure/notifications/whatsapp-utils.ts

Write-Host "`n=== git diff whatsapp-notification.channel.spec.ts ==="
git diff -- tests/unit/infrastructure/notifications/whatsapp-notification.channel.spec.ts

Write-Host "`n=== MIGRATION 0020 CHECK ==="
Select-String -Path backend\infrastructure\database\sqlite\migrations\0020-automation-execution-engine.ts -Pattern "next_attempt_at|attempt_count|max_attempts|action_pending|evaluated_no_match|LegacyAutomationEvent"

