param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Target
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeHome = Join-Path $projectRoot ".tools\node-v22.23.1-win-x64"
$nodeExecutable = Join-Path $nodeHome "node.exe"

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    throw "Node 22 was not found at: $nodeHome"
}

$deployment = if ($Target -eq "dev") {
    @{
        Project = "flowbutler-dev"
        Config = "firebase-config.dev.js"
        Label = "development"
    }
} else {
    @{
        Project = "flowbutler"
        Config = "firebase-config.prod.js"
        Label = "production"
    }
}

$env:Path = "$nodeHome;$env:Path"
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "30"

Copy-Item `
    -LiteralPath (Join-Path $projectRoot "public\js\$($deployment.Config)") `
    -Destination (Join-Path $projectRoot "public\js\firebase-config.js") `
    -Force

$nodeVersion = (& $nodeExecutable --version).Trim()
if ($nodeVersion -notmatch "^v22\.") {
    throw "Node 22 is required for deployment. Current version: $nodeVersion"
}

Write-Host "Deploying $($deployment.Label) app to $($deployment.Project) with $nodeVersion..."
firebase deploy --project $deployment.Project --only "functions,hosting,firestore:rules"
exit $LASTEXITCODE