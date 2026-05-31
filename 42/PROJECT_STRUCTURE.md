# FileSync Project Structure

```
filesync/
├── SPEC.md                 # Detailed specification document
├── README.md               # Main documentation
├── build.bat               # Windows build script
├── build.sh                # Unix build script (Linux/macOS)
│
├── syncengine/             # Go synchronization engine
│   ├── main.go            # CLI entry point (stdin/stdout communication)
│   ├── go.mod             # Go module definition
│   │
│   ├── sync/              # Core synchronization logic
│   │   ├── types.go       # Data structures and types
│   │   ├── scanner.go     # Local and remote file scanning
│   │   ├── engine.go      # Main sync orchestration
│   │   └── transfer.go    # File upload/download management
│   │
│   └── remote/            # SSH/SFTP connection handling
│       ├── ssh.go         # SSH connection management
│       └── sftp.go        # SFTP client wrapper
│
├── pyconfig/              # Python configuration and CLI
│   ├── synccli.py        # Main CLI application
│   ├── config.py         # Configuration management and validation
│   ├── scheduler.py      # Cron-style task scheduling
│   ├── requirements.txt  # Python dependencies
│   ├── test_config.py    # Configuration testing script
│   └── test_integration.py # Integration test script
│
└── config/               # Configuration files
    ├── sync.yaml         # Main configuration (edit this)
    └── test_sync.yaml    # Test configuration
```

## Quick Start

### 1. Build the Go Engine

**Windows:**
```batch
build.bat
```

**Linux/macOS:**
```bash
chmod +x build.sh
./build.sh
```

### 2. Install Python Dependencies

```bash
pip install -r pyconfig/requirements.txt
```

### 3. Configure Your Tasks

Edit `config/sync.yaml` with your synchronization tasks.

### 4. Test Configuration

```bash
python pyconfig/test_integration.py
```

### 5. Use the Tool

```bash
# List all configured tasks
python pyconfig/synccli.py list

# Validate configuration
python pyconfig/synccli.py validate

# Run a specific task
python pyconfig/synccli.py sync my-task-name

# Preview changes without applying them
python pyconfig/synccli.py sync my-task-name --dry-run

# Run with verbose output
python pyconfig/synccli.py sync my-task-name --verbose

# Run as daemon for scheduled sync
python pyconfig/synccli.py daemon
```

## Architecture Details

### Go Engine (syncengine/)

The Go engine handles all file transfer operations:

- **stdin/stdout Communication**: Receives JSON commands from Python CLI
- **SSH/SFTP**: Connects to remote servers
- **File Operations**: Uploads, downloads, and directory synchronization
- **Conflict Detection**: Identifies files modified on both sides

### Python CLI (pyconfig/)

The Python layer provides:

- **Configuration Management**: YAML parsing and validation
- **User Interface**: CLI commands and options
- **Task Scheduling**: Cron expression support
- **Result Formatting**: Pretty-printed sync results

### Communication Protocol

Python sends JSON to Go via stdin:
```json
{"command": "sync", "task": {...}}
```

Go responds with JSON on stdout:
```json
{"success": true, "files_uploaded": 10, ...}
```

## Configuration Schema

```yaml
version: "1.0"
tasks:
  - name: "task-name"           # Unique identifier
    local_path: "/local/path"  # Local directory
    remote_path: "/remote/path" # Remote directory
    remote:
      host: "server.example.com" # SSH host
      port: 22                  # SSH port (default: 22)
      username: "user"          # SSH username
      auth_method: "key_file"   # "key_file" or "password"
      key_file: "~/.ssh/id_rsa" # Path to SSH key
    direction: "bidirectional"  # Sync direction
    conflict_resolution: "newer_wins" # Conflict handling
    ignore_patterns:           # Files/dirs to ignore
      - "*.tmp"
      - "*.log"
    schedule: "0 2 * * *"      # Cron schedule (optional)
    exclude_hidden: false      # Skip hidden files
```

## Testing

Run the test suite:

```bash
# Test configuration loading
python pyconfig/test_config.py

# Test integration
python pyconfig/test_integration.py

# Validate config file
python pyconfig/synccli.py validate

# List all tasks
python pyconfig/synccli.py list
```

## Development

### Running Individual Components

**Test Go engine directly:**
```bash
cd syncengine
go run main.go <<< 'ping example.com'
```

**Test Python config:**
```bash
python pyconfig/synccli.py list -c config/test_sync.yaml
```

### Adding New Features

1. Edit SPEC.md with feature description
2. Implement in appropriate module (Go or Python)
3. Update tests
4. Update README.md documentation

## Troubleshooting

### Connection Issues
- Verify SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Test connection manually: `ssh user@host`
- Check firewall settings

### Permission Errors
- Ensure local directory is writable
- Verify SFTP user has write permissions

### Build Errors
- Ensure Go 1.21+ is installed
- Check that all dependencies are downloaded
- Verify GOPATH/GOROOT are set correctly

## License

MIT License

See README.md for full documentation.
