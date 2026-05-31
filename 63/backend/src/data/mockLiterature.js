const mockLiteratures = [
  {
    id: 'lit-001',
    title: 'Deep Learning for Natural Language Processing: A Comprehensive Survey',
    authors: [
      { fullName: 'Zhang Wei', lastName: 'Zhang', firstName: 'Wei', hIndex: 45 },
      { fullName: 'Li Ming', lastName: 'Li', firstName: 'Ming', hIndex: 38 },
      { fullName: 'Wang Hua', lastName: 'Wang', firstName: 'Hua', hIndex: 32 }
    ],
    journal: 'Nature Machine Intelligence',
    year: 2024,
    volume: 6,
    issue: 3,
    pages: '245-268',
    doi: '10.1038/s42256-024-00123-4',
    abstract: 'This survey provides a comprehensive overview of deep learning methods applied to natural language processing tasks...',
    keywords: ['deep learning', 'NLP', 'neural networks', 'transformer', 'BERT'],
    citationCount: 1250,
    impactFactor: 25.897,
    journalRank: 'Q1',
    venueType: 'journal',
    isPeerReviewed: true,
    isOpenAccess: true,
    source: 'Nature'
  },
  {
    id: 'lit-002',
    title: 'Attention Is All You Need',
    authors: [
      { fullName: 'Ashish Vaswani', lastName: 'Vaswani', firstName: 'Ashish', hIndex: 120 },
      { fullName: 'Noam Shazeer', lastName: 'Shazeer', firstName: 'Noam', hIndex: 95 },
      { fullName: 'Niki Parmar', lastName: 'Parmar', firstName: 'Niki', hIndex: 68 }
    ],
    journal: 'NeurIPS',
    year: 2017,
    volume: 30,
    pages: '5998-6008',
    doi: '10.48550/arXiv.1706.03762',
    abstract: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms...',
    keywords: ['transformer', 'attention', 'machine translation', 'self-attention'],
    citationCount: 8500,
    impactFactor: 15.234,
    journalRank: 'Q1',
    venueType: 'conference',
    isPeerReviewed: true,
    isOpenAccess: true,
    source: 'arXiv'
  },
  {
    id: 'lit-003',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: [
      { fullName: 'Jacob Devlin', lastName: 'Devlin', firstName: 'Jacob', hIndex: 85 },
      { fullName: 'Ming-Wei Chang', lastName: 'Chang', firstName: 'Ming-Wei', hIndex: 72 },
      { fullName: 'Kenton Lee', lastName: 'Lee', firstName: 'Kenton', hIndex: 65 }
    ],
    journal: 'NAACL',
    year: 2019,
    pages: '4171-4186',
    doi: '10.48550/arXiv.1810.04805',
    abstract: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers...',
    keywords: ['BERT', 'pre-training', 'transformer', 'language model'],
    citationCount: 6200,
    impactFactor: 12.456,
    journalRank: 'Q1',
    venueType: 'conference',
    isPeerReviewed: true,
    isOpenAccess: true,
    source: 'ACL'
  },
  {
    id: 'lit-004',
    title: 'Graph Neural Networks: A Review of Methods and Applications',
    authors: [
      { fullName: 'Zhou Jie', lastName: 'Zhou', firstName: 'Jie', hIndex: 56 },
      { fullName: 'Cui Ganqu', lastName: 'Cui', firstName: 'Ganqu', hIndex: 48 },
      { fullName: 'Zhang Zhengyan', lastName: 'Zhang', firstName: 'Zhengyan', hIndex: 42 }
    ],
    journal: 'AI Journal',
    year: 2020,
    volume: 29,
    issue: 1,
    pages: '1-32',
    doi: '10.1016/j.artint.2020.103412',
    abstract: 'Graph neural networks (GNNs) have received increasing attention in recent years due to their powerful representation learning capabilities...',
    keywords: ['graph neural networks', 'GNN', 'representation learning', 'graph embedding'],
    citationCount: 3800,
    impactFactor: 18.567,
    journalRank: 'Q1',
    venueType: 'journal',
    isPeerReviewed: true,
    isOpenAccess: false,
    source: 'Elsevier'
  },
  {
    id: 'lit-005',
    title: 'Reinforcement Learning: An Introduction',
    authors: [
      { fullName: 'Richard S. Sutton', lastName: 'Sutton', firstName: 'Richard S.', hIndex: 150 },
      { fullName: 'Andrew G. Barto', lastName: 'Barto', firstName: 'Andrew G.', hIndex: 110 }
    ],
    journal: 'MIT Press',
    year: 2018,
    edition: '2nd',
    isbn: '9780262039246',
    abstract: 'This book provides a clear and simple account of the key ideas and algorithms of reinforcement learning...',
    keywords: ['reinforcement learning', 'machine learning', 'AI', 'control theory'],
    citationCount: 15000,
    impactFactor: 0,
    journalRank: '',
    venueType: 'book',
    isPeerReviewed: false,
    isOpenAccess: false,
    source: 'MIT Press'
  },
  {
    id: 'lit-006',
    title: 'A Fast Learning Algorithm for Deep Belief Nets',
    authors: [
      { fullName: 'Geoffrey E. Hinton', lastName: 'Hinton', firstName: 'Geoffrey E.', hIndex: 200 },
      { fullName: 'Simon Osindero', lastName: 'Osindero', firstName: 'Simon', hIndex: 65 },
      { fullName: 'Yee-Whye Teh', lastName: 'Teh', firstName: 'Yee-Whye', hIndex: 85 }
    ],
    journal: 'Neural Computation',
    year: 2006,
    volume: 18,
    issue: 7,
    pages: '1527-1554',
    doi: '10.1162/neco.2006.18.7.1527',
    abstract: 'We show how to use "complementary priors" to eliminate the explaining-away effects that make inference difficult in densely connected belief nets...',
    keywords: ['deep learning', 'belief networks', 'unsupervised learning', 'neural networks'],
    citationCount: 9800,
    impactFactor: 4.234,
    journalRank: 'Q2',
    venueType: 'journal',
    isPeerReviewed: true,
    isOpenAccess: false,
    source: 'MIT Press'
  },
  {
    id: 'lit-007',
    title: 'Generative Adversarial Networks',
    authors: [
      { fullName: 'Ian J. Goodfellow', lastName: 'Goodfellow', firstName: 'Ian J.', hIndex: 130 },
      { fullName: 'Jean Pouget-Abadie', lastName: 'Pouget-Abadie', firstName: 'Jean', hIndex: 55 },
      { fullName: 'Mehdi Mirza', lastName: 'Mirza', firstName: 'Mehdi', hIndex: 60 }
    ],
    journal: 'NeurIPS',
    year: 2014,
    volume: 27,
    pages: '2672-2680',
    doi: '10.48550/arXiv.1406.2661',
    abstract: 'We propose a new framework for estimating generative models via an adversarial process, in which we simultaneously train two models...',
    keywords: ['GAN', 'generative models', 'adversarial training', 'deep learning'],
    citationCount: 12000,
    impactFactor: 15.234,
    journalRank: 'Q1',
    venueType: 'conference',
    isPeerReviewed: true,
    isOpenAccess: true,
    source: 'arXiv'
  },
  {
    id: 'lit-008',
    title: 'ImageNet Classification with Deep Convolutional Neural Networks',
    authors: [
      { fullName: 'Alex Krizhevsky', lastName: 'Krizhevsky', firstName: 'Alex', hIndex: 95 },
      { fullName: 'Ilya Sutskever', lastName: 'Sutskever', firstName: 'Ilya', hIndex: 115 },
      { fullName: 'Geoffrey E. Hinton', lastName: 'Hinton', firstName: 'Geoffrey E.', hIndex: 200 }
    ],
    journal: 'NeurIPS',
    year: 2012,
    volume: 25,
    pages: '1097-1105',
    doi: '10.1145/3065386',
    abstract: 'We trained a large, deep convolutional neural network to classify the 1.2 million high-resolution images in the ImageNet LSVRC-2010 contest...',
    keywords: ['CNN', 'image classification', 'deep learning', 'ImageNet'],
    citationCount: 18000,
    impactFactor: 15.234,
    journalRank: 'Q1',
    venueType: 'conference',
    isPeerReviewed: true,
    isOpenAccess: true,
    source: 'ACM'
  }
];

