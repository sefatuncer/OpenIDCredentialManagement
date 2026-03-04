$env:PATH = "C:\nodejs;" + $env:PATH
Set-Location "C:\Users\sefa.tuncer\Desktop\NewCredential\web-wallet"
Write-Host "Node version:"
& "C:\nodejs\node.exe" --version
Write-Host "Installing dependencies..."
& "C:\nodejs\node.exe" "C:\nodejs\node_modules\npm\bin\npm-cli.js" install
Write-Host "Done!"
