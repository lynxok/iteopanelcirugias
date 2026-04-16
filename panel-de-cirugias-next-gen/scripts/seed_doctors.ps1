$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Error "Could not find .env.local in current directory: $(Get-Location)"
    exit 1
}

$content = Get-Content $envFile
$url = ""
$serviceKey = ""

foreach ($line in $content) {
    if ($line -match "VITE_SUPABASE_URL=(.*)") { $url = $matches[1].Trim() }
    if ($line -match "VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)") { $serviceKey = $matches[1].Trim() }
}

if (-not $url -or -not $serviceKey) {
    Write-Error "Missing credentials in .env.local"
    exit 1
}

$headers = @{
    "apikey"          = $serviceKey
    "Authorization"   = "Bearer $serviceKey"
    "Content-Type"    = "application/json"
    "Prefer"          = "return=representation"
    "Content-Profile" = "quirofano"
    "Accept-Profile"  = "quirofano"
}

$doctors = @(
    @{ full_name = "DR OBAID LUIS MARCELO"; license_number = "4216"; specialty = "Cirugía" },
    @{ full_name = "DR BARBERO CARLOS JULIAN"; license_number = "8689"; specialty = "Cirugía" },
    @{ full_name = "DR LOPEZ DARIO ALBERTO"; license_number = "6925"; specialty = "Cirugía" },
    @{ full_name = "DR GOLPE LUCIO MARTIN"; license_number = "7267"; specialty = "Cirugía" },
    @{ full_name = "DR CRESPO FERNANDO ADRIAN"; license_number = "7504"; specialty = "Cirugía" },
    @{ full_name = "DR RIAL PEDRO JAVIER"; license_number = "9203"; specialty = "Cirugía" },
    @{ full_name = "DR CASTILLO MARTIN"; license_number = "12359"; specialty = "Cirugía" },
    @{ full_name = "DR PEREZLINDO LUCAS"; license_number = "11261"; specialty = "Cirugía" }
)

$body = $doctors | ConvertTo-Json

Write-Host "Sending POST request to $url/rest/v1/doctors..."
try {
    $response = Invoke-RestMethod -Method Post -Uri "$url/rest/v1/doctors" -Headers $headers -Body $body
    Write-Host "Success! Doctors inserted."
    $response | ConvertTo-Json
}
catch {
    Write-Error "Failed to insert doctors: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $reader.ReadToEnd()
        Write-Host "Response body: $respBody"
    }
}
