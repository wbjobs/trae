from enum import Enum
from dataclasses import dataclass
from typing import List, Optional


class TokenType(Enum):
    LD = "LD"
    LDI = "LDI"
    AND = "AND"
    ANI = "ANI"
    OR = "OR"
    ORI = "ORI"
    OUT = "OUT"
    IDENTIFIER = "IDENTIFIER"
    NEWLINE = "NEWLINE"
    EOF = "EOF"


@dataclass
class Token:
    type: TokenType
    value: str
    line: int
    column: int

    def __str__(self):
        return f"Token({self.type.value}, '{self.value}', line={self.line}, col={self.column})"


KEYWORDS = {
    "LD": TokenType.LD,
    "LDI": TokenType.LDI,
    "AND": TokenType.AND,
    "ANI": TokenType.ANI,
    "OR": TokenType.OR,
    "ORI": TokenType.ORI,
    "OUT": TokenType.OUT,
}


class Lexer:
    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1
        self.column = 1
        self.tokens: List[Token] = []

    def error(self, message: str) -> Exception:
        return Exception(f"Lexer Error at line {self.line}, column {self.column}: {message}")

    def peek(self, offset: int = 0) -> Optional[str]:
        pos = self.pos + offset
        if pos >= len(self.source):
            return None
        return self.source[pos]

    def advance(self) -> Optional[str]:
        char = self.peek()
        if char is None:
            return None
        self.pos += 1
        if char == '\n':
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return char

    def skip_whitespace(self):
        while self.peek() is not None and self.peek() in ' \t\r':
            self.advance()

    def skip_comment(self):
        if self.peek() == ';':
            while self.peek() is not None and self.peek() != '\n':
                self.advance()

    def read_identifier(self) -> str:
        start_pos = self.pos
        start_column = self.column
        while self.peek() is not None and (self.peek().isalnum() or self.peek() == '_'):
            self.advance()
        identifier = self.source[start_pos:self.pos]
        return identifier

    def tokenize(self) -> List[Token]:
        while self.peek() is not None:
            start_column = self.column
            char = self.peek()

            if char in ' \t\r':
                self.skip_whitespace()
                continue

            if char == ';':
                self.skip_comment()
                continue

            if char == '\n':
                self.advance()
                self.tokens.append(Token(TokenType.NEWLINE, '\n', self.line - 1, start_column))
                continue

            if char.isalpha() or char == '_':
                identifier = self.read_identifier()
                keyword_type = KEYWORDS.get(identifier.upper())
                if keyword_type:
                    self.tokens.append(Token(keyword_type, identifier.upper(), self.line, start_column))
                else:
                    self.tokens.append(Token(TokenType.IDENTIFIER, identifier, self.line, start_column))
                continue

            raise self.error(f"Unexpected character: '{char}'")

        self.tokens.append(Token(TokenType.EOF, '', self.line, self.column))
        return self.tokens
