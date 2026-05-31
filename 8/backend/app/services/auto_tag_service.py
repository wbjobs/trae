import logging
import re
from typing import List, Dict, Set, Tuple
from collections import Counter

logger = logging.getLogger(__name__)


class AutoTagService:
    def __init__(self):
        self._keyword_to_category: Dict[str, List[str]] = {}
        self._initialize_keyword_mappings()

    def _initialize_keyword_mappings(self):
        self._keyword_to_category = {
            'web': ['web', 'http', 'url', 'api', 'endpoint', 'route', 'rest', 'restful', 'websocket'],
            'network': ['network', 'socket', 'tcp', 'udp', 'ip', 'port', 'connection', 'networking'],
            'http': ['http', 'https', 'request', 'response', 'get', 'post', 'put', 'delete', 'fetch', 'axios'],
            'database': ['database', 'db', 'sql', 'mysql', 'postgres', 'mongodb', 'redis', 'sqlite', 'oracle', 'query', 'select', 'insert', 'update', 'delete', 'table', 'join'],
            'file': ['file', 'read', 'write', 'open', 'save', 'load', 'csv', 'json', 'yaml', 'xml', 'txt', 'path', 'directory', 'folder'],
            'async': ['async', 'await', 'promise', 'future', 'callback', 'concurrent', 'parallel', 'thread', 'coroutine'],
            'timeout': ['timeout', 'timer', 'delay', 'sleep', 'wait', 'deadline'],
            'error': ['error', 'exception', 'try', 'catch', 'throw', 'raise', 'handling', 'catch', 'finally'],
            'validation': ['validate', 'validation', 'check', 'verify', 'sanitize', 'schema'],
            'cache': ['cache', 'caching', 'memoize', 'memoization', 'lru', 'store'],
            'algorithm': ['algorithm', 'sort', 'search', 'binary', 'dynamic', 'recursive', 'greedy'],
            'data-structure': ['array', 'list', 'dictionary', 'dict', 'hash', 'map', 'set', 'queue', 'stack', 'tree', 'graph', 'linked'],
            'string': ['string', 'str', 'text', 'parse', 'split', 'join', 'replace', 'regex', 'substring'],
            'math': ['math', 'calculate', 'compute', 'number', 'average', 'sum', 'mean', 'median', 'min', 'max'],
            'date': ['date', 'time', 'datetime', 'timestamp', 'format', 'parse', 'calendar', 'moment'],
            'encoding': ['encode', 'decode', 'base64', 'utf8', 'unicode', 'compression', 'encrypt', 'decrypt'],
            'security': ['security', 'auth', 'authentication', 'authorization', 'token', 'jwt', 'password', 'hash', 'encrypt'],
            'test': ['test', 'unittest', 'pytest', 'jest', 'mock', 'assert', 'suite'],
            'logging': ['log', 'logger', 'logging', 'debug', 'info', 'warn', 'error'],
            'performance': ['performance', 'optimize', 'benchmark', 'profile', 'speed', 'efficient'],
            'gui': ['gui', 'window', 'button', 'menu', 'dialog', 'widget', 'component'],
            'cli': ['cli', 'command', 'argument', 'args', 'parse', 'terminal', 'console'],
            'concurrency': ['thread', 'process', 'multiprocess', 'queue', 'lock', 'mutex', 'semaphore'],
            'design-pattern': ['factory', 'singleton', 'observer', 'decorator', 'strategy', 'builder', 'adapter'],
            'machine-learning': ['ml', 'machine', 'learn', 'train', 'model', 'predict', 'classifier', 'neural', 'deep', 'tensor', 'pytorch', 'tensorflow'],
            'data-processing': ['data', 'pandas', 'numpy', 'process', 'transform', 'clean', 'etl', 'pipeline'],
            'api': ['api', 'rest', 'graphql', 'rpc', 'endpoint', 'client', 'server'],
            'middleware': ['middleware', 'interceptor', 'hook', 'pipeline'],
            'container': ['docker', 'container', 'image', 'compose', 'kubernetes', 'k8s'],
            'cloud': ['cloud', 'aws', 's3', 'azure', 'gcp', 'storage', 'bucket'],
        }

        self._library_to_category: Dict[str, List[str]] = {
            'requests': ['http', 'network', 'api'],
            'flask': ['web', 'api'],
            'django': ['web', 'api', 'database'],
            'fastapi': ['web', 'api'],
            'express': ['web', 'api'],
            'react': ['web', 'gui', 'frontend'],
            'vue': ['web', 'gui', 'frontend'],
            'angular': ['web', 'gui', 'frontend'],
            'next': ['web', 'frontend'],
            'pandas': ['data-processing', 'data-structure'],
            'numpy': ['math', 'data-processing'],
            'tensorflow': ['machine-learning'],
            'torch': ['machine-learning'],
            'sklearn': ['machine-learning'],
            'pytest': ['test'],
            'jest': ['test'],
            'selenium': ['test', 'web'],
            'beautifulsoup': ['web', 'parse'],
            'scrapy': ['web', 'crawler'],
            'axios': ['http', 'network'],
            'fetch': ['http', 'network'],
            'socket': ['network'],
            'sqlite3': ['database'],
            'sqlalchemy': ['database'],
            'redis': ['cache', 'database'],
            'pymongo': ['database'],
            'mysql': ['database'],
            'postgresql': ['database'],
            'asyncio': ['async', 'concurrency'],
            'threading': ['concurrency'],
            'multiprocessing': ['concurrency'],
            'json': ['file', 'data'],
            'csv': ['file', 'data'],
            'yaml': ['file', 'data'],
            'pickle': ['file'],
            'os': ['file', 'system'],
            'pathlib': ['file'],
            'sys': ['system'],
            'subprocess': ['system'],
            'argparse': ['cli'],
            'click': ['cli'],
            'typer': ['cli'],
            'logging': ['logging'],
            'unittest': ['test'],
            'datetime': ['date'],
            'time': ['date'],
            're': ['string', 'regex'],
            'collections': ['data-structure'],
            'functools': ['functional'],
            'itertools': ['functional'],
            'random': ['math'],
            'statistics': ['math'],
            'hashlib': ['security', 'encoding'],
            'base64': ['encoding'],
            'cryptography': ['security'],
            'bcrypt': ['security'],
            'jwt': ['security'],
            'email': ['email', 'network'],
            'smtplib': ['email', 'network'],
        }

        self._pattern_to_category: List[Tuple[re.Pattern, List[str]]] = [
            (re.compile(r'\bdef\s+\w+\s*\(', re.IGNORECASE), ['function']),
            (re.compile(r'\bclass\s+\w+', re.IGNORECASE), ['class', 'oop']),
            (re.compile(r'\bimport\s+\w+', re.IGNORECASE), []),
            (re.compile(r'\breturn\b', re.IGNORECASE), ['function']),
            (re.compile(r'\braise\s+\w+', re.IGNORECASE), ['error']),
            (re.compile(r'\btry\s*:\s*$', re.MULTILINE), ['error']),
            (re.compile(r'\bexcept\s+\w+', re.IGNORECASE), ['error']),
            (re.compile(r'\bfor\s+\w+\s+in\s+', re.IGNORECASE), ['loop']),
            (re.compile(r'\bwhile\s*\(', re.IGNORECASE), ['loop']),
            (re.compile(r'\bif\s+__name__\s*==\s*[\'"]__main__[\'"]', re.IGNORECASE), ['entry-point']),
            (re.compile(r'http[s]?://', re.IGNORECASE), ['http', 'network']),
            (re.compile(r'@\w+\.(get|post|put|delete|patch)\s*\(', re.IGNORECASE), ['api', 'web']),
            (re.compile(r'\bSELECT\s+', re.IGNORECASE), ['database', 'sql']),
            (re.compile(r'\bINSERT\s+INTO\s+', re.IGNORECASE), ['database', 'sql']),
            (re.compile(r'\bUPDATE\s+\w+\s+SET\s+', re.IGNORECASE), ['database', 'sql']),
            (re.compile(r'\bDELETE\s+FROM\s+', re.IGNORECASE), ['database', 'sql']),
            (re.compile(r'\bCREATE\s+TABLE\s+', re.IGNORECASE), ['database', 'sql']),
            (re.compile(r'\bfunction\s+\w+\s*\(', re.IGNORECASE), ['function']),
            (re.compile(r'\bconst\s+\w+\s*=\s*(async\s+)?\s*\(', re.IGNORECASE), ['function', 'async']),
            (re.compile(r'\basync\s+function\s+', re.IGNORECASE), ['async', 'function']),
            (re.compile(r'\bawait\s+\w+', re.IGNORECASE), ['async']),
            (re.compile(r'\bPromise\b', re.IGNORECASE), ['async']),
            (re.compile(r'\.then\s*\(', re.IGNORECASE), ['async']),
            (re.compile(r'\bfetch\s*\(', re.IGNORECASE), ['http', 'network']),
            (re.compile(r'\baxios\.\w+\s*\(', re.IGNORECASE), ['http', 'network']),
            (re.compile(r'\brequests\.\w+\s*\(', re.IGNORECASE), ['http', 'network']),
            (re.compile(r'\bopen\s*\([^)]*[\'"]r[\'"]', re.IGNORECASE), ['file']),
            (re.compile(r'\bopen\s*\([^)]*[\'"]w[\'"]', re.IGNORECASE), ['file']),
            (re.compile(r'\bwith\s+open\s*\(', re.IGNORECASE), ['file']),
            (re.compile(r'\bjson\.load', re.IGNORECASE), ['file', 'json']),
            (re.compile(r'\bjson\.dump', re.IGNORECASE), ['file', 'json']),
            (re.compile(r'\bprint\s*\(', re.IGNORECASE), ['debug']),
            (re.compile(r'\bconsole\.log\s*\(', re.IGNORECASE), ['debug']),
            (re.compile(r'\blogger\.\w+\s*\(', re.IGNORECASE), ['logging']),
            (re.compile(r'\blogging\.\w+\s*\(', re.IGNORECASE), ['logging']),
            (re.compile(r'\bassert\s+', re.IGNORECASE), ['test']),
            (re.compile(r'\bdef\s+test_\w+', re.IGNORECASE), ['test']),
            (re.compile(r'\b@Test\b', re.IGNORECASE), ['test']),
            (re.compile(r'\bdescribe\s*\(\s*[\'"]', re.IGNORECASE), ['test']),
            (re.compile(r'\bit\s*\(\s*[\'"]', re.IGNORECASE), ['test']),
            (re.compile(r'\b@app\.(route|get|post)\s*\(', re.IGNORECASE), ['web', 'api']),
            (re.compile(r'@router\.(get|post|put|delete|patch)\s*\(', re.IGNORECASE), ['api']),
            (re.compile(r'\bFastAPI\s*\(', re.IGNORECASE), ['web', 'api']),
            (re.compile(r'\bFlask\s*\(', re.IGNORECASE), ['web', 'api']),
            (re.compile(r'\bDjango\b', re.IGNORECASE), ['web', 'api']),
            (re.compile(r'\bexpress\s*\.', re.IGNORECASE), ['web', 'api']),
            (re.compile(r'\bReact\b', re.IGNORECASE), ['frontend', 'web']),
            (re.compile(r'\buseState\s*\(', re.IGNORECASE), ['frontend', 'react']),
            (re.compile(r'\buseEffect\s*\(', re.IGNORECASE), ['frontend', 'react']),
            (re.compile(r'\bimport\s+React', re.IGNORECASE), ['frontend', 'react']),
            (re.compile(r'\bVue\b', re.IGNORECASE), ['frontend', 'vue']),
            (re.compile(r'\bAngular\b', re.IGNORECASE), ['frontend', 'angular']),
        ]

    def _extract_imports(self, code: str, language: str) -> List[str]:
        imports = []

        if language in ['python', 'python3']:
            patterns = [
                r'^import\s+(\w+)',
                r'^from\s+(\w+)',
            ]
        elif language in ['javascript', 'typescript']:
            patterns = [
                r'^import\s+.*?from\s+[\'\"]([\w@/-]+)',
                r'^const\s+\w+\s*=\s*require\s*\(\s*[\'\"]([\w@/-]+)',
            ]
        elif language == 'java':
            patterns = [
                r'^import\s+([\w.]+)',
            ]
        else:
            patterns = []

        for pattern in patterns:
            matches = re.finditer(pattern, code, re.MULTILINE)
            for match in matches:
                full_lib = match.group(1)
                lib_name = full_lib.split('.')[0].split('/')[0].replace('@', '')
                if lib_name:
                    imports.append(lib_name.lower())

        return list(set(imports))

    def _extract_identifiers(self, code: str) -> List[str]:
        identifiers = []

        patterns = [
            r'^\s*(?:async\s+)?def\s+(\w+)',
            r'^\s*class\s+(\w+)',
            r'^\s*(?:const|let|var)\s+(\w+)',
            r'^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?\w+\s+(\w+)\s*\(',
            r'^\s*(?:public\s+|private\s+|protected\s+)?class\s+(\w+)',
        ]

        for pattern in patterns:
            matches = re.finditer(pattern, code, re.MULTILINE)
            for match in matches:
                identifier = match.group(1)
                if identifier and not identifier.startswith('_'):
                    identifiers.append(identifier.lower())

        return list(set(identifiers))

    def _extract_keywords(self, code: str) -> List[str]:
        keywords = []

        code_lower = code.lower()

        for keyword, categories in self._keyword_to_category.items():
            if keyword in code_lower:
                keywords.append(keyword)

        return list(set(keywords))

    def _tag_from_language(self, language: str) -> List[str]:
        language_tags = {
            'python': ['python'],
            'python3': ['python'],
            'javascript': ['javascript', 'js'],
            'typescript': ['typescript', 'ts'],
            'java': ['java'],
            'cpp': ['cpp', 'c++'],
            'c': ['c'],
            'csharp': ['csharp', 'c#'],
            'go': ['golang', 'go'],
            'rust': ['rust'],
            'php': ['php'],
            'ruby': ['ruby'],
            'swift': ['swift'],
            'kotlin': ['kotlin'],
            'sql': ['sql', 'database'],
            'bash': ['bash', 'shell'],
            'html': ['html', 'frontend'],
            'css': ['css', 'frontend'],
            'json': ['json', 'data'],
            'yaml': ['yaml', 'config'],
            'markdown': ['markdown', 'documentation'],
        }
        return language_tags.get(language.lower(), [language.lower()])

    def generate_auto_tags(
        self,
        code: str,
        language: str = 'python',
        title: str = '',
        description: str = '',
        existing_tags: List[str] = None
    ) -> Dict[str, List[str]]:
        existing_tags = existing_tags or []
        all_tags: Set[str] = set()
        all_keywords: Set[str] = set()

        all_tags.update(self._tag_from_language(language))

        imports = self._extract_imports(code, language)
        for lib in imports:
            all_keywords.add(lib)
            if lib in self._library_to_category:
                all_tags.update(self._library_to_category[lib])

        keywords = self._extract_keywords(code)
        for keyword in keywords:
            all_keywords.add(keyword)
            if keyword in self._keyword_to_category:
                all_tags.update(self._keyword_to_category[keyword])

        for pattern, categories in self._pattern_to_category:
            if pattern.search(code):
                all_tags.update(categories)

        identifiers = self._extract_identifiers(code)
        for identifier in identifiers[:20]:
            all_keywords.add(identifier)

        combined_text = f"{title} {description}".lower()
        for keyword, categories in self._keyword_to_category.items():
            if keyword in combined_text:
                all_tags.update(categories)

        all_tags = {tag for tag in all_tags if tag and len(tag) >= 2}

        existing_lower = {t.lower() for t in existing_tags}
        suggested_tags = [tag for tag in sorted(all_tags) if tag not in existing_lower]

        return {
            'suggested_tags': suggested_tags[:15],
            'keywords': sorted(list(all_keywords))[:30]
        }


auto_tag_service = AutoTagService()
