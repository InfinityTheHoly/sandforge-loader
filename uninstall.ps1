param()

$ErrorActionPreference = "Stop"
$LoaderDir = Split-Path -Parent $MyInvocation.MyCommand.Path

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
  $installed = Join-Path $LoaderDir "installed.json"
  if (Test-Path $installed) {
    try {
      $obj = Get-Content $installed -Raw | ConvertFrom-Json
      if ($obj.gameRoot -and (Test-GameRoot $obj.gameRoot)) {
        return (Resolve-Path -LiteralPath $obj.gameRoot).Path
      }
    } catch {}
  }
  $beside = Split-Path -Parent $LoaderDir
  if (Test-GameRoot $beside) { return (Resolve-Path -LiteralPath $beside).Path }
  $steam = $null
  try {
    $steam = (Get-ItemProperty -Path "HKCU:\Software\Valve\Steam" -Name SteamPath -ErrorAction Stop).SteamPath
  } catch {}
  if ($steam) {
    $guess = Join-Path $steam "steamapps\common\Sandustry"
    if (Test-GameRoot $guess) { return (Resolve-Path -LiteralPath $guess).Path }
  }
  foreach ($p in @(
    "${env:ProgramFiles(x86)}\Steam\steamapps\common\Sandustry",
    "$env:ProgramFiles\Steam\steamapps\common\Sandustry"
  )) {
    if (Test-GameRoot $p) { return (Resolve-Path -LiteralPath $p).Path }
  }
  throw "Could not find the game."
}

function Remove-Junction {
  param([string]$Path)
  cmd /c rmdir "$Path"
  return ($LASTEXITCODE -eq 0) -and -not (Test-Path -LiteralPath $Path)
}

$running = @(Get-Process -Name "Sandustry" -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  throw "The game is still running (PID $($running.Id -join ', ')). Quit it, then run uninstall again."
}

$root = Find-GameRoot
$res = Join-Path $root "resources"
$appLink = Join-Path $res "app"
$asar = Join-Path $res "app.asar"
$unpacked = Join-Path $res "app.asar.unpacked"
$vanillaDir = Join-Path $res "vanilla"
$stockAsar = Join-Path $vanillaDir "app.asar"
$stockUnpacked = Join-Path $vanillaDir "app.asar.unpacked"

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

if (Test-Path -LiteralPath $appLink) {
  $item = Get-Item -LiteralPath $appLink -Force
  if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "resources\app is not a junction. Not removing."
  }
  $target = Get-JunctionTarget $item
  $ours = (Resolve-Path $LoaderDir).Path
  if ($target -and ($target -ine $ours)) {
    throw "resources\app points at $target, not this loader. Aborting."
  }
  if (-not (Remove-Junction $appLink)) {
    throw "Could not remove $appLink (path in use). Close programs that have the game folder open, then try again."
  }
}

if (Test-Path -LiteralPath $stockAsar) {
  if (Test-Path -LiteralPath $asar) {
    Write-Host "Stock app.asar is already in place. Removing leftover vanilla copy."
    Remove-Item -LiteralPath $vanillaDir -Recurse -Force
  } else {
    Write-Host "Restoring stock app.asar from resources\vanilla."
    try {
      Move-Item -LiteralPath $stockAsar -Destination $asar
    } catch {
      throw "Could not restore resources\app.asar (file in use). Close programs that have the game folder open, then try again."
    }
    if (Test-Path -LiteralPath $stockUnpacked) {
      Move-Item -LiteralPath $stockUnpacked -Destination $unpacked -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $vanillaDir) {
      Remove-Item -LiteralPath $vanillaDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Remove-Item -LiteralPath (Join-Path $LoaderDir "installed.json") -Force -ErrorAction SilentlyContinue
Write-Host "Uninstalled. Steam launch is stock again."
