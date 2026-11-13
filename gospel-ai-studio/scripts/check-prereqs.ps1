# Gospel AI Studio - Windows prerequisite check (read-only; installs nothing).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\check-prereqs.ps1

$ok = $true
function Report($name, $found, $detail, $fix) {
    if ($found) {
        Write-Host ("[ OK ] {0,-26} {1}" -f $name, $detail) -ForegroundColor Green
    } else {
        Write-Host ("[MISS] {0,-26} {1}" -f $name, $fix) -ForegroundColor Yellow
        $script:ok = $false
    }
}
function Version-Of($cmd, $arg) {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $c) { return $null }
    try { return (& $cmd $arg 2>$null | Select-Object -First 1) } catch { return $null }
}

Write-Host "Gospel AI Studio - prerequisite check`n"

$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1)
$ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
Write-Host ("System: {0} (build {1}), {2}, {3} GB RAM`n" -f $os.Caption, $os.BuildNumber, $cpu.Name.Trim(), $ramGb)

$node = Version-Of "node" "--version"
$nodeOk = $false
if ($node -match "v(\d+)\.") { $nodeOk = [int]$Matches[1] -ge 20 }
Report "Node.js 20+" $nodeOk $node "Install Node.js LTS: winget install OpenJS.NodeJS.LTS"

$npm = Version-Of "npm" "--version"
Report "npm" ($null -ne $npm) $npm "Comes with Node.js"

$rustc = Version-Of "rustc" "--version"
Report "Rust (rustc)" ($null -ne $rustc) $rustc "Install Rust: winget install Rustlang.Rustup  (then: rustup default stable-msvc)"

$cargo = Version-Of "cargo" "--version"
Report "Cargo" ($null -ne $cargo) $cargo "Comes with rustup"

$host_triple = $null
if ($rustc) { $host_triple = (& rustc -vV | Select-String "host:").ToString().Split(" ")[1] }
Report "Rust MSVC toolchain" ($host_triple -like "*msvc*") $host_triple "Run: rustup default stable-msvc"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vc = $null
if (Test-Path $vswhere) {
    $vc = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName
}
Report "MSVC C++ build tools" ($null -ne $vc -and $vc -ne "") $vc "Install 'Desktop development with C++': winget install Microsoft.VisualStudio.2022.BuildTools"

$wv = $null
foreach ($key in @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")) {
    if (Test-Path $key) { $wv = (Get-ItemProperty $key).pv; break }
}
Report "WebView2 runtime" ($null -ne $wv) $wv "Install: winget install Microsoft.EdgeWebView2Runtime"

$ff = Version-Of "ffmpeg" "-version"
Report "FFmpeg (runtime)" ($null -ne $ff) $ff "Optional for development; needed for thumbnails/renders: winget install Gyan.FFmpeg"

$ffp = Version-Of "ffprobe" "-version"
Report "FFprobe (runtime)" ($null -ne $ffp) $ffp "Installed together with FFmpeg"

Write-Host ""
if ($ok) {
    Write-Host "All prerequisites found. Next: npm install; npm run app:dev" -ForegroundColor Green
} else {
    Write-Host "Install the missing items above, open a NEW terminal, and run this check again." -ForegroundColor Yellow
}