const mockUsers = {
  'user-001': {
    id: 'user-001',
    name: '张学术',
    email: 'zhang.xueshu@example.com',
    avatar: '',
    affiliation: '清华大学计算机科学与技术系',
    researchFields: ['机器学习', '自然语言处理', '深度学习'],
    orcid: '0000-0001-2345-6789',
    hIndex: 25,
    totalCitations: 1250,
    publicationCount: 35,
    socialLinks: {
      github: 'https://github.com/zhangxueshu',
      googleScholar: 'https://scholar.google.com/citations?user=example',
      researchGate: 'https://researchgate.net/profile/zhang_xueshu'
    },
    preferences: {
      defaultCitationFormat: 'GB/T7714',
      theme: 'dark',
      language: 'zh-CN',
      emailNotifications: true
    }
  }
};

module.exports = {
  mockLiteratures,
  mockUsers,
  getMockLiteratureById: (id) => mockLiteratures.find(l => l.id === id),
  searchMockLiterature: (query) => {
    const lowerQuery = query.toLowerCase();
    return mockLiteratures.filter(lit => {
      return lit.title.toLowerCase().includes(lowerQuery) ||
             lit.abstract.toLowerCase().includes(lowerQuery) ||
             lit.keywords.some(k => k.toLowerCase().includes(lowerQuery)) ||
             lit.authors.some(a => a.fullName.toLowerCase().includes(lowerQuery));
    });
  }
};
