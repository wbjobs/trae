const crypto = require('crypto');

class MerkleDAG {
  constructor() {
    this.chain = [];
    this.genesisHash = null;
  }

  static computeHash(node) {
    const content = [
      node.prevHash || 'GENESIS',
      node.key,
      JSON.stringify(node.value !== undefined ? node.value : null),
      String(node.timestamp),
      node.author || '',
      node.version || '',
      node.action || '',
    ].join('|');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  append(entry) {
    const prev = this.chain.length > 0 ? this.chain[this.chain.length - 1] : null;
    const node = {
      index: this.chain.length,
      prevHash: prev ? prev.hash : null,
      key: entry.key,
      value: entry.value,
      timestamp: entry.timestamp,
      author: entry.author,
      version: entry.version,
      action: entry.action,
    };
    node.hash = MerkleDAG.computeHash(node);

    if (this.chain.length === 0) {
      this.genesisHash = node.hash;
    }

    this.chain.push(node);
    return node;
  }

  getHead() {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : null;
  }

  getHeadHash() {
    const head = this.getHead();
    return head ? head.hash : null;
  }

  getChain() {
    return this.chain.map((n) => ({ ...n }));
  }

  getChainSlice(fromIndex) {
    return this.chain.slice(fromIndex).map((n) => ({ ...n }));
  }

  verify() {
    if (this.chain.length === 0) {
      return { valid: true, error: null, failedIndex: -1 };
    }

    for (let i = 0; i < this.chain.length; i++) {
      const node = this.chain[i];
      const expectedHash = MerkleDAG.computeHash(node);

      if (node.hash !== expectedHash) {
        return {
          valid: false,
          error: `Hash mismatch at index ${i} (key=${node.key})`,
          failedIndex: i,
        };
      }

      if (i > 0) {
        const prev = this.chain[i - 1];
        if (node.prevHash !== prev.hash) {
          return {
            valid: false,
            error: `PrevHash link broken at index ${i} (key=${node.key})`,
            failedIndex: i,
          };
        }
      } else if (node.prevHash !== null) {
        return {
          valid: false,
          error: 'Genesis node has non-null prevHash',
          failedIndex: 0,
        };
      }
    }

    return { valid: true, error: null, failedIndex: -1 };
  }

  verifyRemoteChain(remoteChain) {
    if (!remoteChain || remoteChain.length === 0) {
      return { valid: true, error: null, failedIndex: -1 };
    }

    for (let i = 0; i < remoteChain.length; i++) {
      const node = remoteChain[i];
      const expectedHash = MerkleDAG.computeHash(node);

      if (node.hash !== expectedHash) {
        return {
          valid: false,
          error: `Remote hash mismatch at index ${i}`,
          failedIndex: i,
        };
      }

      if (i > 0) {
        const prev = remoteChain[i - 1];
        if (node.prevHash !== prev.hash) {
          return {
            valid: false,
            error: `Remote prevHash link broken at index ${i}`,
            failedIndex: i,
          };
        }
      } else if (node.prevHash !== null) {
        return {
          valid: false,
          error: 'Remote genesis has non-null prevHash',
          failedIndex: 0,
        };
      }
    }

    return { valid: true, error: null, failedIndex: -1 };
  }

  importChain(remoteChain) {
    if (!remoteChain || remoteChain.length === 0) {
      return { imported: 0 };
    }

    if (this.chain.length === 0) {
      this.chain = remoteChain.map((n) => ({ ...n }));
      if (this.chain.length > 0) {
        this.genesisHash = this.chain[0].hash;
      }
      return { imported: remoteChain.length };
    }

    const localHead = this.getHead();
    const localHeadHash = localHead.hash;

    const forkPoint = remoteChain.findIndex((n) => n.hash === localHeadHash);
    if (forkPoint === -1) {
      return { imported: 0, error: 'No common ancestor found, chains diverged' };
    }

    const newNodes = remoteChain.slice(forkPoint + 1);
    for (const n of newNodes) {
      this.chain.push({ ...n });
    }
    return { imported: newNodes.length };
  }

  size() {
    return this.chain.length;
  }
}

MerkleDAG.GENESIS_PREV_HASH = null;

module.exports = MerkleDAG;
