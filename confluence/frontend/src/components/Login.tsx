import React, { FormEvent } from "react";
import { BookOpen, Mail, Lock, AlertTriangle } from "lucide-react";

interface LoginProps {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
  error: string | null;
  loading: boolean;
}

export default function Login({
  email,
  setEmail,
  password,
  setPassword,
  onSubmit,
  error,
  loading
}: LoginProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-badge">
            <BookOpen size={24} />
          </div>
          <h1>Gate<span>Wiki</span></h1>
          <p>Inicia sesión con tus credenciales unificadas de GateStack</p>
        </div>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Correo Electrónico</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@gatestack.dev"
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                minLength={10}
              />
            </div>
          </div>
          {error && (
            <div className="error-msg">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" className="btn-primary full-width" disabled={loading}>
            <span>{loading ? "Procesando..." : "Iniciar Sesión"}</span>
          </button>
        </form>
        <div className="auth-footer">
          <p>Integrado de forma segura con el panel GateStack IAM (MySQL)</p>
        </div>
      </div>
    </div>
  );
}
