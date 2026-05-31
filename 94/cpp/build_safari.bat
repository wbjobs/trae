@echo off
echo Building WASM module with MAXIMUM Safari compatibility...
echo WARNING: This build uses the most conservative settings for Safari.
echo It may have slightly lower performance but best compatibility.

emcc matmul.cpp -O2 ^
  -s WASM=1 ^
  -s EXPORTED_FUNCTIONS="['_matmul', '_matmul_optimized', '_matmul_tiled', '_create_matrix', '_free_matrix', '_random_matrix', '_zero_matrix']" ^
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'getValue', 'setValue', 'HEAPF32']" ^
  -s ALLOW_MEMORY_GROWTH=0 ^
  -s INITIAL_MEMORY=134217728 ^
  -s MAXIMUM_MEMORY=134217728 ^
  -s STACK_SIZE=5242880 ^
  -s ASSERTIONS=0 ^
  -s DISABLE_EXCEPTION_CATCHING=1 ^
  -s FILESYSTEM=0 ^
  -s ENVIRONMENT='web' ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=0 ^
  -s WASM_BIGINT=0 ^
  -s SIMD=0 ^
  -s BULK_MEMORY=0 ^
  -s MUTABLE_GLOBALS=0 ^
  -s SIGN_EXT=0 ^
  -s SATURATE_FLOAT_TO_INT=0 ^
  -s THREADS=0 ^
  -s WASM_WORKERS=0 ^
  -s EXCEPTION_DEBUG=0 ^
  -s DEMANGLE_SUPPORT=0 ^
  -s RESERVED_FUNCTION_POINTERS=0 ^
  -s LEGACY_VM_SUPPORT=1 ^
  -s STRICT=1 ^
  --no-entry ^
  -o ../frontend/matmul_safari.js

echo.
echo Build complete!
echo.
echo Files generated:
echo   - frontend/matmul_safari.js
echo   - frontend/matmul_safari.wasm
echo.
echo To use Safari build:
echo 1. Rename matmul_safari.js -^> matmul.js
echo 2. Rename matmul_safari.wasm -^> matmul.wasm
echo 3. Or update the script src in index.html
