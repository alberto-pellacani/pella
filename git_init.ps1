# Primo collegamento del progetto a GitHub e prima push.
# Uso:  .\git_init.ps1
# Si puo' rieseguire senza problemi: salta i passaggi gia' fatti.

$ErrorActionPreference = 'Stop'
$Remote = 'https://github.com/alberto-pellacani/pella.git'
$Branch = 'main'

Set-Location -Path $PSScriptRoot

function Invoke-Git {
    git @args
    if ($LASTEXITCODE -ne 0) { throw "Comando fallito: git $($args -join ' ')" }
}

# 1. Repository locale
if (-not (Test-Path '.git')) {
    Write-Host 'Inizializzo il repository git...'
    Invoke-Git init -b $Branch
} else {
    Write-Host 'Repository git gia'' presente.'
}

# 2. Branch principale chiamato "main"
$current = (git branch --show-current)
if ($current -and $current -ne $Branch) {
    Write-Host "Rinomino il branch '$current' in '$Branch'..."
    Invoke-Git branch -M $Branch
}

# 3. Remote "origin"
$existing = (git remote) -contains 'origin'
if ($existing) {
    Write-Host "Aggiorno origin -> $Remote"
    Invoke-Git remote set-url origin $Remote
} else {
    Write-Host "Aggiungo origin -> $Remote"
    Invoke-Git remote add origin $Remote
}

# 4. Commit delle modifiche presenti (il file .env e' escluso da .gitignore)
Invoke-Git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git rev-parse --verify --quiet HEAD | Out-Null
    $message = if ($LASTEXITCODE -eq 0) { 'Aggiornamento prima della prima push' } else { 'first commit' }
    Write-Host "Commit: $message"
    Invoke-Git commit -m $message
} else {
    Write-Host 'Nessuna modifica da committare.'
}

# 5. Controllo di sicurezza: .env non deve mai finire su GitHub
if (git ls-files .env) { throw 'ATTENZIONE: .env e'' tracciato da git! Rimuovilo con: git rm --cached .env' }

# 6. Prima push, collegando il branch locale a quello remoto
Write-Host "Push su origin/$Branch..."
Invoke-Git push -u origin $Branch
Write-Host 'Fatto. Da ora in poi usa .\git_push.ps1' -ForegroundColor Green
