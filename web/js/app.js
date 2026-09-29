import { api, errText, toast, renderShell, initializeDocument } from "./ui.js";
import { showAuth } from "./auth.js";
import { createUi } from "./ui.js";
import { createHome } from "./home.js";
import { createFriends } from "./friends.js";
import { createMessages } from "./messages.js";
import { createProfile } from "./profile.js";
import { createCommunities } from "./communities.js";
import { createSettings } from "./settings.js";
import { createNotifications } from "./notifications.js";
import { createCalls } from "./calls.js";
import { createNavigation } from "./navigation.js";
import { createSynchronization } from "./synchronization.js";

// Inicializa uma única sessão. Os módulos compartilham dados, serviços e ações,
// mas cada área mantém suas funções no próprio arquivo.
function shell(user) {
  const state = {
    user,
    section: "home",
    friends: [],
    dms: [],
    spaces: [],
    activeDm: null,
    activeSpace: null,
    lastFriendSig: "",
    lastDmSig: "",
    store: {
      messages: new Map(),
      notifications: [],
      community: null,
      online: new Map(),
      connection: "online",
    },
    disposed: false,
    eventCursor: 0,
    signalCursor: 0,
    serverEpoch: null,
    routeGeneration: 0,
  };
  renderShell(user);
  const services = {
    content: document.getElementById("content"),
  };
  const actions = {
    logout,
  };
  const context = {
    state,
    services,
    actions,
  };
  Object.assign(actions, createUi(context));
  Object.assign(actions, createHome(context));
  Object.assign(actions, createFriends(context));
  Object.assign(actions, createMessages(context));
  Object.assign(actions, createProfile(context));
  Object.assign(actions, createCommunities(context));
  Object.assign(actions, createSettings(context));
  Object.assign(actions, createNotifications(context));
  Object.assign(actions, createCalls(context));
  Object.assign(actions, createNavigation(context));
  actions.homeSidebar();
  Object.assign(actions, createSynchronization(context));
  async function logout() {
    state.disposed = true;
    services.scheduler.stop();
    services.chat.close();
    services.navigation.destroy();
    window.removeEventListener("pagehide", actions.unloadCall);
    try {
      await services.privateCalls.end();
    } catch {}
    services.privateCalls.destroy();
    services.callView.destroy();
    await api("/api/auth/logout", {
      method: "POST",
    });
    showAuth(shell);
  }
  window.addEventListener("pagehide", actions.unloadCall);
  document.getElementById("dock-mic").onclick = () => services.manager.mute();
  document.getElementById("dock-audio").onclick = () =>
    services.manager.deafen();
  Promise.all([actions.loadDms(), actions.loadFriends(), actions.loadSpaces()])
    .then(() => {
      if (!state.disposed && state.section === "home") {
        services.navigation.set(
          {
            type: "section",
            id: "home",
          },
          "Início",
        );
        actions.renderHome();
      }
      services.scheduler.start();
    })
    .catch((e) => {
      toast(errText(e.message));
      services.scheduler.start();
    });
  document
    .querySelectorAll(".nav-item")
    .forEach((x) => (x.onclick = () => actions.setSection(x.dataset.sec)));
  document.getElementById("home-btn").onclick = () => {
    actions.homeSidebar();
    state.activeSpace = null;
    actions.drawSpaces();
    actions.setSection("home");
  };
  document.getElementById("space-add").onclick = actions.spaceModal;
  document.getElementById("settings-rail").onclick = () =>
    actions.setSection("settings");
  document.getElementById("settings-dock").onclick = () =>
    actions.setSection("settings");
  document.getElementById("profile-dock").onclick = () =>
    actions.setSection("profile");
}
async function start() {
  initializeDocument();
  if (isSecureContext && "serviceWorker" in navigator)
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  try {
    const data = await api("/api/auth/me");
    shell(data.user);
  } catch {
    showAuth(shell);
  }
}
if (location.protocol !== "file:")
  start().catch((error) => {
    document.getElementById("boot-status").textContent =
      "Não foi possível carregar a interface. Recarregue para tentar novamente.";
    console.error(error);
  });
