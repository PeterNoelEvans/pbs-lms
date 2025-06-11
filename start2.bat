@echo off
echo Starting Cloudflare...

cd /d C:\2025\cloudflared

start "Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel run pbs-lms-tunnel"