"use client";

import {
  Archive,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  EllipsisVertical,
  Laugh,
  LockKeyhole,
  LogOut,
  Mic,
  MessageCircleMore,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Reply,
  UserPlus,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRemoteUser, deleteRemoteUser, fetchEncryptedRecord, fetchInitializationStatus, fetchSession, fetchUsers, loginRemote, logoutRemote, saveEncryptedRecordRemote, searchRemoteUsers, setupRemote, updateRemoteUser } from "./api-client";
import { canUseDeviceEncryption, decryptRemoteRecord, encryptRemoteRecord, hasRemoteVaultKey, loadEncryptedRecord, lockRemoteVault, unlockRemoteVault } from "./secure-storage";
import { normalizeUsername, type LocalUser } from "./local-auth";

type Message = {
  id: string;
  body: string;
  mine: boolean;
  time: string;
  status?: "sent" | "read";
  reaction?: string;
  replyTo?: string;
  edited?: boolean;
  recalled?: boolean;
  attachment?: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
  };
};

type Conversation = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  online: boolean;
  muted?: boolean;
  archived?: boolean;
  unread: number;
  lastSeen: string;
  messages: Message[];
};

type MainView = "messages" | "contacts" | "notifications";

const initialConversations: Conversation[] = [];
const legacyDemoConversationIds = new Set(["lin", "zhou", "chen", "tang", "lu"]);

function removeLegacyDemoConversations(conversations: Conversation[]) {
  return conversations.filter((conversation) => !legacyDemoConversationIds.has(conversation.id));
}

const emojis = ["😊", "😂", "❤️", "👍", "✨", "🥳", "👀", "🤝"];
const conversationColors = ["#415d7d", "#7b9ad8", "#8f86c3", "#c886a8", "#7c9b8a"];

function conversationFromUser(user: LocalUser): Conversation {
  const colorIndex = Array.from(user.username).reduce((total, character) => total + character.charCodeAt(0), 0) % conversationColors.length;
  return {
    id: user.username,
    name: user.displayName,
    handle: `@${user.username}`,
    initials: user.displayName.slice(0, 1).toUpperCase(),
    color: conversationColors[colorIndex],
    online: false,
    unread: 0,
    lastSeen: "刚刚加入",
    messages: [],
  };
}

function LoginScreen({ initialized, onLogin, onSetup }: {
  initialized: boolean;
  onLogin: (username: string, password: string) => Promise<string | null>;
  onSetup: (username: string, password: string) => Promise<string | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const loginError = await (initialized ? onLogin(username, password) : onSetup(username, password));
    setSubmitting(false);
    if (loginError) setError(loginError);
  }

  return (
    <main className="login-screen cloud-login">
      <header className="cloud-header">
        <div className="cloud-brand"><span><Cloud size={21} /></span><strong>青屿云盘</strong></div>
      </header>
      <section className="login-form-side">
        <form className="login-card" onSubmit={submitLogin}>
          <div className="cloud-card-icon"><Cloud size={25} /></div>
          <h2>{initialized ? "登录云盘" : "首次设置"}</h2>
          <p className="login-intro">{initialized ? "安全访问并管理您的文件" : "创建管理员账户后即可使用"}</p>
          <label className="login-field">
            <span>账户名</span>
            <div><CircleUserRound size={18} /><input value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" placeholder="输入账户名" autoFocus /></div>
          </label>
          <label className="login-field">
            <span>密码</span>
            <div><LockKeyhole size={18} /><input value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} type={showPassword ? "text" : "password"} autoComplete={initialized ? "current-password" : "new-password"} placeholder={initialized ? "输入密码" : "设置至少 12 位密码"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </label>
          <div className={`login-error ${error ? "visible" : ""}`} role="alert">{error || "占位"}</div>
          <button className="login-submit" disabled={submitting}>{submitting ? "正在验证…" : initialized ? "登录" : "创建管理员账户"}</button>
        </form>
      </section>
      <footer className="cloud-footer"><span>© 2026 青屿云盘</span><span>隐私 · 条款 · 安全</span></footer>
    </main>
  );
}

function Avatar({ person, size = "md" }: { person: Conversation; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ background: person.color }} aria-hidden="true">
      {person.initials}
      {person.online && <i className="online-dot" />}
    </span>
  );
}

function SelfAvatarContent({ avatar, size, fallback }: { avatar: string | null; size: number; fallback: string }) {
  return avatar ? <Image className="self-avatar-image" src={avatar} alt="" width={size} height={size} unoptimized /> : <>{fallback}</>;
}

