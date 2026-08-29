# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is **H CLler (hcl-ier)** - a Claude Code Session Manager & Workbench built with Tauri 2.x. It provides a desktop UI for managing Claude CLI sessions with terminal emulation, session management, and checkpoint capabilities.

**Note**: There are two parallel Rust/Tauri projects in this repository:
- `aicoder/` - Current active version (0.1.9)
- `src-tauri/` - Legacy version (0.1.0)

Most development work should target `aicoder/`.

## Tech Stack

- **Frontend**: React 19 + TypeScript, Vite, Ant Design 6, xterm.js
- **Backend**: Rust with Tauri 2, SQLite (rusqlite), portable-pty
- **State Management**: Zustand (frontend), Mutex-wrapped managers (Rust backend)

## Common Commands

```bash
# Frontend development (in aicoder/ directory)
cd aicoder
npm run dev          # Start Vite dev server
npm run build        # Build TypeScript + Vite bundle

# Tauri development
npm run tauri:dev   # Run app in development mode
npm run tauri:build # Build production executable
```

## Architecture

### Frontend (`aicoder/src/`)
- `components/` - React UI components (Sidebar, TabBar, TerminalPanel, etc.)
- `stores/` - Zustand stores (sessionStore, terminalStore, settingsStore, tokenStore)
- `types/` - TypeScript type definitions
- `utils/` - Utility functions
- `styles/` - CSS files

### Backend (`aicoder/src-tauri/src/`)
- `lib.rs` - Main Tauri command handlers and app setup
- `session.rs` - Session management with SQLite persistence
- `pty.rs` - PTY (pseudo-terminal) management with history logging
- `cli.rs` - Codex CLI detection and version management
- `config.rs` - App configuration (ClaudeConfig, GeneralConfig)
- `checkpoint.rs` - Checkpoint/snapshot creation and restore
- `license.rs` - License management with activation system

### State Management (Rust)
All managers are wrapped in `Mutex<AppState>` and accessed via `tauri::State<AppState>`:
- `session_manager` - SQLite-backed session storage
- `pty_manager` - Terminal instances with history
- `config_manager` - JSON-based configuration
- `checkpoint_manager` - Git-diff based snapshots
- `license_manager` - License validation and activation

## Key Integration Points

- **Session database**: Stored at `{app_data}/sessions.db` (SQLite)
- **Terminal logs**: Stored at `{app_data}/terminal_logs/`
- **Configuration**: Stored at `{app_data}/config/`
- **Checkpoints**: Stored at `{app_data}/checkpoints/`

## Build Targets

The Tauri build outputs Windows executables. The production build uses `rustls-tls` for network operations (no native TLS dependencies).