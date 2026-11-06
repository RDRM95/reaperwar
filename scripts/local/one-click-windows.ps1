# Reaper War Simulator — Windows one-click Local Edition.
# PowerShell 5.1+; no administrator privileges, Git install, or global Node install.
# The companion PLAY-REAPERWAR.cmd downloads this from the project's own
# public GitHub repository and runs it with the current user's permissions.
param([switch]$NoUpdate)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$homeDir = Join-Path $env:LOCALAPPDATA 'ReaperWar'
$gameDir = Join-Path $homeDir 'game'
$previousDir = Join-Path $homeDir 'previous'
$incomingDir = Join-Path $homeDir 'incoming'
$unpackedDir = Join-Path $homeDir 'unpacked'
$toolsDir = Join-Path $homeDir 'tools'
$nodeDir = Join-Path $toolsDir 'node'
$nodeExe = Join-Path $nodeDir 'node.exe'
$stateFile = Join-Path $homeDir 'installed-commit.txt'
$logFile = Join-Path $homeDir 'launcher-last-run.log'
$sourceZip = Join-Path $homeDir 'source.zip'
$sourceApi = 'https://api.github.com/repos/RDRM95/reaperwar/commits/main'
$sourceArchive = 'https://codeload.github.com/RDRM95/reaperwar/zip/refs/heads/main'
$userAgent = 'ReaperWar-OneClick/1.0'

function Say([string]$message) {
  Write-Host ('[Reaper War] ' + $message) -ForegroundColor Cyan
}

function Download-File([string]$uri, [string]$destination) {
  Invoke-WebRequest -Uri $uri -OutFile $destination -UseBasicParsing -UserAgent $userAgent
}

function Compatible-Node([string]$executable) {
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { return $false }
  try {
    # Use direct native output rather than a pipeline, which can obscure
    # process exit status on some Windows PowerShell configurations.
    $raw = & $executable --version 2>&1
    $status = $LASTEXITCODE
    if ($status -ne 0) { return $false }
    $versionText = ([string]($raw | Select-Object -First 1)).Trim()
    $match = [regex]::Match($versionText, '^v([0-9]+)\.([0-9]+)\.([0-9]+)$')
    if (-not $match.Success) { return $false }
    $major = [int]$match.Groups[1].Value
    $minor = [int]$match.Groups[2].Value
    $compatible = ($major -ge 23) -or ($major -eq 22 -and $minor -ge 12) -or ($major -eq 20 -and $minor -ge 19)
    return [bool]$compatible
  } catch {
    return $false
  }
}

function Install-PortableNode {
  Say 'Setting up Node.js locally (no system installation needed)...'
  $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UserAgent $userAgent
  $release = $releases | Where-Object {
    $_.lts -ne $false -and
    $_.version -match '^v([0-9]+)\.([0-9]+)\.' -and
    [int]$Matches[1] -ge 22 -and
    $_.files -contains "win-$architecture-zip"
  } | Select-Object -First 1
  if ($null -eq $release) { throw 'No compatible official Node.js LTS Windows ZIP was found.' }

  $version = [string]$release.version
  $filename = "node-$version-win-$architecture.zip"
  $base = "https://nodejs.org/dist/$version"
  $archive = Join-Path $homeDir $filename
  $extract = Join-Path $homeDir 'node-unpacked'
  $staging = Join-Path $toolsDir 'node-next'
  $backup = Join-Path $toolsDir 'node-previous'

  $manifest = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing -UserAgent $userAgent).Content
  $pattern = '(?m)^\s*([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($filename) + '\s*$'
  $match = [regex]::Match([string]$manifest, $pattern)
  if (-not $match.Success) { throw 'The official Node.js SHA-256 manifest did not contain the expected archive.' }
  $expected = $match.Groups[1].Value.ToLowerInvariant()

  try {
    Download-File "$base/$filename" $archive
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'Node.js archive failed SHA-256 verification.' }
    if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    $candidate = Get-ChildItem -LiteralPath $extract -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe') } |
      Select-Object -First 1
    if ($null -eq $candidate) { throw 'The Node.js archive did not contain node.exe.' }
    Move-Item -LiteralPath $candidate.FullName -Destination $staging
    $candidateExe = Join-Path $staging 'node.exe'
    try {
      $candidateOutput = & $candidateExe --version 2>&1
      $candidateExit = $LASTEXITCODE
      $candidateVersion = ([string]($candidateOutput | Select-Object -First 1)).Trim()
    } catch {
      throw ('The downloaded Node.js could not run: ' + $_.Exception.Message)
    }
    Say "Official Node.js archive: $version; extracted runtime: $candidateVersion (exit $candidateExit)."
    # The archive already passed the official SHA-256 check. Compare its
    # runtime's version directly with the advertised official release.
    if ($candidateExit -ne 0 -or $candidateVersion -ne $version) {
      throw "Node.js executable version check failed: expected $version, got '$candidateVersion' (exit $candidateExit)."
    }

    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
    if (Test-Path -LiteralPath $nodeDir) { Move-Item -LiteralPath $nodeDir -Destination $backup }
    try {
      Move-Item -LiteralPath $staging -Destination $nodeDir
    } catch {
      if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $nodeDir }
      throw
    }
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
  } finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
  }
  Say "Portable Node.js $version is ready."
}

