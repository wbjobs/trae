@echo off
echo Installing Rust...
echo.

where rustc >nul 2>nul
if %errorlevel%==0 (
    echo Rust is already installed:
    rustc --version
    goto :end
)

echo Downloading rustup installer...
powershell -Command "& {irm https://win.rustup.rs/x86_64 | out-file rustup-init.exe}"

if exist rustup-init.exe (
    echo Running rustup installer...
    rustup-init.exe -y --default-toolchain stable --default-host x86_64-pc-windows-msvc
    
    echo.
    echo Rust installed successfully!
    echo Please restart your terminal and run:
    echo   refreshenv
    echo   npm run build
) else (
    echo Failed to download rustup.
    echo Please download manually from https://rustup.rs/
)

:end
pause
