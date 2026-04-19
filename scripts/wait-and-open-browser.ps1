#Requires -Version 5.1
# Poll /api/health until bot is up, then open default browser to UI.
$health = "http://127.0.0.1:7860/api/health"
$ui = "http://127.0.0.1:7860/"
for ($i = 0; $i -lt 100; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Start-Process $ui
            exit 0
        }
    }
    catch {
    }
    Start-Sleep -Milliseconds 350
}
Start-Process $ui
