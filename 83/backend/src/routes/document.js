const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { encryptFile, decryptFile, generateRandomKey, decryptBuffer, benchmarkEncryption } = require('../utils/encryption');
const { generateFileFingerprint, verifyFileIntegrity } = require('../utils/fingerprint');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');
const { generateUserWatermark } = require('../utils/watermark');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../database/temp_uploads');
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.post('/upload', authenticateToken, upload.array('files', 10), async (req, res, next) => {
  try {
    const { title, description, secretLevel = 'internal' } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const encryptedDir = path.join(__dirname, '../../database/encrypted_files');
    fs.ensureDirSync(encryptedDir);

    const results = [];

    for (const file of files) {
      const docUuid = crypto.randomUUID();
      const encryptionKey = generateRandomKey();
      const encryptedFileName = `${docUuid}.enc`;
      const encryptedFilePath = path.join(encryptedDir, encryptedFileName);

      await encryptFile(file.path, encryptedFilePath, encryptionKey);

      const fingerprintData = await generateFileFingerprint(encryptedFilePath, {
        includeBlockHashes: true,
      });

      const result = await runQuery(`
        INSERT INTO documents 
        (doc_uuid, title, file_name, file_path, file_size, file_type, 
         secret_level, fingerprint, encryption_key, uploader_id, 
         uploader_name, department, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        docUuid,
        title || file.originalname,
        file.originalname,
        encryptedFilePath,
        file.size,
        file.mimetype,
        secretLevel,
        fingerprintData.fingerprint,
        encryptionKey,
        req.user.id,
        req.user.realName || req.user.username,
        req.user.department || '',
        description || '',
      ]);

      await runQuery(`
        INSERT INTO trace_fingerprints 
        (document_id, fingerprint, hash_algorithm, block_size, block_hashes)
        VALUES (?, ?, ?, ?, ?)
      `, [
        result.lastID,
        fingerprintData.fingerprint,
        'sha256',
        fingerprintData.blockSize,
        JSON.stringify(fingerprintData.blockHashes),
      ]);

      await logOperation({
        userId: req.user.id,
        username: req.user.username,
        operationType: OPERATION_TYPES.UPLOAD,
        documentId: result.lastID,
        documentTitle: title || file.originalname,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          fileName: file.originalname,
          fileSize: file.size,
          secretLevel,
          fingerprint: fingerprintData.fingerprint,
        },
        isOffline: req.user.isOffline,
      });

      fs.removeSync(file.path);

      results.push({
        id: result.lastID,
        uuid: docUuid,
        title: title || file.originalname,
        fileName: file.originalname,
        fileSize: file.size,
        secretLevel,
        fingerprint: fingerprintData.fingerprint,
      });
    }

    res.json({
      message: `成功上传${results.length}个文件`,
      documents: results,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      keyword, 
      secretLevel, 
      startDate, 
      endDate,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const offset = (page - 1) * pageSize;

    const whereClauses = ['status = 1'];
    const params = [];

    if (keyword) {
      whereClauses.push('(title LIKE ? OR file_name LIKE ? OR description LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (secretLevel) {
      whereClauses.push('secret_level = ?');
      params.push(secretLevel);
    }
    if (startDate) {
      whereClauses.push('created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('created_at <= ?');
      params.push(endDate);
    }

    if (req.user.role !== 'admin') {
      whereClauses.push(`
        (uploader_id = ? OR EXISTS (
          SELECT 1 FROM document_permissions dp 
          WHERE dp.document_id = documents.id 
          AND (dp.user_id = ? OR dp.department = ? OR dp.role = ?)
        ))
      `);
      params.push(req.user.id, req.user.id, req.user.department || '', req.user.role);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM documents ${whereSql}`,
      params
    );

    const documents = await allQuery(`
      SELECT d.*, 
             (SELECT COUNT(*) FROM operation_logs WHERE document_id = d.id AND operation_type = 'view') as view_count,
             (SELECT COUNT(*) FROM operation_logs WHERE document_id = d.id AND operation_type = 'download') as download_count
      FROM documents d
      ${whereSql}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(countResult.total / pageSize),
      documents,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await getQuery('SELECT * FROM documents WHERE id = ? AND status = 1', [id]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      const hasPermission = await getQuery(`
        SELECT 1 FROM document_permissions 
        WHERE document_id = ? AND (user_id = ? OR department = ? OR role = ?)
        LIMIT 1
      `, [id, req.user.id, req.user.department || '', req.user.role]);

      if (!hasPermission) {
        return res.status(403).json({ error: '没有访问该文档的权限' });
      }
    }

    const fingerprintRecord = await getQuery(
      'SELECT * FROM trace_fingerprints WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.VIEW,
      documentId: document.id,
      documentTitle: document.title,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        fileName: document.file_name,
        secretLevel: document.secret_level,
      },
      isOffline: req.user.isOffline,
    });

    res.json({
      ...document,
      encryption_key: undefined,
      fingerprintData: fingerprintRecord ? {
        algorithm: fingerprintRecord.hash_algorithm,
        blockSize: fingerprintRecord.block_size,
        blockCount: JSON.parse(fingerprintRecord.block_hashes || '[]').length,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await getQuery('SELECT * FROM documents WHERE id = ? AND status = 1', [id]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      const hasPermission = await getQuery(`
        SELECT 1 FROM document_permissions 
        WHERE document_id = ? AND (user_id = ? OR department = ? OR role = ?)
        AND permission_type IN ('read', 'download', 'full')
        LIMIT 1
      `, [id, req.user.id, req.user.department || '', req.user.role]);

      if (!hasPermission) {
        return res.status(403).json({ error: '没有下载该文档的权限' });
      }
    }

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const encryptedBuffer = await fs.readFile(document.file_path);
    const decryptedBuffer = decryptBuffer(encryptedBuffer, document.encryption_key);

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.DOWNLOAD,
      documentId: document.id,
      documentTitle: document.title,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        fileName: document.file_name,
        fileSize: document.file_size,
      },
      isOffline: req.user.isOffline,
    });

    res.setHeader('Content-Type', document.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name)}"`);
    res.send(decryptedBuffer);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/verify-integrity', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const originalFingerprint = await getQuery(
      'SELECT * FROM trace_fingerprints WHERE document_id = ? ORDER BY created_at ASC LIMIT 1',
      [id]
    );

    const verificationResult = await verifyFileIntegrity(
      document.file_path,
      {
        fingerprint: document.fingerprint,
        hashes: { sha256: originalFingerprint ? JSON.parse(originalFingerprint.block_hashes)[0]?.hash : '' },
        blockHashes: originalFingerprint ? JSON.parse(originalFingerprint.block_hashes) : [],
      }
    );

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.INTEGRITY_CHECK,
      documentId: document.id,
      documentTitle: document.title,
      ipAddress: req.ip,
      details: {
        isIntact: verificationResult.isIntact,
        changes: verificationResult.changes,
      },
      isOffline: req.user.isOffline,
    });

    res.json(verificationResult);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, secretLevel } = req.body;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '没有修改该文档的权限' });
    }

    await runQuery(`
      UPDATE documents 
      SET title = ?, description = ?, secret_level = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title || document.title, description || document.description, secretLevel || document.secret_level, id]);

    res.json({ message: '文档信息更新成功' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '没有删除该文档的权限' });
    }

    await runQuery('UPDATE documents SET status = 0 WHERE id = ?', [id]);

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.DELETE,
      documentId: document.id,
      documentTitle: document.title,
      ipAddress: req.ip,
      details: { fileName: document.file_name },
      isOffline: req.user.isOffline,
    });

    res.json({ message: '文档删除成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/encryption/benchmark', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { sizeMB = 10 } = req.query;
    
    const result = await benchmarkEncryption(parseInt(sizeMB));
    
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
