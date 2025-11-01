"""
ToolFactory - Creates MAF tool instances from node specifications.
Supports MCP, Hosted tools (code interpreter, file search, web search), and function tools.
"""
import os
import logging
from typing import Dict, Any, List, Callable, Optional
from pathlib import Path
from agent_framework import (
    MCPStreamableHTTPTool,
    HostedCodeInterpreterTool,
    HostedFileSearchTool,
    HostedWebSearchTool,
    HostedMCPTool,
)


class ToolFactory:
    """Factory for creating MAF tools from node specifications."""
    
    def __init__(self):
        self.tools_dir = Path(__file__).parent.parent.parent / "deliverables" / "tools"
        self._function_tools_cache = {}
        self.logger = logging.getLogger(__name__)
        if not logging.getLogger().handlers:
            logging.basicConfig(level=logging.INFO)
    
    def build_tool(self, node: Dict[str, Any]) -> Any:
        """
        Build a tool instance from a node specification.
        
        Args:
            node: Tool node with subtype and data/config
        
        Returns:
            Tool instance (MCP, Hosted, or Function)
        """
        data = node.get("data", {})
        subtype = data.get("subtype")
        config = data.get("toolConfig", {})
        
        if subtype == "mcp-tool":
            return self.build_mcp_tool(config)
        elif subtype == "code-interpreter":
            return self.build_code_interpreter()
        elif subtype == "file-search":
            return self.build_file_search(config)
        elif subtype == "google-search" or subtype == "bing-search":
            return self.build_web_search(config)
        elif subtype == "function":
            return self.build_function_tool(data)
        else:
            # Try to load from tools directory (yahoo-finance, etc.)
            return self._build_function_tool_from_file(subtype, config)
    
    def build_mcp_tool(self, config: Dict[str, Any]) -> MCPStreamableHTTPTool:
        """
        Build MCP tool from config (following azure_ai_with_local_mcp.py pattern).
        """
        endpoint = config.get("apiEndpoint", "")
        if not endpoint:
            raise ValueError("MCP tool requires apiEndpoint in toolConfig")
        
        # MCPStreamableHTTPTool pattern from MAF
        return MCPStreamableHTTPTool(url=endpoint)
    
    def build_code_interpreter(self) -> HostedCodeInterpreterTool:
        """
        Build hosted code interpreter tool (azure_ai_with_code_interpreter.py pattern).
        """
        return HostedCodeInterpreterTool()
    
    def build_file_search(self, config: Dict[str, Any] = None) -> HostedFileSearchTool:
        """
        Build hosted file search tool (azure_ai_with_file_search.py pattern).
        """
        if config and config.get("vectorStoreIds"):
            return HostedFileSearchTool(vector_store_ids=config["vectorStoreIds"])
        return HostedFileSearchTool()
    
    def build_web_search(self, config: Dict[str, Any]) -> HostedWebSearchTool:
        """
        Build hosted web search tool (azure_ai_with_bing_grounding.py pattern).
        """
        connection = config.get("connectionName") or config.get("connectionId")
        return HostedWebSearchTool(connection=connection)
    
    def build_function_tool(self, data: Dict[str, Any]) -> Callable:
        """
        Build a Python function tool from data.
        In production, this would dynamically load a function from a module.
        For now, return a simple placeholder.
        """
        # TODO: Implement dynamic function loading from data.functionRef
        # e.g., "py://tools/math.sum" -> import tools.math.sum
        def placeholder_function(input: str) -> str:
            return f"Function tool placeholder: {input}"
        
        placeholder_function.__name__ = data.get("name", "tool_function")
        placeholder_function.__doc__ = data.get("description", "A custom function tool")
        return placeholder_function
    
    def _build_function_tool_from_file(self, subtype: str, config: Dict[str, Any]) -> Optional[Callable]:
        """
        Build function tool from tools directory (yahoo-finance, etc.).
        Uses same logic as deliverables: detects classes with as_tools() or functions.
        """
        if subtype in self._function_tools_cache:
            return self._function_tools_cache[subtype]
        
        # Try to import from tools directory
        tool_file = self.tools_dir / f"{subtype.replace('-', '_')}.py"
        tool_module_dir = self.tools_dir / subtype.replace('-', '_')
        
        tool_function = None
        module = None

        # Try file import
        if tool_file.exists():
            try:
                import importlib.util
                spec = importlib.util.spec_from_file_location(subtype, tool_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    self.logger.debug("Loaded tool module from file: %s", tool_file)
            except Exception as e:
                self.logger.warning("Failed to load tool %s from file: %s", subtype, e)

        # Try module import
        if module is None and tool_module_dir.exists() and (tool_module_dir / "__init__.py").exists():
            try:
                import sys
                sys.path.insert(0, str(self.tools_dir))
                module = __import__(subtype.replace('-', '_'))
                sys.path.pop(0)
                self.logger.debug("Imported tool module: %s", subtype)
            except Exception as e:
                self.logger.warning("Failed to load tool %s from module: %s", subtype, e)

        # If we loaded a module, try to resolve common patterns
        if module is not None:
            try:
                # 1) Look for a function matching the subtype name
                func_name = subtype.replace('-', '_')
                if hasattr(module, func_name):
                    tool_function = getattr(module, func_name)
                    self.logger.info("Found function tool '%s' in module %s", func_name, subtype)
                # 2) Look for a top-level 'main' function
                elif hasattr(module, 'main'):
                    tool_function = module.main
                    self.logger.info("Found 'main' function tool in module %s", subtype)
                else:
                    # 3) Look for classes ending with 'Tool' and instantiate them
                    for attr_name in dir(module):
                        try:
                            attr = getattr(module, attr_name)
                        except Exception:
                            continue
                        if isinstance(attr, type) and attr_name.lower().endswith('tool'):
                            try:
                                # Try instantiation with no args
                                instance = attr()
                                self.logger.debug("Instantiated %s() for tool subtype %s", attr_name, subtype)
                            except TypeError:
                                # Try passing config as kwargs if available
                                try:
                                    instance = attr(**config) if isinstance(config, dict) else attr()
                                    self.logger.debug("Instantiated %s(**config) for tool subtype %s", attr_name, subtype)
                                except Exception as e:
                                    self.logger.warning("Failed to instantiate tool class %s: %s", attr_name, e)
                                    continue

                            # If instance exposes as_tools(), prefer that
                            if hasattr(instance, 'as_tools') and callable(getattr(instance, 'as_tools')):
                                try:
                                    tools_export = instance.as_tools()
                                    self._function_tools_cache[subtype] = tools_export
                                    self.logger.info("Loaded tool '%s' via %s.as_tools() -> %d callables", subtype, attr_name, len(tools_export) if hasattr(tools_export, '__len__') else 1)
                                    return tools_export
                                except Exception as e:
                                    self.logger.warning("as_tools() call failed on %s: %s", attr_name, e)

                            # Otherwise return the instance itself
                            self._function_tools_cache[subtype] = instance
                            self.logger.info("Instantiated tool class %s for subtype '%s'", attr_name, subtype)
                            return instance
            except Exception as e:
                self.logger.warning("Error while resolving tool module %s: %s", subtype, e)

        # If we found a function, cache and return it
        if tool_function:
            self._function_tools_cache[subtype] = tool_function
            self.logger.info("Loaded function tool for subtype '%s'", subtype)
            return tool_function

        # Return None (not found)
        self.logger.warning("Tool '%s' not implemented. Add to tools/%s.py", subtype, subtype.replace('-', '_'))
        return None
