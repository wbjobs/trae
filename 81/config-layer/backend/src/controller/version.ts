import express from 'express';
import { versionManager } from '../../../../forward-layer/version-manager/src';

export async function createVersion(req: express.Request, res: express.Response) {
  const version = versionManager.createVersion(req.body);
  res.json(version);
}

export async function getVersions(req: express.Request, res: express.Response) {
  const { protocolId } = req.query;
  const versions = protocolId 
    ? versionManager.getVersionsByProtocol(protocolId as string)
    : versionManager.getStatistics().totalVersions;
  
  res.json({ list: protocolId ? versions : [], total: versions.length });
}

export async function getVersion(req: express.Request, res: express.Response) {
  const version = versionManager.getVersion(req.params.id);
  if (!version) {
    return res.status(404).json({ message: 'Version not found' });
  }
  res.json(version);
}

export async function updateVersion(req: express.Request, res: express.Response) {
  const version = versionManager.updateVersion(req.params.id, req.body);
  if (!version) {
    return res.status(404).json({ message: 'Version not found' });
  }
  res.json(version);
}

export async function deleteVersion(req: express.Request, res: express.Response) {
  const success = versionManager.deleteVersion(req.params.id);
  if (!success) {
    return res.status(404).json({ message: 'Version not found' });
  }
  res.json({ success: true });
}

export async function createRelease(req: express.Request, res: express.Response) {
  const release = versionManager.createGrayRelease(req.body);
  res.json(release);
}

export async function startRelease(req: express.Request, res: express.Response) {
  const release = versionManager.startGrayRelease(req.params.id);
  if (!release) {
    return res.status(404).json({ message: 'Release not found' });
  }
  res.json(release);
}

export async function pauseRelease(req: express.Request, res: express.Response) {
  const release = versionManager.pauseGrayRelease(req.params.id);
  if (!release) {
    return res.status(404).json({ message: 'Release not found' });
  }
  res.json(release);
}

export async function resumeRelease(req: express.Request, res: express.Response) {
  const release = versionManager.resumeGrayRelease(req.params.id);
  if (!release) {
    return res.status(404).json({ message: 'Release not found' });
  }
  res.json(release);
}

export async function rollbackRelease(req: express.Request, res: express.Response) {
  const release = versionManager.rollbackGrayRelease(req.params.id);
  if (!release) {
    return res.status(404).json({ message: 'Release not found' });
  }
  res.json(release);
}

export async function getReleases(req: express.Request, res: express.Response) {
  const { protocolId } = req.query;
  const releases = versionManager.listGrayReleases(protocolId as string);
  res.json({ list: releases, total: releases.length });
}

export async function getRelease(req: express.Request, res: express.Response) {
  const release = versionManager.getGrayRelease(req.params.id);
  if (!release) {
    return res.status(404).json({ message: 'Release not found' });
  }
  res.json(release);
}

export async function getVersionStats(req: express.Request, res: express.Response) {
  const stats = versionManager.getStatistics();
  res.json(stats);
}
