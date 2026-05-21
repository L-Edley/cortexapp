import os
import json
import uuid
import asyncio
import logging
from typing import Dict, Any, Optional, List, Callable, Awaitable
from pydantic import BaseModel, Field, create_model, ValidationError

logger = logging.getLogger("aion.tools.registry")

TOOL_TIMEOUT_SECONDS = 10.0


class ToolParameter(BaseModel):
    type: str = Field(default="string", description="Tipo do parâmetro: string, number, boolean")
    description: str = Field(default="", description="Descrição semântica do parâmetro")


class ToolDefinition(BaseModel):
    name: str = Field(..., description="Nome único da ferramenta")
    description: str = Field(..., description="Descrição para o LLM do que a ferramenta faz")
    parameters: Dict[str, ToolParameter] = Field(default_factory=dict, description="Mapa de parâmetros esperados")


class ToolRegistry:
    def __init__(self):
        self._definitions: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, Callable] = {}
        self._validators: Dict[str, type[BaseModel]] = {}

    def register(self, name: str, definition: ToolDefinition, handler: Callable) -> None:
        self._definitions[name] = definition
        self._handlers[name] = handler
        self._validators[name] = self._build_validator(definition)
        logger.info("Tool registered: %s", name)

    @staticmethod
    def _build_validator(definition: ToolDefinition) -> type[BaseModel]:
        fields = {}
        for pname, pdef in definition.parameters.items():
            ptype = str if pdef.type == "string" else (float if pdef.type == "number" else bool)
            fields[pname] = (ptype, Field(..., description=pdef.description))
        return create_model(f"{definition.name}_params", **fields)

    def validate_tool_call(self, name: str, params: Dict[str, Any]) -> bool:
        validator = self._validators.get(name)
        if not validator:
            logger.error("Tool '%s' not found in registry", name)
            return False
        try:
            validator(**params)
            return True
        except ValidationError as e:
            logger.error("Tool '%s' parameter validation failed: %s", name, e)
            return False

    async def execute_tool(self, name: str, params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        if name not in self._handlers:
            self._log_execution("error", name, params, context, error="Handler not found")
            return {"status": "error", "error": f"Handler for tool '{name}' not found"}

        if not self.validate_tool_call(name, params):
            self._log_execution("rejected", name, params, context, error="Validation failed")
            return {"status": "error", "error": f"Tool '{name}' parameter validation failed"}

        try:
            result = await asyncio.wait_for(
                self._handlers[name](params, context),
                timeout=TOOL_TIMEOUT_SECONDS,
            )
            self._log_execution("success", name, params, context)
            return {"status": "success", "result": result}
        except asyncio.TimeoutError:
            logger.error("Tool '%s' timed out after %ss", name, TOOL_TIMEOUT_SECONDS)
            self._log_execution("timeout", name, params, context, error="Timeout")
            return {"status": "error", "error": f"Tool '{name}' execution timed out"}
        except Exception as e:
            logger.exception("Tool '%s' execution failed", name)
            self._log_execution("error", name, params, context, error=str(e))
            return {"status": "error", "error": str(e)}

    @staticmethod
    def _log_execution(status: str, name: str, params: Dict[str, Any], context: Dict[str, Any], error: Optional[str] = None):
        app_id = context.get("app_id", "unknown")
        safe_params = {k: (v[:200] + "..." if isinstance(v, str) and len(v) > 200 else v) for k, v in params.items()}
        log_data = {
            "event": "tool_execution",
            "status": status,
            "tool": name,
            "tenant": app_id,
            "params": safe_params,
        }
        if error:
            log_data["error"] = error
        logger.info("Audit: %s", json.dumps(log_data, ensure_ascii=False))

    def list_definitions(self) -> List[ToolDefinition]:
        return list(self._definitions.values())

    def get_openai_tools(self) -> List[Dict[str, Any]]:
        result = []
        for name, defn in self._definitions.items():
            props = {}
            required = []
            for pname, pdef in defn.parameters.items():
                props[pname] = {"type": pdef.type, "description": pdef.description}
                required.append(pname)
            result.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": defn.description,
                    "parameters": {
                        "type": "object",
                        "properties": props,
                        "required": required,
                    },
                },
            })
        return result


registry = ToolRegistry()


async def _create_task_handler(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "title": params.get("title", "Untitled"),
        "due_date": params.get("due_date"),
        "status": "created",
    }


async def _save_memory_handler(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    from aion.memory import sqlite_store
    app_id = context.get("app_id", "default")
    content = params.get("content", "")
    mem_type = params.get("type", "observation")
    mem_id = await sqlite_store.save_memory(app_id, content, mem_type, None)
    return {"id": mem_id, "status": "saved"}


async def _web_search_handler(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    from aion.research import web_search
    query = params.get("query", "")
    results = await web_search.search_web(query, max_results=5)
    if not results:
        return {
            "query": query,
            "results": [
                {"title": f"Simulação para '{query}'", "snippet": f"Nenhum resultado real disponível. Tavily não configurado ou offline."}
            ],
            "status": "completed",
        }
    return {
        "query": query,
        "results": results,
        "status": "completed",
    }


registry.register(
    "create_task",
    ToolDefinition(
        name="create_task",
        description="Cria uma nova tarefa com título e data de vencimento",
        parameters={
            "title": ToolParameter(type="string", description="Título da tarefa"),
            "due_date": ToolParameter(type="string", description="Data de vencimento (YYYY-MM-DD)"),
        },
    ),
    _create_task_handler,
)

registry.register(
    "save_memory",
    ToolDefinition(
        name="save_memory",
        description="Salva uma memória ou observação no banco do tenant",
        parameters={
            "content": ToolParameter(type="string", description="Conteúdo da memória"),
            "type": ToolParameter(type="string", description="Tipo da memória (observation, todo, note)"),
        },
    ),
    _save_memory_handler,
)

registry.register(
    "web_search",
    ToolDefinition(
        name="web_search",
        description="Busca informação atualizada na web via Tavily API",
        parameters={
            "query": ToolParameter(type="string", description="Termo de busca"),
        },
    ),
    _web_search_handler,
)
