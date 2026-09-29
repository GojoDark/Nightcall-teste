export class PrivateCalls {
  constructor({ api, manager, view, user, toast, changed, notify }) {
    Object.assign(this, {
      api,
      manager,
      view,
      user,
      toast,
      changed,
      notify,
    });
    this.clientId = crypto.randomUUID();
    this.current = null;
    this.starting = null;
    this.rtcQueue = [];
    this.seen = new Set();
    this.disposed = false;
    this.banner = document.getElementById("incoming-call");
    this.banner.hidden = true;
    this.banner.replaceChildren();
  }
  action(call, action) {
    return this.api(`/api/calls/${call.call_id}/${action}`, {
      method: "POST",
      body: JSON.stringify({
        clientId: this.clientId,
      }),
    });
  }
  async start(targetId) {
    if (
      this.current &&
      ["calling", "ringing", "connecting", "connected"].includes(
        this.current.state,
      )
    ) {
      if (this.current.callee_id === targetId) {
        this.view.show();
        this.render();
        return;
      }
      throw Error("Encerre a chamada atual primeiro.");
    }
    if (this.manager.session || this.manager.pending)
      throw Error("Saia do canal de voz antes de ligar.");
    const requestId = crypto.randomUUID();
    this.creating = true;
    try {
      const { call } = await this.api("/api/calls", {
        method: "POST",
        body: JSON.stringify({
          targetId,
          clientId: this.clientId,
          requestId,
        }),
      });
      await this.changed();
      this.apply([call]);
    } finally {
      this.creating = false;
    }
  }
  apply(calls) {
    if (this.disposed) return;
    const incoming = calls.find(
      (c) =>
        c.callee_id === this.user.accountId &&
        ["calling", "ringing"].includes(c.state),
    );
    const owned = calls.find(
      (c) =>
        ["calling", "ringing", "connecting", "connected"].includes(c.state) &&
        (c.caller_id === this.user.accountId
          ? c.caller_client
          : c.callee_client) === this.clientId,
    );
    const previous = this.current;
    const matching =
      previous && calls.find((c) => c.call_id === previous.call_id);
    const call = owned || incoming || matching;
    if (!call) {
      this.current = null;
      this.render();
      return;
    }
    this.current = call;
    if (
      ["calling", "ringing"].includes(call.state) &&
      call.callee_id === this.user.accountId
    ) {
      if (!this.seen.has(call.call_id)) {
        this.seen.add(call.call_id);
        this.notify(
          "Chamada recebida",
          `${call.caller.displayName} está ligando`,
          () => this.render(),
        );
      }
      if (call.state === "calling" && !this.ringing) {
        this.ringing = true;
        this.action(call, "ringing")
          .catch(() => {})
          .finally(() => (this.ringing = false));
      }
    }
    if (["connecting", "connected"].includes(call.state)) {
      const owner =
        (call.caller_id === this.user.accountId
          ? call.caller_client
          : call.callee_client) === this.clientId;
      if (owner && this.ending === call.call_id)
        this.finishEnd(call).catch(() => {});
      else if (
        owner &&
        !this.starting &&
        this.manager.session?.id !== call.call_id
      )
        this.startRTC(call);
      if (owner && this.manager.session?.id === call.call_id) {
        this.manager.session.callState = call.state;
        this.manager.session.connectedAt = call.connected_ms;
        this.view.update();
      }
      if (!owner && this.manager.session?.id === call.call_id)
        this.manager.leave(false);
    }
    if (
      !["calling", "ringing", "connecting", "connected"].includes(call.state)
    ) {
      if (this.ending === call.call_id) this.ending = null;
      if (
        this.manager.session?.id === call.call_id ||
        this.starting === call.call_id
      )
        this.manager.leave(false);
      if (
        previous &&
        ["calling", "ringing", "connecting", "connected"].includes(
          previous.state,
        )
      ) {
        const text = {
          declined: "Chamada recusada",
          missed: "Chamada perdida",
          cancelled: "Chamada cancelada",
          ended: "Chamada encerrada",
          failed: "Não foi possível manter a chamada",
        }[call.state];
        this.toast(text);
        this.changed();
      }
    }
    this.render();
    this.mediaChanged();
  }
  render() {
    const c = this.current,
      pending = c && ["calling", "ringing"].includes(c.state);
    this.banner.hidden = !pending;
    if (!pending) return;
    const incoming = c.callee_id === this.user.accountId,
      signature = c.call_id + incoming + c.state;
    if (this.banner.dataset.signature === signature) return;
    this.banner.dataset.signature = signature;
    this.banner.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = incoming
      ? `${c.caller.displayName} está ligando…`
      : `Ligando para ${c.callee.displayName}…`;
    this.banner.append(title);
    const status = document.createElement("p");
    status.textContent = incoming
      ? "Chamada de voz"
      : c.state === "ringing"
        ? "Chamando no dispositivo do contato…"
        : "Aguardando o contato receber…";
    this.banner.append(status);
    for (const [action, label] of incoming
      ? [
          ["accept", "Atender"],
          ["decline", "Recusar"],
        ]
      : [["cancel", "Cancelar"]]) {
      const button = document.createElement("button");
      button.dataset.callAction = action;
      button.className = action === "accept" ? "primary" : "secondary";
      button.textContent = label;
      button.onclick = async () => {
        button.disabled = true;
        try {
          if (
            action === "accept" &&
            (this.manager.session || this.manager.pending)
          )
            throw Error("Encerre a chamada atual antes de atender.");
          const { call } = await this.action(c, action);
          this.apply([call]);
          await this.changed();
        } catch (e) {
          this.toast(e.message);
          button.disabled = false;
        }
      };
      this.banner.append(button);
    }
  }
  async startRTC(call) {
    this.starting = call.call_id;
    this.reported = null;
    const caller = call.caller_id === this.user.accountId,
      person = caller ? call.callee : call.caller;
    try {
      const s = await this.manager.enter({
        kind: "private",
        id: call.call_id,
        localId: caller ? call.caller_session : call.callee_session,
        targetId: person.accountId,
        person,
        name: person.displayName,
        clientId: this.clientId,
        callState: "connecting",
        connectedAt: call.connected_ms,
      });
      if (
        !s ||
        this.current?.call_id !== call.call_id ||
        !["connecting", "connected"].includes(this.current.state)
      ) {
        await this.manager.leave(false);
        return;
      }
      this.manager.peer(
        person.accountId,
        caller ? call.callee_session : call.caller_session,
      );
      this.view.show();
      for (const event of this.rtcQueue.splice(0))
        if (event.payload.context === call.call_id)
          await this.manager.signal(event);
    } catch (e) {
      this.toast(e.message);
      await this.action(call, "fail").catch(() => {});
      await this.manager.leave(false);
    } finally {
      this.starting = null;
    }
  }
  async signal(event) {
    if (event.payload.kind !== "private") return this.manager.signal(event);
    if (
      !this.current ||
      event.payload.context !== this.current.call_id ||
      !["connecting", "connected"].includes(this.current.state)
    )
      return;
    if (this.starting || this.manager.session?.id !== event.payload.context) {
      this.rtcQueue.push(event);
      this.rtcQueue = this.rtcQueue.slice(-100);
      return;
    }
    return this.manager.signal(event);
  }
  mediaChanged() {
    const c = this.current;
    if (!c || this.manager.session?.id !== c.call_id) return;
    const connected =
      this.manager.peers.size > 0 &&
      [...this.manager.peers.values()].every(
        (p) => p.pc.connectionState === "connected",
      );
    if (connected && this.reported !== c.call_id && !this.reporting) {
      this.reporting = true;
      this.action(c, "connected")
        .then(({ call }) => {
          this.reported = call.call_id;
          this.apply([call]);
        })
        .catch(() => {})
        .finally(() => (this.reporting = false));
    }
    if (connected) this.disconnectedSince = 0;
    else if (c.state === "connected") {
      this.disconnectedSince ||= Date.now();
      if (Date.now() - this.disconnectedSince > 35000)
        this.action(c, "fail")
          .then(({ call }) => this.apply([call]))
          .catch(() => {});
    }
  }
  finishEnd(call) {
    if (this.endingRequest) return this.endingRequest;
    this.endingRequest = this.action(call, "end")
      .then(({ call }) => this.apply([call]))
      .finally(() => (this.endingRequest = null));
    return this.endingRequest;
  }
  async end() {
    const call = this.current;
    if (
      call &&
      ["calling", "ringing", "connecting", "connected"].includes(call.state)
    ) {
      this.ending = call.call_id;
      await this.manager.leave(false);
      return this.finishEnd(call);
    }
    await this.manager.leave(false);
  }
  destroy() {
    this.disposed = true;
    this.banner.hidden = true;
    this.banner.replaceChildren();
  }
}
