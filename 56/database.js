const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class NotesDatabase {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.dbPath = path.join(userDataPath, 'notes.db');
    this.db = null;
    this.SQL = null;
  }

  async init() {
    this.SQL = await initSqlJs();
    
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      this.migrate();
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT,
        x INTEGER DEFAULT 100,
        y INTEGER DEFAULT 100,
        width INTEGER DEFAULT 300,
        height INTEGER DEFAULT 400,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.save();
  }

  migrate() {
    try {
      const columns = this.db.exec("PRAGMA table_info(notes)");
      const hasVersion = columns[0]?.values.some(col => col[1] === 'version');
      
      if (!hasVersion) {
        this.db.run('ALTER TABLE notes ADD COLUMN version INTEGER DEFAULT 1');
        this.save();
      }
    } catch (e) {
      console.log('Migration skipped or completed:', e.message);
    }
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  createNote(id, content = '', x = 100, y = 100, width = 300, height = 400) {
    this.db.run(
      'INSERT INTO notes (id, content, x, y, width, height, version) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, content, x, y, width, height]
    );
    this.save();
    return this.getNote(id);
  }

  updateNoteWithVersionCheck(id, content, x, y, width, height, expectedVersion) {
    const currentNote = this.getNote(id);
    if (!currentNote) {
      return { success: false, reason: 'not_found' };
    }

    if (currentNote.version !== expectedVersion) {
      return { 
        success: false, 
        reason: 'version_conflict',
        currentVersion: currentNote.version,
        serverContent: currentNote.content,
        serverNote: currentNote
      };
    }

    const newVersion = expectedVersion + 1;
    this.db.run(
      'UPDATE notes SET content = ?, x = ?, y = ?, width = ?, height = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, x, y, width, height, newVersion, id]
    );
    this.save();
    
    return {
      success: true,
      note: this.getNote(id)
    };
  }

  forceUpdateNote(id, content, x, y, width, height) {
    const currentNote = this.getNote(id);
    const newVersion = (currentNote?.version || 0) + 1;
    
    this.db.run(
      'UPDATE notes SET content = ?, x = ?, y = ?, width = ?, height = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, x, y, width, height, newVersion, id]
    );
    this.save();
    
    return this.getNote(id);
  }

  updateNote(id, content, x, y, width, height) {
    const currentNote = this.getNote(id);
    const newVersion = (currentNote?.version || 0) + 1;
    
    this.db.run(
      'UPDATE notes SET content = ?, x = ?, y = ?, width = ?, height = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, x, y, width, height, newVersion, id]
    );
    this.save();
    return this.getNote(id);
  }

  deleteNote(id) {
    this.db.run('DELETE FROM notes WHERE id = ?', [id]);
    this.save();
  }

  getNote(id) {
    const stmt = this.db.prepare('SELECT * FROM notes WHERE id = ?');
    const result = stmt.getAsObject(id);
    stmt.free();
    return result && Object.keys(result).length > 0 ? result : null;
  }

  getAllNotes() {
    const results = [];
    const stmt = this.db.prepare('SELECT * FROM notes ORDER BY created_at ASC');
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = NotesDatabase;
