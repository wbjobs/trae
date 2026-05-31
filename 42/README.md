# FileSync - Cross-Platform File Synchronization Tool

A powerful command-line file synchronization tool that supports bidirectional sync between local folders and remote servers via SSH/SFTP.

## Features

- **Bidirectional Synchronization**: Sync files both ways between local and remote
- **Incremental Sync**: Only transfers changed files based on modification time and size
- **Conflict Detection**: Detects and handles conflicts when files are modified on both sides
- **Multiple Sync Tasks**: Configure multiple sync tasks in a single YAML file
- **Ignore Patterns**: Support for glob-style ignore patterns
- **Scheduled Sync**: Run sync tasks automatically using cron expressions
- **Cross-Platform**: Works on Linux, macOS, and Windows

## Architecture

- **Go Sync Engine** (`syncengine/`): Core synchronization logic written in Go for performance
- **Python CLI** (`pyconfig/`): Configuration management and CLI interface in Python
- **Communication**: JSON-based protocol between Python CLI and Go engine

## Requirements

- Go 1.21 or higher (for building syncengine)
- Python 3.7 or higher
- SSH/SFTP server access (for remote sync)

## Installation

### 1. Build the Go Sync Engine

```bash
cd syncengine
go mod download
go build -o syncengine .
```

### 2. Install Python Dependencies

```bash
cd pyconfig
pip install -r requirements.txt
```

### 3. Configure Your Tasks

Edit `config/sync.yaml` to define your synchronization tasks.

## Configuration

Create a YAML configuration file with your sync tasks:

```yaml
version: "1.0"
tasks:
  - name: "my-backup"
    local_path: "/local/path"
    remote_path: "/remote/path"
    remote:
      host: "server.example.com"
      port: 22
      username: "user"
      auth_method: "key_file"
      key_file: "~/.ssh/id_rsa"
    direction: "bidirectional"
    conflict_resolution: "newer_wins"
    ignore_patterns:
      - "*.tmp"
      - "*.log"
    schedule: "0 2 * * *"
```

### Configuration Options

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Unique task name | Yes |
| `local_path` | Local directory path | Yes |
| `remote_path` | Remote directory path | Yes |
| `remote.host` | SSH/SFTP server hostname | Yes |
| `remote.port` | SSH/SFTP server port (default: 22) | No |
| `remote.username` | SSH username | Yes |
| `remote.auth_method` | Authentication method (`key_file` or `password`) | Yes |
| `remote.key_file` | Path to SSH private key | No |
| `remote.password` | SSH password (not recommended) | No |
| `direction` | Sync direction: `local_to_remote`, `remote_to_local`, `bidirectional` | Yes |
| `conflict_resolution` | How to handle conflicts: `newer_wins`, `local_wins`, `remote_wins`, `ask`, `skip` | No |
| `ignore_patterns` | List of patterns to ignore | No |
| `exclude_hidden` | Exclude hidden files and directories | No |
| `schedule` | Cron expression for scheduled sync | No |

## Usage

### List Configured Tasks

```bash
python pyconfig/synccli.py list
```

### Run a Sync Task

```bash
python pyconfig/synccli.py sync my-backup
```

### Dry Run (Preview Changes)

```bash
python pyconfig/synccli.py sync my-backup --dry-run
```

### Verbose Output

```bash
python pyconfig/synccli.py sync my-backup --verbose
```

### Validate Configuration

```bash
python pyconfig/synccli.py validate
```

### Check Task Status

```bash
python pyconfig/synccli.py status
```

### Run Scheduled Sync (Daemon Mode)

```bash
python pyconfig/synccli.py daemon
```

## Command Line Options

```
python pyconfig/synccli.py [command] [options]

Commands:
  sync        Run synchronization
  list        List configured tasks
  status      Show task status
  validate    Validate configuration
  daemon      Run as daemon for scheduled sync

Options:
  -c, --config FILE    Path to configuration file
  -v, --verbose        Verbose output
  -n, --dry-run        Perform a trial run
  --force              Force sync ignoring conflicts
```

## Conflict Resolution Strategies

- **newer_wins**: Keep the file with the most recent modification time
- **local_wins**: Always keep the local version
- **remote_wins**: Always keep the remote version
- **ask**: Prompt for resolution (not yet implemented in CLI)
- **skip**: Skip conflicting files

## Ignore Patterns

Use glob-style patterns:

- `*.tmp` - Ignore all files ending with .tmp
- `*.log` - Ignore all log files
- `.git` - Ignore .git directory
- `node_modules/` - Ignore node_modules directory
- `**/*.pyc` - Ignore all .pyc files in any directory

## Scheduled Sync

Use cron expressions for scheduling:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 2 * * *` - Daily at 2:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday at midnight
- `30 4 1 * *` - First day of month at 4:30 AM

## Examples

### Backup Documents

```bash
python pyconfig/synccli.py sync backup-documents --verbose
```

### Sync Development Projects

```bash
python pyconfig/synccli.py sync sync-projects --dry-run
```

### Download Files from Server

```bash
python pyconfig/synccli.py sync download-releases
```

## Troubleshooting

### Connection Issues

1. Verify SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
2. Test SSH connection manually: `ssh user@host`
3. Check firewall settings

### Permission Errors

1. Ensure read/write permissions on local directories
2. Verify SFTP user has write permissions on remote directory

### Sync Not Working

1. Validate configuration: `python pyconfig/synccli.py validate`
2. Use dry-run to preview changes
3. Check ignore patterns

### Special Character Issues

Files with special characters (Chinese, spaces, non-ASCII characters) should work correctly:

1. Ensure your terminal supports UTF-8 encoding
2. On Windows, use PowerShell or WSL for better Unicode support
3. Configuration files should be saved with UTF-8 encoding
4. If you encounter issues, try the `--verbose` flag to see detailed error messages

## License

MIT License

## Contributing

Contributions welcome! Please feel free to submit issues and pull requests.
