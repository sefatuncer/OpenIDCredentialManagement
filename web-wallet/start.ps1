$env:PATH = "C:\nodejs;" + $env:PATH
Set-Location "C:\Users\sefa.tuncer\Desktop\NewCredential\web-wallet"
Write-Host "Starting web wallet development server..."
& "C:\nodejs\node.exe" "C:\nodejs\node_modules\npm\bin\npm-cli.js" run dev
