import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  user: process.env.PGUSER || 'floweditor',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'floweditor',
  password: process.env.PGPASSWORD || 'floweditor123',
  port: process.env.PGPORT || 5432
});

export async function getDocument(docId) {
  const result = await pool.query(
    `SELECT d.*, b.id as main_branch_id, b.name as main_branch_name
     FROM documents d 
     LEFT JOIN branches b ON d.main_branch_id = b.id
     WHERE d.id = $1`,
    [docId]
  );
  return result.rows[0] || null;
}

export async function createDocument(name = 'Untitled') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const docResult = await client.query(
      'INSERT INTO documents (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    const docId = docResult.rows[0].id;
    
    const branchResult = await client.query(
      `INSERT INTO branches (document_id, name, parent_branch_id) 
       VALUES ($1, 'main', NULL) RETURNING id, name`,
      [docId]
    );
    const branchId = branchResult.rows[0].id;
    
    await client.query(
      'UPDATE documents SET main_branch_id = $1 WHERE id = $2',
      [branchId, docId]
    );
    
    await client.query(
      `INSERT INTO operations (document_id, branch_id, version, operation)
       VALUES ($1, $2, 0, $3)`,
      [docId, branchId, { type: 'init', nodes: [], connections: [] }]
    );
    
    await client.query('COMMIT');
    
    return {
      id: docId,
      name: docResult.rows[0].name,
      main_branch_id: branchId,
      main_branch_name: 'main'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function saveOperation(docId, branchId, version, operation) {
  await pool.query(
    'INSERT INTO operations (document_id, branch_id, version, operation) VALUES ($1, $2, $3, $4)',
    [docId, branchId, version, operation]
  );
}

export async function getOperations(docId, branchId, fromVersion) {
  const result = await pool.query(
    'SELECT version, operation FROM operations WHERE document_id = $1 AND branch_id = $2 AND version > $3 ORDER BY version ASC',
    [docId, branchId, fromVersion]
  );
  return result.rows;
}

export async function getAllOperations(docId, branchId) {
  const result = await pool.query(
    'SELECT version, operation FROM operations WHERE document_id = $1 AND branch_id = $2 ORDER BY version ASC',
    [docId, branchId]
  );
  return result.rows;
}

export async function listDocuments() {
  const result = await pool.query(
    `SELECT d.id, d.name, d.updated_at, b.id as main_branch_id, b.name as main_branch_name
     FROM documents d 
     LEFT JOIN branches b ON d.main_branch_id = b.id
     ORDER BY d.updated_at DESC`
  );
  return result.rows;
}

export async function listBranches(docId) {
  const result = await pool.query(
    `SELECT b.*, 
      (SELECT MAX(version) FROM operations o WHERE o.branch_id = b.id) as latest_version
     FROM branches b 
     WHERE b.document_id = $1 
     ORDER BY b.created_at ASC`,
    [docId]
  );
  return result.rows;
}

export async function getBranch(docId, branchId) {
  const result = await pool.query(
    `SELECT b.*, 
      (SELECT MAX(version) FROM operations o WHERE o.branch_id = b.id) as latest_version
     FROM branches b 
     WHERE b.id = $1 AND b.document_id = $2`,
    [branchId, docId]
  );
  return result.rows[0] || null;
}

export async function createBranch(docId, name, parentBranchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const branchResult = await client.query(
      `INSERT INTO branches (document_id, name, parent_branch_id) 
       VALUES ($1, $2, $3) RETURNING id, name, parent_branch_id`,
      [docId, name, parentBranchId]
    );
    const newBranchId = branchResult.rows[0].id;
    
    const parentOps = await client.query(
      'SELECT operation, version FROM operations WHERE document_id = $1 AND branch_id = $2 ORDER BY version ASC',
      [docId, parentBranchId]
    );
    
    for (const op of parentOps.rows) {
      await client.query(
        'INSERT INTO operations (document_id, branch_id, version, operation) VALUES ($1, $2, $3, $4)',
        [docId, newBranchId, op.version, op.operation]
      );
    }
    
    await client.query('COMMIT');
    
    return branchResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteBranch(docId, branchId) {
  const result = await pool.query(
    'DELETE FROM branches WHERE id = $1 AND document_id = $2 AND name != $3 RETURNING id',
    [branchId, docId, 'main']
  );
  return result.rowCount > 0;
}

export async function renameBranch(docId, branchId, newName) {
  if (newName === 'main') {
    throw new Error('Cannot rename main branch');
  }
  
  const result = await pool.query(
    'UPDATE branches SET name = $1, updated_at = NOW() WHERE id = $2 AND document_id = $3 RETURNING id, name',
    [newName, branchId, docId]
  );
  return result.rows[0] || null;
}

export async function createMerge(docId, sourceBranchId, targetBranchId, conflicts = null) {
  const result = await pool.query(
    `INSERT INTO merges (document_id, source_branch_id, target_branch_id, conflicts)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [docId, sourceBranchId, targetBranchId, conflicts]
  );
  return result.rows[0];
}

export async function getMerge(mergeId) {
  const result = await pool.query(
    'SELECT * FROM merges WHERE id = $1',
    [mergeId]
  );
  return result.rows[0] || null;
}

export async function listMerges(docId) {
  const result = await pool.query(
    `SELECT m.*, 
      sb.name as source_branch_name,
      tb.name as target_branch_name
     FROM merges m 
     JOIN branches sb ON m.source_branch_id = sb.id
     JOIN branches tb ON m.target_branch_id = tb.id
     WHERE m.document_id = $1 
     ORDER BY m.created_at DESC`,
    [docId]
  );
  return result.rows;
}

export async function resolveMerge(mergeId, resolved) {
  const result = await pool.query(
    `UPDATE merges SET status = $1, conflicts = $2, resolved_at = NOW() 
     WHERE id = $3 RETURNING *`,
    [resolved ? 'resolved' : 'conflicted', resolved ? null : null, mergeId]
  );
  return result.rows[0];
}

export async function applyMerge(docId, sourceBranchId, targetBranchId, operations) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const targetVersionResult = await client.query(
      'SELECT MAX(version) as max_version FROM operations WHERE document_id = $1 AND branch_id = $2',
      [docId, targetBranchId]
    );
    let currentVersion = targetVersionResult.rows[0].max_version || 0;
    
    for (const op of operations) {
      currentVersion++;
      await client.query(
        'INSERT INTO operations (document_id, branch_id, version, operation) VALUES ($1, $2, $3, $4)',
        [docId, targetBranchId, currentVersion, op]
      );
    }
    
    await client.query('COMMIT');
    return currentVersion;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
