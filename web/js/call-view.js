import { renderTemplate, fillFields } from "./ui.js";
export class CallView {
  constructor(
    manager,
    { user, icons, esc, toast, profile, leave = () => manager.leave() },
  ) {
    Object.assign(this, {
      manager,
      user,
      icons,
      esc,
      toast,
      profile,
      leave,
    });
    this.tiles = new Map();
    this.visible = false;
    this.root = document.getElementById("persistent-call");
    this.root.hidden = true;
    this.root.classList.remove("session-maximized", "session-focus");
    fillFields(this.root, {
      mic: icons.mic,
      head: icons.head,
      cam: icons.cam,
      screen: icons.screen,
      hang: icons.hang,
    });
    const clock = document.getElementById("session-time");
    clock.textContent = "";
    this.timer = setInterval(() => {
      const s = manager.session;
      const since = s?.kind === "private" ? s.connectedAt : s?.startedAt;
      if (since) {
        const seconds = Math.floor((Date.now() - since) / 1000);
        clock.textContent = ` • ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      } else clock.textContent = "";
    }, 1000);
    const peopleToggle = document.getElementById("session-people-toggle");
    peopleToggle.onclick = () => {
      const panel = this.root.querySelector(".session-people");
      panel.hidden = !panel.hidden;
    };

    this.root.querySelector(".session-people").hidden =
      matchMedia("(max-width:760px)").matches;
    const maximize = this.root.querySelector('[data-action="maximize"]');
    maximize.textContent = "Maximizar";
    maximize.dataset.action = "maximize";
    maximize.onclick = () => {
      const on = this.root.classList.toggle("session-maximized");
      maximize.textContent = on ? "Restaurar" : "Maximizar";
    };

    const fullscreen = this.root.querySelector('[data-action="fullscreen"]');
    fullscreen.textContent = "Tela cheia";
    fullscreen.dataset.action = "fullscreen";
    fullscreen.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (this.root.requestFullscreen)
          await this.root.requestFullscreen();
        else toast("Tela cheia não disponível neste navegador.");
      } catch (e) {
        toast(e.message);
      }
    };

    this.dock = document.getElementById("session-return");
    this.dock.hidden = true;
    this.dock.onclick = () => this.show();

    this.root
      .querySelectorAll(
        '[data-action]:not([data-action="maximize"]):not([data-action="fullscreen"])',
      )
      .forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              switch (b.dataset.action) {
                case "mute":
                  manager.mute();
                  break;
                case "deafen":
                  manager.deafen();
                  break;
                case "camera":
                case "screen":
                  await manager.toggleMedia(b.dataset.action);
                  break;
                case "leave":
                  await this.leave();
                  break;
                case "hide":
                  this.hide();
                  break;
                case "grid":
                  this.root.classList.remove("session-focus");
                  break;
                case "focus":
                  this.root.classList.add("session-focus");
                  if (!this.root.querySelector(".selected"))
                    this.tiles.values().next().value?.classList.add("selected");
                  break;
                case "resume":
                  for (const p of manager.peers.values()) {
                    await p.audio?.play();
                    await p.sharedAudio?.play();
                    p.playBlocked = false;
                  }
                  manager.emit();
                  break;
              }
            } catch (e) {
              toast(e.message);
            }
          }),
      );
  }
  show() {
    this.visible = true;
    this.update();
  }
  hide() {
    this.visible = false;
    this.update();
  }
  async pip(video) {
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        return;
      }
      if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
        this.toast("PiP nativo não está disponível neste navegador.");
        return;
      }
      if (video.readyState < 2 || !video.videoWidth) {
        this.toast("Aguarde o vídeo começar a reproduzir.");
        return;
      }
      await video.requestPictureInPicture();
    } catch (e) {
      this.toast("Não foi possível abrir PiP: " + e.message);
    }
  }
  update() {
    const m = this.manager,
      s = m.session;
    this.root.hidden = !s || !this.visible;
    this.dock.hidden = !s || this.visible;
    if (!s) {
      for (const t of this.tiles.values()) t.remove();
      this.tiles.clear();
      return;
    }
    this.dock.textContent = `${s.name || "Chamada"} • Voltar à call`;
    this.root.querySelector("#session-kind").textContent =
      s.kind === "voice" ? "CANAL DE VOZ" : "CHAMADA PRIVADA";
    this.root.querySelector("#session-name").textContent = s.name || "Chamada";
    const states = [...m.peers.values()].map((p) => p.pc.connectionState);
    this.root.querySelector("#session-status").textContent = states.length
      ? states.every((x) => x === "connected")
        ? s.kind === "private" && s.callState !== "connected"
          ? "Confirmando conexão…"
          : "Conectado"
        : states.some((x) => x === "failed" || x === "disconnected")
          ? "Reconectando…"
          : "Conectando…"
      : s.kind === "voice"
        ? "Você está no canal"
        : "Conectando…";
    for (const [action, on] of [
      ["mute", m.muted || m.deafened],
      ["deafen", m.deafened],
      ["camera", !!m.streams.camera],
      ["screen", !!m.streams.screen],
    ])
      this.root
        .querySelector(`[data-action="${action}"]`)
        .classList.toggle("on", on);
    this.root.querySelector('[data-action="resume"]').hidden = ![
      ...m.peers.values(),
    ].some((p) => p.playBlocked);
    document
      .getElementById("dock-mic")
      ?.classList.toggle("off", m.muted || m.deafened);
    document.getElementById("dock-audio")?.classList.toggle("off", m.deafened);
    const people = [
      {
        ...this.user,
        local: true,
      },
      ...(s.kind === "voice"
        ? s.profiles.filter((p) => p.accountId !== this.user.accountId)
        : [
            s.person || {
              accountId: s.targetId,
              displayName: s.name,
            },
          ]),
    ];
    const wanted = new Set();
    for (const person of people) {
      const p = m.peers.get(person.accountId);
      for (const kind of ["camera", "screen"]) {
        const stream = person.local
          ? m.streams[kind]
          : p?.remote[kind]
            ? p.tracks[kind]
            : null;
        if (kind === "screen" && !stream) continue;
        const id = person.accountId + "-" + kind;
        wanted.add(id);
        let tile = this.tiles.get(id);
        if (!tile) {
          tile = document.createElement("section");
          tile.className = "session-tile";
          tile.dataset.tile = id;
          tile.innerHTML = renderTemplate(
            "call-view.update-session-placeholder",
            {
              pip: this.icons.pip,
            },
          );
          const video = tile.querySelector("video");
          video.muted = true;
          tile.querySelectorAll("button")[0].onclick = () => {
            for (const t of this.tiles.values())
              t.classList.toggle("selected", t === tile);
            this.root.classList.add("session-focus");
          };
          tile.querySelectorAll("button")[1].onclick = () => this.pip(video);
          this.tiles.set(id, tile);
          this.root.querySelector(".session-grid").append(tile);
        }
        const video = tile.querySelector("video");
        if (video.srcObject !== stream) {
          video.srcObject = stream || null;
          if (stream) video.play().catch(() => {});
        }
        video.hidden = !stream;
        tile.querySelector(".session-placeholder").hidden = !!stream;
        const placeholder = tile.querySelector(".session-placeholder");
        if (
          placeholder.dataset.avatar !== (person.avatarUrl || "") ||
          placeholder.dataset.name !== person.displayName
        ) {
          placeholder.replaceChildren();
          if (person.avatarUrl) {
            const avatar = document.createElement("img");
            avatar.src = person.avatarUrl;
            avatar.alt = "";
            placeholder.append(avatar);
          }
          const name = document.createElement("span");
          name.textContent = person.displayName || "Participante";
          placeholder.append(name);
          placeholder.dataset.avatar = person.avatarUrl || "";
          placeholder.dataset.name = person.displayName;
        }
        tile.querySelector("label").textContent =
          `${person.local ? "Você" : person.displayName} • ${kind === "screen" ? "Tela" : "Câmera"}`;
        tile.querySelectorAll("button")[1].disabled = !stream;
      }
    }
    for (const [id, tile] of this.tiles)
      if (!wanted.has(id)) {
        tile.querySelector("video").srcObject = null;
        tile.remove();
        this.tiles.delete(id);
      }
    const signature = people
      .map((p) => p.accountId + ":" + p.displayName)
      .join("|");
    if (this.peopleSignature !== signature) {
      this.peopleSignature = signature;
      const panel = this.root.querySelector(".session-people");
      panel.replaceChildren();
      const heading = document.createElement("h3");
      heading.textContent = "Participantes";
      panel.append(heading);
      for (const person of people) {
        const row = document.createElement("div");
        const name = document.createElement("button");
        name.textContent = person.displayName;
        name.onclick = () => {
          this.hide();
          this.profile(person.accountId);
        };
        row.append(name);
        if (!person.local) {
          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = 0;
          slider.max = 100;
          slider.value = (m.volumes.get(person.accountId) ?? 1) * 100;
          slider.setAttribute("aria-label", "Volume de " + person.displayName);
          slider.oninput = () =>
            m.volume(person.accountId, Number(slider.value) / 100);
          row.append(slider);
        }
        panel.append(row);
      }
    }
  }
  destroy() {
    clearInterval(this.timer);
    this.root.hidden = true;
    this.dock.hidden = true;
    this.root.querySelector(".session-grid").replaceChildren();
    this.root.querySelector(".session-people").replaceChildren();
    this.tiles.clear();
  }
}
