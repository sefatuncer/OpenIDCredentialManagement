# Credo-TS Setup Script for Windows
# Bu script Visual Studio Build Tools kurulumu ve Credo native dependencies kurulumunu yapar

Write-Host "=== Credo-TS Windows Setup ===" -ForegroundColor Cyan
Write-Host ""

# Admin kontrolu
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "UYARI: Bu script admin yetkisi gerektiriyor!" -ForegroundColor Yellow
    Write-Host "PowerShell'i 'Run as Administrator' ile acin ve tekrar calistirin." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Devam etmek icin Enter'a basin"
}

# Visual Studio Build Tools kontrol
Write-Host "Visual Studio Build Tools kontrol ediliyor..." -ForegroundColor Yellow

$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = $false

if (Test-Path $vsWhere) {
    $installPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($installPath) {
        Write-Host "Visual Studio Build Tools bulundu: $installPath" -ForegroundColor Green
        $hasBuildTools = $true
    }
}

if (-not $hasBuildTools) {
    Write-Host "Visual Studio Build Tools bulunamadi. Kurulum baslatiliyor..." -ForegroundColor Yellow

    # vs_BuildTools.exe indir
    $vsInstallerUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $vsInstallerPath = "$env:TEMP\vs_BuildTools.exe"

    Write-Host "Visual Studio Build Tools indiriliyor..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $vsInstallerUrl -OutFile $vsInstallerPath

    Write-Host "Kurulum baslatiliyor (bu islem uzun surebilir)..." -ForegroundColor Yellow
    Write-Host "Kurulum tamamlandiginda bu pencere otomatik kapanacak." -ForegroundColor Yellow

    # Kurulum parametreleri
    $installArgs = @(
        "--quiet",
        "--wait",
        "--norestart",
        "--nocache",
        "--add", "Microsoft.VisualStudio.Workload.VCTools",
        "--add", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "--add", "Microsoft.VisualStudio.Component.Windows10SDK.19041",
        "--includeRecommended"
    )

    Start-Process -FilePath $vsInstallerPath -ArgumentList $installArgs -Wait

    Write-Host "Visual Studio Build Tools kurulumu tamamlandi!" -ForegroundColor Green
}

# Node.js versiyonu kontrol
Write-Host ""
Write-Host "Node.js versiyonu kontrol ediliyor..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "Node.js: $nodeVersion" -ForegroundColor Green

# Python kontrolu
Write-Host ""
Write-Host "Python kontrol ediliyor..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version
    Write-Host "Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python bulunamadi. Python 3.x kurulmali." -ForegroundColor Red
}

# npm rebuild
Write-Host ""
Write-Host "npm paketleri rebuild ediliyor..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\.."
npm rebuild

# Askar kurulumu
Write-Host ""
Write-Host "@hyperledger/aries-askar-nodejs kuruluyor..." -ForegroundColor Yellow
npm install @hyperledger/aries-askar-nodejs

Write-Host ""
Write-Host "=== Kurulum Tamamlandi ===" -ForegroundColor Green
Write-Host ""
Write-Host "Simdi 'npm run dev' ile uygulamayi baslatin." -ForegroundColor Cyan

Read-Host "Cikis icin Enter'a basin"
