import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../api";

export function PasswordResetView({
  token,
  done,
  onDone,
  onBack,
}: {
  token: string;
  done: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await api.confirmPasswordReset(token, password);
      onDone();
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell reset-shell">
      <section className="auth-intro">
        <div className="brand-mark">
          <ShieldCheck size={32} />
        </div>
        <h1>GateStack</h1>
        <p>Actualiza tu contraseña para volver a entrar a la consola.</p>
      </section>
      <form className="auth-panel" onSubmit={submit}>
        <h2>Restablecer contraseña</h2>
        {done ? (
          <>
            <p className="form-note">Contraseña actualizada. Ya puedes iniciar sesión.</p>
            <button type="button" className="primary" onClick={onBack}>
              Volver al login
            </button>
          </>
        ) : (
          <>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nueva contraseña"
              type="password"
              required
              minLength={10}
            />
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmar contraseña"
              type="password"
              required
              minLength={10}
            />
            <button className="primary" disabled={loading}>
              {loading ? "Actualizando..." : "Actualizar contraseña"}
            </button>
            {error && <p className="form-note">{error}</p>}
          </>
        )}
      </form>
    </main>
  );
}

