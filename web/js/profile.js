import {
  api,
  esc,
  errText,
  avatar,
  fileDataUrl,
  toast,
  renderTemplate,
  fillFields,
  showPage,
} from "./ui.js";
// Perfil público e edição de avatar, banner e dados.
export function createProfile({ state, services, actions }) {
  async function openUserProfile(accountId) {
    const generation = actions.enterPage(
      {
        type: "profile",
        id: accountId,
      },
      "Perfil",
    );
    state.section = "profile";
    try {
      const d =
        accountId === state.user.accountId
          ? {
              user: state.user,
            }
          : await api("/api/profile/" + accountId);
      if (generation !== state.routeGeneration) return;
      const u = d.user;
      showPage("profile.open-user-profile-profile-page", {
        backgroundAttribute: u.bannerUrl
          ? `style="background-image:linear-gradient(180deg,transparent,rgba(9,11,20,.7)),url('${esc(u.bannerUrl)}')"`
          : "",
        avatar: avatar(u, "lg"),
        displayName: esc(u.displayName),
        username: esc(u.username),
        status: u.status,
        bio: esc(u.bio || "Sem bio ainda."),
        statusSection: u.customStatus
          ? renderTemplate("profile.open-user-profile-profile-status", {
              customStatus: esc(u.customStatus),
            })
          : "",
        linksSection: (() => {
          let links = [];
          try {
            links = u.links || JSON.parse(u.linksJson || "[]");
          } catch {}
          return links.length
            ? renderTemplate("profile.open-user-profile-profile-links", {
                linksItems: links
                  .map((l) =>
                    renderTemplate("profile.open-user-profile-content", {
                      url: esc(l.url),
                      label: esc(l.label || l.url),
                    }),
                  )
                  .join(""),
              })
            : "";
        })(),
        profileActions:
          u.accountId === state.user.accountId
            ? renderTemplate("profile.open-user-profile-primary", {})
            : renderTemplate("profile.open-user-profile-primary-2", {}),
      });
      services.content.querySelector(".profile-banner").style.backgroundImage =
        u.bannerUrl
          ? "linear-gradient(180deg,transparent,rgba(9,11,20,.7)),url(" +
            JSON.stringify(u.bannerUrl) +
            ")"
          : "";
      services.content.querySelector(".presence").className =
        "presence " + u.status;
      document
        .getElementById("edit-own-profile")
        ?.addEventListener("click", actions.renderProfile);
      document
        .getElementById("profile-message")
        ?.addEventListener("click", async () => {
          const dm = await api("/api/dms", {
            method: "POST",
            body: JSON.stringify({
              accountId: u.accountId,
            }),
          });
          await actions.loadDms();
          actions.openConversation(dm.conversationId);
        });
      document
        .getElementById("profile-call")
        ?.addEventListener("click", () =>
          actions.startPrivateCall(u.accountId, u.displayName),
        );
    } catch {
      toast("Não foi possível abrir este perfil.");
    }
  }
  function renderProfile() {
    let links = [];
    try {
      links = state.user.links || JSON.parse(state.user.linksJson || "[]");
    } catch {}
    showPage("profile.profile-profile-page", {
      backgroundAttribute: state.user.bannerUrl
        ? `style="background-image:linear-gradient(180deg,transparent,rgba(9,11,20,.65)),url('${esc(state.user.bannerUrl)}')"`
        : "",
      avatar: avatar(state.user, "lg"),
      displayName: esc(state.user.displayName),
      username: esc(state.user.username),
      displayNameValue: esc(state.user.displayName),
      customStatus: esc(state.user.customStatus || ""),
      avatarUrl: esc(
        state.user.avatarUrl?.startsWith("data:")
          ? ""
          : state.user.avatarUrl || "",
      ),
      bannerUrl: esc(
        state.user.bannerUrl?.startsWith("data:")
          ? ""
          : state.user.bannerUrl || "",
      ),
      bio: esc(state.user.bio || ""),
      contentItems: [0, 1, 2]
        .map((i) =>
          renderTemplate("profile.profile-link-row", {
            i: i,
            label: esc(links[i]?.label || ""),
            iValue: i,
            url: esc(links[i]?.url || ""),
          }),
        )
        .join(""),
    });
    services.content.querySelector(".profile-banner").style.backgroundImage =
      state.user.bannerUrl
        ? "linear-gradient(180deg,transparent,rgba(9,11,20,.65)),url(" +
          JSON.stringify(state.user.bannerUrl) +
          ")"
        : "";
    const form = document.getElementById("profile-form");
    for (const name of [
      "displayName",
      "status",
      "customStatus",
      "avatarUrl",
      "bannerUrl",
      "bio",
    ]) {
      const value = state.user[name] || "";
      form.elements[name].value =
        (name === "avatarUrl" || name === "bannerUrl") &&
        value.startsWith("data:")
          ? ""
          : value;
    }
    document.getElementById("profile-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        const avatarFile = document.getElementById("avatar-file").files[0],
          bannerFile = document.getElementById("banner-file").files[0];
        const avatarUrl = avatarFile
          ? await fileDataUrl(avatarFile, 104857600)
          : String(fd.get("avatarUrl") || state.user.avatarUrl || "").trim();
        const bannerUrl = bannerFile
          ? await fileDataUrl(bannerFile, 104857600, 1600)
          : String(fd.get("bannerUrl") || state.user.bannerUrl || "").trim();
        const links = [0, 1, 2]
          .map((i) => ({
            label: fd.get("linkLabel" + i),
            url: fd.get("linkUrl" + i),
          }))
          .filter((x) => x.url);
        const payload = {
          displayName: fd.get("displayName"),
          status: fd.get("status"),
          customStatus: fd.get("customStatus"),
          bio: fd.get("bio"),
          avatarUrl,
          bannerUrl,
          links,
        };
        const d = await api("/api/profile/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        state.user = d.user;
        state.user.links = links;
        toast("Perfil salvo.");
        services.chat.user = state.user;
        services.privateCalls.user = state.user;
        services.callView.user = state.user;
        fillFields(document.getElementById("profile-dock"), {
          avatar: avatar(state.user, "sm"),
          displayName: esc(state.user.displayName),
          username: esc(state.user.username),
        });
        actions.renderProfile();
        services.manager.emit();
      } catch (x) {
        toast(
          x.message === "FILE_TOO_LARGE"
            ? "Imagem muito grande para o perfil."
            : x.message === "INVALID_IMAGE"
              ? "Formato de imagem não suportado."
              : errText(x.message),
        );
      }
    };
    document.getElementById("logout").onclick = actions.logout;
  }
  return {
    openUserProfile,
    renderProfile,
  };
}
