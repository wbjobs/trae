# Collaborative Flow Editor

A real-time collaborative flowchart editor built with SvelteKit, fabric.js, Node.js, and PostgreSQL.

## Features

- **Real-time Collaboration**: Multiple users can edit the same flowchart simultaneously
- **Operational Transformation (OT)**: Ensures conflict-free concurrent edits
- **Live Cursors**: See other users' cursor positions in real-time
- **Flowchart Nodes**: Support for rectangles, circles, diamonds, and ellipses
- **Connections**: Create connections between nodes
- **Property Editing**: Edit node text and color properties
- **Persistence**: Documents stored in PostgreSQL with JSONB support

## Architecture

### Frontend (SvelteKit + fabric.js)
- `client/` - SvelteKit application
  - `src/lib/FlowEditor.svelte` - Main editor component
  - `src/lib/editor.js` - fabric.js canvas wrapper
  - `src/lib/ot.js` - Client-side OT algorithm
  - `src/lib/websocket.js` - WebSocket client with store

### Backend (Node.js + WebSocket + PostgreSQL)
- `server/` - Node.js server
  - `src/index.js` - HTTP and WebSocket server entry
  - `src/websocket.js` - WebSocket connection handlers
  - `src/ot.js` - Server-side OT algorithm
  - `src/db.js` - PostgreSQL database operations

## Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Setup

1. **Start PostgreSQL** (using Docker):
```bash
docker-compose up -d
```

2. **Install backend dependencies**:
```bash
cd server
npm install
```

3. **Install frontend dependencies**:
```bash
cd ../client
npm install
```

4. **Start the backend server**:
```bash
cd server
npm run dev
```

5. **Start the frontend dev server** (in another terminal):
```bash
cd client
npm run dev
```

6. **Open your browser** and navigate to `http://localhost:5173`

## Usage

1. **Create an account/profile**: Click "Profile" button to set your name and cursor color
2. **Create a document**: Click "Create New Document" to start a new flowchart
3. **Add nodes**: Use the toolbar to add different node types
4. **Connect nodes**: Select a node and click "Connect", then click another node
5. **Edit properties**: Select a node to edit its text and color
6. **Collaborate**: Share the document ID with others to collaborate in real-time

## OT Algorithm

The Operational Transformation algorithm handles concurrent edits by:
- Transforming operations based on their types
- Prioritizing local operations for immediate feedback
- Transforming remote operations against local pending operations
- Supporting node add/remove/move/update and connection add/remove

## Database Schema

- **documents**: Stores flowchart documents with JSONB content
- **operations**: Stores operation history for conflict resolution

## License

MIT
