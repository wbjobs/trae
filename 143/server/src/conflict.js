export class ConflictDetector {
  static detectConflicts(sourceContent, targetContent) {
    const conflicts = [];

    const sourceNodes = new Map((sourceContent.nodes || []).map(n => [n.id, n]));
    const targetNodes = new Map((targetContent.nodes || []).map(n => [n.id, n]));
    const sourceConnections = new Map((sourceContent.connections || []).map(c => [c.id, c]));
    const targetConnections = new Map((targetContent.connections || []).map(c => [c.id, c]));

    for (const [nodeId, sourceNode] of sourceNodes) {
      if (targetNodes.has(nodeId)) {
        const targetNode = targetNodes.get(nodeId);
        
        if (this.hasNodeConflict(sourceNode, targetNode)) {
          conflicts.push({
            type: 'node_conflict',
            nodeId,
            source: {
              text: sourceNode.text,
              color: sourceNode.color,
              x: sourceNode.x,
              y: sourceNode.y
            },
            target: {
              text: targetNode.text,
              color: targetNode.color,
              x: targetNode.x,
              y: targetNode.y
            },
            description: `Node "${sourceNode.text || nodeId}" has different properties in both branches`
          });
        }

        if (this.hasPositionOverlap(sourceNode, targetNode)) {
          conflicts.push({
            type: 'node_overlap',
            nodeId,
            source: { x: sourceNode.x, y: sourceNode.y },
            target: { x: targetNode.x, y: targetNode.y },
            description: `Node "${sourceNode.text || nodeId}" position differs`
          });
        }
      }
    }

    for (const [nodeId, sourceNode] of sourceNodes) {
      if (!targetNodes.has(nodeId)) {
        for (const [targetNodeId, targetNode] of targetNodes) {
          if (this.isOverlapping(sourceNode, targetNode)) {
            conflicts.push({
              type: 'spatial_overlap',
              sourceNodeId: nodeId,
              targetNodeId,
              sourceNode: {
                id: nodeId,
                text: sourceNode.text,
                x: sourceNode.x,
                y: sourceNode.y
              },
              targetNode: {
                id: targetNodeId,
                text: targetNode.text,
                x: targetNode.x,
                y: targetNode.y
              },
              description: `Node "${sourceNode.text || nodeId}" overlaps with "${targetNode.text || targetNodeId}"`
            });
          }
        }
      }
    }

    for (const [connId, sourceConn] of sourceConnections) {
      if (targetConnections.has(connId)) {
        const targetConn = targetConnections.get(connId);
        if (sourceConn.from !== targetConn.from || sourceConn.to !== targetConn.to) {
          conflicts.push({
            type: 'connection_conflict',
            connectionId: connId,
            source: sourceConn,
            target: targetConn,
            description: `Connection "${connId}" connects different nodes`
          });
        }
      }
    }

    for (const [connId, sourceConn] of sourceConnections) {
      if (!targetConnections.has(connId)) {
        const sourceFromExists = sourceNodes.has(sourceConn.from) || targetNodes.has(sourceConn.from);
        const sourceToExists = sourceNodes.has(sourceConn.to) || targetNodes.has(sourceConn.to);
        
        if (!sourceFromExists || !sourceToExists) {
          conflicts.push({
            type: 'broken_connection',
            connectionId: connId,
            connection: sourceConn,
            description: `Connection "${connId}" may break due to missing nodes`,
            missingFrom: !sourceFromExists,
            missingTo: !sourceToExists
          });
        }
      }
    }

    for (const [connId, targetConn] of targetConnections) {
      if (!sourceConnections.has(connId)) {
        const targetFromExists = sourceNodes.has(targetConn.from) || targetNodes.has(targetConn.from);
        const targetToExists = sourceNodes.has(targetConn.to) || targetNodes.has(targetConn.to);
        
        if (!targetFromExists || !targetToExists) {
          conflicts.push({
            type: 'broken_connection',
            connectionId: connId,
            connection: targetConn,
            description: `Connection "${connId}" may break due to missing nodes`,
            missingFrom: !targetFromExists,
            missingTo: !targetToExists
          });
        }
      }
    }

    return conflicts;
  }

  static hasNodeConflict(node1, node2) {
    return (
      node1.text !== node2.text ||
      node1.color !== node2.color ||
      node1.type !== node2.type
    );
  }

  static hasPositionOverlap(node1, node2) {
    const threshold = 50;
    return (
      Math.abs(node1.x - node2.x) > threshold ||
      Math.abs(node1.y - node2.y) > threshold
    );
  }

  static isOverlapping(node1, node2) {
    const nodeSize = 100;
    return (
      Math.abs(node1.x - node2.x) < nodeSize &&
      Math.abs(node1.y - node2.y) < nodeSize
    );
  }

  static resolveConflict(conflict, resolution) {
    if (conflict.type === 'node_conflict' || conflict.type === 'node_overlap') {
      return {
        nodeId: conflict.nodeId,
        action: resolution.action,
        modifiedOperation: resolution.modifiedOperation
      };
    }
    
    if (conflict.type === 'spatial_overlap') {
      if (resolution.keepSource) {
        return {
          nodeId: conflict.targetNodeId,
          action: 'skip'
        };
      } else {
        return {
          nodeId: conflict.sourceNodeId,
          action: 'skip'
        };
      }
    }
    
    return null;
  }
}
