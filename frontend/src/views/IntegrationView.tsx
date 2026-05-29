import { useState } from "react";

export function IntegrationView() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const pythonCode = `from fastapi import Depends, Header, HTTPException, status
import httpx

GATESTACK_AUTH_URL = "http://localhost:8000/auth/me"

async def get_current_user(authorization: str = Header(...)):
    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.get(
            GATESTACK_AUTH_URL,
            headers={"Authorization": authorization},
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de GateStack inválido o expirado",
        )
    return response.json()

def require_permission(permission_code: str):
    async def dependency(user: dict = Depends(get_current_user)):
        if permission_code not in user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Falta el permiso requerido: {permission_code}",
            )
        return user
    return dependency
`;

  const reactCode = `import { useState, useEffect } from 'react';

export function useGateStackAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('gatestack_token');
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('http://localhost:8000/auth/me', {
      headers: { 'Authorization': \`Bearer \${token}\` }
    })
    .then(res => res.json())
    .then(data => {
      setUser(data);
      setLoading(false);
    })
    .catch(() => {
      localStorage.removeItem('gatestack_token');
      setLoading(false);
    });
  }, []);

  const hasPermission = (code) => {
    return user?.permissions?.includes(code) || false;
  };

  return { user, loading, hasPermission };
}
`;

  return (
    <div className="integration-view">
      <div className="table-surface header-box">
        <h3>Integración con la Matriz de Seguridad</h3>
        <p className="section-desc">
          Integra tus aplicaciones validando el token del usuario contra GateStack. No compartas la clave secreta JWT
          con apps externas; usa el endpoint de validación para obtener permisos efectivos.
        </p>

        <div className="client-secrets-panel">
          <h4>Configuración del API</h4>
          <div className="secret-row">
            <span>Endpoint de validación:</span>
            <code>http://localhost:8000/auth/me</code>
          </div>
          <p className="toolbar-note">El secreto JWT permanece solo en GateStack.</p>
        </div>
      </div>

      <div className="code-snippets-grid">
        <div className="table-surface code-card">
          <div className="code-header">
            <h4>FastAPI Backend (Middleware / Dependencia)</h4>
            <button className="secondary-action compact" onClick={() => copyToClipboard(pythonCode, "python")}>
              {copied === "python" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <pre><code>{pythonCode}</code></pre>
        </div>

        <div className="table-surface code-card">
          <div className="code-header">
            <h4>React Frontend (Hook useGateStackAuth)</h4>
            <button className="secondary-action compact" onClick={() => copyToClipboard(reactCode, "react")}>
              {copied === "react" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <pre><code>{reactCode}</code></pre>
        </div>
      </div>
    </div>
  );
}

