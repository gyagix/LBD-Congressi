param(
    [Parameter(Mandatory=$true)]
    [string]$RepoPath,
    [Parameter(Mandatory=$true)]
    [string]$OneDrivePath
)

# File da escludere oltre a .git e .vscode
$ExcludedFiles = @("RepoToOneDrive.ps1","OneDriveToRepo.ps1","Istruzioni_powershell.txt",".gitignore","LBD-Congressi.code-workspace")

function Copy-FileWithPrompt {
    param($source, $destination)
    if (Test-Path $destination) {
        $srcTime = (Get-Item $source).LastWriteTime
        $dstTime = (Get-Item $destination).LastWriteTime
        if ($dstTime -gt $srcTime) {
            $choice = Read-Host "Conflitto: $destination è più recente. Sovrascrivere? (S/N)"
            if ($choice -ne "S") { return }
        }
    }
    Copy-Item $source $destination -Force
}

function Sync-File {
    param($filePath)
    $fileName = Split-Path $filePath -Leaf
    # Ignora .git, .vscode e gli script
    if ($filePath -like "*.git*" -or $filePath -like "*\.vscode\*" -or $ExcludedFiles -contains $fileName) { return }
    $relative = Resolve-Path $filePath -Relative -RelativeBase $RepoPath
    $dest = Join-Path $OneDrivePath $relative
    $destDir = Split-Path $dest -Parent
    if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
    Copy-FileWithPrompt $filePath $dest
}

# Setup FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $RepoPath
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.*"
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite'

$action = {
    $path = $Event.SourceEventArgs.FullPath
    Sync-File $path
    Write-Host "Sync automatico: $path -> OneDrive"
}

Register-ObjectEvent $watcher Changed -Action $action
Register-ObjectEvent $watcher Created -Action $action

Write-Host "Monitoring changes in $RepoPath -> $OneDrivePath"
Write-Host "Premi Ctrl+C per fermare."

while ($true) { Start-Sleep -Seconds 1 }