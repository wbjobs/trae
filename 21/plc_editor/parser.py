from typing import List, Optional

from .ast_nodes import (
    ProgramNode,
    RungNode,
    ContactNode,
    OutputNode,
    AndNode,
    OrNode,
    NotNode,
    ASTNode
)
from .lexer import Lexer, Token, TokenType


class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0

    def error(self, message: str) -> Exception:
        token = self.current_token()
        return Exception(
            f"Parser Error at line {token.line}, column {token.column}: {message}"
        )

    def current_token(self) -> Token:
        if self.pos >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[self.pos]

    def peek_token(self, offset: int = 0) -> Token:
        pos = self.pos + offset
        if pos >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[pos]

    def eat(self, token_type: TokenType) -> Token:
        token = self.current_token()
        if token.type != token_type:
            raise self.error(
                f"Expected {token_type.value}, got {token.type.value}"
            )
        self.pos += 1
        return token

    def skip_newlines(self):
        while self.current_token().type == TokenType.NEWLINE:
            self.pos += 1

    def parse_identifier(self) -> str:
        token = self.eat(TokenType.IDENTIFIER)
        return token.value

    def parse_contact(self) -> ASTNode:
        token = self.current_token()
        negated = False
        
        if token.type == TokenType.LD:
            self.pos += 1
        elif token.type == TokenType.LDI:
            self.pos += 1
            negated = True
        elif token.type == TokenType.AND:
            self.pos += 1
        elif token.type == TokenType.ANI:
            self.pos += 1
            negated = True
        elif token.type == TokenType.OR:
            self.pos += 1
        elif token.type == TokenType.ORI:
            self.pos += 1
            negated = True
        else:
            raise self.error(
                f"Expected contact instruction, got {token.type.value}"
            )
        
        name = self.parse_identifier()
        return ContactNode(name, negated)

    def parse_output(self) -> OutputNode:
        self.eat(TokenType.OUT)
        name = self.parse_identifier()
        return OutputNode(name)

    def parse_rung(self) -> Optional[RungNode]:
        self.skip_newlines()
        token = self.current_token()
        
        if token.type == TokenType.EOF:
            return None
        
        if token.type not in (TokenType.LD, TokenType.LDI):
            raise self.error(
                f"Expected LD or LDI to start rung, got {token.type.value}"
            )
        
        condition = self.parse_contact()
        
        while True:
            token = self.current_token()
            if token.type in (TokenType.AND, TokenType.ANI):
                right = self.parse_contact()
                condition = AndNode(condition, right)
            elif token.type in (TokenType.OR, TokenType.ORI):
                right = self.parse_contact()
                condition = OrNode(condition, right)
            elif token.type == TokenType.OUT:
                break
            else:
                raise self.error(
                    f"Expected AND, ANI, OR, ORI, or OUT, got {token.type.value}"
                )
        
        output = self.parse_output()
        
        if self.current_token().type == TokenType.NEWLINE:
            self.pos += 1
        
        return RungNode(condition, output)

    def parse_program(self) -> ProgramNode:
        rungs: List[RungNode] = []
        
        while True:
            rung = self.parse_rung()
            if rung is None:
                break
            rungs.append(rung)
        
        if self.current_token().type != TokenType.EOF:
            raise self.error(f"Unexpected token: {self.current_token().type.value}")
        
        return ProgramNode(rungs)

    def parse(self) -> ProgramNode:
        return self.parse_program()


def parse_source(source: str) -> ProgramNode:
    lexer = Lexer(source)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    return parser.parse()