function Recover-PreviousInstall {
  # If Windows was restarted during an update, recover the old game and profile.
  if (-not (Test-Path -LiteralPath $previousDir)) { return }
  if (-not (Test-Path -LiteralPath $gameDir)) {
    Move-Item -LiteralPath $previousDir -Destination $gameDir
    return
  }
  foreach ($item in @('.local-profile', 'node_modules', 'dist')) {
    $old = Join-Path $previousDir $item
    $current = Join-Path $gameDir $item
    if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $current)) {
      Move-Item -LiteralPath $old -Destination $current
    }
  }
  Remove-Item -LiteralPath $previousDir -Recurse -Force
}

function Update-Game([string]$commit) {
  Say 'Downloading the latest original Reaper War build...'
  if (Test-Path -LiteralPath $unpackedDir) { Remove-Item -LiteralPath $unpackedDir -Recurse -Force }
  if (Test-Path -LiteralPath $incomingDir) { Remove-Item -LiteralPath $incomingDir -Recurse -Force }
  try {
    Download-File $sourceArchive $sourceZip
    Expand-Archive -LiteralPath $sourceZip -DestinationPath $unpackedDir -Force
    $candidate = Get-ChildItem -LiteralPath $unpackedDir -Directory |
      Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json')) -and
                     (Test-Path -LiteralPath (Join-Path $_.FullName 'scripts\local\launch.mjs')) } |
      Select-Object -First 1
    if ($null -eq $candidate) { throw 'The game download is incomplete or lacks its local launcher.' }
    Move-Item -LiteralPath $candidate.FullName -Destination $incomingDir

    $hadPrevious = Test-Path -LiteralPath $gameDir
    if ($hadPrevious) { Move-Item -LiteralPath $gameDir -Destination $previousDir }
    try {
      Move-Item -LiteralPath $incomingDir -Destination $gameDir
      if ($hadPrevious) {
        # Keep browser save data, cached dependencies and the previous build.
        foreach ($item in @('.local-profile', 'node_modules', 'dist')) {
          $old = Join-Path $previousDir $item
          if (Test-Path -LiteralPath $old) { Move-Item -LiteralPath $old -Destination (Join-Path $gameDir $item) }
        }
      }
    } catch {
      # Restore the entire earlier installation, including its save profile.
      if ($hadPrevious -and (Test-Path -LiteralPath $previousDir)) {
        foreach ($item in @('.local-profile', 'node_modules', 'dist')) {
          $moved = Join-Path $gameDir $item
          $old = Join-Path $previousDir $item
          if ((Test-Path -LiteralPath $moved) -and -not (Test-Path -LiteralPath $old)) {
            Move-Item -LiteralPath $moved -Destination $old
          }
        }
      }
      if (Test-Path -LiteralPath $gameDir) { Remove-Item -LiteralPath $gameDir -Recurse -Force }
      if ($hadPrevious -and (Test-Path -LiteralPath $previousDir)) {
        Move-Item -LiteralPath $previousDir -Destination $gameDir
      }
      throw
    }

    if ($hadPrevious -and (Test-Path -LiteralPath $previousDir)) {
      Remove-Item -LiteralPath $previousDir -Recurse -Force
    }
    if ($commit) { Set-Content -LiteralPath $stateFile -Value $commit -NoNewline -Encoding ASCII }
    Say 'Game files are up to date. Local save data has been kept.'
  } finally {
    if (Test-Path -LiteralPath $sourceZip) { Remove-Item -LiteralPath $sourceZip -Force }
    if (Test-Path -LiteralPath $unpackedDir) { Remove-Item -LiteralPath $unpackedDir -Recurse -Force }
  }
}

