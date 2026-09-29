import {
  api,
  esc,
  errText,
  avatar,
  toast,
  renderTemplate,
  showPage,
} from "./ui.js";
// Lista, pedidos e aceite de amizade.
export function createFriends({ state, services, actions }) {
  function updateBadge() {
    const n = state.friends.filter(
      (f) => f.status === "pending" && f.addresseeId === state.user.accountId,
    ).length;
    const b = document.getElementById("pending-badge");
    b.textContent = n;
    b.hidden = !n;
  }
  async function loadFriends() {
    const next = (await api("/api/friends")).friends;
    if (state.disposed) return;
    const sig = JSON.stringify(next);
    const changed = sig !== state.lastFriendSig;
    state.friends = next;
    state.lastFriendSig = sig;
    actions.updateBadge();
    if (changed && state.section === "home") actions.renderHome();
    if (changed && state.section === "friends") actions.renderFriends();
  }
  function renderFriends() {
    const incoming = state.friends.filter(
      (f) => f.status === "pending" && f.addresseeId === state.user.accountId,
    );
    showPage("friends.friends-friends-page", {
      pendingBadge: incoming.length
        ? renderTemplate("friends.friends-content", {
            length: incoming.length,
          })
        : "",
    });
    let tab = "online";
    services.content
      .querySelectorAll("[data-tab]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.tab === tab),
      );
    const draw = () => {
      const list =
        tab === "online"
          ? state.friends.filter(
              (f) => f.status === "accepted" && f.userStatus === "online",
            )
          : tab === "all"
            ? state.friends.filter((f) => f.status === "accepted")
            : incoming;
      document.getElementById("friend-list").innerHTML = list.length
        ? renderTemplate("friends.friends-friend-list", {
            listItems: list
              .map((f) =>
                renderTemplate("friends.friends-friend-row", {
                  avatar: avatar(f, "md"),
                  userStatus: f.userStatus,
                  accountId: f.accountId,
                  displayName: esc(f.displayName),
                  username: esc(f.username),
                  friendActions:
                    tab === "pending"
                      ? renderTemplate("friends.friends-friend-actions", {
                          friendshipId: f.friendshipId,
                          friendshipIdValue: f.friendshipId,
                        })
                      : renderTemplate("friends.friends-friend-actions-2", {
                          accountId: f.accountId,
                          accountIdValue: f.accountId,
                          displayName: esc(f.displayName),
                        }),
                }),
              )
              .join(""),
          })
        : renderTemplate("friends.friends-empty-state", {
            emptyTitle:
              tab === "pending"
                ? "Nenhuma solicitação pendente."
                : "Você ainda não tem amigos nesta lista.",
          });
      document.querySelectorAll("[data-accept]").forEach(
        (b) =>
          (b.onclick = async () => {
            await api(`/api/friends/${b.dataset.accept}/accept`, {
              method: "POST",
            });
            await actions.loadFriends();
          }),
      );
      document.querySelectorAll("[data-decline]").forEach(
        (b) =>
          (b.onclick = async () => {
            await api(`/api/friends/${b.dataset.decline}/decline`, {
              method: "POST",
            });
            await actions.loadFriends();
          }),
      );
      document
        .querySelectorAll("[data-message]")
        .forEach((x) => (x.onclick = () => actions.startDm(x.dataset.message)));
      document
        .querySelectorAll("[data-profile]")
        .forEach(
          (x) => (x.onclick = () => actions.openUserProfile(x.dataset.profile)),
        );
      document
        .querySelectorAll(".call-btn")
        .forEach(
          (x) =>
            (x.onclick = () =>
              actions.startPrivateCall(x.dataset.call, x.dataset.name)),
        );
    };
    document.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          tab = b.dataset.tab;
          document
            .querySelectorAll("[data-tab]")
            .forEach((x) => x.classList.toggle("active", x === b));
          draw();
        }),
    );
    document.getElementById("add-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/friends/request", {
          method: "POST",
          body: JSON.stringify({
            username: document.getElementById("friend-username").value,
          }),
        });
        document.getElementById("friend-username").value = "";
        toast("Solicitação enviada.");
        await actions.loadFriends();
      } catch (x) {
        toast(errText(x.message));
      }
    };
    draw();
  }
  return {
    updateBadge,
    loadFriends,
    renderFriends,
  };
}
