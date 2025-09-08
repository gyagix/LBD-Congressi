param(
    [Parameter(Mandatory=$true)]
    [string]$RepoPath,
    [Parameter(Mandatory=$true)]
    [string]$OneDrivePath
)

$ExcludedFiles = @("RepoToOneDrive.ps1","OneDriveToRepo.ps1","Istruzioni_powershell.txt",".gitignore","LBD-Congressi.code-workspace")

function Copy-FileWithPrompt {
    param($source, $destination)
    $fileName = Split-Path $destination -Leaf
    if ($destination -like "*.git*" -or $destination -like "*\.vscode\*" -or $ExcludedFiles -contains $fileName) { return }
    if (Test-Path $destination) {
        $srcTime = (Get-Item $source).LastWriteTime
        $dstTime = (Get-Item $destination).LastWriteTime
        if ($dstTime -gt $srcTime) {
            $choice = Read-Host "Conflitto: $destination è più recente. Sovrascrivere? (S/N)"
            if ($choice -ne "S") { return }
        }
    }
    $destDir = Split-Path $destination -Parent
    if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
    Copy-Item $source $destination -Force
}

function Sync-Dir($sourceDir, $targetDir) {
    Get-ChildItem $sourceDir -Recurse -File | Where-Object {
        $_.FullName -notmatch "\\.git" -and $_.FullName -notmatch "\\.vscode" -and ($ExcludedFiles -notcontains $_.Name)
    } | ForEach-Object {
        $relative = $_.FullName.Substring($sourceDir.Length+1)
        $dest = Join-Path $targetDir $relative
        Copy-FileWithPrompt $_.FullName $dest
    }
}

Sync-Dir $OneDrivePath $RepoPath
Write-Host "Sync manuale completato: OneDrive -> Repo"