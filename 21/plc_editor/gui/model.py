from dataclasses import dataclass, field
from typing import List, Optional, Union
from enum import Enum
import uuid


class ElementType(Enum):
    CONTACT = "contact"
    CONTACT_NOT = "contact_not"
    OUTPUT = "output"


class ConnectionType(Enum):
    SERIES = "series"
    PARALLEL = "parallel"


@dataclass
class LadderElement:
    id: str
    type: ElementType
    name: str = ""
    x: int = 0
    y: int = 0
    width: int = 60
    height: int = 50
    selected: bool = False

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class LadderRung:
    id: str
    elements: List[LadderElement] = field(default_factory=list)
    output: Optional[LadderElement] = None

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class LadderProgram:
    rungs: List[LadderRung] = field(default_factory=list)

    def add_rung(self) -> LadderRung:
        rung = LadderRung(id=f"rung_{len(self.rungs)}")
        self.rungs.append(rung)
        return rung

    def remove_rung(self, rung_id: str):
        self.rungs = [r for r in self.rungs if r.id != rung_id]

    def get_contacts_flat(self, rung: LadderRung) -> List[LadderElement]:
        return [e for e in rung.elements if e.type in (ElementType.CONTACT, ElementType.CONTACT_NOT)]

    def to_ladder_text(self) -> str:
        lines = []
        for rung_idx, rung in enumerate(self.rungs):
            contacts = self.get_contacts_flat(rung)
            output = rung.output

            if not contacts or not output:
                continue

            first = contacts[0]
            if first.type == ElementType.CONTACT_NOT:
                lines.append(f"LDI {first.name}")
            else:
                lines.append(f"LD {first.name}")

            for elem in contacts[1:]:
                if elem.type == ElementType.CONTACT_NOT:
                    lines.append(f"ANI {elem.name}")
                elif elem.type == ElementType.CONTACT:
                    lines.append(f"AND {elem.name}")

            lines.append(f"OUT {output.name}")
            lines.append("")

        return "\n".join(lines)

    def element_count(self) -> int:
        count = 0
        for rung in self.rungs:
            count += len(rung.elements)
            if rung.output:
                count += 1
        return count
