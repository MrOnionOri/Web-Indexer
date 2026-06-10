import React, { useState } from "react";
import { ArrowLeft, Award, Lock, Globe, Edit3, Trash2, MessageSquare, Send } from "lucide-react";
import { parseSubtopics } from "../subtopics";

interface UserBadge {
  id: string;
  code: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  logo_url: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
  badges?: UserBadge[];
}

interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  user_name: string;
  emoji: string;
}

interface Comment {
  id: string;
  page_id: string;
  parent_id?: string;
  author_email: string;
  author_name: string;
  author_id: string;
  content: string;
  created_at: string;
  reactions: CommentReaction[];
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  subtopics?: string;
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  is_restricted: boolean;
  allowed_emails: string;
  comments_allowed: boolean;
  created_at: string;
  updated_at: string;
}

interface PageReadProps {
  currentUser: UserProfile;
  activePage: Page;
  activeSubtopicIndex?: number | null;
  comments: Comment[];
  onAddComment: (content: string, parentId?: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onToggleReaction: (commentId: string, emoji: string) => Promise<void>;
  onBackClick: () => void;
  onEditClick: () => void;
  onDeleteClick: (id: string) => void;
  hasEdit: boolean;
  hasDelete: boolean;
  renderMarkdown: (md: string) => React.ReactNode;
}

const EMOJI_LIST = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}"];

