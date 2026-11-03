# GRANATE MCP

Servidor MCP mínimo (stdio, sin dependencias) para consultar y editar la bóveda desde
OpenCode, Claude Desktop u otro cliente compatible.

## Configuración

1. En GRANATE entra en **Ajustes → Tokens de API** y crea un token.
2. Añade el servidor a tu cliente MCP. Ejemplo para OpenCode (`opencode.json`):

```json
{
  "mcp": {
    "granate": {
      "type": "local",
      "command": ["node", "C:/Users/Manuel Q/Proyectos/GRANATE/mcp/granate-mcp.mjs"],
      "enabled": true,
      "environment": {
        "GRANATE_URL": "https://granate-five.vercel.app",
        "GRANATE_TOKEN": "granate_...",
        "GRANATE_VAULT": "opcional-id-de-boveda"
      }
    }
  }
}
```

Para Claude Desktop:

```json
{
  "mcpServers": {
    "granate": {
      "command": "node",
      "args": ["C:/Users/Manuel Q/Proyectos/GRANATE/mcp/granate-mcp.mjs"],
      "env": {
        "GRANATE_URL": "https://granate-five.vercel.app",
        "GRANATE_TOKEN": "granate_..."
      }
    }
  }
}
```

## Herramientas

- `granate_list_vaults`
- `granate_search` (`query`, `vault_id?`)
- `granate_read_note` (`path`, `vault_id?`)
- `granate_write_note` (`path`, `content`, `vault_id?`)
- `granate_list_tags` (`vault_id?`)

Todas usan la API HTTP con `Authorization: Bearer <token>`; el token hereda los permisos
del usuario que lo creó.
