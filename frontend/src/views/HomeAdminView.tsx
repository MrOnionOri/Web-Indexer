import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api, PortalHomeSettings } from "../api";

export function HomeAdminView({
  settings,
  refresh,
}: {
  settings: PortalHomeSettings | null;
  refresh: () => void;
}) {
  const current = settings ?? {
    id: "",
    headline: "GateStack",
    subheadline: "Portal principal de aplicaciones internas",
    welcome_message: "Accede a tus aplicaciones aprobadas desde un solo lugar.",
    hero_image_url: null,
    announcement: "",
    updated_at: "",
  };

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
  }, [current.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      await api.updateHomeSettings({
        headline: String(form.get("headline") ?? "").trim(),
        subheadline: String(form.get("subheadline") ?? "").trim(),
        welcome_message: String(form.get("welcomeMessage") ?? "").trim(),
        hero_image_url: String(form.get("heroImageUrl") ?? "").trim() || null,
        announcement: String(form.get("announcement") ?? "").trim(),
      });
      setMessage("Home actualizada.");
      refresh();
    } catch (err: any) {
      setMessage(err.message ?? "No se pudo actualizar la home");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="table-surface home-editor">
      <div>
        <h3>Personalizar pagina de inicio</h3>
        <p className="toolbar-note">Estos textos son los que vera el usuario al entrar al portal.</p>
      </div>
      <form className="app-form" onSubmit={handleSubmit}>
        <label>
          Titulo
          <input name="headline" defaultValue={current.headline} required minLength={2} maxLength={180} />
        </label>
        <label>
          Subtitulo
          <input name="subheadline" defaultValue={current.subheadline} required minLength={2} maxLength={255} />
        </label>
        <label>
          Imagen/banner URL
          <input name="heroImageUrl" defaultValue={current.hero_image_url ?? ""} type="url" />
        </label>
        <label>
          Aviso corto
          <input name="announcement" defaultValue={current.announcement} maxLength={255} />
        </label>
        <label className="wide-field">
          Mensaje
          <textarea name="welcomeMessage" defaultValue={current.welcome_message} required minLength={2} rows={4} />
        </label>
        <div className="form-actions wide-field">
          <button className="primary compact" disabled={saving}>
            <Save />
            {saving ? "Guardando..." : "Guardar home"}
          </button>
        </div>
        {message && <p className="form-note wide-field">{message}</p>}
      </form>
    </section>
  );
}
