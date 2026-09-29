import { esc, avatar, renderTemplate, showPage } from "./ui.js";
// Home e atalhos sociais.
export function createHome({ state, services, actions }) {
  function renderHome() {
    const online = state.friends.filter(
        (f) => f.status === "accepted" && f.userStatus === "online",
      ),
      recent = state.dms.slice(0, 3);
    showPage("home.home-home-page", {
      displayName: esc(state.user.displayName),
      avatar: avatar(state.user, "md"),
      onlineCount: online.length,
      peopleLabel: online.length === 1 ? "pessoa" : "pessoas",
      onlinePeople: online.length
        ? renderTemplate("home.home-people-grid", {
            onlineItems: online
              .map((f) =>
                renderTemplate("home.home-person-card", {
                  accountId: f.accountId,
                  avatar: avatar(f, "lg"),
                  displayName: esc(f.displayName),
                  username: esc(f.username),
                  customStatus: esc(f.customStatus || "Online"),
                  accountIdValue: f.accountId,
                  accountIdValueValue: f.accountId,
                  displayNameValue: esc(f.displayName),
                }),
              )
              .join(""),
          })
        : renderTemplate("home.home-empty-state", {}),
      recentConversations: recent.length
        ? renderTemplate("home.home-recent-dms", {
            recentItems: recent
              .map((d) =>
                renderTemplate("home.home-recent-dm", {
                  conversationId: d.conversationId,
                  avatar: avatar(d, "md"),
                  displayName: esc(d.displayName),
                  lastMessage: esc(d.lastMessage || "Conversa iniciada"),
                }),
              )
              .join(""),
          })
        : renderTemplate("home.home-recent-empty", {}),
    });
    document.getElementById("go-msg").onclick = () =>
      actions.setSection("messages");
    document
      .getElementById("go-friends")
      ?.addEventListener("click", () => actions.setSection("friends"));
    document
      .querySelectorAll("[data-profile]")
      .forEach(
        (x) => (x.onclick = () => actions.openUserProfile(x.dataset.profile)),
      );
    document
      .querySelectorAll("[data-message]")
      .forEach((x) => (x.onclick = () => actions.startDm(x.dataset.message)));
    document
      .querySelectorAll("[data-open-dm]")
      .forEach(
        (x) => (x.onclick = () => actions.openConversation(x.dataset.openDm)),
      );
    document
      .querySelectorAll(".call-btn")
      .forEach(
        (x) =>
          (x.onclick = () =>
            actions.startPrivateCall(x.dataset.call, x.dataset.name)),
      );
  }
  return {
    renderHome,
  };
}
