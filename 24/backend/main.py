from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from cypher_parser import CypherParser
from cte_generator import CTEGenerator
from explain_parser import ExplainPlanParser

app = FastAPI(title="Cypher to PostgreSQL Translator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranslateRequest(BaseModel):
    cypher: str
    include_explain: bool = True


class TranslateResponse(BaseModel):
    sql: str
    parsed: dict
    error: str | None = None
    explain_plan: dict | None = None


class ValidateResponse(BaseModel):
    valid: bool
    error: str | None = None
    error_line: int | None = None
    error_column: int | None = None


@app.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest):
    try:
        parser = CypherParser(request.cypher)
        parsed = parser.parse()
        generator = CTEGenerator(parsed)
        sql = generator.generate()

        explain_plan = None
        if request.include_explain:
            plan_parser = ExplainPlanParser(sql=sql)
            explain_plan = plan_parser.parse()

        return TranslateResponse(sql=sql, parsed=parsed, error=None, explain_plan=explain_plan)
    except Exception as e:
        return TranslateResponse(sql="", parsed={}, error=str(e), explain_plan=None)


@app.post("/validate", response_model=ValidateResponse)
async def validate(request: TranslateRequest):
    try:
        parser = CypherParser(request.cypher)
        parser.parse()
        return ValidateResponse(valid=True, error=None, error_line=None, error_column=None)
    except ValueError as e:
        error_msg = str(e)
        line_num = None
        col_num = None

        if "Missing MATCH clause" in error_msg:
            line_num = 1
            col_num = 1
        elif "Missing RETURN clause" in error_msg:
            lines = request.cypher.split('\n')
            line_num = len(lines)
            col_num = len(lines[-1]) + 1

        return ValidateResponse(
            valid=False,
            error=error_msg,
            error_line=line_num,
            error_column=col_num
        )
    except Exception as e:
        return ValidateResponse(
            valid=False,
            error=str(e),
            error_line=None,
            error_column=None
        )


@app.get("/health")
async def health():
    return {"status": "ok"}
