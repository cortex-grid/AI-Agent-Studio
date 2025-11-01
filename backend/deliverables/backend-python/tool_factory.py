"""
ToolFactory - Creates MAF tool instances from node specifications.
Supports MCP, Hosted, and Function tools following MAF patterns.
"""
import os
from typing import Dict, Any, Optional, Callable
from pathlib import Path
import logging

# MAF tool imports
try:
    from agent_framework.tools.mcp import MCPStreamableHTTPTool
    from agent_framework.tools.hosted import (
        HostedCodeInterpreterTool,
        HostedFileSearchTool,
        HostedWebSearchTool,
    )
except ImportError:
    # Fallback if hosted tools aren't available
    MCPStreamableHTTPTool = None
    HostedCodeInterpreterTool = None
    HostedFileSearchTool = None
    HostedWebSearchTool = None


class ToolFactory:
    """Factory for creating MAF tools from node specifications."""
    
    def __init__(self):
        self.tools_dir = Path(__file__).parent.parent / "tools"
        self._function_tools_cache = {}
        # Module logger
        self.logger = logging.getLogger(__name__)
        # If the application hasn't configured logging, set a sensible default
        if not logging.getLogger().handlers:
            logging.basicConfig(level=logging.INFO)
    
    def create_tool(self, node: Dict[str, Any]) -> Any:
        """
        Create a tool from a node specification.
        
        Args:
            node: Tool node with data containing subtype and toolConfig
        
        Returns:
            MAF tool instance (MCP/Hosted/Function)
        """
        data = node.get("data", {})
        subtype = data.get("subtype")
        tool_config = data.get("toolConfig", {})
        
        if not subtype:
            raise ValueError(f"Tool node {node.get('id')} missing subtype")
        
        # MCP Tools
        if subtype == "mcp-tool":
            return self._build_mcp_tool(tool_config)
        
        # Hosted Tools
        if subtype == "code-interpreter":
            return self._build_code_interpreter()
        if subtype == "file-search":
            return self._build_file_search(tool_config)
        if subtype in ["google-search", "bing-search"]:
            return self._build_web_search(tool_config)
        
        # Function Tools (yahoo-finance, pandas, etc.)
        return self._build_function_tool(subtype, tool_config)
    
    def _build_mcp_tool(self, config: Dict[str, Any]):
        """Build MCP tool from config."""
        if not MCPStreamableHTTPTool:
            raise RuntimeError("MCP tools not available. Install agent_framework with MCP support.")
        
        endpoint = config.get("apiEndpoint") or config.get("endpoint")
        if not endpoint:
            raise ValueError("MCP tool requires apiEndpoint in toolConfig")
        
        return MCPStreamableHTTPTool(url=endpoint)
    
    def _build_code_interpreter(self):
        """Build hosted code interpreter tool."""
        if not HostedCodeInterpreterTool:
            raise RuntimeError("Code interpreter not available. Check agent_framework installation.")
        
        return HostedCodeInterpreterTool()
    
    def _build_file_search(self, config: Dict[str, Any]):
        """Build hosted file search tool."""
        if not HostedFileSearchTool:
            raise RuntimeError("File search not available. Check agent_framework installation.")
        
        # Optional: vector store ID from config
        vector_store_ids = config.get("vectorStoreIds", [])
        if vector_store_ids:
            return HostedFileSearchTool(vector_store_ids=vector_store_ids)
        
        return HostedFileSearchTool()
    
    def _build_web_search(self, config: Dict[str, Any]):
        """Build hosted web search tool (Bing grounding)."""
        if not HostedWebSearchTool:
            raise RuntimeError("Web search not available. Check agent_framework installation.")
        
        # Connection name or ID from config or env
        connection_name = config.get("connectionName") or os.getenv("BING_CONNECTION_NAME")
        connection_id = config.get("connectionId") or os.getenv("BING_CONNECTION_ID")
        
        if connection_name:
            return HostedWebSearchTool(connection_name=connection_name)
        elif connection_id:
            return HostedWebSearchTool(connection_id=connection_id)
        else:
            # Default to environment-configured connection
            return HostedWebSearchTool()
    
    def _build_function_tool(self, subtype: str, config: Dict[str, Any]) -> Optional[Callable]:
        """
        Build function tool from tools directory.
        
        Looks for:
        - tools/{subtype}.py with a function matching the tool name
        - tools/{subtype}/__init__.py with exported functions
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

        # Return a placeholder that logs a warning
        self.logger.warning("Tool '%s' not implemented. Add to tools/%s.py", subtype, subtype.replace('-', '_'))
        return None
