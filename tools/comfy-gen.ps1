<#
.SYNOPSIS
  Generate an image with the local ComfyUI server from a saved API-format workflow.

.DESCRIPTION
  Loads a ComfyUI "Save (API Format)" workflow JSON, injects the prompt at the
  `__PROMPT__` token inside the positive CLIPTextEncode node, queues it, waits for
  completion, then downloads the produced image to -Out.

.EXAMPLE
  pwsh tools/comfy-gen.ps1 `
    -Workflow tools/comfy/txt2img.api.json `
    -Prompt "seamless top-down rocky badland texture, cracked dry earth, tileable" `
    -Out assets/generated/rough.png
#>
param(
  [Parameter(Mandatory = $true)][string]$Workflow,
  [Parameter(Mandatory = $true)][string]$Prompt,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Server = "http://127.0.0.1:8000",
  [int]$Seed = -1,
  [int]$TimeoutSec = 300
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Workflow)) { throw "Workflow not found: $Workflow" }
$raw = Get-Content -Raw -Path $Workflow

# Inject the prompt at the __PROMPT__ token. JSON-escape the prompt so quotes/newlines are safe.
$escaped = ($Prompt | ConvertTo-Json)        # yields a quoted JSON string
$escaped = $escaped.Substring(1, $escaped.Length - 2)  # strip the surrounding quotes
if ($raw -notmatch "__PROMPT__") { throw "Workflow has no __PROMPT__ token to replace." }
$raw = $raw.Replace("__PROMPT__", $escaped)

$graph = $raw | ConvertFrom-Json

# Optionally override every KSampler seed for reproducibility / variation.
if ($Seed -ge 0) {
  foreach ($node in $graph.PSObject.Properties.Value) {
    if ($node.class_type -eq "KSampler" -and $node.inputs.PSObject.Properties.Name -contains "seed") {
      $node.inputs.seed = $Seed
    }
  }
}

$clientId = [guid]::NewGuid().ToString()
$body = @{ prompt = $graph; client_id = $clientId } | ConvertTo-Json -Depth 100
$queued = Invoke-RestMethod -Method Post -Uri "$Server/prompt" -Body $body -ContentType "application/json"
$promptId = $queued.prompt_id
if (-not $promptId) { throw "ComfyUI did not return a prompt_id (queue rejected)." }
Write-Host "Queued prompt $promptId ; waiting..."

# Poll the history endpoint until this prompt completes.
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$entry = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  $hist = Invoke-RestMethod -Method Get -Uri "$Server/history/$promptId"
  if ($hist.PSObject.Properties.Name -contains $promptId) {
    $entry = $hist.$promptId
    if ($entry.status -and $entry.status.completed) { break }
    if ($entry.outputs) { break }
  }
}
if (-not $entry) { throw "Timed out after ${TimeoutSec}s waiting for ComfyUI." }

# Find the first SaveImage output image in the outputs.
$image = $null
foreach ($nodeOut in $entry.outputs.PSObject.Properties.Value) {
  if ($nodeOut.images -and $nodeOut.images.Count -gt 0) { $image = $nodeOut.images[0]; break }
}
if (-not $image) { throw "No image found in ComfyUI outputs for $promptId." }

$query = "filename=$([uri]::EscapeDataString($image.filename))&subfolder=$([uri]::EscapeDataString($image.subfolder))&type=$([uri]::EscapeDataString($image.type))"
$outDir = Split-Path -Parent $Out
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
Invoke-WebRequest -Uri "$Server/view?$query" -OutFile $Out
Write-Host "Saved -> $Out"
