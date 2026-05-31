class FPNode {
  constructor(item, count, parent) {
    this.item = item;
    this.count = count;
    this.parent = parent;
    this.children = new Map();
    this.nodeLink = null;
  }

  increment(count) {
    this.count += count;
  }
}

class FPGrowth {
  constructor(minSupport = 0.1, minConfidence = 0.5) {
    this.minSupport = minSupport;
    this.minConfidence = minConfidence;
    this.frequentItemsets = [];
  }

  buildFPTree(transactions) {
    const itemCounts = new Map();
    for (const transaction of transactions) {
      for (const item of transaction) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    const totalTransactions = transactions.length;
    const minSupportCount = Math.ceil(this.minSupport * totalTransactions);

    const frequentItems = new Map();
    for (const [item, count] of itemCounts) {
      if (count >= minSupportCount) {
        frequentItems.set(item, count);
      }
    }

    if (frequentItems.size === 0) {
      return { tree: null, headerTable: null, frequentItems: new Map() };
    }

    const headerTable = new Map();
    for (const [item, count] of frequentItems) {
      headerTable.set(item, { count, head: null });
    }

    const root = new FPNode(null, 0, null);

    for (const transaction of transactions) {
      const sortedItems = transaction
        .filter(item => frequentItems.has(item))
        .sort((a, b) => frequentItems.get(b) - frequentItems.get(a));

      if (sortedItems.length > 0) {
        this.insertTransaction(sortedItems, root, headerTable);
      }
    }

    return { tree: root, headerTable, frequentItems };
  }

  insertTransaction(items, root, headerTable) {
    let currentNode = root;

    for (const item of items) {
      if (currentNode.children.has(item)) {
        currentNode = currentNode.children.get(item);
        currentNode.increment(1);
      } else {
        const newNode = new FPNode(item, 1, currentNode);
        currentNode.children.set(item, newNode);

        const headerEntry = headerTable.get(item);
        if (headerEntry.head === null) {
          headerEntry.head = newNode;
        } else {
          let linkNode = headerEntry.head;
          while (linkNode.nodeLink !== null) {
            linkNode = linkNode.nodeLink;
          }
          linkNode.nodeLink = newNode;
        }

        currentNode = newNode;
      }
    }
  }

  mineFrequentItemsets(transactions) {
    const { tree, headerTable, frequentItems } = this.buildFPTree(transactions);
    this.frequentItemsets = [];

    if (tree === null) {
      return [];
    }

    this.fpGrowth([], headerTable, transactions.length);
    return this.frequentItemsets;
  }

  fpGrowth(prefix, headerTable, totalTransactions) {
    const items = Array.from(headerTable.keys()).sort((a, b) => {
      const countA = headerTable.get(a).count;
      const countB = headerTable.get(b).count;
      return countA - countB;
    });

    for (const item of items) {
      const newPrefix = [...prefix, item];
      const headerEntry = headerTable.get(item);

      this.frequentItemsets.push({
        items: newPrefix,
        support: headerEntry.count / totalTransactions,
        count: headerEntry.count
      });

      const conditionalPatternBase = this.getConditionalPatternBase(item, headerTable);
      const conditionalTransactions = [];

      for (const { pattern, count } of conditionalPatternBase) {
        for (let i = 0; i < count; i++) {
          conditionalTransactions.push(pattern);
        }
      }

      const { tree: conditionalTree, headerTable: newHeaderTable } = this.buildFPTree(conditionalTransactions);

      if (conditionalTree !== null) {
        this.fpGrowth(newPrefix, newHeaderTable, totalTransactions);
      }
    }
  }

  getConditionalPatternBase(item, headerTable) {
    const patterns = [];
    const headerEntry = headerTable.get(item);

    let node = headerEntry.head;
    while (node !== null) {
      const pattern = [];
      let current = node.parent;

      while (current.item !== null) {
        pattern.unshift(current.item);
        current = current.parent;
      }

      if (pattern.length > 0) {
        patterns.push({ pattern, count: node.count });
      }

      node = node.nodeLink;
    }

    return patterns;
  }

  generateAssociationRules(frequentItemsets, transactions) {
    const rules = [];
    const itemsetMap = new Map();

    for (const itemset of frequentItemsets) {
      const key = itemset.items.sort().join(',');
      itemsetMap.set(key, itemset);
    }

    for (const itemset of frequentItemsets) {
      if (itemset.items.length < 2) continue;

      const nonEmptySubsets = this.getNonEmptySubsets(itemset.items);

      for (const subset of nonEmptySubsets) {
        const complement = itemset.items.filter(item => !subset.includes(item));

        if (complement.length === 0) continue;

        const subsetKey = subset.sort().join(',');
        const itemsetKey = itemset.items.sort().join(',');

        const subsetItemset = itemsetMap.get(subsetKey);
        const fullItemset = itemsetMap.get(itemsetKey);

        if (subsetItemset && fullItemset) {
          const confidence = fullItemset.support / subsetItemset.support;
          const lift = confidence / (fullItemset.support / (subsetItemset.support * transactions.length));

          if (confidence >= this.minConfidence) {
            rules.push({
              antecedent: subset,
              consequent: complement,
              support: fullItemset.support,
              confidence: confidence,
              lift: lift,
              count: fullItemset.count
            });
          }
        }
      }
    }

    return rules.sort((a, b) => b.confidence - a.confidence);
  }

  getNonEmptySubsets(items) {
    const subsets = [];
    const n = items.length;

    for (let i = 1; i < (1 << n); i++) {
      const subset = [];
      for (let j = 0; j < n; j++) {
        if (i & (1 << j)) {
          subset.push(items[j]);
        }
      }
      subsets.push(subset);
    }

    return subsets;
  }

  run(transactions) {
    if (transactions.length === 0) {
      return { frequentItemsets: [], rules: [] };
    }

    const frequentItemsets = this.mineFrequentItemsets(transactions);
    const rules = this.generateAssociationRules(frequentItemsets, transactions);

    return { frequentItemsets, rules };
  }
}

module.exports = FPGrowth;
