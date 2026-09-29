import {
  api,
  esc,
  errText,
  avatar,
  toast,
  renderTemplate,
  showPage,
} from "./ui.js";
import { icons } from "../assets/icons.js";

// Conversas, lista de DMs e envio de mensagens.
// Stable message nodes and request generations prevent page changes from losing chat state.
export class ChatView {
  constructor({
    api,
    user,
    esc,
    avatar,
    cache,
    onActivity,
    profile,
    errorText,
  }) {
    Object.assign(this, {
      api,
      user,
      esc,
      avatar,
      cache,
      onActivity,
      profile,
      errorText,
    });
    this.generation = 0;
    this.active = null;
  }
  close() {
    this.generation++;
    if (this.active) {
      this.active.savedScroll = this.box?.scrollTop || 0;
      this.active.wasBottom = this.nearBottom();
    }
    this.active = null;
  }
  mount({ kind, id, container, name, header }) {
    this.close();
    const key = kind + ":" + id;
    const state = this.cache.get(key) || {
      messages: [],
      status: "loading",
      savedScroll: 0,
    };
    this.cache.set(key, state);
    this.active = state;
    this.kind = kind;
    this.id = id;
    this.path =
      kind === "dm"
        ? `/api/dms/${id}/messages`
        : `/api/channels/${id}/messages`;
    const dm = kind === "dm";
    const chat = showPage(
      "messages.chat",
      {
        pageClass: dm ? "dm-page" : "channel-chat",
        header: header,
        scrollId: dm ? "message-scroll" : "channel-scroll",
        formId: dm ? "composer" : "channel-composer",
        inputId: dm ? "message-input" : "channel-input",
        name: this.esc(name),
      },
      container,
    );
    chat.className = dm ? "dm-page" : "channel-chat";
    chat.querySelector(".message-scroll").id = dm
      ? "message-scroll"
      : "channel-scroll";
    chat.querySelector("form").id = dm ? "composer" : "channel-composer";
    chat.querySelector("textarea").id = dm ? "message-input" : "channel-input";
    chat.querySelector("textarea").placeholder = "Mensagem para " + name;
    chat.querySelector(".message-scroll").replaceChildren();
    chat.querySelector(".chat-load-status").replaceChildren();
    chat.querySelector(".new-messages").hidden = true;
    chat.querySelector("form button").disabled = false;
    this.box = container.querySelector(".message-scroll");
    this.status = container.querySelector(".chat-load-status");
    this.more = container.querySelector(".new-messages");
    this.nodes = new Map();
    this.more.onclick = () => {
      this.box.scrollTop = this.box.scrollHeight;
      this.more.hidden = true;
      this.markRead();
    };
    this.box.onscroll = () => {
      if (this.nearBottom()) {
        this.more.hidden = true;
        this.markRead();
      }
    };
    const form = container.querySelector("form"),
      input = form.querySelector("textarea");
    input.value = state.draft || "";
    input.oninput = () => (state.draft = input.value);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body || state.sending) return;
      state.sending = true;
      form.querySelector("button").disabled = true;
      const pending =
        state.pending?.body === body
          ? state.pending
          : {
              body,
              clientId: crypto.randomUUID(),
            };
      state.pending = pending;
      const generation = this.generation,
        path = this.path;
      try {
        await this.api(path, {
          method: "POST",
          body: JSON.stringify(pending),
        });
        state.pending = null;
        state.draft = "";
        input.value = "";
        await this.onActivity();
        if (generation === this.generation) {
          await this.refresh(true);
          input.focus();
        }
      } catch (error) {
        if (generation === this.generation)
          this.setError(
            "Mensagem não enviada. Seu texto foi mantido. Toque em Enviar para tentar novamente.",
          );
      } finally {
        state.sending = false;
        form.querySelector("button").disabled = false;
      }
    };
    input.onkeydown = (e) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !matchMedia("(max-width:760px)").matches
      ) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    this.render(true);
    if (state.wasBottom === false) this.box.scrollTop = state.savedScroll;
    this.refresh(state.wasBottom !== false);
  }
  nearBottom() {
    return (
      !this.box ||
      this.box.scrollHeight - this.box.scrollTop - this.box.clientHeight < 100
    );
  }
  setError(message) {
    this.status.replaceChildren();
    const text = document.createElement("span");
    text.textContent = message;
    const retry = document.createElement("button");
    retry.textContent = "Tentar novamente";
    retry.onclick = () => this.refresh(true);
    this.status.append(text, retry);
    this.status.hidden = false;
  }
  async refresh(force = false) {
    const state = this.active;
    if (!state || state.loading) return;
    state.loading = true;
    const generation = this.generation,
      path = this.path;
    if (!state.messages.length && state.status === "loading") {
      this.status.textContent = "Carregando mensagens…";
      this.status.hidden = false;
    }
    try {
      const data = await this.api(path);
      state.messages = data.messages;
      state.status = data.messages.length ? "loaded" : "empty";
      if (generation !== this.generation) return;
      this.status.hidden = true;
      this.render(force);
      if (this.nearBottom()) this.markRead();
    } catch (error) {
      state.status = "error";
      if (generation === this.generation)
        this.setError(this.errorText(error.message));
    } finally {
      state.loading = false;
    }
  }
  render(force = false) {
    const state = this.active;
    if (!state) return;
    const bottom = this.nearBottom(),
      scroll = this.box.scrollTop;
    let added = 0;
    if (!state.messages.length) {
      this.box.innerHTML =
        state.status === "loading"
          ? ""
          : renderTemplate("messages.empty-chat", {});
      return;
    }
    this.box.querySelector(".dm-welcome")?.remove();
    for (const message of state.messages) {
      let node = this.nodes.get(message.messageId);
      if (!node) {
        node = document.createElement("article");
        node.className = `message ${message.authorId === this.user.accountId ? "mine" : ""} ${message.kind === "call" ? "system-event" : ""}`;
        node.dataset.messageId = message.messageId;
        node.innerHTML =
          message.kind === "call"
            ? renderTemplate("messages.call-history-row", {
                body: this.esc(message.body),
                time: new Date(message.createdAt + "Z").toLocaleString("pt-BR"),
              })
            : renderTemplate("messages.message-row", {
                avatar: this.avatar(message, "sm"),
                displayName: this.esc(message.displayName),
                time: new Date(message.createdAt + "Z").toLocaleTimeString(
                  "pt-BR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                ),
                body: this.esc(message.body),
              });
        node
          .querySelector(".avatar-profile")
          ?.addEventListener("click", () => this.profile(message.authorId));
        this.nodes.set(message.messageId, node);
        this.box.append(node);
        added++;
      }
    }
    if (force || bottom) {
      this.box.scrollTop = this.box.scrollHeight;
      this.more.hidden = true;
    } else {
      this.box.scrollTop = scroll;
      if (added) this.more.hidden = false;
    }
  }
  async markRead() {
    const state = this.active;
    if (!state || this.kind !== "dm" || document.visibilityState !== "visible")
      return;
    const sequence = state.messages.at(-1)?.sequence || 0;
    if (sequence <= (state.read || 0)) return;
    state.read = sequence;
    try {
      await this.api(`/api/dms/${this.id}/read`, {
        method: "POST",
        body: JSON.stringify({
          sequence,
        }),
      });
      await this.onActivity();
    } catch {
      state.read = 0;
    }
  }
}
export function createMessages({ state, services, actions }) {
  services.chat = new ChatView({
    api,
    user: state.user,
    esc,
    avatar,
    cache: state.store.messages,
    onActivity: () => actions.loadDms(),
    profile: (accountId) => actions.openUserProfile(accountId),
    errorText: errText,
  });
  function drawDmSidebar() {
    if (state.activeSpace) return;
    const el = document.getElementById("dm-list");
    if (!el) return;
    el.innerHTML = state.dms.length
      ? state.dms
          .map((d) =>
            renderTemplate("messages.draw-dm-sidebar-dm-side", {
              activeClass: state.activeDm === d.conversationId ? "active" : "",
              conversationId: d.conversationId,
              avatar: avatar(d, "sm"),
              displayName: esc(d.displayName),
              lastMessage: esc(d.lastMessage || "@" + d.username),
              userStatus: d.userStatus,
              unreadBadge: d.unreadCount
                ? renderTemplate("messages.draw-dm-sidebar-dm-unread", {
                    unreadCount: d.unreadCount,
                  })
                : "",
            }),
          )
          .join("")
      : renderTemplate("messages.draw-dm-sidebar-empty-side", {});
    el.querySelectorAll("[data-dm]").forEach(
      (b) => (b.onclick = () => actions.openConversation(b.dataset.dm)),
    );
  }
  async function loadDms() {
    const next = (await api("/api/dms")).conversations;
    if (state.disposed) return;
    const sig = JSON.stringify(next);
    if (sig === state.lastDmSig) return;
    state.lastDmSig = sig;
    state.dms = next;
    actions.drawDmSidebar();
    const unread = state.dms.reduce((n, d) => n + d.unreadCount, 0);
    document.querySelectorAll("[data-sec=messages]").forEach((b) => {
      b.dataset.unread = unread || "";
    });
    if (state.section === "home") actions.renderHome();
    if (state.section === "messages" && !state.activeDm)
      actions.renderMessages();
  }
  async function openConversation(conversationId) {
    const generation = actions.enterPage(
      {
        type: "dm",
        id: conversationId,
      },
      "Conversa",
    );
    state.activeSpace = null;
    actions.homeSidebar();
    state.section = "messages";
    state.activeDm = conversationId;
    actions.drawDmSidebar();
    try {
      let dm = state.dms.find((x) => x.conversationId === conversationId);
      if (!dm) {
        await actions.loadDms();
        dm = state.dms.find((x) => x.conversationId === conversationId);
      }
      if (generation !== state.routeGeneration) return;
      if (!dm) throw Error("CONVERSATION_NOT_FOUND");
      services.navigation.set(
        {
          type: "dm",
          id: conversationId,
        },
        dm.displayName,
      );
      services.chat.mount({
        kind: "dm",
        id: conversationId,
        container: services.content,
        name: dm.displayName,
        header: renderTemplate("messages.open-conversation-dm-head", {
          avatar: avatar(dm, "md"),
          displayName: esc(dm.displayName),
          username: esc(dm.username),
          call: icons.call,
        }),
      });
      document.getElementById("dm-call").onclick = () =>
        actions.startPrivateCall(dm.accountId, dm.displayName);
      document.getElementById("dm-profile").onclick = () =>
        actions.openUserProfile(dm.accountId);
    } catch (e) {
      if (generation === state.routeGeneration)
        actions.showPageError(errText(e.message), () =>
          actions.openConversation(conversationId),
        );
    }
  }
  async function startDm(accountId) {
    try {
      const d = await api("/api/dms", {
        method: "POST",
        body: JSON.stringify({
          accountId,
        }),
      });
      await actions.loadDms();
      await actions.openConversation(d.conversationId);
    } catch (x) {
      toast(errText(x.message));
    }
  }
  function renderMessages() {
    showPage("messages.messages-messages-page", {
      conversations: state.dms.length
        ? renderTemplate("messages.messages-message-directory", {
            dmsItems: state.dms
              .map((d) =>
                renderTemplate("messages.messages-message-directory-row", {
                  conversationId: d.conversationId,
                  avatar: avatar(d, "md"),
                  displayName: esc(d.displayName),
                  lastMessage: esc(d.lastMessage || "@" + d.username),
                  userStatus: d.userStatus,
                  unreadBadge: d.unreadCount
                    ? renderTemplate("messages.messages-dm-unread", {
                        unreadCount: d.unreadCount,
                      })
                    : "",
                }),
              )
              .join(""),
          })
        : renderTemplate("messages.messages-empty-state", {}),
    });
    document
      .querySelectorAll("[data-open-dm]")
      .forEach(
        (x) => (x.onclick = () => actions.openConversation(x.dataset.openDm)),
      );
    document
      .getElementById("messages-friends")
      ?.addEventListener("click", () => actions.setSection("friends"));
  }
  return {
    drawDmSidebar,
    loadDms,
    openConversation,
    startDm,
    renderMessages,
  };
}
