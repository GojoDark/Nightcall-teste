// One media session per signed-in account. Views subscribe; they never own tracks.
export class CallManager {
  constructor({
    accountId,
    api,
    media = navigator.mediaDevices,
    Peer = RTCPeerConnection,
    Stream = MediaStream,
    changed = () => {},
    error = console.error,
    audioFactory,
  }) {
    Object.assign(this, {
      accountId,
      api,
      media,
      Peer,
      Stream,
      changed,
      error,
    });
    this.audioFactory =
      audioFactory ||
      (() => {
        const a = document.createElement("audio");
        a.autoplay = true;
        document.body.append(a);
        return a;
      });
    this.session = null;
    this.peers = new Map();
    this.streams = {};
    this.volumes = new Map();
    this.muted = false;
    this.deafened = false;
    this.settings = {
      input: "",
      output: "",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    this.epoch = 0;
    this.pending = null;
    this.mediaPending = new Set();
    this.iceServers = [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ];
  }
  emit() {
    this.changed(this);
  }
  async configure() {
    const r = await this.api("/api/rtc-config");
    this.iceServers = r.iceServers;
  }
  constraints() {
    const s = this.settings;
    return {
      audio: {
        ...(s.input
          ? {
              deviceId: {
                exact: s.input,
              },
            }
          : {}),
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
      },
      video: false,
    };
  }
  async captureMic() {
    if (!this.media?.getUserMedia)
      throw Error(
        "Microfone indisponível. Abra o Nightcall por HTTPS e permita o acesso.",
      );
    return this.media.getUserMedia(this.constraints());
  }
  async enter(context) {
    if (this.session?.kind === context.kind && this.session.id === context.id)
      return this.session;
    if (this.pending) {
      if (
        this.pendingContext.kind === context.kind &&
        this.pendingContext.id === context.id
      )
        return this.pending;
      throw Error("Uma entrada em chamada já está em andamento.");
    }
    if (this.session)
      throw Error("Encerre a chamada atual antes de entrar em outra.");
    const epoch = ++this.epoch;
    this.pendingContext = context;
    this.pending = (async () => {
      let mic, joined;
      try {
        mic = await this.captureMic();
        if (epoch !== this.epoch) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        if (context.kind === "voice")
          joined = await this.api(`/api/voice/${context.id}/join`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: context.localId,
            }),
          });
        if (epoch !== this.epoch) {
          mic.getTracks().forEach((t) => t.stop());
          if (joined)
            await this.api(`/api/voice/${context.id}/leave`, {
              method: "POST",
              body: JSON.stringify({
                sessionId: context.localId,
              }),
            });
          return;
        }
        this.streams.audio = mic;
        mic
          .getAudioTracks()
          .forEach((t) => (t.enabled = !this.muted && !this.deafened));
        this.session = {
          ...context,
          localId: context.localId,
          startedAt: Date.now(),
          profiles: joined?.profiles || [],
          participants: joined?.sessions || [],
        };
        if (joined)
          for (const member of joined.sessions)
            if (member.accountId !== this.accountId)
              this.peer(member.accountId, member.sessionId);
        this.emit();
        return this.session;
      } catch (e) {
        mic?.getTracks().forEach((t) => t.stop());
        if (this.session?.localId === context.localId)
          await this.leave().catch(() => {});
        else if (joined)
          await this.api(`/api/voice/${context.id}/leave`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: context.localId,
            }),
          }).catch(() => {});
        throw e;
      } finally {
        this.pending = null;
        this.pendingContext = null;
      }
    })();
    return this.pending;
  }
  peer(id, remoteSession) {
    const old = this.peers.get(id);
    if (old?.remoteSession === remoteSession) return old;
    if (old) this.removePeer(id);
    const session = this.session;
    if (!session) throw Error("Sem chamada ativa.");
    const pc = new this.Peer({
      iceServers: this.iceServers,
    });
    const p = {
      id,
      remoteSession,
      pc,
      polite: this.accountId.localeCompare(id) > 0,
      makingOffer: false,
      ignoreOffer: false,
      settingAnswer: false,
      ice: [],
      remote: {},
      tracks: {},
      queue: Promise.resolve(),
      mediaRevision: -1,
    };
    this.peers.set(id, p);
    p.transceivers = p.polite
      ? []
      : ["audio", "camera", "screen", "screenAudio"].map((kind) => {
          const stream =
            kind === "screenAudio" ? this.streams.screen : this.streams[kind];
          const audio = kind === "audio" || kind === "screenAudio";
          const track = audio
            ? stream?.getAudioTracks()[0]
            : stream?.getVideoTracks()[0];
          return pc.addTransceiver(track || (audio ? "audio" : "video"), {
            direction: "sendrecv",
            ...(track
              ? {
                  streams: [stream],
                }
              : {}),
          });
        });
    const codecs = globalThis.RTCRtpSender?.getCapabilities?.("audio")?.codecs;
    if (codecs && p.transceivers[0]?.setCodecPreferences)
      p.transceivers[0].setCodecPreferences([
        ...codecs.filter((c) => c.mimeType.toLowerCase() === "audio/opus"),
        ...codecs.filter((c) => c.mimeType.toLowerCase() !== "audio/opus"),
      ]);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        this.send(p, {
          candidate,
        }).catch(this.error);
    };
    pc.onnegotiationneeded = () =>
      this.enqueue(p, async () => {
        if (pc.signalingState !== "stable") return;
        try {
          p.makingOffer = true;
          await pc.setLocalDescription();
          await this.send(p, {
            description: pc.localDescription,
            media: this.mediaState(),
          });
        } finally {
          p.makingOffer = false;
        }
      });
    pc.ontrack = (e) => {
      const index = pc.getTransceivers().indexOf(e.transceiver);
      const kind = ["audio", "camera", "screen", "screenAudio"][index];
      if (!kind) return;
      p.tracks[kind] = new this.Stream([e.track]);
      if (kind === "audio" || kind === "screenAudio") {
        const key = kind === "audio" ? "audio" : "sharedAudio";
        p[key] ||= this.audioFactory();
        p[key].srcObject = p.tracks[kind];
        this.applyAudio(p);
        p[key].play?.().catch(() => {
          p.playBlocked = true;
          this.emit();
        });
      }
      e.track.onunmute = () => this.emit();
      e.track.onended = () => this.emit();
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      clearTimeout(p.reconnectTimer);
      if (pc.connectionState === "failed") pc.restartIce();
      if (pc.connectionState === "disconnected")
        p.reconnectTimer = setTimeout(() => {
          if (this.peers.get(id) === p && pc.connectionState === "disconnected")
            pc.restartIce();
        }, 3000);
      this.emit();
    };
    return p;
  }
  enqueue(p, operation) {
    p.queue = p.queue
      .then(() => (this.peers.get(p.id) === p ? operation() : undefined))
      .catch((e) => this.error(e));
    return p.queue;
  }
  mediaState() {
    return {
      revision: this.revision || 0,
      camera: !!this.streams.camera,
      screen: !!this.streams.screen,
      muted: this.muted || this.deafened,
    };
  }
  async send(p, data) {
    const s = this.session;
    if (!s || this.peers.get(p.id) !== p) return;
    return this.api("/api/signals", {
      method: "POST",
      body: JSON.stringify({
        targetId: p.id,
        type: "rtc",
        payload: {
          kind: s.kind,
          context: s.id,
          fromSession: s.localId,
          toSession: p.remoteSession,
          ...data,
        },
      }),
    });
  }
  async signal({ fromId, payload: d }) {
    const s = this.session;
    if (
      !s ||
      d.kind !== s.kind ||
      d.context !== s.id ||
      d.toSession !== s.localId
    )
      return;
    if (
      s.kind === "private" &&
      (fromId !== s.targetId ||
        this.peers.get(fromId)?.remoteSession !== d.fromSession)
    )
      return;
    if (
      s.kind === "voice" &&
      !s.participants.some(
        (m) => m.accountId === fromId && m.sessionId === d.fromSession,
      )
    )
      return;
    const p = this.peer(fromId, d.fromSession);
    return this.enqueue(p, async () => {
      const pc = p.pc;
      if (d.description) {
        const ready =
          !p.makingOffer && (pc.signalingState === "stable" || p.settingAnswer);
        const collision = d.description.type === "offer" && !ready;
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        p.settingAnswer = d.description.type === "answer";
        try {
          await pc.setRemoteDescription(d.description);
        } finally {
          p.settingAnswer = false;
        }
        if (!p.transceivers.length) {
          p.transceivers = pc.getTransceivers();
          for (const [index, kind] of [
            "audio",
            "camera",
            "screen",
            "screenAudio",
          ].entries()) {
            const transceiver = p.transceivers[index];
            const stream =
              kind === "screenAudio" ? this.streams.screen : this.streams[kind];
            const track =
              kind === "audio" || kind === "screenAudio"
                ? stream?.getAudioTracks()[0]
                : stream?.getVideoTracks()[0];
            if (transceiver) {
              transceiver.direction = "sendrecv";
              await transceiver.sender.replaceTrack(track || null);
            }
          }
        }
        for (const candidate of p.ice.splice(0))
          await pc.addIceCandidate(candidate);
        if (d.description.type === "offer") {
          await pc.setLocalDescription();
          await this.send(p, {
            description: pc.localDescription,
            media: this.mediaState(),
          });
        }
      }
      if (d.candidate && !p.ignoreOffer) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.candidate);
        else p.ice.push(d.candidate);
      }
      if (d.media && d.media.revision >= p.mediaRevision) {
        p.mediaRevision = d.media.revision;
        p.remote = d.media;
      }
      this.emit();
    });
  }
  async syncPresence(state) {
    if (this.session?.kind !== "voice") return;
    this.session.profiles = state.profiles;
    this.session.participants = state.sessions;
    for (const [id, p] of this.peers)
      if (
        !state.sessions.some(
          (m) => m.accountId === id && m.sessionId === p.remoteSession,
        )
      )
        this.removePeer(id);
    for (const m of state.sessions)
      if (m.accountId !== this.accountId) this.peer(m.accountId, m.sessionId);
    this.emit();
  }
  async heartbeat() {
    const s = this.session;
    if (!s) return;
    if (s.kind !== "voice") {
      await Promise.all(
        [...this.peers.values()].map((p) =>
          this.send(p, {
            media: this.mediaState(),
          }),
        ),
      );
      return;
    }
    const r = await this.api(`/api/voice/${s.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: s.localId,
      }),
    });
    if (this.session !== s) return;
    if (!r.joined) {
      await this.leave(false);
      throw Error("A sessão de voz expirou. Entre novamente no canal.");
    }
    await this.syncPresence(r);
    await Promise.all(
      [...this.peers.values()].map((p) =>
        this.send(p, {
          media: this.mediaState(),
        }),
      ),
    );
  }
  async toggleMedia(kind) {
    if (!this.session || this.mediaPending.has(kind)) return;
    this.mediaPending.add(kind);
    const s = this.session;
    try {
      if (this.streams[kind]) {
        await this.setMedia(kind, null);
        return;
      }
      if (kind === "screen" && !this.media?.getDisplayMedia)
        throw Error("Este navegador não oferece compartilhamento de tela.");
      const stream = await (kind === "screen"
        ? this.media.getDisplayMedia({
            video: true,
            audio: true,
            systemAudio: "include",
          })
        : this.media.getUserMedia({
            video: true,
            audio: false,
          }));
      if (this.session !== s) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      track.onended = () => {
        if (this.streams[kind] === stream)
          this.setMedia(kind, null).catch(this.error);
      };
      await this.setMedia(kind, stream);
    } finally {
      this.mediaPending.delete(kind);
    }
  }
  async setMedia(kind, stream) {
    const session = this.session,
      old = this.streams[kind],
      index = ["audio", "camera", "screen"].indexOf(kind);
    const peers = [...this.peers.values()];
    const track =
      kind === "audio"
        ? stream?.getAudioTracks()[0]
        : stream?.getVideoTracks()[0];
    const results = await Promise.allSettled(
      peers.flatMap((p) => [
        p.transceivers[index]?.sender.replaceTrack(track || null),
        ...(kind === "screen"
          ? [
              p.transceivers[3]?.sender.replaceTrack(
                stream?.getAudioTracks()[0] || null,
              ),
            ]
          : []),
      ]),
    );
    if (this.session !== session) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (results.some((r) => r.status === "rejected")) {
      const previous =
        kind === "audio" ? old?.getAudioTracks()[0] : old?.getVideoTracks()[0];
      await Promise.allSettled(
        peers.flatMap((p) => [
          p.transceivers[index]?.sender.replaceTrack(previous || null),
          ...(kind === "screen"
            ? [
                p.transceivers[3]?.sender.replaceTrack(
                  old?.getAudioTracks()[0] || null,
                ),
              ]
            : []),
        ]),
      );
      stream?.getTracks().forEach((t) => t.stop());
      throw Error(
        "Não foi possível trocar a mídia. A captura anterior foi preservada.",
      );
    }
    this.streams[kind] = stream;
    old?.getTracks().forEach((t) => t.stop());
    this.revision = (this.revision || 0) + 1;
    this.emit();
    await Promise.all(
      [...this.peers.values()].map((p) =>
        this.send(p, {
          media: this.mediaState(),
        }),
      ),
    );
  }
  mute(value = !this.muted) {
    this.muted = value;
    this.updateMute();
  }
  deafen(value = !this.deafened) {
    this.deafened = value;
    this.updateMute();
    for (const p of this.peers.values()) this.applyAudio(p);
  }
  updateMute() {
    this.streams.audio
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !this.muted && !this.deafened));
    this.emit();
  }
  applyAudio(p) {
    for (const audio of [p.audio, p.sharedAudio]) {
      if (!audio) continue;
      audio.muted = this.deafened;
      audio.volume = this.volumes.get(p.id) ?? 1;
      if (audio.setSinkId)
        audio.setSinkId(this.settings.output).catch(this.error);
    }
  }
  volume(id, value) {
    this.volumes.set(id, value);
    const p = this.peers.get(id);
    if (p) this.applyAudio(p);
  }
  async updateSettings(next) {
    const previous = this.settings;
    this.settings = {
      ...previous,
      ...next,
    };
    const s = this.session;
    try {
      if (s && Object.keys(next).some((k) => k !== "output")) {
        const stream = await this.captureMic();
        if (this.session !== s) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream
          .getAudioTracks()
          .forEach((t) => (t.enabled = !this.muted && !this.deafened));
        await this.setMedia("audio", stream);
      }
      for (const p of this.peers.values()) this.applyAudio(p);
    } catch (e) {
      this.settings = previous;
      throw e;
    }
  }
  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    clearTimeout(p.reconnectTimer);
    p.pc.close();
    for (const audio of [p.audio, p.sharedAudio])
      if (audio) {
        audio.srcObject = null;
        audio.remove();
      }
  }
  async leave(notify = true) {
    ++this.epoch;
    const s = this.session;
    this.session = null;
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    for (const stream of Object.values(this.streams))
      stream?.getTracks().forEach((t) => t.stop());
    this.streams = {};
    this.emit();
    if (!s || !notify) return;
    if (s.kind === "voice")
      await this.api(`/api/voice/${s.id}/leave`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: s.localId,
        }),
      });
    else if (s.clientId)
      await this.api(`/api/calls/${s.id}/end`, {
        method: "POST",
        body: JSON.stringify({
          clientId: s.clientId,
        }),
      });
  }
}
