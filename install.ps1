param()

$ErrorActionPreference = "Stop"
$LoaderDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppMarker = Join-Path $LoaderDir "package.json"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-JunctionTarget {
  param($Item)
  $t = $Item.Target
  if ($null -eq $t) { return "" }
  if ($t -is [array]) { $t = $t[0] }
  $t = [string]$t
  if (-not $t) { return "" }
  try { return (Resolve-Path -LiteralPath $t).Path } catch { return $t }
}

function Test-GameRoot {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  $exe = Join-Path $Dir "Sandustry.exe"
  $asar = Join-Path $Dir "resources\app.asar"
  $vanilla = Join-Path $Dir "resources\vanilla\app.asar"
  return (Test-Path -LiteralPath $exe) -and ((Test-Path -LiteralPath $asar) -or (Test-Path -LiteralPath $vanilla))
}

function Find-GameRoot {
  $beside = Split-Path -Parent $LoaderDir
  if (Test-GameRoot $beside) { return (Resolve-Path -LiteralPath $beside).Path }
  $steam = $null
  try {
    $steam = (Get-ItemProperty -Path "HKCU:\Software\Valve\Steam" -Name SteamPath -ErrorAction Stop).SteamPath
  } catch {}
  $libs = New-Object System.Collections.Generic.List[string]
  if ($steam) {
    $libs.Add($steam) | Out-Null
    $vdf = Join-Path $steam "steamapps\libraryfolders.vdf"
    if (Test-Path $vdf) {
      [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"') | ForEach-Object {
        $libs.Add(($_.Groups[1].Value -replace '\\\\', '\')) | Out-Null
      }
    }
  }
  foreach ($lib in $libs) {
    $guess = Join-Path $lib "steamapps\common\Sandustry"
    if (Test-GameRoot $guess) { return (Resolve-Path -LiteralPath $guess).Path }
  }
  foreach ($p in @(
    "${env:ProgramFiles(x86)}\Steam\steamapps\common\Sandustry",
    "$env:ProgramFiles\Steam\steamapps\common\Sandustry"
  )) {
    if (Test-GameRoot $p) { return (Resolve-Path -LiteralPath $p).Path }
  }
  throw "Could not find the game. Launch it once, quit, then run install again."
}

function Copy-Replace {
  param([string]$From, [string]$To)
  if (-not (Test-Path -LiteralPath $From)) { return }
  $destDir = Split-Path -Parent $To
  if (-not (Test-Path -LiteralPath $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  if (Test-Path -LiteralPath $To) {
    Remove-Item -LiteralPath $To -Recurse -Force
  }
  Copy-Item -LiteralPath $From -Destination $To -Recurse -Force
}

function Remove-LockedPath {
  param([string]$Path, [int]$Tries = 8)
  if (-not (Test-Path -LiteralPath $Path)) { return $true }
  $off = "$Path.off"
  for ($i = 1; $i -le $Tries; $i++) {
    try {
      if (Test-Path -LiteralPath $off) {
        Remove-Item -LiteralPath $off -Recurse -Force -ErrorAction SilentlyContinue
      }
      Move-Item -LiteralPath $Path -Destination $off -Force -ErrorAction Stop
      if (-not (Test-Path -LiteralPath $Path)) {
        Remove-Item -LiteralPath $off -Recurse -Force -ErrorAction SilentlyContinue
        return $true
      }
    } catch {}
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      if (-not (Test-Path -LiteralPath $Path)) { return $true }
    } catch {}
    Start-Sleep -Milliseconds (400 * $i)
  }
  return -not (Test-Path -LiteralPath $Path)
}

function Remove-Junction {
  param([string]$Path)
  cmd /c rmdir "$Path"
  if ($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $Path)) {
    throw "Could not remove $Path. Close anything using that path, then try again."
  }
}

if (-not (Test-Path $AppMarker)) { throw "package.json missing next to install.ps1" }

$running = @(Get-Process -Name "Sandustry" -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  throw "The game is still running (PID $($running.Id -join ', ')). Quit it, then run install again."
}

$root = Find-GameRoot
$res = Join-Path $root "resources"
$appLink = Join-Path $res "app"
$asar = Join-Path $res "app.asar"
$unpacked = Join-Path $res "app.asar.unpacked"
$vanillaDir = Join-Path $res "vanilla"
$stockAsar = Join-Path $vanillaDir "app.asar"
$stockUnpacked = Join-Path $vanillaDir "app.asar.unpacked"
$loaderResolved = (Resolve-Path $LoaderDir).Path
Write-Host "Game: $root"
Write-Host "Loader: $loaderResolved"

$needsAdmin = $false
try {
  $probe = Join-Path $res ".sandforge-write-test"
  [IO.File]::WriteAllText($probe, "ok")
  Remove-Item -LiteralPath $probe -Force
} catch {
  $needsAdmin = $true
}

if ($needsAdmin -and -not (Test-IsAdmin)) {
  Write-Host "Requesting Administrator..."
  $p = Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Wait -PassThru
  exit $p.ExitCode
}

if (Test-Path -LiteralPath $asar) {
  Write-Host "Copying stock app.asar to resources\vanilla."
  New-Item -ItemType Directory -Path $vanillaDir -Force | Out-Null
  if (-not (Test-Path -LiteralPath $stockAsar)) {
    Copy-Replace -From $asar -To $stockAsar
  }
  if ((Test-Path -LiteralPath $unpacked) -and -not (Test-Path -LiteralPath $stockUnpacked)) {
    Copy-Replace -From $unpacked -To $stockUnpacked
  }
} elseif (-not (Test-Path -LiteralPath $stockAsar)) {
  throw "Could not find resources\app.asar or resources\vanilla\app.asar."
}

if (-not (Test-Path -LiteralPath $stockAsar)) {
  throw "Stock game asar missing after copy ($stockAsar)."
}

if (Test-Path -LiteralPath $asar) {
  Write-Host "Removing resources\app.asar so Electron loads resources\app."
  if (-not (Remove-LockedPath $asar)) {
    throw "Could not remove resources\app.asar (file in use). Close programs that have the game folder open, then run install again. A copy is already in resources\vanilla\app.asar."
  }
}
if (-not (Test-Path -LiteralPath $asar) -and (Test-Path -LiteralPath $unpacked) -and (Test-Path -LiteralPath $stockUnpacked)) {
  Remove-LockedPath $unpacked | Out-Null
}

if (Test-Path -LiteralPath $appLink) {
  $item = Get-Item -LiteralPath $appLink -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    $target = Get-JunctionTarget $item
    if ($target -and ($target -ieq $loaderResolved)) {
      Write-Host "Junction already points at this loader."
    } else {
      Write-Host "Replacing existing junction -> $target"
      Remove-Junction $appLink
      New-Item -ItemType Junction -Path $appLink -Target $loaderResolved | Out-Null
    }
  } else {
    throw "resources\app already exists and is not a junction. Remove it manually if you created it."
  }
} else {
  New-Item -ItemType Junction -Path $appLink -Target $loaderResolved | Out-Null
}

$made = Get-Item -LiteralPath $appLink -Force
$madeTarget = Get-JunctionTarget $made
if (-not ($made.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($madeTarget -ine $loaderResolved)) {
  throw "Install failed: resources\app did not point at the loader (got '$madeTarget')."
}
if (Test-Path -LiteralPath $asar) {
  throw "Install failed: resources\app.asar is still present. Electron would ignore the loader."
}

Set-Content -Path (Join-Path $LoaderDir "installed.json") -Value (@{
  gameRoot = $root
  stockAsar = $stockAsar
  at = (Get-Date).ToString("o")
} | ConvertTo-Json)
Write-Host "Installed. Launch from Steam."
Write-Host "F6 relaunches the loader."
