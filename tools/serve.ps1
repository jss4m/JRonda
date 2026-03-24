param(
  [int]$Port = 8080,
  [string]$Root = "",
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"

$Root = if ([string]::IsNullOrWhiteSpace($Root)) { Split-Path $PSScriptRoot -Parent } else { $Root }
if (-not (Test-Path $Root -PathType Container)) {
  Write-Error "Root path invalid: $Root"
  exit 1
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "JRonda local server running at $prefix"
Write-Host "Serving: $Root"
Write-Host "Press Ctrl+C to stop."

if ($OpenBrowser) {
  Start-Process $prefix | Out-Null
}

function Get-MimeType([string]$path) {
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  switch ($ext) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".ico" { "image/x-icon" }
    ".txt" { "text/plain; charset=utf-8" }
    ".map" { "application/json; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  try {
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
    if ($requestPath -eq "/") { $requestPath = "/index.html" }

    $relative = $requestPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $filePath = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))

    if (-not $filePath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.ContentType = "text/plain; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      $context.Response.OutputStream.Write($body, 0, $body.Length)
      $context.Response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = Get-MimeType $filePath
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.AddHeader("Cache-Control", "public, max-age=3600")
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  } catch {
    try {
      $context.Response.StatusCode = 500
      $context.Response.ContentType = "text/plain; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("Server error")
      $context.Response.OutputStream.Write($body, 0, $body.Length)
      $context.Response.Close()
    } catch {}
  }
}
