@echo off
echo ============================================
echo   ZTunnel - Zero Trust Tunnel Service
echo   Demo Setup Script
echo ============================================
echo.

echo [1/4] Creating certificate directory...
if not exist "certs" mkdir certs

echo [2/4] Generating certificates...
go run cmd\certgen\main.go -dir certs -cn client-1

echo.
echo [3/4] Building server...
go build -o ztunnel-server.exe cmd\server\main.go

echo [4/4] Building client...
go build -o ztunnel-client.exe cmd\client\main.go

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo To start the tunnel server:
echo   ztunnel-server.exe
echo.
echo To start the client demo:
echo   ztunnel-client.exe -service svc-demo-http
echo.
echo To run as local proxy on port 8081:
echo   ztunnel-client.exe -service svc-demo-http -listen :8081
echo.
echo Admin API available at http://localhost:8080
echo Tunnel endpoint at localhost:8443
echo.
