# Invia su GitHub i commit locali (su Render parte un nuovo deploy automatico).
# Uso:  .\git_push.ps1
# Nota: fa SOLO la push. Le modifiche non ancora committate non vengono inviate.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Avviso se ci sono modifiche non committate (non vengono inviate)
$pending = git status --porcelain
if ($pending) {
    Write-Host 'Attenzione: ci sono modifiche non committate che NON verranno inviate:' -ForegroundColor Yellow
    $pending | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

$branch = git branch --show-current
Write-Host "Push del branch '$branch' su origin..."
git push origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Push fallita.' }
Write-Host 'Push completata.' -ForegroundColor Green
