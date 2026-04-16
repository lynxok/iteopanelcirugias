$url = "https://wbguwmbwutvhqsirtjps.supabase.co/functions/v1/telegram-bot"
$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ3V3bWJ3dXR2aHFzaXJ0anBzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk3ODU5NiwiZXhwIjoyMDgzNTU0NTk2fQ.mOuc9YyLdJlXhmScUat12yfRha9O-cMGtEzlywznPjA"

$body = @{
    type = "INSERT"
    table = "telegram_notifications"
    schema = "quirofano"
    record = @{
        id = "550e8400-e29b-41d4-a716-446655440000"
        user_id = "01ca54d8-87b1-4e28-85f3-5c6b216c0d38"
        message = "🧪 Test Manual desde PowerShell"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers @{ "Authorization" = "Bearer $key"; "Content-Type" = "application/json" } -Body $body
    Write-Output "Success:"
    Write-Output $response
} catch {
    Write-Output "Error:"
    Write-Output $_.Exception.Response.StatusCode.value__
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $responseBody = $reader.ReadToEnd()
    Write-Output $responseBody
}
