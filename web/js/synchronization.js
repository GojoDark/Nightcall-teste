import { api, errText, toast } from "./ui.js";
// Um scheduler para toda a sessão; páginas não criam timers próprios.
// One scheduler per authenticated application. Jobs never overlap themselves.
export class SyncEngine {
  constructor(error = () => {}) {
    this.jobs = new Map();
    this.error = error;
    this.timer = null;
    this.running = false;
    this.wake = () => {
      for (const job of this.jobs.values()) job.next = 0;
      this.tick();
    };
  }
  add(key, interval, run) {
    this.jobs.set(key, {
      interval,
      run,
      next: 0,
      busy: false,
    });
  }
  remove(key) {
    this.jobs.delete(key);
  }
  start() {
    if (this.running) return;
    this.running = true;
    addEventListener("online", this.wake);
    document.addEventListener("visibilitychange", this.wake);
    this.tick();
  }
  tick() {
    if (!this.running) return;
    clearTimeout(this.timer);
    const time = Date.now();
    for (const [key, job] of this.jobs) {
      if (job.busy || time < job.next) continue;
      job.busy = true;
      Promise.resolve()
        .then(job.run)
        .catch((e) => this.error(e, key))
        .finally(() => {
          job.busy = false;
          job.next = Date.now() + job.interval;
        });
    }
    this.timer = setTimeout(() => this.tick(), 200);
  }
  kick(key) {
    const job = this.jobs.get(key);
    if (job) job.next = 0;
    if (this.running) this.tick();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.jobs.clear();
    removeEventListener("online", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
  }
}
export function createSynchronization({ state, services, actions }) {
  services.scheduler = new SyncEngine((error, key) => {
    if (state.disposed) return;
    if (key === "sync") {
      state.store.connection = "offline";
      document.getElementById("sync-status").textContent = "Reconectando…";
    } else if (key === "chat") services.chat.setError(errText(error.message));
  });
  const syncStatus = document.getElementById("sync-status");
  syncStatus.textContent = "";
  services.scheduler.add("sync", 300, async () => {
    const result = await api(
      `/api/sync?clientId=${services.privateCalls.clientId}&after=${state.eventCursor}&signalAfter=${state.signalCursor}`,
    );
    if (state.disposed) return;
    if (state.serverEpoch && state.serverEpoch !== result.epoch)
      state.signalCursor = 0;
    state.serverEpoch = result.epoch;
    const recovering = state.store.connection === "offline";
    state.store.connection = "online";
    syncStatus.textContent = "";
    services.privateCalls.apply(result.calls);
    for (const event of result.signals) {
      if (event.type === "rtc") {
        if (
          services.manager.session?.kind === "voice" &&
          event.payload.context === services.manager.session.id &&
          !services.manager.session.participants.some(
            (x) => x.accountId === event.fromId,
          )
        )
          await services.manager.syncPresence(
            await api(`/api/voice/${services.manager.session.id}/state`),
          );
        await services.privateCalls.signal(event);
      }
      state.signalCursor = Math.max(state.signalCursor, event.seq);
    }
    let refreshDM = false,
      refreshFriends = false;
    for (const event of result.events) {
      const p = event.payload;
      state.eventCursor = Math.max(state.eventCursor, event.seq);
      if (["dm", "read", "call", "profile"].includes(event.kind))
        refreshDM = true;
      if (["friend", "profile"].includes(event.kind)) refreshFriends = true;
      if (
        (event.kind === "dm" || event.kind === "call") &&
        p.fromId !== state.user.accountId &&
        p.preview &&
        state.activeDm !== p.conversationId
      )
        actions.internalNotification("Nova mensagem", p.preview, () =>
          actions.openConversation(p.conversationId),
        );
      if (
        event.kind === "friend" &&
        p.fromId !== state.user.accountId &&
        p.fromId
      )
        actions.internalNotification(
          "Solicitação de amizade",
          "Abra Amigos para responder.",
          () => actions.setSection("friends"),
        );
      if (event.kind === "invite")
        actions.internalNotification(
          "Convite de comunidade",
          p.name,
          async () => {
            try {
              await api("/api/spaces/join", {
                method: "POST",
                body: JSON.stringify({
                  token: p.token,
                }),
              });
              await actions.loadSpaces();
              actions.openSpace(p.spaceId);
            } catch (e) {
              toast(errText(e.message));
            }
          },
        );
      if (event.kind === "call" && p.state === "missed")
        actions.internalNotification(
          "Chamada perdida",
          "Veja o histórico na conversa.",
          () => actions.openConversation(p.conversationId),
        );
      if (
        (p.conversationId && p.conversationId === state.activeDm) ||
        (p.channelId && services.navigation.route?.id === p.channelId)
      )
        services.scheduler.kick("chat");
    }
    for (const entry of result.online)
      state.store.online.set(entry.accountId, entry.status);
    let presenceChanged = false;
    for (const collection of [state.friends, state.dms])
      for (const person of collection) {
        const status = state.store.online.get(person.accountId);
        if (status && person.userStatus !== status) {
          person.userStatus = status;
          presenceChanged = true;
        }
      }
    if (refreshDM || recovering) await actions.loadDms();
    else if (presenceChanged) {
      actions.drawDmSidebar();
      if (state.section === "home") actions.renderHome();
      if (state.section === "messages" && !state.activeDm)
        actions.renderMessages();
    }
    if (refreshFriends || recovering) await actions.loadFriends();
    if (recovering) {
      services.scheduler.kick("chat");
      for (const p of services.manager.peers.values()) p.pc.restartIce();
    }
    services.privateCalls.mediaChanged();
  });
  services.scheduler.add("heartbeat", 2500, async () => {
    if (services.manager.session) await services.manager.heartbeat();
  });
  services.scheduler.add("directory", 4000, async () => {
    await Promise.all([actions.loadDms(), actions.loadFriends()]);
  });
  services.scheduler.add("chat", 2000, () => services.chat.refresh());
  services.scheduler.add("community", 1800, async () => {
    const sid = state.activeSpace;
    if (!sid) return;
    const latest = await api("/api/spaces/" + sid);
    if (state.activeSpace !== sid || state.disposed) return;
    latest.space.members = latest.members;
    const signature = JSON.stringify([latest.space, latest.channels]);
    if (signature !== state.store.communitySignature) {
      state.store.communitySignature = signature;
      actions.communitySidebar(latest.space, latest.channels);
      state.store.community = {
        sp: latest.space,
        channels: latest.channels,
      };
    }
    await Promise.all(
      latest.channels
        .filter((c) => c.type === "voice")
        .map((c) => actions.refreshVoiceUsers(c.channelId)),
    );
  });
  return {};
}
