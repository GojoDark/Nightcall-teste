import {
  api,
  esc,
  errText,
  avatar,
  fileDataUrl,
  toast,
  renderTemplate,
} from "./ui.js";
import { icons } from "../assets/icons.js";

// Comunidades, canais, convites e painel de membros.
export function createCommunities({ state, services, actions }) {
  function drawSpaces() {
    const stack = document.getElementById("space-stack");
    if (!stack) return;
    stack.querySelectorAll("[data-space]").forEach((x) => x.remove());
    const add = document.getElementById("space-add");
    for (const sp of state.spaces) {
      const b = document.createElement("button");
      b.className =
        "space" + (state.activeSpace === sp.spaceId ? " selected" : "");
      b.dataset.space = sp.spaceId;
      b.title = sp.name;
      if (sp.iconUrl) {
        b.style.backgroundImage = `url('${sp.iconUrl}')`;
        b.style.backgroundSize = "cover";
        b.style.backgroundPosition = "center";
        b.textContent = "";
      } else b.textContent = sp.name.slice(0, 2).toUpperCase();
      b.onclick = () => actions.openSpace(sp.spaceId);
      stack.insertBefore(b, add);
    }
  }
  async function loadSpaces() {
    state.spaces = (await api("/api/spaces")).spaces;
    if (!state.disposed) actions.drawSpaces();
  }
  function spaceModal() {
    const wrap = document.getElementById("space-modal");
    wrap.hidden = false;
    wrap.querySelectorAll("form").forEach((form) => form.reset());
    const close = () => {
      wrap.hidden = true;
    };
    wrap.querySelector(".modal-x").onclick = close;
    wrap.onclick = (e) => {
      if (e.target === wrap) close();
    };
    wrap.querySelector("#create-space").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const d = await api("/api/spaces", {
          method: "POST",
          body: JSON.stringify({
            name: new FormData(e.currentTarget).get("name"),
          }),
        });
        close();
        await actions.loadSpaces();
        actions.openSpace(d.space.spaceId);
      } catch (x) {
        toast(errText(x.message));
      }
    };
    wrap.querySelector("#join-space").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const d = await api("/api/spaces/join", {
          method: "POST",
          body: JSON.stringify({
            token: new FormData(e.currentTarget).get("token"),
          }),
        });
        close();
        await actions.loadSpaces();
        actions.openSpace(d.space.spaceId);
      } catch (x) {
        toast(errText(x.message));
      }
    };
  }
  async function createSpaceInvite(spaceId) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = renderTemplate(
      "communities.create-space-invite-space-modal",
      {
        friendsItemsItems: state.friends
          .filter((f) => f.status === "accepted")
          .map((f) =>
            renderTemplate("communities.create-space-invite-content", {
              accountId: esc(f.accountId),
              displayName: esc(f.displayName),
            }),
          )
          .join(""),
      },
    );
    document.body.append(wrap);
    wrap.querySelector(".modal-x").onclick = () => wrap.remove();
    wrap.querySelector("#send-internal-invite").onclick = async () => {
      const inviteeId = wrap.querySelector("select").value;
      if (!inviteeId) return;
      try {
        await api("/api/spaces/" + spaceId + "/invite", {
          method: "POST",
          body: JSON.stringify({
            inviteeId,
          }),
        });
        wrap.querySelector("#invite-result").textContent =
          "Convite enviado nas notificações do amigo.";
      } catch (e) {
        toast(errText(e.message));
      }
    };
    wrap.querySelector("#copy-space-invite").onclick = async () => {
      try {
        const r = await api("/api/spaces/" + spaceId + "/invite", {
          method: "POST",
          body: "{}",
        });
        await navigator.clipboard.writeText(r.token);
        wrap.querySelector("#invite-result").textContent =
          "Código copiado. Válido por 7 dias.";
      } catch (e) {
        toast(errText(e.message));
      }
    };
  }
  function communitySidebar(sp, channels) {
    const side = document.querySelector(".context-sidebar");
    side.querySelector(".context-header").innerHTML = renderTemplate(
      "communities.community-sidebar-community-head-actions",
      {
        name: esc(sp.name),
        gear: icons.gear,
      },
    );
    side.querySelector(".context-nav").style.display = "none";
    setTimeout(() => {
      document
        .getElementById("community-invite")
        ?.addEventListener("click", () =>
          actions.createSpaceInvite(sp.spaceId),
        );
      document
        .getElementById("community-members-toggle")
        ?.addEventListener("click", () => actions.toggleMemberPanel(sp));
      document
        .getElementById("community-settings")
        ?.addEventListener("click", () =>
          actions.spaceSettingsModal(sp, channels),
        );
    }, 0);
    side.querySelector(".side-label").style.display = "none";
    const list = side.querySelector("#dm-list");
    list.style.display = "block";
    list.innerHTML = renderTemplate(
      "communities.community-sidebar-community-side-label",
      {
        channelsItemsItems: channels
          .filter((c) => c.type === "text")
          .map((c) =>
            renderTemplate("communities.community-sidebar-community-channel", {
              channelId: c.channelId,
              name: esc(c.name),
            }),
          )
          .join(""),
        channelsItemsItems2: channels
          .filter((c) => c.type === "voice")
          .map((c) =>
            renderTemplate(
              "communities.community-sidebar-community-channel-2",
              {
                channelId: c.channelId,
                name: esc(c.name),
                channelIdValue: c.channelId,
              },
            ),
          )
          .join(""),
      },
    );
    list
      .querySelectorAll("[data-channel]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            b.dataset.type === "text"
              ? actions.openTextChannel(sp, channels, b.dataset.channel)
              : actions.joinVoiceChannel(sp, channels, b.dataset.channel)),
      );
    channels
      .filter((c) => c.type === "voice")
      .forEach((c) => actions.refreshVoiceUsers(c.channelId));
    state.store.community = {
      sp,
      channels,
    };
  }
  function toggleMemberPanel(sp) {
    let panel = document.getElementById("member-panel");
    if (panel) {
      panel.remove();
      return;
    }
    panel = document.createElement("aside");
    panel.id = "member-panel";
    panel.className = "member-panel";
    panel.innerHTML = renderTemplate(
      "communities.toggle-member-panel-member-panel-list",
      {
        content: sp.members?.length || 0,
        membersItems: (sp.members || [])
          .map((m) =>
            renderTemplate("communities.toggle-member-panel-member-panel-row", {
              accountId: m.accountId,
              avatar: avatar(m, "sm"),
              displayName: esc(m.displayName),
              username: esc(m.username),
              roleLabel: m.role === "owner" ? " • dono" : "",
              status: m.status,
            }),
          )
          .join(""),
      },
    );
    document.querySelector(".app-shell").appendChild(panel);
    panel.querySelector("#close-members").onclick = () => panel.remove();
    panel
      .querySelectorAll("[data-profile]")
      .forEach(
        (b) => (b.onclick = () => actions.openUserProfile(b.dataset.profile)),
      );
  }
  function spaceSettingsModal(sp, channels) {
    if (sp.role !== "owner") {
      toast("Somente o dono pode configurar a comunidade.");
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = renderTemplate(
      "communities.space-settings-modal-space-modal",
      {
        name: esc(sp.name),
        nameValue: esc(sp.name),
        iconUrl: esc(sp.iconUrl || ""),
      },
    );
    document.body.appendChild(wrap);
    wrap.querySelector(".modal-x").onclick = () => wrap.remove();
    wrap.querySelector("#space-settings-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const file = document.getElementById("space-icon-file").files[0];
        const fd = new FormData(e.currentTarget);
        const iconUrl = file
          ? await fileDataUrl(file, 104857600)
          : String(fd.get("iconUrl") || sp.iconUrl || "").trim();
        await api(`/api/spaces/${sp.spaceId}/settings`, {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            iconUrl,
          }),
        });
        wrap.remove();
        await actions.loadSpaces();
        await actions.openSpace(sp.spaceId);
        toast("Comunidade atualizada.");
      } catch (x) {
        toast(
          x.message === "FILE_TOO_LARGE"
            ? "Imagem muito grande."
            : errText(x.message),
        );
      }
    };
    wrap.querySelector("#new-channel-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        await api(`/api/spaces/${sp.spaceId}/channels`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(fd.entries())),
        });
        wrap.remove();
        await actions.openSpace(sp.spaceId);
      } catch (x) {
        toast(errText(x.message));
      }
    };
  }
  async function openTextChannel(sp, channels, channelId) {
    const ch = channels.find((c) => c.channelId === channelId);
    if (!ch) {
      actions.showPageError("Canal não encontrado.", () =>
        actions.openSpace(sp.spaceId),
      );
      return;
    }
    actions.enterPage(
      {
        type: "channel",
        spaceId: sp.spaceId,
        id: channelId,
      },
      "# " + ch.name,
    );
    state.activeSpace = sp.spaceId;
    state.section = "space";
    state.store.community = {
      sp,
      channels,
    };
    services.chat.mount({
      kind: "channel",
      id: channelId,
      container: services.content,
      name: "#" + ch.name,
      header: renderTemplate("communities.open-text-channel-channel-head", {
        name: esc(ch.name),
        nameValue: esc(sp.name),
      }),
    });
    document.getElementById("channel-members").onclick = () =>
      actions.toggleMemberPanel(sp);
    document
      .querySelectorAll(".community-channel")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.channel === channelId),
      );
  }
  async function openSpace(spaceId, channelId = null) {
    const generation = actions.enterPage(
      {
        type: "space",
        id: spaceId,
      },
      "Comunidade",
    );
    state.activeSpace = spaceId;
    state.section = "space";
    actions.drawSpaces();
    services.content.innerHTML = renderTemplate(
      "communities.open-space-message-loading",
      {},
    );
    try {
      const d = await api(`/api/spaces/${spaceId}`);
      if (generation !== state.routeGeneration || state.disposed) return;
      const sp = {
        ...d.space,
        members: d.members,
      };
      state.store.community = {
        sp,
        channels: d.channels,
      };
      actions.communitySidebar(sp, d.channels);
      const ch =
        d.channels.find(
          (c) => c.channelId === channelId && c.type === "text",
        ) || d.channels.find((c) => c.type === "text");
      if (ch) {
        services.navigation.restoring = true;
        await actions.openTextChannel(sp, d.channels, ch.channelId);
        services.navigation.restoring = false;
        history.replaceState(
          {
            ...history.state,
            nightcallRoute: services.navigation.route,
          },
          "",
        );
      } else
        services.content.innerHTML = renderTemplate(
          "communities.open-space-dm-welcome",
          {},
        );
    } catch (e) {
      if (generation === state.routeGeneration)
        actions.showPageError(errText(e.message), () =>
          actions.openSpace(spaceId, channelId),
        );
    }
  }
  async function refreshVoiceUsers(channelId) {
    try {
      const r = await api(`/api/voice/${channelId}/state`);
      const side = document.getElementById("voice-users-" + channelId);
      if (side)
        side.innerHTML = (r.profiles || [])
          .map((m) =>
            renderTemplate("communities.refresh-voice-users-voice-side-user", {
              accountId: m.accountId,
              avatar: avatar(m, "sm"),
              displayName: esc(m.displayName),
            }),
          )
          .join("");
      side
        ?.querySelectorAll("[data-profile]")
        .forEach(
          (b) => (b.onclick = () => actions.openUserProfile(b.dataset.profile)),
        );
      return r;
    } catch {
      return {
        participants: [],
        profiles: [],
      };
    }
  }
  return {
    drawSpaces,
    loadSpaces,
    spaceModal,
    createSpaceInvite,
    communitySidebar,
    toggleMemberPanel,
    spaceSettingsModal,
    openTextChannel,
    openSpace,
    refreshVoiceUsers,
  };
}
