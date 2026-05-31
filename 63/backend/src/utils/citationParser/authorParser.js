class AuthorParser {
  constructor() {
    this.separators = /[,，;；、]|\s+and\s+|\s+&\s+/i;
  }

  parse(authorsStr) {
    if (!authorsStr) return [];
    
    const authorParts = authorsStr
      .split(this.separators)
      .map(a => a.trim())
      .filter(a => a && a.length > 0);
    
    return authorParts.map(name => this.parseSingleAuthor(name));
  }

  parseSingleAuthor(name) {
    const cleaned = name.replace(/\[.*?\]/g, '').trim();
    const parts = cleaned.split(/\s+/).filter(p => p);
    
    if (parts.length === 0) {
      return { fullName: cleaned, lastName: '', firstName: '', initials: '' };
    }

    let lastName, firstName, middleName;
    
    if (parts.length === 1) {
      lastName = parts[0];
      firstName = '';
      middleName = '';
    } else if (cleaned.includes(',')) {
      const commaParts = cleaned.split(',').map(p => p.trim());
      lastName = commaParts[0];
      const givenParts = commaParts[1] ? commaParts[1].split(/\s+/) : [];
      firstName = givenParts[0] || '';
      middleName = givenParts.slice(1).join(' ');
    } else {
      lastName = parts[parts.length - 1];
      firstName = parts[0];
      middleName = parts.slice(1, -1).join(' ');
    }

    const initials = this.generateInitials(firstName, middleName);

    return {
      fullName: cleaned,
      lastName,
      firstName,
      middleName,
      initials
    };
  }

  generateInitials(firstName, middleName) {
    const initials = [];
    if (firstName && firstName[0]) {
      initials.push(firstName[0].toUpperCase() + '.');
    }
    if (middleName) {
      middleName.split(/\s+/).forEach(m => {
        if (m[0]) initials.push(m[0].toUpperCase() + '.');
      });
    }
    return initials.join(' ');
  }

  formatAuthor(author, style = 'default') {
    switch (style) {
      case 'apa':
        return `${author.lastName}, ${author.initials}`;
      case 'mla':
        return `${author.lastName}, ${author.firstName}${author.middleName ? ' ' + author.middleName : ''}`;
      case 'chicago':
        return `${author.firstName}${author.middleName ? ' ' + author.middleName : ''} ${author.lastName}`;
      case 'gb7714':
        return `${author.lastName} ${author.firstName}`;
      case 'ieee':
        return `${author.initials} ${author.lastName}`;
      default:
        return author.fullName;
    }
  }

  formatAuthors(authors, style = 'default', maxAuthors = null) {
    if (!authors || authors.length === 0) return '';
    
    let displayAuthors = authors;
    let etAl = false;
    
    if (maxAuthors && authors.length > maxAuthors) {
      displayAuthors = authors.slice(0, maxAuthors);
      etAl = true;
    }

    const formatted = displayAuthors.map(a => this.formatAuthor(a, style));
    
    if (formatted.length === 1) {
      return formatted[0];
    }
    
    const lastAuthor = formatted.pop();
    const separator = style === 'apa' || style === 'ieee' ? ', & ' : ', and ';
    
    return formatted.join(', ') + separator + lastAuthor + (etAl ? ', et al.' : '');
  }
}

module.exports = new AuthorParser();
