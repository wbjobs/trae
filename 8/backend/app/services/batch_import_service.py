import logging
import io
import json
import re
import zipfile
import tarfile
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime

from .vector_db_service import vector_db_service
from .auto_tag_service import auto_tag_service

logger = logging.getLogger(__name__)


class BatchImportService:
    EXTENSION_TO_LANGUAGE = {
        '.py': 'python',
        '.pyw': 'python',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.java': 'java',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.hpp': 'cpp',
        '.c': 'c',
        '.h': 'c',
        '.cs': 'csharp',
        '.go': 'go',
        '.rs': 'rust',
        '.php': 'php',
        '.rb': 'ruby',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.kts': 'kotlin',
        '.sql': 'sql',
        '.sh': 'bash',
        '.bash': 'bash',
        '.zsh': 'bash',
        '.html': 'html',
        '.htm': 'html',
        '.css': 'css',
        '.scss': 'css',
        '.sass': 'css',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.markdown': 'markdown',
    }

    MAX_FILE_SIZE = 1024 * 1024
    MAX_FILES = 500
    MAX_TOTAL_SIZE = 50 * 1024 * 1024

    def detect_language(self, filename: str) -> Optional[str]:
        ext = Path(filename).suffix.lower()
        return self.EXTENSION_TO_LANGUAGE.get(ext)

    def extract_title_from_filename(self, filename: str) -> str:
        name = Path(filename).stem
        name = name.replace('_', ' ').replace('-', ' ')
        name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
        words = [w.capitalize() for w in name.split()]
        return ' '.join(words)

    def extract_description_from_code(self, code: str, language: str) -> str:
        descriptions = []

        if language == 'python':
            patterns = [
                r'^\"\"\"([\s\S]*?)\"\"\"',
                r"^'''([\s\S]*?)'''",
            ]
            for pattern in patterns:
                match = re.match(pattern, code.strip(), re.MULTILINE)
                if match:
                    desc = match.group(1).strip()
                    if desc:
                        first_paragraph = desc.split('\n\n')[0]
                        descriptions.append(first_paragraph[:500])
                        break

        elif language in ['javascript', 'typescript']:
            patterns = [
                r'^/\*\*([\s\S]*?)\*/',
            ]
            for pattern in patterns:
                match = re.match(pattern, code.strip(), re.MULTILINE)
                if match:
                    desc = match.group(1).strip()
                    desc = re.sub(r'^\s*\*', '', desc, flags=re.MULTILINE)
                    desc = re.sub(r'^\s*@\w+.*$', '', desc, flags=re.MULTILINE)
                    desc = desc.strip()
                    if desc:
                        descriptions.append(desc[:500])
                        break

        elif language == 'java':
            patterns = [
                r'^/\*\*([\s\S]*?)\*/',
            ]
            for pattern in patterns:
                match = re.match(pattern, code.strip(), re.MULTILINE)
                if match:
                    desc = match.group(1).strip()
                    desc = re.sub(r'^\s*\*', '', desc, flags=re.MULTILINE)
                    desc = desc.strip()
                    if desc:
                        descriptions.append(desc[:500])
                        break

        first_comments = []
        lines = code.strip().split('\n')[:20]
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('#') and len(stripped) > 2:
                first_comments.append(stripped[1:].strip())
            elif stripped.startswith('//') and len(stripped) > 3:
                first_comments.append(stripped[2:].strip())
            elif stripped.startswith('/*') or stripped.startswith('*'):
                continue
            elif stripped:
                break

        if first_comments and len(first_comments) >= 2:
            descriptions.append(' '.join(first_comments)[:500])

        return descriptions[0] if descriptions else ''

    def is_code_file(self, filename: str) -> bool:
        ext = Path(filename).suffix.lower()
        return ext in self.EXTENSION_TO_LANGUAGE

    def should_skip_file(self, filename: str) -> bool:
        skip_patterns = [
            r'^__pycache__/',
            r'/\.git/',
            r'/node_modules/',
            r'/venv/',
            r'/env/',
            r'/\.idea/',
            r'/\.vscode/',
            r'/dist/',
            r'/build/',
            r'\.min\.(js|css)$',
            r'\.bundle\.(js|css)$',
            r'\.map$',
        ]

        for pattern in skip_patterns:
            if re.search(pattern, filename):
                return True

        return False

    def extract_from_zip(self, zip_content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        snippets = []
        errors = []
        total_size = 0
        file_count = 0

        try:
            with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue

                    filename = info.filename

                    if self.should_skip_file(filename):
                        continue

                    if not self.is_code_file(filename):
                        continue

                    if info.file_size > self.MAX_FILE_SIZE:
                        errors.append(f"File too large: {filename}")
                        continue

                    if total_size + info.file_size > self.MAX_TOTAL_SIZE:
                        errors.append("Total size exceeded limit")
                        break

                    if file_count >= self.MAX_FILES:
                        errors.append("Maximum file count reached")
                        break

                    try:
                        content = zf.read(info.filename).decode('utf-8', errors='ignore')
                        language = self.detect_language(filename)

                        if language and content.strip():
                            snippet = self._create_snippet_from_file(
                                filename=filename,
                                content=content,
                                language=language
                            )
                            snippets.append(snippet)
                            total_size += info.file_size
                            file_count += 1

                    except Exception as e:
                        errors.append(f"Error reading {filename}: {str(e)}")

        except zipfile.BadZipFile:
            errors.append("Invalid ZIP file")
        except Exception as e:
            errors.append(f"Error extracting ZIP: {str(e)}")

        return snippets, errors

    def extract_from_tar(self, tar_content: bytes, compression: str = '') -> Tuple[List[Dict[str, Any]], List[str]]:
        snippets = []
        errors = []
        total_size = 0
        file_count = 0

        try:
            mode = 'r:*'
            if compression == 'gz':
                mode = 'r:gz'
            elif compression == 'bz2':
                mode = 'r:bz2'
            elif compression == 'xz':
                mode = 'r:xz'

            with tarfile.open(fileobj=io.BytesIO(tar_content), mode=mode) as tf:
                for member in tf.getmembers():
                    if not member.isfile():
                        continue

                    filename = member.name

                    if self.should_skip_file(filename):
                        continue

                    if not self.is_code_file(filename):
                        continue

                    if member.size > self.MAX_FILE_SIZE:
                        errors.append(f"File too large: {filename}")
                        continue

                    if total_size + member.size > self.MAX_TOTAL_SIZE:
                        errors.append("Total size exceeded limit")
                        break

                    if file_count >= self.MAX_FILES:
                        errors.append("Maximum file count reached")
                        break

                    try:
                        f = tf.extractfile(member)
                        if f:
                            content = f.read().decode('utf-8', errors='ignore')
                            language = self.detect_language(filename)

                            if language and content.strip():
                                snippet = self._create_snippet_from_file(
                                    filename=filename,
                                    content=content,
                                    language=language
                                )
                                snippets.append(snippet)
                                total_size += member.size
                                file_count += 1

                    except Exception as e:
                        errors.append(f"Error reading {filename}: {str(e)}")

        except tarfile.TarError as e:
            errors.append(f"Invalid TAR file: {str(e)}")
        except Exception as e:
            errors.append(f"Error extracting TAR: {str(e)}")

        return snippets, errors

    def _create_snippet_from_file(self, filename: str, content: str, language: str) -> Dict[str, Any]:
        title = self.extract_title_from_filename(filename)
        description = self.extract_description_from_code(content, language)

        auto_tag_result = auto_tag_service.generate_auto_tags(
            code=content,
            language=language,
            title=title,
            description=description
        )

        return {
            'title': title,
            'code': content,
            'language': language,
            'description': description,
            'tags': [],
            'auto_tags': auto_tag_result['suggested_tags'],
            'source_file': filename,
            'keywords': auto_tag_result['keywords'],
        }

    def process_archive(
        self,
        file_content: bytes,
        filename: str
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        filename_lower = filename.lower()

        if filename_lower.endswith('.zip'):
            return self.extract_from_zip(file_content)
        elif filename_lower.endswith(('.tar.gz', '.tgz')):
            return self.extract_from_tar(file_content, 'gz')
        elif filename_lower.endswith('.tar.bz2'):
            return self.extract_from_tar(file_content, 'bz2')
        elif filename_lower.endswith('.tar.xz'):
            return self.extract_from_tar(file_content, 'xz')
        elif filename_lower.endswith('.tar'):
            return self.extract_from_tar(file_content)
        else:
            return [], [f"Unsupported file format: {filename}"]

    def process_json_archive(
        self,
        file_content: bytes
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        snippets = []
        errors = []

        try:
            data = json.loads(file_content.decode('utf-8'))

            if 'snippets' in data:
                raw_snippets = data['snippets']
            elif isinstance(data, list):
                raw_snippets = data
            else:
                errors.append("Invalid JSON format. Expected array or object with 'snippets' field")
                return snippets, errors

            for i, snippet_data in enumerate(raw_snippets):
                if 'code' not in snippet_data or not snippet_data['code'].strip():
                    errors.append(f"Snippet {i+1}: Missing or empty code")
                    continue

                language = snippet_data.get('language', 'python')
                title = snippet_data.get('title', '')
                description = snippet_data.get('description', '')
                tags = snippet_data.get('tags', [])

                auto_tag_result = auto_tag_service.generate_auto_tags(
                    code=snippet_data['code'],
                    language=language,
                    title=title,
                    description=description,
                    existing_tags=tags
                )

                snippets.append({
                    'title': title,
                    'code': snippet_data['code'],
                    'language': language,
                    'description': description,
                    'tags': tags,
                    'auto_tags': auto_tag_result['suggested_tags'],
                    'keywords': auto_tag_result['keywords'],
                })

        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON: {str(e)}")
        except Exception as e:
            errors.append(f"Error processing JSON: {str(e)}")

        return snippets, errors

    def import_snippets(
        self,
        snippets: List[Dict[str, Any]],
        include_auto_tags: bool = True
    ) -> Dict[str, Any]:
        imported_count = 0
        failed_count = 0
        errors = []

        for i, snippet in enumerate(snippets):
            try:
                tags = snippet.get('tags', [])
                if include_auto_tags and snippet.get('auto_tags'):
                    tags = list(set(tags + snippet['auto_tags']))

                result = vector_db_service.add_code_snippet(
                    code=snippet['code'],
                    title=snippet.get('title'),
                    description=snippet.get('description'),
                    language=snippet.get('language', 'python'),
                    tags=tags
                )

                if result:
                    imported_count += 1
            except Exception as e:
                failed_count += 1
                errors.append(f"Snippet {i+1}: {str(e)}")

        return {
            'imported_count': imported_count,
            'failed_count': failed_count,
            'total_count': len(snippets),
            'errors': errors
        }


batch_import_service = BatchImportService()
