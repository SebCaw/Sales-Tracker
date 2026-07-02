# Run the tracker locally (the same files that deploy to GitHub Pages).
# Static file server using .NET HttpListener — no Node/Python needed.
# Usage:  powershell -ExecutionPolicy Bypass -File serve-local.ps1
# Then open http://localhost:8090/
# Optional: pass a different port, e.g.  serve-local.ps1 -Port 5500
#
# Tip: to refresh the data while running locally, run  ./scrape.ps1  in another window,
# then reload the page (the server sends no-cache headers so you'll see the update).

param([int]$Port = 8090)
$port = $Port
$root = $PSScriptRoot

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"; ".png" = "image/png"; ".ico" = "image/x-icon"
  ".pdf"  = "application/pdf"
  ".jpg"  = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"
  ".pptx" = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch { Write-Host "Could not start on port $port. In use? $_"; exit 1 }
Write-Host "Apprenticeship Tracker (local) running at  http://localhost:$port/"
Write-Host "Press Ctrl+C in this window to stop."

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) { $res.StatusCode = 403; $res.Close(); continue }
    if (Test-Path $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
      $res.Headers.Add("Cache-Control", "no-store, must-revalidate")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
  } catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}
