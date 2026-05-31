export const OTEngine = {
  transform(op1, op2) {
    if (!op1 || !op2) return [op1, op2];

    const transformers = {
      'add_node': {
        'add_node': this.transformAddNode.bind(this),
        'remove_node': this.transformAddVsRemove.bind(this),
        'move_node': this.transformAddVsOther.bind(this),
        'update_node': this.transformAddVsOther.bind(this),
        'add_connection': this.transformAddVsOther.bind(this),
        'remove_connection': this.transformAddVsOther.bind(this)
      },
      'remove_node': {
        'add_node': this.transformRemoveVsAdd.bind(this),
        'remove_node': this.transformRemoveNode.bind(this),
        'move_node': this.transformRemoveVsMove.bind(this),
        'update_node': this.transformRemoveVsUpdate.bind(this),
        'add_connection': this.transformRemoveVsConnection.bind(this),
        'remove_connection': this.transformRemoveVsConnection.bind(this)
      },
      'move_node': {
        'add_node': this.transformOtherVsAdd.bind(this),
        'remove_node': this.transformMoveVsRemove.bind(this),
        'move_node': this.transformMoveNode.bind(this),
        'update_node': this.transformMoveVsUpdate.bind(this),
        'add_connection': this.transformMoveVsConnection.bind(this),
        'remove_connection': this.transformOtherVsConnection.bind(this)
      },
      'update_node': {
        'add_node': this.transformOtherVsAdd.bind(this),
        'remove_node': this.transformUpdateVsRemove.bind(this),
        'move_node': this.transformUpdateVsMove.bind(this),
        'update_node': this.transformUpdateNode.bind(this),
        'add_connection': this.transformOtherVsConnection.bind(this),
        'remove_connection': this.transformOtherVsConnection.bind(this)
      },
      'add_connection': {
        'add_node': this.transformOtherVsAdd.bind(this),
        'remove_node': this.transformConnectionVsRemove.bind(this),
        'move_node': this.transformConnectionVsMove.bind(this),
        'update_node': this.transformOtherVsConnection.bind(this),
        'add_connection': this.transformAddConnection.bind(this),
        'remove_connection': this.transformAddVsRemoveConnection.bind(this)
      },
      'remove_connection': {
        'add_node': this.transformOtherVsAdd.bind(this),
        'remove_node': this.transformOtherVsConnection.bind(this),
        'move_node': this.transformOtherVsConnection.bind(this),
        'update_node': this.transformOtherVsConnection.bind(this),
        'add_connection': this.transformRemoveVsAddConnection.bind(this),
        'remove_connection': this.transformRemoveConnection.bind(this)
      }
    };

    const transformer = transformers[op1.type]?.[op2.type];
    if (transformer) {
      return transformer(op1, op2);
    }

    return [op1, op2];
  },

  transformAddNode(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformAddVsRemove(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, null];
    }
    return [op1, op2];
  },

  transformAddVsOther(op1, op2) {
    return [op1, op2];
  },

  transformRemoveVsAdd(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformRemoveNode(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, null];
    }
    return [op1, op2];
  },

  transformRemoveVsMove(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [op1, null];
    }
    return [op1, op2];
  },

  transformRemoveVsUpdate(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [op1, null];
    }
    return [op1, op2];
  },

  transformRemoveVsConnection(op1, op2) {
    const affectedByRemove = op2.from === op1.nodeId || op2.to === op1.nodeId;
    if (affectedByRemove) {
      return [op1, null];
    }
    return [op1, op2];
  },

  transformOtherVsAdd(op1, op2) {
    return [op1, op2];
  },

  transformMoveVsRemove(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformMoveNode(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [op1, null];
    }
    return [op1, op2];
  },

  transformMoveVsUpdate(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  },

  transformMoveVsConnection(op1, op2) {
    return [op1, op2];
  },

  transformUpdateVsRemove(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformUpdateVsMove(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  },

  transformUpdateNode(op1, op2) {
    if (op1.nodeId === op2.nodeId) {
      const mergedUpdates = { ...op2.updates, ...op1.updates };
      return [{ ...op1, updates: mergedUpdates }, null];
    }
    return [op1, op2];
  },

  transformOtherVsConnection(op1, op2) {
    return [op1, op2];
  },

  transformConnectionVsRemove(op1, op2) {
    const affectedByRemove = op1.connection?.from === op2.nodeId || op1.connection?.to === op2.nodeId;
    if (affectedByRemove) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformConnectionVsMove(op1, op2) {
    return [op1, op2];
  },

  transformAddConnection(op1, op2) {
    if (op1.connectionId === op2.connectionId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformAddVsRemoveConnection(op1, op2) {
    if (op1.connectionId === op2.connectionId) {
      return [null, null];
    }
    return [op1, op2];
  },

  transformRemoveVsAddConnection(op1, op2) {
    if (op1.connectionId === op2.connectionId) {
      return [null, op2];
    }
    return [op1, op2];
  },

  transformRemoveConnection(op1, op2) {
    if (op1.connectionId === op2.connectionId) {
      return [null, null];
    }
    return [op1, op2];
  },

  applyOperation(doc, op) {
    if (!op) return doc;

    const newDoc = JSON.parse(JSON.stringify(doc));

    if (!newDoc.nodes) newDoc.nodes = [];
    if (!newDoc.connections) newDoc.connections = [];

    switch (op.type) {
      case 'add_node':
        if (!newDoc.nodes.find(n => n.id === op.node.id)) {
          newDoc.nodes.push(op.node);
        }
        break;

      case 'remove_node':
        newDoc.nodes = newDoc.nodes.filter(n => n.id !== op.nodeId);
        newDoc.connections = newDoc.connections.filter(
          c => c.from !== op.nodeId && c.to !== op.nodeId
        );
        break;

      case 'move_node':
        const nodeToMove = newDoc.nodes.find(n => n.id === op.nodeId);
        if (nodeToMove) {
          nodeToMove.x = op.x;
          nodeToMove.y = op.y;
        }
        break;

      case 'update_node':
        const nodeToUpdate = newDoc.nodes.find(n => n.id === op.nodeId);
        if (nodeToUpdate) {
          Object.assign(nodeToUpdate, op.updates);
        }
        break;

      case 'add_connection':
        if (!newDoc.connections.find(c => c.id === op.connection.id)) {
          newDoc.connections.push(op.connection);
        }
        break;

      case 'remove_connection':
        newDoc.connections = newDoc.connections.filter(c => c.id !== op.connectionId);
        break;
    }

    return newDoc;
  },

  applyOperations(doc, operations) {
    let result = doc;
    for (const op of operations) {
      result = this.applyOperation(result, op);
    }
    return result;
  },

  transformCursor(cursor, op) {
    if (!cursor || !op) return cursor;
    
    if (op.type === 'remove_node' && cursor.nodeId === op.nodeId) {
      return { ...cursor, nodeId: null };
    }
    
    return cursor;
  }
};