export default function ChatApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [serverInitialized, setServerInitialized] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [userManagerOpen, setUserManagerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [updatingUser, setUpdatingUser] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<LocalUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [userFormError, setUserFormError] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [activeView, setActiveView] = useState<MainView>("messages");
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [newChatResults, setNewChatResults] = useState<LocalUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [newChatSearchError, setNewChatSearchError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [swipeGesture, setSwipeGesture] = useState<{ id: string; startX: number; offset: number; base: number } | null>(null);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);
  const [deleteTargetKind, setDeleteTargetKind] = useState<"conversation" | "contact">("conversation");
  const [contactMenuId, setContactMenuId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [callMode, setCallMode] = useState<"audio" | "video" | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [secureStorageReady, setSecureStorageReady] = useState(false);
  const [deviceEncryptionEnabled, setDeviceEncryptionEnabled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const suppressConversationClickRef = useRef(false);
  const messageLongPressTimerRef = useRef<number | null>(null);
  const contactLongPressTimerRef = useRef<number | null>(null);
  const storageWriteVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const initialized = await fetchInitializationStatus();
        if (cancelled) return;
        setServerInitialized(initialized);
        if (!initialized) return;
        const sessionUser = await fetchSession();
        if (cancelled) return;
        const encryptionEnabled = canUseDeviceEncryption();
        if (sessionUser && (!encryptionEnabled || await hasRemoteVaultKey(sessionUser.username))) {
          setDeviceEncryptionEnabled(encryptionEnabled);
          setCurrentUser(sessionUser);
          setAuthenticated(true);
          if (sessionUser.role === "admin") setUsers(await fetchUsers());
          const avatarKey = `milo-self-avatar:${sessionUser.username}`;
          const avatar = window.localStorage.getItem(avatarKey) ?? (sessionUser.role === "admin" ? window.localStorage.getItem("milo-self-avatar") : null);
          if (avatar && !window.localStorage.getItem(avatarKey)) window.localStorage.setItem(avatarKey, avatar);
          setSelfAvatar(avatar);
          if (!encryptionEnabled) setToast("HTTP 测试模式：登录成功，加密记录已暂停");
        } else if (sessionUser) {
          await logoutRemote();
        }
      } catch {
        setToast("服务器暂时不可用");
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!currentUser || !deviceEncryptionEnabled) return;
    let cancelled = false;
    const recordName = `conversations:${currentUser.username}`;
    void (async () => {
      try {
        const remote = await fetchEncryptedRecord(recordName);
        if (cancelled) return;
        if (remote) {
          const storedConversations = await decryptRemoteRecord<Conversation[]>(currentUser.username, recordName, remote);
          const cleanedConversations = removeLegacyDemoConversations(storedConversations);
          setConversations(cleanedConversations);
          setActiveId(cleanedConversations[0]?.id ?? "");
          window.localStorage.removeItem("milo-conversations");
        } else {
          const encryptedLocal = await loadEncryptedRecord<Conversation[]>(recordName)
            ?? (currentUser.role === "admin" ? await loadEncryptedRecord<Conversation[]>("conversations") : null);
          const legacy = currentUser.role === "admin" ? window.localStorage.getItem("milo-conversations") : null;
          const storedConversations = encryptedLocal ?? (legacy ? JSON.parse(legacy) as Conversation[] : null);
          const migrated = storedConversations ? removeLegacyDemoConversations(storedConversations) : null;
          if (migrated) {
            await saveEncryptedRecordRemote(recordName, await encryptRemoteRecord(currentUser.username, recordName, migrated));
            if (cancelled) return;
            setConversations(migrated);
            setActiveId(migrated[0]?.id ?? "");
            window.localStorage.removeItem("milo-conversations");
          } else {
            setConversations(initialConversations);
            setActiveId("");
          }
        }
        setHydrated(true);
        setSecureStorageReady(true);
      } catch {
        if (!cancelled) setToast("加密消息记录无法读取，已停止写入以保护原数据");
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, deviceEncryptionEnabled]);

  useEffect(() => {
    if (!hydrated || !currentUser || !deviceEncryptionEnabled) return;
    const version = storageWriteVersionRef.current + 1;
    storageWriteVersionRef.current = version;
    const recordName = `conversations:${currentUser.username}`;
    void encryptRemoteRecord(currentUser.username, recordName, conversations)
      .then((payload) => saveEncryptedRecordRemote(recordName, payload)).catch(() => {
      if (storageWriteVersionRef.current === version) setToast("加密消息记录保存失败");
    });
  }, [conversations, currentUser, deviceEncryptionEnabled, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, conversations]);

  useEffect(() => {
    if (!callMode) return;
    const timer = window.setInterval(() => setCallSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!newChatOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const normalized = normalizeUsername(newChatQuery);
      if (!/^[a-z0-9_.-]{3,32}$/.test(normalized)) {
        setNewChatResults([]);
        setNewChatSearchError("");
        setSearchingUsers(false);
        return;
      }
      setSearchingUsers(true);
      setNewChatSearchError("");
      void searchRemoteUsers(normalized).then((results) => {
        if (cancelled) return;
        setNewChatResults(results);
        setSearchingUsers(false);
      }).catch(() => {
        if (cancelled) return;
        setNewChatResults([]);
        setSearchingUsers(false);
        setNewChatSearchError("搜索失败，请稍后重试");
      });
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newChatOpen, newChatQuery]);

  useEffect(() => {
    if (!actionMessageId) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(".message-menu") || target.closest(".message-bubble"))) return;
      setActionMessageId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMessageId(null);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionMessageId]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setRecordSeconds((value) => {
        if (value >= 59) recorderRef.current?.stop();
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const scoped = conversations.filter((item) => Boolean(item.archived) === showArchived);
    if (!normalized) return scoped;
    return scoped.filter((item) =>
      `${item.name} ${item.handle} ${item.messages.at(-1)?.body ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [conversations, query, showArchived]);

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((item) => {
      if (item.archived) return false;
      return !normalized || `${item.name} ${item.handle}`.toLowerCase().includes(normalized);
    });
  }, [conversations, query]);

  const notificationConversations = conversations.filter((item) => item.unread > 0 && !item.archived);
  const unreadTotal = notificationConversations.reduce((total, item) => total + item.unread, 0);

  const displayedMessages = useMemo(() => {
    if (!active) return [];
    const normalized = messageQuery.trim().toLowerCase();
    if (!normalized) return active.messages;
    return active.messages.filter((message) =>
      `${message.body} ${message.attachment?.name ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [active, messageQuery]);

  const sharedMessages = active?.messages.filter((message) => message.attachment) ?? [];
  const contactMenuPerson = conversations.find((item) => item.id === contactMenuId);
  const selfInitial = (currentUser?.displayName || currentUser?.username || "A").slice(0, 1).toUpperCase();

  function selectConversation(id: string) {
    if (suppressConversationClickRef.current) {
      suppressConversationClickRef.current = false;
      return;
    }
    if (openSwipeId === id) {
      setOpenSwipeId(null);
      return;
    }
    setActiveId(id);
    setMobileChatOpen(true);
    setDetailsOpen(false);
    setConversations((items) => items.map((item) => (item.id === id ? { ...item, unread: 0 } : item)));
  }

  function selectMainView(view: MainView) {
    setActiveView(view);
    setMobileChatOpen(false);
    setDetailsOpen(false);
    setMessageSearchOpen(false);
    setActionMessageId(null);
    setOpenSwipeId(null);
    setQuery("");
  }

  function openConversationFromView(id: string) {
    if (suppressConversationClickRef.current) {
      suppressConversationClickRef.current = false;
      return;
    }
    if (openSwipeId === id) {
      setOpenSwipeId(null);
      return;
    }
    setActiveView("messages");
    setActiveId(id);
    setMobileChatOpen(true);
    setDetailsOpen(false);
    setConversations((items) => items.map((item) => (item.id === id ? { ...item, unread: 0 } : item)));
  }

  function openContactConversation(id: string) {
    setContactMenuId(null);
    setActiveView("messages");
    setActiveId(id);
    setMobileChatOpen(true);
    setDetailsOpen(false);
    setConversations((items) => items.map((item) => (item.id === id ? { ...item, unread: 0 } : item)));
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (editingId) {
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? { ...item, messages: item.messages.map((message) => message.id === editingId ? { ...message, body, edited: true } : message) }
            : item,
        ),
      );
      setDraft("");
      setEditingId(null);
      setToast("消息已修改");
      return;
    }
    const message: Message = {
      id: crypto.randomUUID(),
      body,
      mine: true,
      time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
      status: "sent",
      replyTo: replyingTo?.body,
    };
    setConversations((items) =>
      items.map((item) => (item.id === activeId ? { ...item, messages: [...item.messages, message] } : item)),
    );
    setDraft("");
    setReplyingTo(null);
    setEmojiOpen(false);
    window.setTimeout(() => {
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? { ...item, messages: item.messages.map((entry) => (entry.id === message.id ? { ...entry, status: "read" } : entry)) }
            : item,
        ),
      );
    }, 900);
  }

  function reactTo(messageId: string) {
    setConversations((items) =>
      items.map((item) =>
        item.id === activeId
          ? {
              ...item,
              messages: item.messages.map((message) =>
                message.id === messageId ? { ...message, reaction: message.reaction ? undefined : "❤️" } : message,
              ),
            }
          : item,
      ),
    );
  }

  function startMessageLongPress(event: ReactPointerEvent<HTMLButtonElement>, messageId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (messageLongPressTimerRef.current) window.clearTimeout(messageLongPressTimerRef.current);
    messageLongPressTimerRef.current = window.setTimeout(() => {
      setActionMessageId(messageId);
      navigator.vibrate?.(35);
      messageLongPressTimerRef.current = null;
    }, 480);
  }

  function cancelMessageLongPress() {
    if (!messageLongPressTimerRef.current) return;
    window.clearTimeout(messageLongPressTimerRef.current);
    messageLongPressTimerRef.current = null;
  }

  function startContactLongPress(event: ReactPointerEvent<HTMLButtonElement>, contactId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (contactLongPressTimerRef.current) window.clearTimeout(contactLongPressTimerRef.current);
    contactLongPressTimerRef.current = window.setTimeout(() => {
      suppressConversationClickRef.current = true;
      setOpenSwipeId(null);
      setContactMenuId(contactId);
      navigator.vibrate?.(35);
      contactLongPressTimerRef.current = null;
    }, 480);
  }

  function cancelContactLongPress() {
    if (!contactLongPressTimerRef.current) return;
    window.clearTimeout(contactLongPressTimerRef.current);
    contactLongPressTimerRef.current = null;
  }

  function moveContactSwipe(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (swipeGesture?.id === id && Math.abs(event.clientX - swipeGesture.startX) > 6) cancelContactLongPress();
    moveConversationSwipe(event, id);
  }

  function requestDelete(id: string, kind: "conversation" | "contact") {
    setDeleteTargetKind(kind);
    setDeleteConversationId(id);
    setContactMenuId(null);
  }

  function toggleMute() {
    setConversations((items) => items.map((item) => (item.id === activeId ? { ...item, muted: !item.muted } : item)));
  }

  function startReply(message: Message) {
    setReplyingTo(message);
    setEditingId(null);
    setActionMessageId(null);
  }

  function startEdit(message: Message) {
    setDraft(message.body);
    setEditingId(message.id);
    setReplyingTo(null);
    setActionMessageId(null);
  }

  function deleteMessage(messageId: string) {
    setConversations((items) => items.map((item) => item.id === activeId ? { ...item, messages: item.messages.filter((message) => message.id !== messageId) } : item));
    setActionMessageId(null);
    setToast("消息已删除");
  }

  function recallMessage(messageId: string) {
    setConversations((items) => items.map((item) =>
      item.id === activeId
        ? { ...item, messages: item.messages.map((message) => message.id === messageId ? { ...message, body: "", attachment: undefined, replyTo: undefined, reaction: undefined, edited: false, recalled: true } : message) }
        : item,
    ));
    setActionMessageId(null);
    setToast("消息已撤回");
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(message.body || message.attachment?.name || "");
    setActionMessageId(null);
    setToast("已复制到剪贴板");
  }

  function archiveConversation() {
    if (!active) return;
    const nextArchived = !active.archived;
    setConversations((items) => items.map((item) => item.id === activeId ? { ...item, archived: nextArchived } : item));
    const next = conversations.find((item) => item.id !== activeId && Boolean(item.archived) === showArchived);
    if (next) setActiveId(next.id);
    setToast(nextArchived ? "对话已归档" : "对话已移出归档");
  }

  function archiveConversationById(id: string) {
    const target = conversations.find((item) => item.id === id);
    if (!target) return;
    const archived = !target.archived;
    setConversations((items) => items.map((item) => item.id === id ? { ...item, archived } : item));
    setOpenSwipeId(null);
    if (activeId === id) {
      const next = conversations.find((item) => item.id !== id && Boolean(item.archived) === showArchived);
      if (next) setActiveId(next.id);
    }
    setToast(archived ? "对话已归档" : "对话已恢复");
  }

  function confirmDeleteConversation() {
    if (!deleteConversationId) return;
    const deletingId = deleteConversationId;
    const remaining = conversations.filter((item) => item.id !== deletingId);
    setConversations(remaining);
    if (activeId === deletingId) setActiveId(remaining[0]?.id ?? "");
    setDeleteConversationId(null);
    setOpenSwipeId(null);
    setToast(deleteTargetKind === "contact" ? "联系人及本地聊天记录已删除" : "对话已删除");
  }

  function startConversationSwipe(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setSwipeGesture({ id, startX: event.clientX, offset: openSwipeId === id ? -132 : 0, base: openSwipeId === id ? -132 : 0 });
  }

  function moveConversationSwipe(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (!swipeGesture || swipeGesture.id !== id) return;
    const offset = Math.max(-132, Math.min(0, swipeGesture.base + event.clientX - swipeGesture.startX));
    if (Math.abs(offset - swipeGesture.base) > 5) suppressConversationClickRef.current = true;
    setSwipeGesture({ ...swipeGesture, offset });
  }

  function endConversationSwipe(id: string) {
    if (!swipeGesture || swipeGesture.id !== id) return;
    setOpenSwipeId(swipeGesture.offset < -52 ? id : null);
    setSwipeGesture(null);
  }

  function startCall(mode: "audio" | "video") {
    setCallSeconds(0);
    setCallMode(mode);
  }

  function handleAttachment(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast("本地版附件不能超过 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const message: Message = {
        id: crypto.randomUUID(),
        body: "",
        mine: true,
        time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        status: "read",
        replyTo: replyingTo?.body,
        attachment: { name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl: String(reader.result) },
      };
      setConversations((items) => items.map((item) => item.id === activeId ? { ...item, messages: [...item.messages, message] } : item));
      setReplyingTo(null);
      setToast("附件已发送");
    };
    reader.readAsDataURL(file);
  }

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartedRef.current = Date.now();
      setRecordSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const message: Message = {
            id: crypto.randomUUID(), body: "", mine: true,
            time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
            status: "read",
            attachment: { name: `语音消息 ${duration}秒.webm`, type: blob.type, size: blob.size, dataUrl: String(reader.result) },
          };
          setConversations((items) => items.map((item) => item.id === activeId ? { ...item, messages: [...item.messages, message] } : item));
          setToast("语音消息已发送");
        };
        reader.readAsDataURL(blob);
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      setToast("无法使用麦克风，请检查浏览器权限");
    }
  }

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const rest = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  async function login(username: string, password: string): Promise<string | null> {
    try {
      const user = await loginRemote(normalizeUsername(username), password);
      const encryptionEnabled = canUseDeviceEncryption();
      if (encryptionEnabled) await unlockRemoteVault(user.username, password, user.vaultSalt, user.vaultIterations);
      setUsers(user.role === "admin" ? await fetchUsers() : []);
      setHydrated(false);
      setSecureStorageReady(false);
      setDeviceEncryptionEnabled(encryptionEnabled);
      setCurrentUser(user);
      setAuthenticated(true);
      setSelfAvatar(window.localStorage.getItem(`milo-self-avatar:${user.username}`));
      if (!encryptionEnabled) setToast("HTTP 测试模式：登录成功，加密记录已暂停");
      return null;
    } catch (error) {
      if (error instanceof Error && error.message === "invalid credentials") return "账户名或密码不正确";
      return "服务器暂时不可用，请稍后重试";
    }
  }

  async function setup(username: string, password: string): Promise<string | null> {
    try {
      const normalized = normalizeUsername(username);
      const user = await setupRemote(normalized, password);
      const encryptionEnabled = canUseDeviceEncryption();
      if (encryptionEnabled) await unlockRemoteVault(user.username, password, user.vaultSalt, user.vaultIterations);
      setUsers([user]);
      setHydrated(false);
      setSecureStorageReady(false);
      setDeviceEncryptionEnabled(encryptionEnabled);
      setCurrentUser(user);
      setServerInitialized(true);
      setAuthenticated(true);
      if (!encryptionEnabled) setToast("HTTP 测试模式：账户已创建，加密记录已暂停");
      return null;
    } catch (error) {
      if (error instanceof Error && error.message === "invalid username") return "账户名需为 3–32 位字母、数字或 ._-";
      if (error instanceof Error && error.message === "weak password") return "密码至少需要 12 位";
      if (error instanceof Error && error.message === "already initialized") {
        setServerInitialized(true);
        return "管理员账户已经创建，请直接登录";
      }
      return "服务器暂时不可用，请稍后重试";
    }
  }

  function logout() {
    if (currentUser) void lockRemoteVault(currentUser.username);
    void logoutRemote();
    setAccountOpen(false);
    setUserManagerOpen(false);
    setHydrated(false);
    setSecureStorageReady(false);
    setDeviceEncryptionEnabled(false);
    setCurrentUser(null);
    setSelfAvatar(null);
    setAuthenticated(false);
  }

  function beginEditUser(user: LocalUser) {
    setEditingUser(user.username);
    setEditingDisplayName(user.displayName);
    setUserFormError("");
  }

  function cancelEditUser() {
    setEditingUser(null);
    setEditingDisplayName("");
  }

  async function saveUserEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingUser || currentUser?.role !== "admin") return;
    const displayName = editingDisplayName.trim();
    if (!displayName) {
      setUserFormError("显示名称不能为空");
      return;
    }
    setUpdatingUser(true);
    setUserFormError("");
    try {
      const updated = await updateRemoteUser(editingUser, { displayName });
      setUsers((items) => items.map((user) => user.username === updated.username ? updated : user));
      cancelEditUser();
      setToast(`用户 ${updated.username} 已更新`);
    } catch {
      setUserFormError("用户更新失败，请重试");
    } finally {
      setUpdatingUser(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteUserTarget || currentUser?.role !== "admin") return;
    setDeletingUser(true);
    try {
      await deleteRemoteUser(deleteUserTarget.username);
      setUsers((items) => items.filter((user) => user.username !== deleteUserTarget.username));
      if (editingUser === deleteUserTarget.username) cancelEditUser();
      setToast(`用户 ${deleteUserTarget.username} 已删除`);
      setDeleteUserTarget(null);
    } catch {
      setUserFormError("用户删除失败，请重试");
    } finally {
      setDeletingUser(false);
    }
  }

  function openUserConversation(user: LocalUser) {
    setActiveView("messages");
    setActiveId(user.username);
    setMobileChatOpen(true);
    setDetailsOpen(false);
    setNewChatOpen(false);
    setNewChatQuery("");
    setNewChatResults([]);
    setNewChatSearchError("");
    setConversations((items) => {
      const existing = items.some((conversation) => conversation.id === user.username);
      const next = existing ? items : [...items, conversationFromUser(user)];
      return next.map((item) => item.id === user.username ? { ...item, unread: 0 } : item);
    });
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    if (currentUser?.role !== "admin") return;
    const username = normalizeUsername(newUsername);
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      setUserFormError("用户名需为 3–32 位小写字母、数字、点、横线或下划线");
      return;
    }
    if (users.some((user) => user.username === username)) {
      setUserFormError("该用户名已存在");
      return;
    }
    if (newUserPassword.length < 12) {
      setUserFormError("初始密码至少需要 12 位");
      return;
    }
    setCreatingUser(true);
    setUserFormError("");
    try {
      const user = await createRemoteUser({ username, displayName: newDisplayName.trim() || username, password: newUserPassword });
      const nextUsers = [...users, user];
      setUsers(nextUsers);
      setNewUsername("");
      setNewDisplayName("");
      setNewUserPassword("");
      setToast(`用户 ${username} 已创建`);
    } catch {
      setUserFormError("用户创建失败，请重试");
    } finally {
      setCreatingUser(false);
    }
  }

  function handleAvatarUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast("请选择图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast("头像图片不能超过 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setToast("头像读取失败");
    reader.onload = () => {
      const source = new window.Image();
      source.onerror = () => setToast("无法识别这张图片");
      source.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) {
          setToast("头像处理失败");
          return;
        }
        const cropSize = Math.min(source.naturalWidth, source.naturalHeight);
        const sourceX = (source.naturalWidth - cropSize) / 2;
        const sourceY = (source.naturalHeight - cropSize) / 2;
        context.drawImage(source, sourceX, sourceY, cropSize, cropSize, 0, 0, 256, 256);
        const nextAvatar = canvas.toDataURL("image/jpeg", 0.86);
        try {
          if (!currentUser) return;
          window.localStorage.setItem(`milo-self-avatar:${currentUser.username}`, nextAvatar);
          setSelfAvatar(nextAvatar);
          setAccountOpen(false);
          setToast("头像已更新");
        } catch {
          setToast("本地存储空间不足，无法保存头像");
        }
      };
      source.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function resetSelfAvatar() {
    if (currentUser) window.localStorage.removeItem(`milo-self-avatar:${currentUser.username}`);
    setSelfAvatar(null);
    setAccountOpen(false);
    setToast("已恢复默认头像");
  }

  if (!sessionReady) {
    return <main className="session-loading"><div className="brand-mark">M</div><span>正在准备 Milo</span></main>;
  }

  if (!authenticated) {
    return <LoginScreen initialized={serverInitialized} onLogin={login} onSetup={setup} />;
  }

  return (
    <main className="app-shell">
      {!deviceEncryptionEnabled && <div className="http-test-banner">HTTP 测试模式：已登录，加密记录将在 HTTPS 下启用</div>}
      <aside className="rail" aria-label="主导航">
        <div className="brand-mark">M</div>
        <nav>
          <button className={`rail-button ${activeView === "messages" ? "active" : ""}`} onClick={() => selectMainView("messages")} aria-label="消息" aria-pressed={activeView === "messages"}><MessageCircleMore size={20} /></button>
          <button className={`rail-button ${activeView === "contacts" ? "active" : ""}`} onClick={() => selectMainView("contacts")} aria-label="联系人" aria-pressed={activeView === "contacts"}><UsersRound size={20} /></button>
          <button className={`rail-button ${activeView === "notifications" ? "active" : ""}`} onClick={() => selectMainView("notifications")} aria-label="通知" aria-pressed={activeView === "notifications"}><Bell size={20} />{unreadTotal > 0 && <span className="tiny-badge">{Math.min(unreadTotal, 99)}</span>}</button>
        </nav>
        <div className="rail-bottom">
          <button className="self-avatar" onClick={() => setAccountOpen((value) => !value)} aria-label="打开账户菜单"><SelfAvatarContent avatar={selfAvatar} size={34} fallback={selfInitial} /></button>
          {accountOpen && (
            <div className="account-menu">
              <div className="account-summary"><span className="self-avatar large"><SelfAvatarContent avatar={selfAvatar} size={40} fallback={selfInitial} /></span><div><strong>{currentUser?.displayName}</strong><small>@{currentUser?.username}</small></div></div>
              <div className="admin-chip"><ShieldCheck size={13} /> {currentUser?.role === "admin" ? "管理员账户" : "普通用户"}</div>
              {secureStorageReady && <div className="secure-storage-chip"><LockKeyhole size={13} /> 本机记录已加密</div>}
              {currentUser?.role === "admin" && <button onClick={() => { setAccountOpen(false); setUserManagerOpen(true); }}><UserPlus size={16} /> 用户管理</button>}
              <button onClick={() => avatarInputRef.current?.click()}><ImageIcon size={16} /> 更换头像</button>
              {selfAvatar && <button onClick={resetSelfAvatar}><Undo2 size={16} /> 恢复默认头像</button>}
              <button className="logout" onClick={logout}><LogOut size={16} /> 退出登录</button>
            </div>
          )}
        </div>
      </aside>

      <section className={`conversation-panel ${mobileChatOpen ? "mobile-hidden" : ""}`}>
        <header className="conversation-heading">
          <div>
            <p className="eyebrow">MILO</p>
            <h1>{activeView === "messages" ? "消息" : activeView === "contacts" ? "联系人" : "通知"}</h1>
          </div>
          <div className="conversation-heading-actions">
            {activeView !== "notifications" && <button className="round-button warm" onClick={() => { setNewChatOpen(true); setNewChatQuery(""); setNewChatResults([]); setNewChatSearchError(""); }} aria-label="发起新对话"><Plus size={20} /></button>}
            <button className="mobile-account-trigger" onClick={() => setAccountOpen(true)} aria-label="打开账户菜单"><span className="self-avatar"><SelfAvatarContent avatar={selfAvatar} size={34} fallback={selfInitial} /></span></button>
          </div>
        </header>
        {activeView !== "notifications" && (
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeView === "messages" ? "搜索联系人或消息" : "搜索联系人"} />
            {query && <button onClick={() => setQuery("")} aria-label="清除搜索"><X size={15} /></button>}
          </label>
        )}

        {activeView === "messages" && <>
          <div className="list-label"><span>{showArchived ? "已归档" : "最近对话"}</span><button onClick={() => setShowArchived((value) => !value)}>{showArchived ? "返回" : "全部"} <ChevronDown size={13} /></button></div>
          <div className="conversation-list">
            {filtered.map((person) => {
              const last = person.messages.at(-1);
              const swipeOffset = swipeGesture?.id === person.id ? swipeGesture.offset : openSwipeId === person.id ? -132 : 0;
              return (
                <div key={person.id} className="conversation-swipe">
                  <div className="conversation-swipe-actions">
                    <button className="swipe-archive" onClick={() => archiveConversationById(person.id)}><Archive size={16} /><span>{person.archived ? "恢复" : "归档"}</span></button>
                    <button className="swipe-delete" onClick={() => requestDelete(person.id, "conversation")}><Trash2 size={16} /><span>删除</span></button>
                  </div>
                  <button className={`conversation-row ${activeId === person.id ? "selected" : ""}`} style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeGesture?.id === person.id ? "none" : undefined }} onPointerDown={(event) => startConversationSwipe(event, person.id)} onPointerMove={(event) => moveConversationSwipe(event, person.id)} onPointerUp={() => endConversationSwipe(person.id)} onPointerCancel={() => endConversationSwipe(person.id)} onClick={() => selectConversation(person.id)}>
                    <Avatar person={person} />
                    <span className="conversation-copy"><span className="row-top"><strong>{person.name}</strong><time>{last?.time}</time></span><span className="row-bottom"><span>{last?.mine && "你："}{person.archived ? "已归档 · " : ""}{last?.body || last?.attachment?.name}</span>{person.muted && <BellOff size={13} />}{person.unread > 0 && <b>{person.unread}</b>}</span></span>
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="empty-search"><Search size={24} /><p>{query ? "没有找到相关对话" : "暂无对话"}</p></div>}
          </div>
          <button className="archive-link" onClick={() => setShowArchived((value) => !value)}><Archive size={16} /> {showArchived ? "返回最近对话" : "已归档的对话"}</button>
        </>}

        {activeView === "contacts" && <>
          <div className="list-label"><span>全部联系人</span><span>{filteredContacts.length} 位</span></div>
          <div className="conversation-list contact-list">
            {filteredContacts.map((person) => {
              const swipeOffset = swipeGesture?.id === person.id ? swipeGesture.offset : openSwipeId === person.id ? -132 : 0;
              return <div key={person.id} className="conversation-swipe">
                <div className="conversation-swipe-actions contact-actions"><button className="swipe-delete" onClick={() => requestDelete(person.id, "contact")}><Trash2 size={16} /><span>删除联系人</span></button></div>
                <button
                  className="conversation-row"
                  style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeGesture?.id === person.id ? "none" : undefined }}
                  onPointerDown={(event) => { startConversationSwipe(event, person.id); startContactLongPress(event, person.id); }}
                  onPointerMove={(event) => moveContactSwipe(event, person.id)}
                  onPointerUp={() => { cancelContactLongPress(); endConversationSwipe(person.id); }}
                  onPointerCancel={() => { cancelContactLongPress(); endConversationSwipe(person.id); }}
                  onContextMenu={(event) => { event.preventDefault(); cancelContactLongPress(); setOpenSwipeId(null); setContactMenuId(person.id); }}
                  onClick={() => openConversationFromView(person.id)}
                >
                  <Avatar person={person} /><span className="conversation-copy"><span className="row-top"><strong>{person.name}</strong></span><span className="row-bottom"><span>{person.handle} · {person.online ? "在线" : person.lastSeen}</span></span></span>
                </button>
              </div>;
            })}
            {filteredContacts.length === 0 && <div className="empty-search"><UsersRound size={24} /><p>{query ? "没有找到相关联系人" : "暂无联系人"}</p></div>}
          </div>
        </>}

        {activeView === "notifications" && <>
          <div className="list-label"><span>未读通知</span><span>{unreadTotal} 条</span></div>
          <div className="notification-list">
            {notificationConversations.map((person) => <button key={person.id} className="notification-row" onClick={() => openConversationFromView(person.id)}><span className="notification-icon"><Bell size={17} /></span><span><strong>{person.name} 发来 {person.unread} 条新消息</strong><small>{person.messages.at(-1)?.body || "点击查看对话"}</small></span><time>{person.messages.at(-1)?.time}</time></button>)}
            {notificationConversations.length === 0 && <div className="empty-search"><Bell size={24} /><p>暂时没有新通知</p></div>}
          </div>
        </>}

        <nav className="mobile-main-nav" aria-label="移动端主导航">
          <button className={activeView === "messages" ? "active" : ""} onClick={() => selectMainView("messages")}><MessageCircleMore size={20} /><span>消息</span></button>
          <button className={activeView === "contacts" ? "active" : ""} onClick={() => selectMainView("contacts")}><UsersRound size={20} /><span>联系人</span></button>
          <button className={activeView === "notifications" ? "active" : ""} onClick={() => selectMainView("notifications")}><Bell size={20} /><span>通知</span>{unreadTotal > 0 && <b>{Math.min(unreadTotal, 99)}</b>}</button>
        </nav>
      </section>

      <section className={`chat-panel ${mobileChatOpen ? "mobile-open" : ""}`}>
        {active ? <>
        <header className="chat-header">
          <button
            className="mobile-back"
            onClick={() => {
              setMobileChatOpen(false);
              setDetailsOpen(false);
              setMessageSearchOpen(false);
              setActionMessageId(null);
            }}
            aria-label="返回会话列表"
          >
            <ChevronLeft size={24} />
          </button>
          <Avatar person={active} size="sm" />
          <div className="chat-person"><strong>{active.name}</strong><span>{active.online ? "在线 · 通常很快回复" : active.lastSeen}</span></div>
          <div className="header-actions">
            <button onClick={() => startCall("audio")} aria-label="语音通话"><Phone size={19} /></button>
            <button onClick={() => startCall("video")} aria-label="视频通话"><Video size={20} /></button>
            <button className={detailsOpen ? "is-active" : ""} onClick={() => setDetailsOpen((value) => !value)} aria-label="会话详情"><EllipsisVertical size={21} /></button>
          </div>
        </header>

        {messageSearchOpen && (
          <div className="chat-searchbar">
            <Search size={16} />
            <input autoFocus value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} placeholder="搜索当前聊天记录" />
            <span>{messageQuery ? `${displayedMessages.length} 条结果` : "输入关键词"}</span>
            <button onClick={() => { setMessageSearchOpen(false); setMessageQuery(""); }} aria-label="关闭搜索"><X size={16} /></button>
          </div>
        )}

        <div className="message-area">
          <div className="date-divider"><span>今天</span></div>
          {displayedMessages.map((message) => (
            <article key={message.id} className={`message-line ${message.mine ? "mine" : "theirs"}`}>
              {!message.mine && <Avatar person={active} size="sm" />}
              <div className="message-stack">
                {message.replyTo && <div className="reply-preview">回复：{message.replyTo}</div>}
                <button
                  className={`message-bubble ${message.attachment ? "has-attachment" : ""} ${message.recalled ? "recalled" : ""}`}
                  onPointerDown={(event) => startMessageLongPress(event, message.id)}
                  onPointerUp={cancelMessageLongPress}
                  onPointerLeave={cancelMessageLongPress}
                  onPointerCancel={cancelMessageLongPress}
                  onContextMenu={(event) => { event.preventDefault(); cancelMessageLongPress(); setActionMessageId(message.id); }}
                  onDoubleClick={() => !message.recalled && reactTo(message.id)}
                  title={message.recalled ? "这条消息已撤回" : "长按或右键查看更多操作"}
                >
                  {message.recalled && <span className="recalled-copy">{message.mine ? "你撤回了一条消息" : `${active.name} 撤回了一条消息`}</span>}
                  {message.attachment && (
                    message.attachment.type.startsWith("image/")
                      ? <span className="attachment-image"><Image unoptimized width={270} height={180} src={message.attachment.dataUrl} alt={message.attachment.name} /><small>{message.attachment.name}</small></span>
                      : message.attachment.type.startsWith("audio/")
                        ? <span className="attachment-audio"><Mic size={17} /><audio controls src={message.attachment.dataUrl} /></span>
                        : <span className="attachment-file"><FileText size={22} /><span><strong>{message.attachment.name}</strong><small>{Math.max(1, Math.round(message.attachment.size / 1024))} KB</small></span></span>
                  )}
                  {message.body && <span>{message.body}</span>}
                  {message.reaction && <span className="reaction">{message.reaction}</span>}
                </button>
                {actionMessageId === message.id && (
                  <div className="message-menu">
                    {!message.recalled && <button onClick={() => startReply(message)}><Reply size={14} /> 回复</button>}
                    {!message.recalled && <button onClick={() => { reactTo(message.id); setActionMessageId(null); }}><span className="menu-heart">♡</span> 表情回应</button>}
                    {!message.recalled && message.body && <button onClick={() => copyMessage(message)}><Copy size={14} /> 复制文字</button>}
                    {message.attachment && <a href={message.attachment.dataUrl} download={message.attachment.name} onClick={() => setActionMessageId(null)}><Download size={14} /> 下载</a>}
                    {message.mine && message.body && !message.recalled && <button onClick={() => startEdit(message)}><Pencil size={14} /> 编辑</button>}
                    {message.mine && !message.recalled && <button className="recall" onClick={() => recallMessage(message.id)}><Undo2 size={14} /> 撤回消息</button>}
                    <button className="danger" onClick={() => deleteMessage(message.id)}><Trash2 size={14} /> 删除此消息</button>
                  </div>
                )}
                <span className="message-meta">
                  {message.time}
                  {message.edited && <em>已编辑</em>}
                  {message.mine && (message.status === "read" ? <><CheckCheck size={14} /> 已读</> : <><Check size={14} /> 已发送</>)}
                </span>
              </div>
            </article>
          ))}
          {displayedMessages.length === 0 && <div className="no-message-results"><Search size={24} /><p>没有找到匹配的消息</p></div>}
          <div ref={bottomRef} />
        </div>

        <div className="composer-wrap">
          <div className="typing-hint">{active.online ? `${active.name} 此刻在线` : "消息将在对方上线后送达"}</div>
          {(replyingTo || editingId) && (
            <div className="composer-context">
              <div><strong>{editingId ? "编辑消息" : `回复 ${replyingTo?.mine ? "自己" : active.name}`}</strong><span>{editingId ? draft : replyingTo?.body || replyingTo?.attachment?.name}</span></div>
              <button onClick={() => { setReplyingTo(null); setEditingId(null); if (editingId) setDraft(""); }} aria-label="取消"><X size={15} /></button>
            </div>
          )}
          {isRecording && <div className="recording-bar"><i /><span>正在录音 {formatDuration(recordSeconds)}</span><button onClick={toggleRecording}>完成并发送</button></div>}
          <form className="composer" onSubmit={sendMessage}>
            <input ref={fileInputRef} className="file-input" type="file" accept="image/*,.pdf,.txt,.doc,.docx" onChange={(event) => { handleAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="添加附件"><Paperclip size={19} /></button>
            <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} placeholder={`发消息给 ${active.name}`} />
            <button type="button" className={isRecording ? "is-recording" : ""} onClick={toggleRecording} aria-label={isRecording ? "停止录音" : "语音消息"}><Mic size={19} /></button>
            <button type="button" className={emojiOpen ? "is-active" : ""} onClick={() => setEmojiOpen((value) => !value)} aria-label="选择表情"><Laugh size={19} /></button>
            <button className="send-button" disabled={!draft.trim()} aria-label="发送消息"><Send size={18} /></button>
            {emojiOpen && <div className="emoji-picker">{emojis.map((emoji) => <button type="button" key={emoji} onClick={() => setDraft((value) => value + emoji)}>{emoji}</button>)}</div>}
          </form>
        </div>
        </> : (
          <div className="empty-chat-state">
            <span><MessageCircleMore size={32} /></span>
            <strong>暂无对话</strong>
            <p>输入完整用户名，开始一段新对话</p>
            <button onClick={() => { setNewChatOpen(true); setNewChatQuery(""); setNewChatResults([]); setNewChatSearchError(""); }}><Plus size={17} /> 新建对话</button>
          </div>
        )}
      </section>

      {detailsOpen && active && (
        <aside className="details-panel">
          <button className="details-close" onClick={() => setDetailsOpen(false)} aria-label="关闭详情"><X size={18} /></button>
          <Avatar person={active} size="lg" />
          <h2>{active.name}</h2>
          <p>{active.handle}</p>
          <div className="detail-actions">
            <button onClick={() => { setMessageSearchOpen(true); setDetailsOpen(false); }}><Search size={18} /><span>搜索</span></button>
            <button onClick={toggleMute}>{active.muted ? <Bell size={18} /> : <BellOff size={18} />}<span>{active.muted ? "开启通知" : "静音"}</span></button>
          </div>
          <div className="detail-section">
            <div className="detail-title"><strong>共享内容</strong><button onClick={() => setSharedOpen(true)}>查看全部</button></div>
            <div className="media-grid">
              {sharedMessages.slice(-3).map((message) => <button key={message.id} onClick={() => setSharedOpen(true)}>{message.attachment?.type.startsWith("image/") ? <ImageIcon size={20} /> : <FileText size={20} />}</button>)}
              {sharedMessages.length === 0 && <span className="media-empty">暂无</span>}
            </div>
          </div>
          <div className="detail-section compact">
            <button onClick={() => setProfileOpen(true)}><CircleUserRound size={18} /> 查看个人资料</button>
            <button onClick={() => { setMessageSearchOpen(true); setDetailsOpen(false); }}><Search size={18} /> 搜索聊天记录</button>
            <button onClick={archiveConversation}><Archive size={18} /> {active.archived ? "移出归档" : "归档对话"}</button>
          </div>
        </aside>
      )}

      {callMode && active && (
        <div className="modal-backdrop call-backdrop">
          <section className="call-card">
            <Avatar person={active} size="lg" />
            <h2>{active.name}</h2>
            <p>{callSeconds < 2 ? "正在连接…" : callMode === "video" ? "视频通话中" : "语音通话中"}</p>
            <time>{formatDuration(callSeconds)}</time>
            {callMode === "video" && <div className="video-preview"><Video size={34} /><span>本地摄像头预览</span></div>}
            <button className="end-call" onClick={() => setCallMode(null)}><PhoneOff size={20} /></button>
          </section>
        </div>
      )}

      {profileOpen && active && (
        <div className="modal-backdrop" onMouseDown={() => setProfileOpen(false)}>
          <section className="info-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-x" onClick={() => setProfileOpen(false)}><X size={17} /></button>
            <Avatar person={active} size="lg" />
            <h2>{active.name}</h2><p>{active.handle}</p>
            <dl><div><dt>状态</dt><dd>{active.online ? "当前在线" : active.lastSeen}</dd></div><div><dt>共同会话</dt><dd>{active.messages.length} 条消息</dd></div><div><dt>通知</dt><dd>{active.muted ? "已静音" : "已开启"}</dd></div></dl>
          </section>
        </div>
      )}

      {sharedOpen && active && (
        <div className="modal-backdrop" onMouseDown={() => setSharedOpen(false)}>
          <section className="shared-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">SHARED</p><h2>共享内容</h2></div><button onClick={() => setSharedOpen(false)}><X size={18} /></button></div>
            <div className="shared-list">
              {sharedMessages.map((message) => (
                <div key={message.id}>{message.attachment?.type.startsWith("image/") ? <ImageIcon size={20} /> : <FileText size={20} />}<span><strong>{message.attachment?.name}</strong><small>{message.time}</small></span><a href={message.attachment?.dataUrl} download={message.attachment?.name}><Download size={17} /></a></div>
              ))}
              {sharedMessages.length === 0 && <div className="shared-empty"><Paperclip size={25} /><p>还没有发送过附件</p></div>}
            </div>
          </section>
        </div>
      )}

      {contactMenuPerson && (
        <div className="modal-backdrop contact-menu-backdrop" onMouseDown={() => setContactMenuId(null)}>
          <section className="contact-action-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="contact-action-head"><Avatar person={contactMenuPerson} /><div><strong>{contactMenuPerson.name}</strong><small>{contactMenuPerson.handle}</small></div><button onClick={() => setContactMenuId(null)} aria-label="关闭联系人菜单"><X size={17} /></button></div>
            <div className="contact-action-list">
              <button onClick={() => openContactConversation(contactMenuPerson.id)}><MessageCircleMore size={18} /><span>发消息</span></button>
              <button onClick={() => { setActiveId(contactMenuPerson.id); setContactMenuId(null); setProfileOpen(true); }}><CircleUserRound size={18} /><span>查看资料</span></button>
              <button onClick={() => { setConversations((items) => items.map((item) => item.id === contactMenuPerson.id ? { ...item, muted: !item.muted } : item)); setContactMenuId(null); setToast(contactMenuPerson.muted ? "已开启通知" : "已设为静音"); }}>{contactMenuPerson.muted ? <Bell size={18} /> : <BellOff size={18} />}<span>{contactMenuPerson.muted ? "开启通知" : "消息静音"}</span></button>
              <button onClick={() => { archiveConversationById(contactMenuPerson.id); setContactMenuId(null); }}><Archive size={18} /><span>归档对话</span></button>
              <button className="danger" onClick={() => requestDelete(contactMenuPerson.id, "contact")}><Trash2 size={18} /><span>删除联系人</span></button>
            </div>
          </section>
        </div>
      )}

      {deleteConversationId && (
        <div className="modal-backdrop" onMouseDown={() => setDeleteConversationId(null)}>
          <section className="confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirm-icon"><Trash2 size={21} /></div>
            <h2>{deleteTargetKind === "contact" ? "删除这个联系人？" : "删除这个对话？"}</h2>
            <p>{deleteTargetKind === "contact" ? "联系人及其本地聊天记录将一起清除，此操作无法撤销。" : "本地聊天记录将被清除，此操作无法撤销。"}</p>
            <div><button onClick={() => setDeleteConversationId(null)}>取消</button><button className="confirm-danger" onClick={confirmDeleteConversation}>{deleteTargetKind === "contact" ? "删除联系人" : "删除对话"}</button></div>
          </section>
        </div>
      )}

      {newChatOpen && (
        <div className="modal-backdrop" onMouseDown={() => { setNewChatOpen(false); setNewChatQuery(""); setNewChatResults([]); setNewChatSearchError(""); }}>
          <section className="new-chat-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">NEW MESSAGE</p><h2>发起新对话</h2></div><button onClick={() => { setNewChatOpen(false); setNewChatQuery(""); setNewChatResults([]); setNewChatSearchError(""); }}><X size={18} /></button></div>
            <label className="search-box"><Search size={17} /><input autoFocus value={newChatQuery} onChange={(event) => { setNewChatQuery(event.target.value); setNewChatSearchError(""); }} placeholder="输入完整用户名" /></label>
            {searchingUsers && <div className="user-search-empty"><Search size={24} /><strong>正在搜索…</strong></div>}
            {!searchingUsers && newChatSearchError && <div className="user-search-empty"><Search size={24} /><strong>{newChatSearchError}</strong></div>}
            {!searchingUsers && !newChatSearchError && newChatQuery.trim().length < 3 && <div className="user-search-empty"><Search size={24} /><strong>输入完整用户名开始搜索</strong><p>我们不会推荐联系人或展示可能认识的人。</p></div>}
            {!searchingUsers && !newChatSearchError && newChatQuery.trim().length >= 3 && newChatResults.length === 0 && <div className="user-search-empty"><Search size={24} /><strong>没有找到这个用户</strong><p>请确认用户名拼写。</p></div>}
            {!searchingUsers && newChatResults.length > 0 && <div className="user-search-results">{newChatResults.map((user) => <button key={user.username} className="user-search-result" onClick={() => openUserConversation(user)}><span className="user-search-result-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span className="user-search-result-copy"><strong>{user.displayName}</strong><small>@{user.username}</small></span><ChevronRight size={16} /></button>)}</div>}
          </section>
        </div>
      )}
      {userManagerOpen && currentUser?.role === "admin" && (
        <div className="modal-backdrop" onMouseDown={() => setUserManagerOpen(false)}>
          <section className="user-manager-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">ADMIN</p><h2>用户管理</h2></div><button onClick={() => { setUserManagerOpen(false); cancelEditUser(); }} aria-label="关闭用户管理"><X size={18} /></button></div>
            <div className="managed-user-list">
              {users.map((user) => editingUser === user.username ? (
                <form key={user.username} className="managed-user-edit" onSubmit={saveUserEdit}>
                  <label><span>显示名称</span><input value={editingDisplayName} onChange={(event) => { setEditingDisplayName(event.target.value); setUserFormError(""); }} autoFocus /></label>
                  <div><button type="button" onClick={cancelEditUser}>取消</button><button className="save-user-button" disabled={updatingUser}>{updatingUser ? "保存中…" : "保存"}</button></div>
                </form>
              ) : (
                <div key={user.username} className="managed-user-row">
                  <span className="managed-user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{user.displayName}</strong><small>@{user.username} · {user.role === "admin" ? "管理员" : "普通用户"}</small></span>
                  <time>{new Date(user.createdAt).toLocaleDateString("zh-CN")}</time>
                  {user.username !== currentUser?.username && <span className="managed-user-actions"><button type="button" onClick={() => beginEditUser(user)} aria-label={`编辑 ${user.username}`}><Pencil size={14} /></button><button type="button" className="danger" onClick={() => setDeleteUserTarget(user)} aria-label={`删除 ${user.username}`}><Trash2 size={14} /></button></span>}
                </div>
              ))}
            </div>
            <form className="add-user-form" onSubmit={addUser}>
              <h3><UserPlus size={17} /> 添加新用户</h3>
              <div className="user-form-grid">
                <label><span>用户名</span><input value={newUsername} onChange={(event) => { setNewUsername(event.target.value); setUserFormError(""); }} placeholder="例如 zhangsan" autoComplete="off" /></label>
                <label><span>显示名称</span><input value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} placeholder="例如 张三" autoComplete="off" /></label>
                <label className="password-field"><span>初始密码</span><input value={newUserPassword} onChange={(event) => { setNewUserPassword(event.target.value); setUserFormError(""); }} type="password" placeholder="至少 12 位" autoComplete="new-password" /></label>
              </div>
              <p className={`user-form-error ${userFormError ? "visible" : ""}`}>{userFormError || "用户创建后即可从登录页登录"}</p>
              <button className="create-user-button" disabled={creatingUser}>{creatingUser ? "正在创建…" : "创建用户"}</button>
            </form>
          </section>
        </div>
      )}
      {deleteUserTarget && (
        <div className="modal-backdrop" onMouseDown={() => !deletingUser && setDeleteUserTarget(null)}>
          <section className="confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirm-icon"><Trash2 size={21} /></div>
            <h2>删除用户？</h2>
            <p>用户 @{deleteUserTarget.username}、登录会话及其加密记录都会被删除，此操作无法撤销。</p>
            <div><button onClick={() => setDeleteUserTarget(null)} disabled={deletingUser}>取消</button><button className="confirm-danger" onClick={() => void confirmDeleteUser()} disabled={deletingUser}>{deletingUser ? "删除中…" : "确认删除"}</button></div>
          </section>
        </div>
      )}
      <input ref={avatarInputRef} className="file-input" type="file" accept="image/*" onChange={(event) => { handleAvatarUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      {accountOpen && (
        <div className="mobile-account-backdrop" onMouseDown={() => setAccountOpen(false)}>
          <section className="mobile-account-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-summary"><span className="self-avatar large"><SelfAvatarContent avatar={selfAvatar} size={40} fallback={selfInitial} /></span><div><strong>{currentUser?.displayName}</strong><small>@{currentUser?.username}</small></div></div>
            <div className="admin-chip"><ShieldCheck size={13} /> {currentUser?.role === "admin" ? "管理员账户" : "普通用户"}</div>
            {secureStorageReady && <div className="secure-storage-chip"><LockKeyhole size={13} /> 本机记录已加密</div>}
            {currentUser?.role === "admin" && <button onClick={() => { setAccountOpen(false); setUserManagerOpen(true); }}><UserPlus size={17} /> 用户管理</button>}
            <button onClick={() => avatarInputRef.current?.click()}><ImageIcon size={17} /> 更换头像</button>
            {selfAvatar && <button onClick={resetSelfAvatar}><Undo2 size={17} /> 恢复默认头像</button>}
            <button className="logout" onClick={logout}><LogOut size={17} /> 退出登录</button>
            <button className="cancel" onClick={() => setAccountOpen(false)}>取消</button>
          </section>
        </div>
      )}
      {toast && <div className="app-toast">{toast}</div>}
    </main>
  );
}