export default function PageRead({
  currentUser,
  activePage,
  activeSubtopicIndex,
  comments,
  onAddComment,
  onDeleteComment,
  onToggleReaction,
  onBackClick,
  onEditClick,
  onDeleteClick,
  hasEdit,
  hasDelete,
  renderMarkdown
}: PageReadProps) {
  const [newCommentText, setNewCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para respuestas e hilos
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isReplyingSubmitting, setIsReplyingSubmitting] = useState(false);
  const [activePickerId, setActivePickerId] = useState<string | null>(null);

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const renderUserBadges = (userId: string) => {
    if (userId !== currentUser.id || !currentUser.badges?.length) return null;
    return (
      <span className="inline-user-badges">
        {currentUser.badges.slice(0, 3).map((badge) => (
          <span
            className="inline-user-badge"
            style={{ borderColor: badge.color, color: badge.color }}
            title={badge.description || badge.label}
            key={badge.id}
          >
            {badge.logo_url ? <img className="inline-user-badge-logo" src={badge.logo_url} alt="" /> : <Award size={10} />}
            {badge.label}
          </span>
        ))}
      </span>
    );
  };

  const isOwner = activePage.created_by_id === currentUser.id;
  const pageSubtopics = parseSubtopics(activePage.subtopics);
  const selectedSubtopic = activeSubtopicIndex !== null && activeSubtopicIndex !== undefined
    ? pageSubtopics[activeSubtopicIndex]
    : null;
  const isSubtopicView = !!selectedSubtopic;
  const displayTitle = selectedSubtopic?.title || activePage.title;
  const displayContent = selectedSubtopic ? selectedSubtopic.content : activePage.content;

  // Filtrar comentarios padres y mapear hijos
  const parentComments = comments.filter(c => !c.parent_id);
  const getRepliesFor = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  // Renderizador de fila de reacciones
  const renderReactions = (comment: Comment) => {
    const reactionGroups = (comment.reactions || []).reduce((acc, r) => {
      acc[r.emoji] = acc[r.emoji] || [];
      acc[r.emoji].push(r);
      return acc;
    }, {} as Record<string, CommentReaction[]>);

    return (
      <div className="comment-reactions-row">
        {Object.entries(reactionGroups).map(([emoji, rxList]) => {
          const hasMyReaction = rxList.some(r => r.user_id === currentUser.id);
          const tooltipUsers = rxList.map(r => r.user_name).join(", ");
          return (
            <button
              key={emoji}
              type="button"
              className={`reaction-badge ${hasMyReaction ? "active" : ""}`}
              onClick={() => onToggleReaction(comment.id, emoji)}
              title={`Reaccionado por: ${tooltipUsers}`}
            >
              <span className="reaction-emoji">{emoji}</span>
              <span className="reaction-count">{rxList.length}</span>
            </button>
          );
        })}
        
        {activePage.comments_allowed && (
          <div className="reaction-picker-wrapper" style={{ position: "relative" }}>
            <button
              type="button"
              className="btn-add-reaction-toggle"
              onClick={() => setActivePickerId(activePickerId === comment.id ? null : comment.id)}
              title="Reaccionar"
            >
              +
            </button>
            {activePickerId === comment.id && (
              <div className="reaction-picker-popover">
                {EMOJI_LIST.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    className="picker-emoji-btn"
                    onClick={() => {
                      onToggleReaction(comment.id, emoji);
                      setActivePickerId(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="subview">
      <button className="btn-back" onClick={onBackClick}>
        <ArrowLeft size={14} />
        <span>Volver al listado</span>
      </button>

      <article className="page-container">
        <div className="page-header">
          <div className="page-meta-row">
            <span className="space-badge">{activePage.space_key}</span>
            {isSubtopicView && <span className="space-badge subtle">Tema: {activePage.title}</span>}
            <span className={`page-privacy ${activePage.is_restricted ? "text-muted" : "text-success"}`}>
              {activePage.is_restricted ? <><Lock size={12} /> Restringido</> : <><Globe size={12} /> Público</>}
            </span>
          </div>
          <h1 className="page-title">{displayTitle}</h1>
          <div className="page-author-card">
            <div className="author-avatar">{getInitials(activePage.created_by_name)}</div>
            <div className="author-details">
              <span className="author-name">
                {activePage.created_by_name}
                {renderUserBadges(activePage.created_by_id)}
              </span>
              <span className="page-date">Creada el {formatDate(activePage.created_at)}</span>
            </div>
            <div className="page-actions-right">
              {(hasEdit || isOwner) && (
                <button className="btn-secondary" onClick={onEditClick}>
                  <Edit3 size={14} />
                  <span>Editar</span>
                </button>
              )}
              {(hasDelete || isOwner) && (
                <button className="btn-danger" onClick={() => onDeleteClick(activePage.id)}>
                  <Trash2 size={14} />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="page-content">
          {displayContent ? renderMarkdown(displayContent) : (
            <p className="text-muted">Sin información adicional.</p>
          )}
        </div>

        {activePage.is_restricted && (
          <div className="alert-box info-alert" style={{ marginBottom: "24px" }}>
            <Lock size={18} />
            <div>
              <strong>Página Restringida:</strong> Esta página tiene límites de visibilidad. Solo puede ser vista por el creador y los siguientes correos:
              <span style={{ marginLeft: "8px", fontWeight: "bold" }}>{activePage.allowed_emails || currentUser.email}</span>
            </div>
          </div>
        )}

        {/* Sección de comentarios premium */}
        <section className="comments-section">
          <div className="comments-section-header">
            <MessageSquare size={16} />
            <h2>Comentarios ({comments.length})</h2>
          </div>

          <div className="comment-list">
            {parentComments.length === 0 ? (
              <p className="no-comments-msg">No hay comentarios en esta página aún. ¡Sé el primero en participar!</p>
            ) : (
              parentComments.map((comment) => {
                const isCommentAuthor = comment.author_id === currentUser.id;
                const isPageCreator = activePage.created_by_id === currentUser.id;
                const isAdmin = currentUser.is_platform_admin || (currentUser.permissions && currentUser.permissions.includes("gatewiki:admin"));
                const canDelete = isCommentAuthor || isPageCreator || isAdmin;
                const replies = getRepliesFor(comment.id);

                return (
                  <div key={comment.id} className="comment-block">
                    {/* Comentario Padre */}
                    <div className="comment-item">
                      <div className="comment-avatar">
                        {getInitials(comment.author_name)}
                      </div>
                      <div className="comment-body-wrapper">
                        <div className="comment-meta">
                          <span className="comment-author-name">
                            {comment.author_name}
                            {renderUserBadges(comment.author_id)}
                          </span>
                          <span className="comment-timestamp">{formatDate(comment.created_at)}</span>
                          {canDelete && (
                            <button
                              type="button"
                              className="comment-delete-btn"
                              onClick={() => {
                                if (confirm("¿Estás seguro de que deseas eliminar este comentario y todas sus respuestas?")) {
                                  onDeleteComment(comment.id);
                                }
                              }}
                              title="Eliminar comentario"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <p className="comment-text-content">{comment.content}</p>
                        
                        {/* Fila de reacciones */}
                        {renderReactions(comment)}

                        {/* Botón de Respuesta */}
                        {activePage.comments_allowed && (
                          <button
                            type="button"
                            className="btn-comment-reply-toggle"
                            onClick={() => {
                              if (replyingToId === comment.id) {
                                setReplyingToId(null);
                                setReplyText("");
                              } else {
                                setReplyingToId(comment.id);
                                setReplyText("");
                              }
                            }}
                          >
                            Responder
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Respuestas anidadas (Hilo de un nivel) */}
                    {replies.length > 0 && (
                      <div className="comment-replies-container">
                        {replies.map(reply => {
                          const isReplyAuthor = reply.author_id === currentUser.id;
                          const canDeleteReply = isReplyAuthor || isPageCreator || isAdmin;

                          return (
                            <div key={reply.id} className="comment-item reply-item">
                              <div className="comment-avatar reply-avatar">
                                {getInitials(reply.author_name)}
                              </div>
                              <div className="comment-body-wrapper">
                                <div className="comment-meta">
                                  <span className="comment-author-name">
                                    {reply.author_name}
                                    {renderUserBadges(reply.author_id)}
                                  </span>
                                  <span className="comment-timestamp">{formatDate(reply.created_at)}</span>
                                  {canDeleteReply && (
                                    <button
                                      type="button"
                                      className="comment-delete-btn"
                                      onClick={() => {
                                        if (confirm("¿Estás seguro de que deseas eliminar esta respuesta?")) {
                                          onDeleteComment(reply.id);
                                        }
                                      }}
                                      title="Eliminar respuesta"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                                <p className="comment-text-content">{reply.content}</p>
                                
                                {/* Fila de reacciones para respuestas */}
                                {renderReactions(reply)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Formulario de respuesta inline */}
                    {replyingToId === comment.id && (
                      <form
                        className="comment-form-container reply-form-inline"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!replyText.trim() || isReplyingSubmitting) return;
                          setIsReplyingSubmitting(true);
                          try {
                            await onAddComment(replyText.trim(), comment.id);
                            setReplyText("");
                            setReplyingToId(null);
                          } catch (error) {
                            console.error(error);
                          } finally {
                            setIsReplyingSubmitting(false);
                          }
                        }}
                      >
                        <textarea
                          className="comment-textarea reply-textarea"
                          rows={2}
                          placeholder={`Responder a ${comment.author_name}...`}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          required
                        />
                        <div className="comment-form-footer reply-form-footer">
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px" }}
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyText("");
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px" }}
                            disabled={isReplyingSubmitting || !replyText.trim()}
                          >
                            <Send size={11} />
                            <span>{isReplyingSubmitting ? "Enviando..." : "Responder"}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {activePage.comments_allowed ? (
            <form
              className="comment-form-container"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCommentText.trim() || isSubmitting) return;
                setIsSubmitting(true);
                try {
                  await onAddComment(newCommentText.trim());
                  setNewCommentText("");
                } catch (error) {
                  console.error(error);
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <textarea
                className="comment-textarea"
                rows={3}
                placeholder="Escribe una respuesta o comentario..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                required
              />
              <div className="comment-form-footer">
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "8px 16px", borderRadius: "10px", fontSize: "13px" }}
                  disabled={isSubmitting || !newCommentText.trim()}
                >
                  <Send size={13} />
                  <span>{isSubmitting ? "Enviando..." : "Comentar"}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="comments-disabled-alert">
              <Lock size={14} style={{ marginRight: "6px", opacity: 0.8 }} />
              <span>Los comentarios están desactivados para esta página.</span>
            </div>
          )}
        </section>
      </article>
    </div>
  );
}
