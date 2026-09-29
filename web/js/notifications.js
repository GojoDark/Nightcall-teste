import { toast, renderTemplate } from "./ui.js";
// Avisos internos e permissão de notificações.
export function createNotifications({ state, services, actions }) {
  const notificationButton = document.querySelector(".desktop-notifications");
  notificationButton.onclick = () => actions.showNotifications();
  function internalNotification(title, body, action) {
    state.store.notifications.unshift({
      title,
      body,
      action,
    });
    state.store.notifications = state.store.notifications.slice(0, 40);
    const badge = document.getElementById("notification-count");
    if (badge) {
      badge.textContent = state.store.notifications.length;
      badge.hidden = false;
    }
    if (
      document.visibilityState === "hidden" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      if (navigator.serviceWorker)
        navigator.serviceWorker.ready
          .then((r) =>
            r.showNotification(title, {
              body,
              icon: "/assets/images/nightcall-mark.png",
            }),
          )
          .catch(() => {});
      else
        try {
          const n = new Notification(title, {
            body,
            icon: "/assets/images/nightcall-mark.png",
          });
          n.onclick = () => {
            window.focus();
            action?.();
          };
        } catch {}
    }
  }
  function showNotifications() {
    const panel = document.getElementById("notification-panel");
    const items = document.getElementById("notification-items");
    items.replaceChildren();
    panel.hidden = false;
    panel.querySelector("header button").onclick = () => {
      panel.hidden = true;
    };
    if (!state.store.notifications.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhuma notificação nova.";
      items.append(empty);
    }
    for (const item of state.store.notifications) {
      const button = document.createElement("button");
      button.className = "notification-item";
      const title = document.createElement("b"),
        body = document.createElement("span");
      title.textContent = item.title;
      body.textContent = item.body;
      button.append(title, body);
      button.onclick = () => {
        panel.hidden = true;
        item.action?.();
      };
      items.append(button);
    }
    const enable = document.createElement("button");
    enable.className = "secondary";
    enable.textContent = "Permitir notificações nesta aba";
    enable.onclick = async () => {
      if (!("Notification" in window)) {
        toast("Este navegador não oferece notificações.");
        return;
      }
      const permission = await Notification.requestPermission();
      toast(
        permission === "granted"
          ? "Notificações permitidas enquanto o Nightcall estiver aberto."
          : "Notificações não foram permitidas.",
      );
    };
    items.append(enable);

    document.getElementById("notification-count").hidden = true;
  }
  return {
    internalNotification,
    showNotifications,
  };
}