function Main {
  if (-not (Test-Path -LiteralPath $homeDir)) { New-Item -ItemType Directory -Path $homeDir | Out-Null }
  if (-not (Test-Path -LiteralPath $toolsDir)) { New-Item -ItemType Directory -Path $toolsDir | Out-Null }
  Say ('Diagnostic log: ' + $logFile)
  Recover-PreviousInstall

  $installed = (Test-Path -LiteralPath (Join-Path $gameDir 'package.json'))
  $localCommit = if (Test-Path -LiteralPath $stateFile) {
    (Get-Content -LiteralPath $stateFile -Raw).Trim()
  } else { '' }
  $remoteCommit = ''
  if (-not $NoUpdate) {
    try {
      $info = Invoke-RestMethod -Uri $sourceApi -UserAgent $userAgent
      $remoteCommit = [string]$info.sha
    } catch {
      Say 'Online update check unavailable; an existing installation can still run.'
    }
  }

  $updated = $false
  if (-not $installed -or ($remoteCommit -and $remoteCommit -ne $localCommit)) {
    try {
      Update-Game $remoteCommit
      $updated = $true
    } catch {
      if (-not $installed) { throw }
      Write-Warning ('Update failed; starting existing build. ' + $_.Exception.Message)
    }
  } else {
    Say 'Game is installed. No update needed.'
  }

  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  $systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  $useSystem = $null -ne $systemNode -and $null -ne $systemNpm -and (Compatible-Node $systemNode.Source)
  if ($useSystem) {
    $runtime = $systemNode.Source
    Say 'Using the compatible Node.js already installed on this PC.'
  } else {
    if (-not (Compatible-Node $nodeExe) -or -not (Test-Path -LiteralPath (Join-Path $nodeDir 'npm.cmd'))) {
      Install-PortableNode
    }
    $env:PATH = $nodeDir + ';' + $env:PATH
    $runtime = $nodeExe
  }

  Say 'Starting Local Edition on this PC...'
  Say 'First launch will install game packages and build the game automatically.'
  Say 'The game opens in Chrome or Edge; close the game window to stop it.'
  Push-Location $gameDir
  try {
    $launch = Join-Path $gameDir 'scripts\local\launch.mjs'
    $arguments = @($launch)
    if ($updated) { $arguments += '--rebuild' }
    $started = Get-Date
    & $runtime @arguments
    if ($LASTEXITCODE -ne 0) { throw "The local game launcher exited with code $LASTEXITCODE." }
    if (((Get-Date) - $started).TotalSeconds -lt 8) {
      throw 'The game process ended immediately without staying open. The launcher is no longer closing this error window: check the messages above.'
    }
    Say 'Local Edition session ended.'
  } finally {
    Pop-Location
  }
}

$exitCode = 0
$transcriptStarted = $false
try {
  if (-not (Test-Path -LiteralPath $homeDir)) { New-Item -ItemType Directory -Path $homeDir | Out-Null }
  try {
    Start-Transcript -LiteralPath $logFile -Append -ErrorAction Stop | Out-Null
    $transcriptStarted = $true
  } catch {
    Write-Warning ('Could not start the diagnostic log: ' + $_.Exception.Message)
  }
  Main
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'The game did not start successfully.' -ForegroundColor Yellow
  Write-Host ('Diagnostic log: ' + $logFile)
  Write-Host 'Your existing save profile is kept whenever an update fails.'
  Write-Host 'If this is your first launch, check your internet connection.'
} finally {
  if ($transcriptStarted) { Stop-Transcript | Out-Null }
}
exit $exitCode
