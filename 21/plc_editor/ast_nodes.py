from abc import ABC, abstractmethod
from typing import List, Optional


class ASTNode(ABC):
    @abstractmethod
    def accept(self, visitor):
        pass

    @abstractmethod
    def __str__(self):
        pass


class ContactNode(ASTNode):
    def __init__(self, name: str, negated: bool = False):
        self.name = name
        self.negated = negated

    def accept(self, visitor):
        return visitor.visit_contact(self)

    def __str__(self):
        return f"{'NOT ' if self.negated else ''}{self.name}"


class OutputNode(ASTNode):
    def __init__(self, name: str):
        self.name = name

    def accept(self, visitor):
        return visitor.visit_output(self)

    def __str__(self):
        return f"OUT {self.name}"


class NotNode(ASTNode):
    def __init__(self, operand: ASTNode):
        self.operand = operand

    def accept(self, visitor):
        return visitor.visit_not(self)

    def __str__(self):
        return f"NOT({self.operand})"


class AndNode(ASTNode):
    def __init__(self, left: ASTNode, right: ASTNode):
        self.left = left
        self.right = right

    def accept(self, visitor):
        return visitor.visit_and(self)

    def __str__(self):
        return f"({self.left} AND {self.right})"


class OrNode(ASTNode):
    def __init__(self, left: ASTNode, right: ASTNode):
        self.left = left
        self.right = right

    def accept(self, visitor):
        return visitor.visit_or(self)

    def __str__(self):
        return f"({self.left} OR {self.right})"


class RungNode(ASTNode):
    def __init__(self, condition: ASTNode, output: OutputNode):
        self.condition = condition
        self.output = output

    def accept(self, visitor):
        return visitor.visit_rung(self)

    def __str__(self):
        return f"RUNG: {self.condition} -> {self.output}"


class ProgramNode(ASTNode):
    def __init__(self, rungs: List[RungNode]):
        self.rungs = rungs

    def accept(self, visitor):
        return visitor.visit_program(self)

    def __str__(self):
        return "\n".join(str(rung) for rung in self.rungs)


class ASTVisitor(ABC):
    @abstractmethod
    def visit_contact(self, node: ContactNode):
        pass

    @abstractmethod
    def visit_output(self, node: OutputNode):
        pass

    @abstractmethod
    def visit_not(self, node: NotNode):
        pass

    @abstractmethod
    def visit_and(self, node: AndNode):
        pass

    @abstractmethod
    def visit_or(self, node: OrNode):
        pass

    @abstractmethod
    def visit_rung(self, node: RungNode):
        pass

    @abstractmethod
    def visit_program(self, node: ProgramNode):
        pass
